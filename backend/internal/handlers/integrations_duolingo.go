package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ── JWT cache (avoid logging in on every 60-second panel refresh) ──────────────

var (
	duoJWTMu    sync.RWMutex
	duoJWTCache = map[string]struct {
		jwt       string
		expiresAt time.Time
	}{}
)

func duoParseCreds(apiKey string) (username, password string, err error) {
	idx := strings.Index(apiKey, ":")
	if idx < 0 {
		return "", "", fmt.Errorf("duolingo: API key must be username:password")
	}
	return apiKey[:idx], apiKey[idx+1:], nil
}

func duoGetJWT(username, password string) (string, error) {
	cacheKey := username + ":" + password

	duoJWTMu.RLock()
	if e, ok := duoJWTCache[cacheKey]; ok && time.Now().Before(e.expiresAt) {
		duoJWTMu.RUnlock()
		return e.jwt, nil
	}
	duoJWTMu.RUnlock()

	body, _ := json.Marshal(map[string]string{"login": username, "password": password})
	req, _ := http.NewRequest("POST", "https://www.duolingo.com/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; StoaDashboard/1.0)")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("duolingo: login request failed: %w", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("duolingo: login failed (HTTP %d) — check username and password", resp.StatusCode)
	}

	var loginResp struct {
		JWT     string `json:"jwt"`
		Failure string `json:"failure"`
	}
	json.Unmarshal(b, &loginResp)

	// JWT may also be in response header
	if loginResp.JWT == "" {
		loginResp.JWT = resp.Header.Get("jwt")
	}
	if loginResp.Failure != "" {
		return "", fmt.Errorf("duolingo: login rejected — %s", loginResp.Failure)
	}
	if loginResp.JWT == "" {
		return "", fmt.Errorf("duolingo: no JWT in login response")
	}

	duoJWTMu.Lock()
	duoJWTCache[cacheKey] = struct {
		jwt       string
		expiresAt time.Time
	}{loginResp.JWT, time.Now().Add(12 * time.Hour)}
	duoJWTMu.Unlock()

	return loginResp.JWT, nil
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
	Code   string `json:"code"`
	Name   string `json:"name"`
	Level  int    `json:"level"`
	XP     int    `json:"xp"`
	Active bool   `json:"active"`
}

type DuolingoDayXP struct {
	Date string `json:"date"`
	XP   int    `json:"xp"`
}

type DuolingoPanelData struct {
	Username  string           `json:"username"`
	Name      string           `json:"name"`
	Streak    int              `json:"streak"`
	TodayXP   int              `json:"todayXP"`
	DailyGoal int              `json:"dailyGoal"`
	TotalXP   int              `json:"totalXP"`
	GoalMet   bool             `json:"goalMet"`
	League    string           `json:"league"`
	Courses   []DuolingoCourse `json:"courses"`
	RecentXP  []DuolingoDayXP  `json:"recentXP"`
}

// ── Raw API response types ────────────────────────────────────────────────────

type duoLangData struct {
	LanguageString  string `json:"language_string"`
	Learning        bool   `json:"learning"`
	CurrentLearning bool   `json:"current_learning"`
	Level           int    `json:"level"`
	Points          int    `json:"points"`
	Streak          int    `json:"streak"`
}

