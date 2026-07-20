package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// ── Output types ──────────────────────────────────────────────────────────────

type GitHubRepo struct {
	Name        string `json:"name"`
	FullName    string `json:"fullName"`
	Description string `json:"description,omitempty"`
	Language    string `json:"language,omitempty"`
	Stars       int    `json:"stars"`
	Forks       int    `json:"forks"`
	PushedAt    string `json:"pushedAt"`
	URL         string `json:"url"`
	IsFork      bool   `json:"isFork"`
}

type GitHubEvent struct {
	Type      string `json:"type"`
	RepoName  string `json:"repoName"`
	CreatedAt string `json:"createdAt"`
	Detail    string `json:"detail,omitempty"`
}

type GitHubDayCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type GitHubPanelData struct {
	Login       string           `json:"login"`
	Name        string           `json:"name"`
	AvatarURL   string           `json:"avatarUrl"`
	Bio         string           `json:"bio,omitempty"`
	Location    string           `json:"location,omitempty"`
	PublicRepos int              `json:"publicRepos"`
	Followers   int              `json:"followers"`
	Following   int              `json:"following"`
	TopRepos    []GitHubRepo     `json:"topRepos"`
	RecentRepos []GitHubRepo     `json:"recentRepos"`
	Events      []GitHubEvent    `json:"events"`
	Activity    []GitHubDayCount `json:"activity"`
}

// ── Raw API types ─────────────────────────────────────────────────────────────

type ghUserRaw struct {
	Login       string `json:"login"`
	Name        string `json:"name"`
	AvatarURL   string `json:"avatar_url"`
	Bio         string `json:"bio"`
	Location    string `json:"location"`
	PublicRepos int    `json:"public_repos"`
	Followers   int    `json:"followers"`
	Following   int    `json:"following"`
}

type ghRepoRaw struct {
	Name            string `json:"name"`
	FullName        string `json:"full_name"`
	Description     string `json:"description"`
	Language        string `json:"language"`
	StargazersCount int    `json:"stargazers_count"`
	ForksCount      int    `json:"forks_count"`
	PushedAt        string `json:"pushed_at"`
	HTMLURL         string `json:"html_url"`
	Fork            bool   `json:"fork"`
}

