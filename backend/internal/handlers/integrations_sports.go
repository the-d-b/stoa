package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// -- ESPN path map

var espnLeaguePath = map[string]string{
	"nhl": "hockey/nhl",
	"nfl": "football/nfl",
	"nba": "basketball/nba",
	"mlb": "baseball/mlb",
}

// -- Data types

type SportsPlay struct {
	Text       string `json:"text"`
	Clock      string `json:"clock"`
	Period     int    `json:"period"`
	ScoreValue int    `json:"scoreValue"`
}

type SportsGame struct {
	ID          string `json:"id"`
	League      string `json:"league"`
	ShortName   string `json:"shortName"`
	HomeTeam    string `json:"homeTeam"`
	AwayTeam    string `json:"awayTeam"`
	HomeAbbr    string `json:"homeAbbr"`
	AwayAbbr    string `json:"awayAbbr"`
	HomeLogo    string `json:"homeLogo"`
	AwayLogo    string `json:"awayLogo"`
	HomeScore   string `json:"homeScore"`
	AwayScore   string `json:"awayScore"`
	HomeColor   string `json:"homeColor"`
	AwayColor   string `json:"awayColor"`
	Status      string `json:"status"`  // "pre" | "in" | "post"
	StatusText  string `json:"statusText"`
	Clock       string `json:"clock"`
	Period      int    `json:"period"`
	StartTime   string `json:"startTime"`
	IsFavorite  bool         `json:"isFavorite"`
	Plays       []SportsPlay `json:"plays,omitempty"`
}

type SportsStanding struct {
	League   string `json:"league"`
	Division string `json:"division"`
	Teams    []SportsStandingTeam `json:"teams"`
}

type SportsStandingTeam struct {
	Name   string `json:"name"`
	Abbr   string `json:"abbr"`
	Logo   string `json:"logo"`
	Wins   int    `json:"wins"`
	Losses int    `json:"losses"`
	Pct    string `json:"pct"`
	GB     string `json:"gb"`
	IsFav  bool   `json:"isFav"`
}

type SportsScheduleGame struct {
	League     string `json:"league"`
	HomeTeam   string `json:"homeTeam"`
	AwayTeam   string `json:"awayTeam"`
	HomeAbbr   string `json:"homeAbbr"`
	AwayAbbr   string `json:"awayAbbr"`
	HomeLogo   string `json:"homeLogo"`
	AwayLogo   string `json:"awayLogo"`
	StartTime  string `json:"startTime"`
	IsFavorite bool   `json:"isFavorite"`
	IsTBD      bool   `json:"isTBD"`
}

type LeagueStatus struct {
	League          string `json:"league"`
	IsOffSeason     bool   `json:"isOffSeason"`
	NextSeasonStart string `json:"nextSeasonStart"` // "Month Day, Year" or empty
}

type SportsPanelData struct {
	Games         []SportsGame         `json:"games"`
	Standings     []SportsStanding     `json:"standings"`
	Schedule      []SportsScheduleGame `json:"schedule"`
	LeagueStatus  []LeagueStatus       `json:"leagueStatus"`
	HasLive       bool                 `json:"hasLive"`
	FetchedAt     string               `json:"fetchedAt"`
}

// espnSeasonWindow is the current season's date range from the scoreboard
// response (leagues[0].season). Zero when ESPN omits it.
type espnSeasonWindow struct {
	Start time.Time
	End   time.Time
}

// isLeagueOffSeason is the fallback heuristic when the scoreboard has no
// season window. Unreliable on its own: ESPN's scoreboard lists the next
// scheduled games even months ahead, so "pre" games don't imply in-season.
func isLeagueOffSeason(league string, games []SportsGame, schedule []SportsScheduleGame) bool {
	// If there are any games today or upcoming, not off-season
	for _, g := range games {
		if g.Status == "pre" || g.Status == "in" { return false }
	}
	if len(schedule) > 0 { return false }
	// All games are post or there are none, and no schedule - likely off-season
	return true
}