type duoUserRaw struct {
	ID                   int64                       `json:"id"`
	Name                 string                      `json:"name"`
	Username             string                      `json:"username"`
	SiteStreak           int                         `json:"site_streak"`
	DailyGoal            int                         `json:"daily_goal"`
	StreakExtendedToday  bool                        `json:"streak_extended_today"`
	CurrentLanguage      string                      `json:"language"`
	Languages            []string                    `json:"languages"`
	LanguageData         map[string]duoLangData      `json:"language_data"`
	Calendar             map[string]int              `json:"calendar"`
	LeagueData           json.RawMessage             `json:"league_data"`
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

	username, password, err := duoParseCreds(apiKey)
	if err != nil {
		return nil, err
	}

	// Login to get JWT
	jwt, err := duoGetJWT(username, password)
	if err != nil {
		return nil, err
	}

	// Fetch user profile
	b, err := duoGetUser(username, jwt)
	if err != nil {
		// Invalidate cached JWT on auth failure and retry once
		duoJWTMu.Lock()
		delete(duoJWTCache, username+":"+password)
		duoJWTMu.Unlock()
		jwt2, loginErr := duoGetJWT(username, password)
		if loginErr != nil {
			return nil, err
		}
		b, err = duoGetUser(username, jwt2)
		if err != nil {
			return nil, err
		}
	}

	// Parse response — users array
	var wrapper struct {
		Users []duoUserRaw `json:"users"`
	}
	if json.Unmarshal(b, &wrapper) != nil || len(wrapper.Users) == 0 {
		return nil, fmt.Errorf("duolingo: unexpected response format")
	}
	u := wrapper.Users[0]

	// ── Courses ───────────────────────────────────────────────────────────────
	totalXP := 0
	var courses []DuolingoCourse
	for _, code := range u.Languages {
		ld, ok := u.LanguageData[code]
		if !ok || !ld.Learning {
			continue
		}
		totalXP += ld.Points
		courses = append(courses, DuolingoCourse{
			Code:   code,
			Name:   ld.LanguageString,
			Level:  ld.Level,
			XP:     ld.Points,
			Active: ld.CurrentLearning || code == u.CurrentLanguage,
		})
	}
	// Sort: active first, then by XP descending
	sort.Slice(courses, func(i, j int) bool {
		if courses[i].Active != courses[j].Active {
			return courses[i].Active
		}
		return courses[i].XP > courses[j].XP
	})

	// ── Calendar → recent XP (last 14 days) ──────────────────────────────────
	type tsXP struct {
		ts int64
		xp int
	}
	var tsSlice []tsXP
	for tsStr, xp := range u.Calendar {
		ts, err := strconv.ParseInt(tsStr, 10, 64)
		if err != nil {
			continue
		}
		tsSlice = append(tsSlice, tsXP{ts, xp})
	}
	sort.Slice(tsSlice, func(i, j int) bool { return tsSlice[i].ts < tsSlice[j].ts })

	// Take last 14 entries
	if len(tsSlice) > 14 {
		tsSlice = tsSlice[len(tsSlice)-14:]
	}

	recentXP := make([]DuolingoDayXP, len(tsSlice))
	for i, entry := range tsSlice {
		t := time.Unix(entry.ts, 0).UTC()
		recentXP[i] = DuolingoDayXP{Date: t.Format("2006-01-02"), XP: entry.xp}
	}

	// Today's XP — last calendar entry if it's today's date
	todayXP := 0
	todayStr := time.Now().UTC().Format("2006-01-02")
	if len(recentXP) > 0 {
		last := recentXP[len(recentXP)-1]
		if last.Date == todayStr {
			todayXP = last.XP
		}
	}

	// ── League ───────────────────────────────────────────────────────────────
	league := duoParseLeague(u.LeagueData)

	goal := u.DailyGoal
	if goal == 0 {
		goal = 10
	}

	return &DuolingoPanelData{
		Username:  u.Username,
		Name:      u.Name,
		Streak:    u.SiteStreak,
		TodayXP:   todayXP,
		DailyGoal: goal,
		TotalXP:   totalXP,
		GoalMet:   u.StreakExtendedToday || todayXP >= goal,
		League:    league,
		Courses:   courses,
		RecentXP:  recentXP,
	}, nil
}

// duoParseLeague extracts the league tier name from various response shapes.
func duoParseLeague(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	// Try common shapes
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
	// Numeric tier → name
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

// testDuolingoConnection parses credentials and attempts a login.
func testDuolingoConnection(apiKey string) error {
	username, password, err := duoParseCreds(apiKey)
	if err != nil {
		return err
	}
	if username == "" || password == "" {
		return fmt.Errorf("duolingo: username and password cannot be empty")
	}
	// Invalidate cache to force a fresh login
	duoJWTMu.Lock()
	delete(duoJWTCache, username+":"+password)
	duoJWTMu.Unlock()

	_, err = duoGetJWT(username, password)
	return err
}
