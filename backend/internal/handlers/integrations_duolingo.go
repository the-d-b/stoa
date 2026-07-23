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

// duoParseCreds accepts "username" or "username:jwt_token".
// The profile API is publicly accessible; JWT is optional for potential private fields.
func duoParseCreds(apiKey string) (username, jwt string) {
	if idx := strings.Index(apiKey, ":"); idx > 0 {
		return strings.TrimSpace(apiKey[:idx]), strings.TrimSpace(apiKey[idx+1:])
	}
	return strings.TrimSpace(apiKey), ""
}

func duoGetUser(username, jwt string) ([]byte, error) {
	u := "https://www.duolingo.com/2017-06-30/users?username=" + username
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; StoaDashboard/1.0)")
	if jwt != "" {
		req.Header.Set("Authorization", "Bearer "+jwt)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("duolingo: HTTP %d fetching user profile", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Output types ──────────────────────────────────────────────────────────────

type DuolingoCourse struct {
	ID               string `json:"id"`
	LearningLanguage string `json:"learningLanguage"`
	Title            string `json:"title"`
	XP               int    `json:"xp"`
	Crowns           int    `json:"crowns"`
	Active           bool   `json:"active"`
}

type DuolingoPanelData struct {
	Username        string           `json:"username"`
	Name            string           `json:"name"`
	AvatarURL       string           `json:"avatarUrl"`
	Streak          int              `json:"streak"`
	LongestStreak   int              `json:"longestStreak"`
	StreakDoneToday bool             `json:"streakDoneToday"` // server-local best-effort; frontend recomputes from StreakEndDate using browser-local time, which is authoritative
	StreakEndDate   string           `json:"streakEndDate"`   // raw YYYY-MM-DD from Duolingo, no timezone info
	TotalXP         int              `json:"totalXP"`
	HasPlus         bool             `json:"hasPlus"`
	League          string           `json:"league"`
	Courses         []DuolingoCourse `json:"courses"`
}

// ── Raw API types ─────────────────────────────────────────────────────────────

type duoCourseRaw struct {
	ID               string `json:"id"`
	LearningLanguage string `json:"learningLanguage"`
	Title            string `json:"title"`
	XP               int    `json:"xp"`
	Crowns           int    `json:"crowns"`
}

type duoUserRaw struct {
	Name            string         `json:"name"`
	Username        string         `json:"username"`
	Picture         string         `json:"picture"`
	Streak          int            `json:"streak"`
	TotalXp         int            `json:"totalXp"`
	HasPlus         bool           `json:"hasPlus"`
	CurrentCourseID string         `json:"currentCourseId"`
	Courses         []duoCourseRaw `json:"courses"`
	StreakData      struct {
		CurrentStreak struct {
			Length  int    `json:"length"`
			EndDate string `json:"endDate"`
		} `json:"currentStreak"`
		LongestStreak struct {
			Length int `json:"length"`
		} `json:"longestStreak"`
	} `json:"streakData"`
	LeagueData json.RawMessage `json:"leagueData"`
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

func fetchDuolingoPanelData(db *sql.DB, config map[string]interface{}) (*DuolingoPanelData, error) {
	integrationID, _ := config["integrationId"].(string)
	if integrationID == "" {
		return nil, fmt.Errorf("duolingo: integrationId required in panel config")
	}
	_, _, apiKey, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	username, jwt := duoParseCreds(apiKey)
	if username == "" {
		return nil, fmt.Errorf("duolingo: username is required")
	}

	b, err := duoGetUser(username, jwt)
	if err != nil {
		return nil, err
	}
	var wrapper struct {
		Users []duoUserRaw `json:"users"`
	}
	if json.Unmarshal(b, &wrapper) != nil || len(wrapper.Users) == 0 {
		return nil, fmt.Errorf("duolingo: user %q not found — check your Duolingo username", username)
	}
	u := wrapper.Users[0]

	// Avatar: Duolingo returns protocol-relative URLs (//simg-ssl.duolingo.com/...)
	avatarURL := u.Picture
	if strings.HasPrefix(avatarURL, "//") {
		avatarURL = "https:" + avatarURL
	}

	streakDoneToday := duoStreakDoneToday(u.StreakData.CurrentStreak.EndDate, timeNow())

	// Courses — sort active first, then XP descending
	courses := make([]DuolingoCourse, 0, len(u.Courses))
	for _, c := range u.Courses {
		courses = append(courses, DuolingoCourse{
			ID:               c.ID,
			LearningLanguage: c.LearningLanguage,
			Title:            c.Title,
			XP:               c.XP,
			Crowns:           c.Crowns,
			Active:           c.ID == u.CurrentCourseID,
		})
	}
	sort.Slice(courses, func(i, j int) bool {
		if courses[i].Active != courses[j].Active {
			return courses[i].Active
		}
		return courses[i].XP > courses[j].XP
	})

	return &DuolingoPanelData{
		Username:        u.Username,
		Name:            u.Name,
		AvatarURL:       avatarURL,
		Streak:          u.Streak,
		LongestStreak:   u.StreakData.LongestStreak.Length,
		StreakDoneToday: streakDoneToday,
		StreakEndDate:   u.StreakData.CurrentStreak.EndDate,
		TotalXP:         u.TotalXp,
		HasPlus:         u.HasPlus,
		League:          duoParseLeague(u.LeagueData),
		Courses:         courses,
	}, nil
}

// duoStreakDoneToday reports whether the user's streak already counts for
// today, computed in SERVER-LOCAL time. endDate is Duolingo's plain
// YYYY-MM-DD "last day the streak was extended" — confirmed against a live
// response to carry no timezone info at all. Duolingo itself resolves
// endDate using the user's own app-configured timezone, which stoa has no
// way to learn from this endpoint.
//
// This is NOT authoritative — it's a fallback for API consumers that only
// see this boolean. Server-local time is only a reliable proxy for the
// user's actual timezone when the server happens to be configured for it;
// a containerized deployment commonly defaults to UTC regardless of where
// the user actually is, which silently reproduces the exact false-alarm
// this function was written to fix. The frontend has the real answer
// (browser-local time) and recomputes this itself from StreakEndDate rather
// than trusting this field — see useStreakCountdown / streakDoneToday in
// DuolingoPanel.tsx.
func duoStreakDoneToday(endDate string, now time.Time) bool {
	today := now.Local().Format("2006-01-02")
	return endDate >= today
}

// duoParseLeague extracts the league tier name from various response shapes.
func duoParseLeague(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var v1 struct {
		Tier string `json:"tier"`
	}
	if json.Unmarshal(raw, &v1) == nil && v1.Tier != "" {
		return v1.Tier
	}
	var v2 struct {
		Active struct {
			Tier string `json:"tier"`
		} `json:"active"`
	}
	if json.Unmarshal(raw, &v2) == nil && v2.Active.Tier != "" {
		return v2.Active.Tier
	}
	var v3 struct {
		Tier int `json:"tier"`
	}
	if json.Unmarshal(raw, &v3) == nil && v3.Tier > 0 {
		tiers := []string{"", "Bronze", "Silver", "Gold", "Sapphire", "Ruby", "Emerald", "Amethyst", "Pearl", "Obsidian", "Diamond"}
		if v3.Tier < len(tiers) {
			return tiers[v3.Tier]
		}
	}
	return ""
}

// testDuolingoConnection validates the secret by hitting the profile endpoint.
func testDuolingoConnection(apiKey string) error {
	username, jwt := duoParseCreds(apiKey)
	if username == "" {
		return fmt.Errorf("duolingo: username is required")
	}
	b, err := duoGetUser(username, jwt)
	if err != nil {
		return err
	}
	var wrapper struct {
		Users []struct {
			Username string `json:"username"`
		} `json:"users"`
	}
	if json.Unmarshal(b, &wrapper) != nil || len(wrapper.Users) == 0 {
		return fmt.Errorf("duolingo: user %q not found — check your Duolingo username", username)
	}
	return nil
}