// -- Next-season lookup (ESPN core API), cached per league

var (
	nextSeasonCache   = map[string]cachedSeasonStart{}
	nextSeasonCacheMu sync.Mutex
)

type cachedSeasonStart struct {
	value     string
	fetchedAt time.Time
}

// nextRegularSeasonStart returns the next regular-season start date for a
// league formatted "January 2, 2006", resolved live from ESPN's core API.
// Successful lookups are cached 24h, failures 1h. Empty when unknown.
func nextRegularSeasonStart(league string) string {
	league = strings.ToLower(league)
	nextSeasonCacheMu.Lock()
	if c, ok := nextSeasonCache[league]; ok {
		ttl := 24 * time.Hour
		if c.value == "" { ttl = time.Hour }
		if time.Since(c.fetchedAt) < ttl {
			nextSeasonCacheMu.Unlock()
			return c.value
		}
	}
	nextSeasonCacheMu.Unlock()

	value := fetchNextRegularSeasonStart(league)
	nextSeasonCacheMu.Lock()
	nextSeasonCache[league] = cachedSeasonStart{value: value, fetchedAt: time.Now()}
	nextSeasonCacheMu.Unlock()
	return value
}

func fetchNextRegularSeasonStart(league string) string {
	corePath := espnCoreLeaguePath[league]
	if corePath == "" {
		return ""
	}
	// Latest season (ESPN lists seasons newest-first, including upcoming ones)
	body, err := espnGet(fmt.Sprintf("https://sports.core.api.espn.com/v2/sports/%s/seasons?limit=1", corePath))
	if err != nil {
		log.Printf("[SPORTS] seasons list error %s: %v", league, err)
		return ""
	}
	var seasons struct {
		Items []struct {
			Ref string `json:"$ref"`
		} `json:"items"`
	}
	if json.Unmarshal(body, &seasons) != nil || len(seasons.Items) == 0 {
		return ""
	}
	ref := seasons.Items[0].Ref
	if i := strings.IndexByte(ref, '?'); i >= 0 {
		ref = ref[:i]
	}
	year := ref[strings.LastIndexByte(ref, '/')+1:]
	if year == "" {
		return ""
	}
	// Type 2 = regular season; its startDate is opening night / kickoff
	body, err = espnGet(fmt.Sprintf("https://sports.core.api.espn.com/v2/sports/%s/seasons/%s/types/2", corePath, year))
	if err != nil {
		log.Printf("[SPORTS] season type error %s: %v", league, err)
		return ""
	}
	var seasonType struct {
		StartDate string `json:"startDate"`
	}
	if json.Unmarshal(body, &seasonType) != nil || seasonType.StartDate == "" {
		return ""
	}
	start, err := parseESPNTime(seasonType.StartDate)
	if err != nil || start.Before(time.Now()) {
		return "" // already started or unparseable — nothing future to show
	}
	return start.Local().Format("January 2, 2006")
}

// -- Config helpers

type SportsConfig struct {
	Leagues  []string `json:"leagues"`
	Teams    []string `json:"teams"` // abbreviations e.g. ["COL","SJS","DEN","DAL","DEN","DAL","KC"]
	DaysAhead int     `json:"daysAhead"`
}

func parseSportsConfig(apiURL string) SportsConfig {
	var cfg SportsConfig
	json.Unmarshal([]byte(apiURL), &cfg)
	if len(cfg.Leagues) == 0 {
		cfg.Leagues = []string{"nhl", "nfl", "nba", "mlb"}
	}
	if cfg.DaysAhead == 0 {
		cfg.DaysAhead = 28
	}
	return cfg
}

// parseESPNTime handles ESPN's non-standard time formats
func parseESPNTime(s string) (time.Time, error) {
	formats := []string{time.RFC3339, "2006-01-02T15:04Z", "2006-01-02T15:04:05Z"}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("cannot parse time %q", s)
}

