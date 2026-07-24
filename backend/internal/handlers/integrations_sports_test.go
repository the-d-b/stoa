package handlers

import (
	"testing"
)

func TestParseESPNTime(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		wantErr bool
	}{
		{"rfc3339", "2026-07-19T18:00:00Z", false},
		{"minute precision no seconds", "2026-07-19T18:00Z", false},
		{"second precision", "2026-07-19T18:00:00Z", false},
		{"garbage", "not-a-time", true},
		{"empty", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseESPNTime(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("parseESPNTime(%q) = %v, want error", tc.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseESPNTime(%q) unexpected error: %v", tc.in, err)
			}
			if got.Year() != 2026 {
				t.Errorf("parseESPNTime(%q) = %v, want year 2026", tc.in, got)
			}
		})
	}
}

func TestIsFavoriteTeam(t *testing.T) {
	favs := []string{"COL", "sjs", "Dal"}
	cases := []struct {
		abbr string
		want bool
	}{
		{"COL", true},
		{"col", true}, // case-insensitive
		{"SJS", true}, // favs list itself is mixed-case
		{"DAL", true},
		{"BOS", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := isFavoriteTeam(tc.abbr, favs); got != tc.want {
			t.Errorf("isFavoriteTeam(%q, %v) = %v, want %v", tc.abbr, favs, got, tc.want)
		}
	}
	if isFavoriteTeam("COL", nil) {
		t.Error("isFavoriteTeam with nil favTeams should always be false")
	}
}

func TestIsLeagueOffSeason(t *testing.T) {
	cases := []struct {
		name     string
		games    []SportsGame
		schedule []SportsScheduleGame
		want     bool
	}{
		{
			name:  "has a pre game today",
			games: []SportsGame{{Status: "pre"}},
			want:  false,
		},
		{
			name:  "has a live game",
			games: []SportsGame{{Status: "in"}},
			want:  false,
		},
		{
			name:  "only completed games, no schedule",
			games: []SportsGame{{Status: "post"}, {Status: "post"}},
			want:  true,
		},
		{
			name: "no games, but schedule has upcoming",
			schedule: []SportsScheduleGame{
				{HomeTeam: "A", AwayTeam: "B"},
			},
			want: false,
		},
		{
			name: "nothing at all",
			want: true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isLeagueOffSeason("nhl", tc.games, tc.schedule); got != tc.want {
				t.Errorf("isLeagueOffSeason() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestParseSportsConfig(t *testing.T) {
	t.Run("defaults applied when empty", func(t *testing.T) {
		cfg := parseSportsConfig("{}")
		if len(cfg.Leagues) != 4 {
			t.Errorf("expected 4 default leagues, got %v", cfg.Leagues)
		}
		if cfg.DaysAhead != 28 {
			t.Errorf("expected default daysAhead 28, got %d", cfg.DaysAhead)
		}
	})

	t.Run("custom values preserved", func(t *testing.T) {
		cfg := parseSportsConfig(`{"leagues":["nhl"],"teams":["COL"],"daysAhead":7}`)
		if len(cfg.Leagues) != 1 || cfg.Leagues[0] != "nhl" {
			t.Errorf("expected leagues=[nhl], got %v", cfg.Leagues)
		}
		if len(cfg.Teams) != 1 || cfg.Teams[0] != "COL" {
			t.Errorf("expected teams=[COL], got %v", cfg.Teams)
		}
		if cfg.DaysAhead != 7 {
			t.Errorf("expected daysAhead=7, got %d", cfg.DaysAhead)
		}
	})

	t.Run("malformed JSON still yields safe defaults", func(t *testing.T) {
		cfg := parseSportsConfig("not json")
		if len(cfg.Leagues) != 4 {
			t.Errorf("expected fallback to 4 default leagues on malformed input, got %v", cfg.Leagues)
		}
		if cfg.DaysAhead != 28 {
			t.Errorf("expected fallback daysAhead 28 on malformed input, got %d", cfg.DaysAhead)
		}
	})
}

func TestLogoURL(t *testing.T) {
	got := logoURL("", "nhl", "COL")
	want := "https://a.espncdn.com/i/teamlogos/nhl/500/col.png"
	if got != want {
		t.Errorf("logoURL() = %q, want %q", got, want)
	}
}

func TestParseScoreboardResponse(t *testing.T) {
	body := []byte(`{
		"leagues": [{"season": {"startDate": "2026-10-01T00:00Z", "endDate": "2027-04-15T00:00Z"}}],
		"events": [
			{
				"id": "401001",
				"shortName": "COL @ BOS",
				"date": "2026-07-19T18:00Z",
				"status": {"type": {"state": "in", "description": "In Progress", "completed": false}, "displayClock": "12:34", "period": 2},
				"competitions": [{
					"competitors": [
						{"homeAway": "home", "score": "3", "team": {"displayName": "Boston Bruins", "abbreviation": "BOS", "color": "111111", "logo": "https://example.com/bos.png"}},
						{"homeAway": "away", "score": "2", "team": {"displayName": "Colorado Avalanche", "abbreviation": "COL", "color": "222222", "logo": ""}}
					]
				}]
			},
			{
				"id": "401002",
				"shortName": "DAL @ SJS",
				"date": "2026-07-18T02:00Z",
				"status": {"type": {"state": "post", "description": "Final", "completed": true}, "displayClock": "0:00", "period": 3},
				"competitions": [{
					"competitors": [
						{"homeAway": "home", "score": "4", "team": {"displayName": "San Jose Sharks", "abbreviation": "SJS", "color": "333333", "logo": "https://example.com/sjs.png"}},
						{"homeAway": "away", "score": "1", "team": {"displayName": "Dallas Stars", "abbreviation": "DAL", "color": "444444", "logo": "https://example.com/dal.png"}}
					]
				}]
			}
		]
	}`)

	games, hasLive, season, err := parseScoreboardResponse("nhl", []string{"COL"}, body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !hasLive {
		t.Error("expected hasLive=true (one event has state=in)")
	}
	if season.Start.IsZero() || season.End.IsZero() {
		t.Errorf("expected season window to be parsed, got %+v", season)
	}
	if len(games) != 2 {
		t.Fatalf("expected 2 games, got %d", len(games))
	}

	live := games[0]
	if live.HomeTeam != "Boston Bruins" || live.AwayTeam != "Colorado Avalanche" {
		t.Errorf("home/away mismatch: home=%q away=%q", live.HomeTeam, live.AwayTeam)
	}
	if live.HomeLogo != "https://example.com/bos.png" {
		t.Errorf("expected home logo to pass through unchanged, got %q", live.HomeLogo)
	}
	// away team had an empty logo in the fixture — should fall back to logoURL()
	if live.AwayLogo != logoURL("", "nhl", "COL") {
		t.Errorf("expected away logo fallback, got %q", live.AwayLogo)
	}
	if !live.IsFavorite {
		t.Error("expected IsFavorite=true — COL is in favTeams and is the away team")
	}

	final := games[1]
	if final.IsFavorite {
		t.Error("expected IsFavorite=false — neither SJS nor DAL is a favorite")
	}
	if final.Status != "post" {
		t.Errorf("expected status=post, got %q", final.Status)
	}

	t.Run("malformed JSON returns error", func(t *testing.T) {
		if _, _, _, err := parseScoreboardResponse("nhl", nil, []byte("not json")); err == nil {
			t.Error("expected error for malformed JSON")
		}
	})

	t.Run("no events yields empty slice, no live", func(t *testing.T) {
		games, hasLive, _, err := parseScoreboardResponse("nhl", nil, []byte(`{"events": []}`))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if hasLive {
			t.Error("expected hasLive=false with no events")
		}
		if len(games) != 0 {
			t.Errorf("expected 0 games, got %d", len(games))
		}
	})
}

func TestParseStandingsResponse(t *testing.T) {
	body := []byte(`{
		"children": [{
			"name": "Central",
			"standings": {
				"entries": [
					{
						"team": {"displayName": "Colorado Avalanche", "abbreviation": "COL", "logo": ""},
						"stats": [
							{"name": "wins", "displayValue": "45"},
							{"name": "losses", "displayValue": "20"},
							{"name": "winPercent", "displayValue": ".692"},
							{"name": "gamesBehind", "displayValue": "-"}
						]
					},
					{
						"team": {"displayName": "Dallas Stars", "abbreviation": "DAL", "logo": "https://example.com/dal.png"},
						"stats": [
							{"name": "wins", "displayValue": "40"},
							{"name": "losses", "displayValue": "25"},
							{"name": "pct", "displayValue": ".615"},
							{"name": "gb", "displayValue": "5.0"}
						]
					}
				]
			}
		}]
	}`)

	standings, err := parseStandingsResponse("nhl", []string{"COL"}, body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(standings) != 1 || standings[0].Division != "Central" {
		t.Fatalf("expected 1 division named Central, got %+v", standings)
	}
	teams := standings[0].Teams
	if len(teams) != 2 {
		t.Fatalf("expected 2 teams, got %d", len(teams))
	}

	col := teams[0]
	if col.Wins != 45 || col.Losses != 20 {
		t.Errorf("COL record wrong: wins=%d losses=%d", col.Wins, col.Losses)
	}
	if col.Pct != ".692" {
		t.Errorf("expected winPercent stat name to populate Pct, got %q", col.Pct)
	}
	if !col.IsFav {
		t.Error("expected COL to be flagged favorite")
	}
	if col.Logo != logoURL("", "nhl", "COL") {
		t.Errorf("expected logo fallback for COL (empty in fixture), got %q", col.Logo)
	}

	dal := teams[1]
	if dal.Pct != ".615" {
		t.Errorf("expected alternate 'pct' stat name to populate Pct, got %q", dal.Pct)
	}
	if dal.GB != "5.0" {
		t.Errorf("expected alternate 'gb' stat name to populate GB, got %q", dal.GB)
	}
	if dal.Logo != "https://example.com/dal.png" {
		t.Errorf("expected DAL logo to pass through unchanged, got %q", dal.Logo)
	}
	if dal.IsFav {
		t.Error("expected DAL to not be flagged favorite")
	}
}

func TestParseScheduleChunk(t *testing.T) {
	body := []byte(`{
		"events": [
			{
				"date": "2026-07-25T18:00Z",
				"status": {"type": {"state": "pre"}},
				"competitions": [{
					"timeValid": true,
					"competitors": [
						{"homeAway": "home", "team": {"displayName": "Boston Bruins", "abbreviation": "BOS", "logo": ""}},
						{"homeAway": "away", "team": {"displayName": "Colorado Avalanche", "abbreviation": "COL", "logo": "https://example.com/col.png"}}
					]
				}]
			},
			{
				"date": "2026-07-20T18:00Z",
				"status": {"type": {"state": "post"}},
				"competitions": [{
					"timeValid": true,
					"competitors": [
						{"homeAway": "home", "team": {"displayName": "San Jose Sharks", "abbreviation": "SJS", "logo": ""}},
						{"homeAway": "away", "team": {"displayName": "Dallas Stars", "abbreviation": "DAL", "logo": ""}}
					]
				}]
			},
			{
				"date": "2026-07-26T00:00Z",
				"status": {"type": {"state": "pre"}},
				"competitions": [{
					"timeValid": false,
					"competitors": [
						{"homeAway": "home", "team": {"displayName": "Winnipeg Jets", "abbreviation": "WPG", "logo": ""}},
						{"homeAway": "away", "team": {"displayName": "Vegas Golden Knights", "abbreviation": "VGK", "logo": ""}}
					]
				}]
			}
		]
	}`)

	seen := map[string]bool{}
	games, err := parseScheduleChunk("nhl", []string{"COL"}, body, seen)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// The "post" (completed) game should be filtered out entirely.
	if len(games) != 2 {
		t.Fatalf("expected 2 upcoming games (post-game filtered), got %d: %+v", len(games), games)
	}

	bruins := games[0]
	if bruins.HomeTeam != "Boston Bruins" || bruins.AwayTeam != "Colorado Avalanche" {
		t.Errorf("home/away mismatch: home=%q away=%q", bruins.HomeTeam, bruins.AwayTeam)
	}
	if !bruins.IsFavorite {
		t.Error("expected IsFavorite=true — COL is a favorite and is the away team")
	}
	if bruins.IsTBD {
		t.Error("expected IsTBD=false — timeValid was true in the fixture")
	}
	if bruins.AwayLogo != "https://example.com/col.png" {
		t.Errorf("expected away logo to pass through unchanged, got %q", bruins.AwayLogo)
	}
	if bruins.HomeLogo != logoURL("", "nhl", "BOS") {
		t.Errorf("expected home logo fallback (empty in fixture), got %q", bruins.HomeLogo)
	}

	jets := games[1]
	if !jets.IsTBD {
		t.Error("expected IsTBD=true — timeValid was false in the fixture")
	}

	t.Run("dedup carries across chunks via shared seen map", func(t *testing.T) {
		// Re-parsing the exact same body against the same seen map should
		// produce zero additional games — this is how fetchSportsSchedule
		// avoids duplicating a game that appears in adjacent date-range chunks.
		again, err := parseScheduleChunk("nhl", []string{"COL"}, body, seen)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(again) != 0 {
			t.Errorf("expected 0 games on re-parse with shared seen map, got %d", len(again))
		}
	})
}

// FetchSportsData treats a zero Start/End as "no season window available" —
// confirms that contract holds for the zero value of the struct itself.
func TestEspnSeasonWindowZeroValue(t *testing.T) {
	var w espnSeasonWindow
	if !w.Start.IsZero() || !w.End.IsZero() {
		t.Error("zero-value espnSeasonWindow should have zero Start/End")
	}
}