type ghEventRaw struct {
	Type string `json:"type"`
	Repo struct {
		Name string `json:"name"`
	} `json:"repo"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt string          `json:"created_at"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func githubGet(apiKey, path string) ([]byte, error) {
	req, _ := http.NewRequest("GET", "https://api.github.com"+path, nil)
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "StoaDashboard/1.0")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("github: unauthorized — check your personal access token (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("github: HTTP %d fetching %s", resp.StatusCode, path)
	}
	return b, nil
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

func fetchGitHubPanelData(db *sql.DB, config map[string]interface{}) (*GitHubPanelData, error) {
	integrationID, _ := config["integrationId"].(string)
	if integrationID == "" {
		return nil, fmt.Errorf("github: integrationId required in panel config")
	}
	_, _, apiKey, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	// Fetch authenticated user profile
	b, err := githubGet(apiKey, "/user")
	if err != nil {
		return nil, err
	}
	var user ghUserRaw
	if json.Unmarshal(b, &user) != nil || user.Login == "" {
		return nil, fmt.Errorf("github: unexpected user response")
	}

	// Fetch user repos (sorted by pushed, up to 100, owner affiliation only)
	b, err = githubGet(apiKey, "/user/repos?sort=pushed&per_page=100&affiliation=owner")
	if err != nil {
		return nil, err
	}
	var repos []ghRepoRaw
	json.Unmarshal(b, &repos)

	// Top repos: non-fork, sorted by stars descending (up to 6)
	var ownRepos []ghRepoRaw
	for _, r := range repos {
		if !r.Fork {
			ownRepos = append(ownRepos, r)
		}
	}
	topRepos := make([]ghRepoRaw, len(ownRepos))
	copy(topRepos, ownRepos)
	sort.Slice(topRepos, func(i, j int) bool {
		return topRepos[i].StargazersCount > topRepos[j].StargazersCount
	})
	if len(topRepos) > 6 {
		topRepos = topRepos[:6]
	}

	// Recent repos: all repos sorted by pushed_at (already returned by API)
	recentRepos := repos
	if len(recentRepos) > 8 {
		recentRepos = recentRepos[:8]
	}

	// Fetch recent events (last 30)
	b, err = githubGet(apiKey, "/users/"+user.Login+"/events?per_page=30")
	if err != nil {
		return nil, err
	}
	var rawEvents []ghEventRaw
	json.Unmarshal(b, &rawEvents)

	// Build 30-day activity buckets
	now := time.Now().UTC()
	dayMap := make(map[string]int, 30)
	for i := 0; i < 30; i++ {
		dayMap[now.AddDate(0, 0, -i).Format("2006-01-02")] = 0
	}

	events := make([]GitHubEvent, 0, len(rawEvents))
	for _, e := range rawEvents {
		// Count events per day
		if t, err2 := time.Parse(time.RFC3339, e.CreatedAt); err2 == nil {
			d := t.UTC().Format("2006-01-02")
			if _, ok := dayMap[d]; ok {
				dayMap[d]++
			}
		}
		ev := GitHubEvent{
			Type:      e.Type,
			RepoName:  e.Repo.Name,
			CreatedAt: e.CreatedAt,
		}
		switch e.Type {
		case "PushEvent":
			var p struct {
				Ref     string `json:"ref"`
				Commits []struct {
					Message string `json:"message"`
				} `json:"commits"`
			}
			if json.Unmarshal(e.Payload, &p) == nil {
				branch := p.Ref
				if idx := strings.LastIndex(branch, "/"); idx >= 0 {
					branch = branch[idx+1:]
				}
				if len(p.Commits) > 0 {
					msg := p.Commits[0].Message
					if nl := strings.Index(msg, "\n"); nl >= 0 {
						msg = msg[:nl]
					}
					if len(msg) > 72 {
						msg = msg[:72] + "…"
					}
					ev.Detail = branch + ": " + msg
				} else {
					ev.Detail = branch
				}
			}
		case "PullRequestEvent":
			var p struct {
				Action      string `json:"action"`
				Number      int    `json:"number"`
				PullRequest struct {
					Title string `json:"title"`
				} `json:"pull_request"`
			}
			if json.Unmarshal(e.Payload, &p) == nil {
				title := p.PullRequest.Title
				if len(title) > 60 {
					title = title[:60] + "…"
				}
				ev.Detail = fmt.Sprintf("#%d %s — %s", p.Number, p.Action, title)
			}
		case "IssuesEvent":
			var p struct {
				Action string `json:"action"`
				Issue  struct {
					Number int    `json:"number"`
					Title  string `json:"title"`
				} `json:"issue"`
			}
			if json.Unmarshal(e.Payload, &p) == nil {
				title := p.Issue.Title
				if len(title) > 60 {
					title = title[:60] + "…"
				}
				ev.Detail = fmt.Sprintf("#%d %s — %s", p.Issue.Number, p.Action, title)
			}
		case "CreateEvent":
			var p struct {
				RefType string `json:"ref_type"`
				Ref     string `json:"ref"`
			}
			if json.Unmarshal(e.Payload, &p) == nil && p.Ref != "" {
				ev.Detail = p.RefType + " " + p.Ref
			}
		case "ReleaseEvent":
			var p struct {
				Release struct {
					TagName string `json:"tag_name"`
				} `json:"release"`
			}
			if json.Unmarshal(e.Payload, &p) == nil {
				ev.Detail = p.Release.TagName
			}
		case "WatchEvent":
			ev.Detail = "starred"
		case "ForkEvent":
			var p struct {
				Forkee struct {
					FullName string `json:"full_name"`
				} `json:"forkee"`
			}
			if json.Unmarshal(e.Payload, &p) == nil {
				ev.Detail = p.Forkee.FullName
			}
		case "IssueCommentEvent":
			var p struct {
				Issue struct {
					Number int `json:"number"`
				} `json:"issue"`
			}
			if json.Unmarshal(e.Payload, &p) == nil {
				ev.Detail = fmt.Sprintf("#%d", p.Issue.Number)
			}
		}
		events = append(events, ev)
	}

	// Convert dayMap to sorted slice (oldest → newest)
	activity := make([]GitHubDayCount, 30)
	for i := 0; i < 30; i++ {
		d := now.AddDate(0, 0, -(29 - i)).Format("2006-01-02")
		activity[i] = GitHubDayCount{Date: d, Count: dayMap[d]}
	}

	result := &GitHubPanelData{
		Login:       user.Login,
		Name:        user.Name,
		AvatarURL:   user.AvatarURL,
		Bio:         user.Bio,
		Location:    user.Location,
		PublicRepos: user.PublicRepos,
		Followers:   user.Followers,
		Following:   user.Following,
		Events:      events,
		Activity:    activity,
	}
	for _, r := range topRepos {
		result.TopRepos = append(result.TopRepos, repoToOut(r))
	}
	for _, r := range recentRepos {
		result.RecentRepos = append(result.RecentRepos, repoToOut(r))
	}
	return result, nil
}

func repoToOut(r ghRepoRaw) GitHubRepo {
	return GitHubRepo{
		Name:        r.Name,
		FullName:    r.FullName,
		Description: r.Description,
		Language:    r.Language,
		Stars:       r.StargazersCount,
		Forks:       r.ForksCount,
		PushedAt:    r.PushedAt,
		URL:         r.HTMLURL,
		IsFork:      r.Fork,
	}
}

func testGitHubConnection(apiKey string) error {
	if apiKey == "" {
		return fmt.Errorf("github: personal access token is required")
	}
	b, err := githubGet(apiKey, "/user")
	if err != nil {
		return err
	}
	var u ghUserRaw
	if json.Unmarshal(b, &u) != nil || u.Login == "" {
		return fmt.Errorf("github: unexpected response — check your token")
	}
	return nil
}