func isFavoriteTeam(abbr string, favTeams []string) bool {
	abbr = strings.ToUpper(abbr)
	for _, t := range favTeams {
		if strings.ToUpper(t) == abbr {
			return true
		}
	}
	return false
}

// -- ESPN fetch helpers

// Core API uses different sport/league path format
var espnCoreLeaguePath = map[string]string{
	"nhl": "hockey/leagues/nhl",
	"nfl": "football/leagues/nfl",
	"nba": "basketball/leagues/nba",
	"mlb": "baseball/leagues/mlb",
}

func fetchGamePlays(league, eventID string, limit int) ([]SportsPlay, error) {
	corePath := espnCoreLeaguePath[league]
	if corePath == "" || eventID == "" {
		return nil, nil
	}
	url := fmt.Sprintf(
		"https://sports.core.api.espn.com/v2/sports/%s/events/%s/competitions/%s/plays?limit=%d",
		corePath, eventID, eventID, limit,
	)
	body, err := espnGet(url)
	if err != nil {
		return nil, err
	}
	var raw struct {
		Items []struct {
			Text       string `json:"text"`
			ScoreValue int    `json:"scoreValue"`
			Clock      struct {
				DisplayValue string `json:"displayValue"`
			} `json:"clock"`
			Period struct {
				Number int `json:"number"`
			} `json:"period"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	var plays []SportsPlay
	// Items are oldest-first; take last N for most recent
	items := raw.Items
	if len(items) > limit {
		items = items[len(items)-limit:]
	}
	// Reverse so most recent play is first
	for i := len(items) - 1; i >= 0; i-- {
		item := items[i]
		if item.Text == "" {
			continue
		}
		plays = append(plays, SportsPlay{
			Text:       item.Text,
			Clock:      item.Clock.DisplayValue,
			Period:     item.Period.Number,
			ScoreValue: item.ScoreValue,
		})
	}
	return plays, nil
}

var sportsHTTPClient = &http.Client{Timeout: 10 * time.Second}

func espnGet(url string) ([]byte, error) {
	resp, err := sportsHTTPClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("ESPN HTTP %d: %s", resp.StatusCode, url)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 512*1024))
}

func logoURL(sport, league, abbr string) string {
	abbr = strings.ToLower(abbr)
	return fmt.Sprintf("https://a.espncdn.com/i/teamlogos/%s/500/%s.png", league, abbr)
}

// -- Scoreboard fetch

func fetchSportsScoreboard(league string, favTeams []string) ([]SportsGame, bool, espnSeasonWindow, error) {
	path := espnLeaguePath[league]
	if path == "" {
		return nil, false, espnSeasonWindow{}, nil
	}
	url := fmt.Sprintf("https://site.api.espn.com/apis/site/v2/sports/%s/scoreboard", path)
	body, err := espnGet(url)
	if err != nil {
		return nil, false, espnSeasonWindow{}, err
	}

	var raw struct {
		Leagues []struct {
			Season struct {
				StartDate string `json:"startDate"`
				EndDate   string `json:"endDate"`
			} `json:"season"`
		} `json:"leagues"`
		Events []struct {
			ID        string `json:"id"`
			ShortName string `json:"shortName"`
			Date      string `json:"date"`
			Status    struct {
				Type struct {
					State       string `json:"state"`
					Description string `json:"description"`
					Completed   bool   `json:"completed"`
				} `json:"type"`
				DisplayClock string `json:"displayClock"`
				Period       int    `json:"period"`
			} `json:"status"`
			Competitions []struct {
				Competitors []struct {
					HomeAway string `json:"homeAway"`
					Score    string `json:"score"`
					Team     struct {
						DisplayName  string `json:"displayName"`
						Abbreviation string `json:"abbreviation"`
						Color        string `json:"color"`
						Logo         string `json:"logo"`
					} `json:"team"`
				} `json:"competitors"`
			} `json:"competitions"`
		} `json:"events"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, false, espnSeasonWindow{}, err
	}

	var season espnSeasonWindow
	if len(raw.Leagues) > 0 {
		if t, err := parseESPNTime(raw.Leagues[0].Season.StartDate); err == nil {
			season.Start = t
		}
		if t, err := parseESPNTime(raw.Leagues[0].Season.EndDate); err == nil {
			season.End = t
		}
	}

	var games []SportsGame
	hasLive := false
	leagueUpper := strings.ToUpper(league)

	for _, ev := range raw.Events {
		st := ev.Date
		if t, err := parseESPNTime(ev.Date); err == nil { st = t.Format(time.RFC3339) }
		g := SportsGame{
			ID:         ev.ID,
			League:     leagueUpper,
			ShortName:  ev.ShortName,
			Status:     ev.Status.Type.State,
			StatusText: ev.Status.Type.Description,
			Clock:      ev.Status.DisplayClock,
			Period:     ev.Status.Period,
			StartTime:  st,
		}
		if g.Status == "in" {
			hasLive = true
		}
		if len(ev.Competitions) > 0 {
			for _, comp := range ev.Competitions[0].Competitors {
				logoUrl := comp.Team.Logo
				if logoUrl == "" {
					logoUrl = logoURL("", league, comp.Team.Abbreviation)
				}
				if comp.HomeAway == "home" {
					g.HomeTeam = comp.Team.DisplayName
					g.HomeAbbr = comp.Team.Abbreviation
					g.HomeLogo = logoUrl
					g.HomeScore = comp.Score
					g.HomeColor = comp.Team.Color
				} else {
					g.AwayTeam = comp.Team.DisplayName
					g.AwayAbbr = comp.Team.Abbreviation
					g.AwayLogo = logoUrl
					g.AwayScore = comp.Score
					g.AwayColor = comp.Team.Color
				}
			}
		}
		g.IsFavorite = isFavoriteTeam(g.HomeAbbr, favTeams) || isFavoriteTeam(g.AwayAbbr, favTeams)
		games = append(games, g)
	}
	return games, hasLive, season, nil
}

// -- Standings fetch

func fetchSportsStandings(league string, favTeams []string) ([]SportsStanding, error) {
	path := espnLeaguePath[league]
	if path == "" {
		return nil, nil
	}
	// Standings uses /apis/v2/ not /apis/site/v2/
	sport := strings.Split(path, "/")[0]
	leagueSlug := strings.Split(path, "/")[1]
	url := fmt.Sprintf("https://site.api.espn.com/apis/v2/sports/%s/%s/standings", sport, leagueSlug)
	body, err := espnGet(url)
	if err != nil {
		return nil, err
	}

	var raw struct {
		Children []struct {
			Name     string `json:"name"`
			Standings struct {
				Entries []struct {
					Team struct {
						DisplayName  string `json:"displayName"`
						Abbreviation string `json:"abbreviation"`
						Logo         string `json:"logo"`
					} `json:"team"`
					Stats []struct {
						Name         string `json:"name"`
						DisplayValue string `json:"displayValue"`
					} `json:"stats"`
				} `json:"entries"`
			} `json:"standings"`
		} `json:"children"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}

	var standings []SportsStanding
	for _, div := range raw.Children {
		s := SportsStanding{
			League:   strings.ToUpper(league),
			Division: div.Name,
		}
		for _, entry := range div.Standings.Entries {
			t := SportsStandingTeam{
				Name:  entry.Team.DisplayName,
				Abbr:  entry.Team.Abbreviation,
				Logo:  entry.Team.Logo,
				IsFav: isFavoriteTeam(entry.Team.Abbreviation, favTeams),
			}
			if t.Logo == "" {
				t.Logo = logoURL("", league, t.Abbr)
			}
			for _, stat := range entry.Stats {
				switch stat.Name {
				case "wins":
					fmt.Sscanf(stat.DisplayValue, "%d", &t.Wins)
				case "losses":
					fmt.Sscanf(stat.DisplayValue, "%d", &t.Losses)
				case "winPercent", "pct":
					t.Pct = stat.DisplayValue
				case "gamesBehind", "gb":
					t.GB = stat.DisplayValue
				}
			}
			s.Teams = append(s.Teams, t)
		}
		standings = append(standings, s)
	}
	return standings, nil
}

// -- Schedule fetch

func fetchSportsSchedule(league string, daysAhead int, favTeams []string) ([]SportsScheduleGame, error) {
	path := espnLeaguePath[league]
	if path == "" {
		return nil, nil
	}
	now := time.Now()
	var schedule []SportsScheduleGame
	seen := map[string]bool{}

	// MLB only accepts single dates - fetch day by day
	// Other leagues accept date ranges - fetch week by week
	var fetchDates []string
	if league == "mlb" {
		for d := 0; d <= daysAhead; d++ {
			fetchDates = append(fetchDates, now.AddDate(0, 0, d).Format("20060102"))
		}
	} else {
		// Build week-sized ranges
		weekSize := 7
		for offset := 0; offset < daysAhead; offset += weekSize {
			chunkStart := now.AddDate(0, 0, offset)
			chunkEnd := now.AddDate(0, 0, offset+weekSize-1)
			if offset+weekSize > daysAhead {
				chunkEnd = now.AddDate(0, 0, daysAhead)
			}
			fetchDates = append(fetchDates, chunkStart.Format("20060102")+"-"+chunkEnd.Format("20060102"))
		}
	}

	for _, dateParam := range fetchDates {
		url := fmt.Sprintf(
			"https://site.api.espn.com/apis/site/v2/sports/%s/scoreboard?dates=%s",
			path, dateParam,
		)
		body, err := espnGet(url)
		if err != nil {
			log.Printf("[SPORTS] schedule chunk error %s %s: %v", league, dateParam, err)
			continue
		}

		var raw2 struct {
			Events []struct {
				Date      string `json:"date"`
				Name      string `json:"name"`
				Status    struct {
					Type struct {
						State       string `json:"state"`
						Description string `json:"description"`
						Detail      string `json:"detail"`
					} `json:"type"`
				} `json:"status"`
				Competitions []struct {
					TimeValid   bool   `json:"timeValid"`
					Competitors []struct {
						HomeAway string `json:"homeAway"`
						Team     struct {
							DisplayName  string `json:"displayName"`
							Abbreviation string `json:"abbreviation"`
							Logo         string `json:"logo"`
						} `json:"team"`
					} `json:"competitors"`
				} `json:"competitions"`
			} `json:"events"`
		}
		if err := json.Unmarshal(body, &raw2); err != nil {
			log.Printf("[SPORTS] schedule parse error %s: %v", league, err)
			continue
		}
		leagueUpper := strings.ToUpper(league)
		for _, ev := range raw2.Events {
		if ev.Status.Type.State == "post" {
			continue // skip completed games
		}
		// timeValid is inside competitions[0] -- false means no confirmed time yet
		isTBD := len(ev.Competitions) > 0 && !ev.Competitions[0].TimeValid
		schSt := ev.Date
		if t, err := parseESPNTime(ev.Date); err == nil { schSt = t.Format(time.RFC3339) }
		g := SportsScheduleGame{
			League:    leagueUpper,
			StartTime: schSt,
		}
		if len(ev.Competitions) > 0 {
			for _, comp := range ev.Competitions[0].Competitors {
				logo := comp.Team.Logo
				if logo == "" {
					logo = logoURL("", league, comp.Team.Abbreviation)
				}
				if comp.HomeAway == "home" {
					g.HomeTeam = comp.Team.DisplayName
					g.HomeAbbr = comp.Team.Abbreviation
					g.HomeLogo = logo
				} else {
					g.AwayTeam = comp.Team.DisplayName
					g.AwayAbbr = comp.Team.Abbreviation
					g.AwayLogo = logo
				}
			}
		}
			g.IsFavorite = isFavoriteTeam(g.HomeAbbr, favTeams) || isFavoriteTeam(g.AwayAbbr, favTeams)
			g.IsTBD = isTBD
			// Deduplicate by start time + teams
			key := g.StartTime + g.HomeAbbr + g.AwayAbbr
			if !seen[key] {
				seen[key] = true
				schedule = append(schedule, g)
			}
		}
	} // end date chunks
	return schedule, nil
}

// -- Main integration fetcher

func FetchSportsData(db *sql.DB, integrationID string) (*SportsPanelData, error) {
	cfgJSON, err := readIntegrationConfig(db, integrationID)
	if err != nil {
		return nil, fmt.Errorf("sports integration not found: %v", err)
	}

	cfg := parseSportsConfig(cfgJSON)
	data := &SportsPanelData{
		Games:     []SportsGame{},
		Standings: []SportsStanding{},
		Schedule:  []SportsScheduleGame{},
		FetchedAt: time.Now().UTC().Format(time.RFC3339),
	}

	leagueGames := map[string][]SportsGame{}
	leagueSchedule := map[string][]SportsScheduleGame{}

	// We'll populate plays after the main loop for live games only
	for _, league := range cfg.Leagues {
		// Scores / today's games
		games, hasLive, seasonWin, err := fetchSportsScoreboard(league, cfg.Teams)
		if err != nil {
			log.Printf("[SPORTS] scoreboard error %s: %v", league, err)
		} else {
			data.Games = append(data.Games, games...)
			leagueGames[strings.ToUpper(league)] = games
			if hasLive {
				data.HasLive = true
			}
		}

		// Standings
		standings, err := fetchSportsStandings(league, cfg.Teams)
		if err != nil {
			log.Printf("[SPORTS] standings error %s: %v", league, err)
		} else {
			data.Standings = append(data.Standings, standings...)
		}

		// Schedule (upcoming only)
		schedule, err := fetchSportsSchedule(league, cfg.DaysAhead, cfg.Teams)
		if err != nil {
			log.Printf("[SPORTS] schedule error %s: %v", league, err)
		} else {
			data.Schedule = append(data.Schedule, schedule...)
			leagueSchedule[strings.ToUpper(league)] = schedule
		}

		// Detect off-season from ESPN's season window: outside [start, end] is
		// off-season. The scoreboard lists next scheduled games even months
		// ahead, so upcoming "pre" games alone don't mean the season is active.
		// Note the window can lag: after a season ends ESPN may keep the
		// scoreboard on the ended season for weeks (end date in the past).
		leagueUpper := strings.ToUpper(league)
		now := time.Now()
		var offSeason bool
		if !seasonWin.Start.IsZero() && !seasonWin.End.IsZero() {
			offSeason = now.Before(seasonWin.Start) || now.After(seasonWin.End)
		} else {
			offSeason = isLeagueOffSeason(league, leagueGames[leagueUpper], leagueSchedule[leagueUpper])
		}
		status := LeagueStatus{
			League:      leagueUpper,
			IsOffSeason: offSeason,
		}
		if offSeason {
			status.NextSeasonStart = nextRegularSeasonStart(league)
		}
		data.LeagueStatus = append(data.LeagueStatus, status)
	}

	// Fetch play-by-play for live games only (up to 8 most recent plays)
	for i, g := range data.Games {
		if g.Status != "in" {
			continue
		}
		plays, perr := fetchGamePlays(strings.ToLower(g.League), g.ID, 4)
		if perr != nil {
			log.Printf("[SPORTS] plays error %s %s: %v", g.League, g.ID, perr)
			continue
		}
		data.Games[i].Plays = plays
	}
	return data, nil
}

// Panel fetcher wrapper - called by cache worker
func fetchSportsPanelData(db *sql.DB, config map[string]interface{}) (interface{}, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no sports integration configured")
	}
	return FetchSportsData(db, integrationID)
}
