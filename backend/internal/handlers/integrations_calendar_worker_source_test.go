package handlers

import (
	"testing"
	"time"
)

// ── Sonarr ────────────────────────────────────────────────────────────────

func TestParseSonarrCalEvents(t *testing.T) {
	body := []byte(`[
		{
			"title": "Pilot",
			"airDate": "2026-07-25",
			"hasFile": false,
			"series": {"title": "Some Show", "titleSlug": "some-show"}
		},
		{
			"title": "No Series Info",
			"airDate": "2026-07-26",
			"hasFile": true
		}
	]`)

	events := parseSonarrCalEvents(body, "http://sonarr.local")
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d: %v", len(events), events)
	}

	e := events[0]
	if e["title"] != "Some Show — Pilot" {
		t.Errorf("expected combined series/episode title, got %v", e["title"])
	}
	if e["date"] != "2026-07-25" {
		t.Errorf("expected date passthrough, got %v", e["date"])
	}
	if e["uiUrl"] != "http://sonarr.local" || e["color"] != "#60a5fa" {
		t.Errorf("uiUrl/color mismatch: %v", e)
	}
	if e["hasFile"] != false {
		t.Errorf("expected hasFile=false, got %v", e["hasFile"])
	}

	// Missing "series" object shouldn't panic — seriesTitle/titleSlug just go empty
	e2 := events[1]
	if e2["title"] != " — No Series Info" {
		t.Errorf("expected empty series title prefix, got %v", e2["title"])
	}
}

// ── Radarr ────────────────────────────────────────────────────────────────

func TestParseRadarrCalEvents(t *testing.T) {
	// parseRadarrCalEvents runs release dates through localDate(), which
	// converts to the machine's local zone — pin to UTC so the expected
	// dates below don't depend on where this test happens to run.
	origLocal := time.Local
	time.Local = time.UTC
	defer func() { time.Local = origLocal }()

	today := "2026-07-19"
	body := []byte(`[
		{
			"title": "Future Movie",
			"titleSlug": "future-movie",
			"hasFile": false,
			"inCinemas": "2026-07-20T00:00:00Z",
			"digitalRelease": "2026-08-01T00:00:00Z"
		},
		{
			"title": "Already Released",
			"titleSlug": "already-released",
			"hasFile": true,
			"inCinemas": "2025-01-01T00:00:00Z"
		},
		{
			"title": "No Dates",
			"titleSlug": "no-dates",
			"hasFile": false
		}
	]`)

	events := parseRadarrCalEvents(body, "http://radarr.local", today)

	// "Future Movie" should produce 2 events (cinema + digital), both >= today.
	// "Already Released" should produce 0 (its only date is in the past).
	// "No Dates" should produce 0.
	if len(events) != 2 {
		t.Fatalf("expected 2 events (only future releases of Future Movie), got %d: %v", len(events), events)
	}

	byLabel := map[string]map[string]interface{}{}
	for _, e := range events {
		byLabel[e["title"].(string)] = e
	}
	if e, ok := byLabel["Future Movie (In Cinemas)"]; !ok {
		t.Errorf("missing cinema release event, got %v", events)
	} else if e["date"] != "2026-07-20" {
		t.Errorf("expected cinema date 2026-07-20, got %v", e["date"])
	}
	if e, ok := byLabel["Future Movie (Digital)"]; !ok {
		t.Errorf("missing digital release event, got %v", events)
	} else if e["date"] != "2026-08-01" {
		t.Errorf("expected digital date 2026-08-01, got %v", e["date"])
	}
	for _, e := range events {
		if e["title"] == "Already Released (In Cinemas)" {
			t.Errorf("past release should have been filtered out, got %v", e)
		}
	}
}

// ── Readarr ───────────────────────────────────────────────────────────────

func TestParseReadarrCalEvents(t *testing.T) {
	body := []byte(`[
		{
			"title": "The Book",
			"titleSlug": "the-book",
			"releaseDate": "2026-07-25T00:00:00Z",
			"hasFile": false,
			"author": {"authorName": "Some Author"}
		},
		{
			"title": "No Author Book",
			"releaseDate": "2026-07-26T00:00:00Z",
			"hasFile": true
		},
		{
			"title": "No Release Date",
			"hasFile": false
		}
	]`)

	events := parseReadarrCalEvents(body, "http://readarr.local")
	// "No Release Date" should be skipped entirely.
	if len(events) != 2 {
		t.Fatalf("expected 2 events (no-date book skipped), got %d: %v", len(events), events)
	}

	if events[0]["title"] != "Some Author — The Book" {
		t.Errorf("expected author-prefixed title, got %v", events[0]["title"])
	}
	if events[1]["title"] != "No Author Book" {
		t.Errorf("expected bare title when author missing, got %v", events[1]["title"])
	}
}

// ── Lidarr ────────────────────────────────────────────────────────────────

func TestParseLidarrCalEvents(t *testing.T) {
	body := []byte(`[
		{
			"title": "The Album",
			"releaseDate": "2026-07-25T00:00:00Z",
			"artist": {"artistName": "Some Artist", "foreignArtistId": "abc-123"}
		}
	]`)

	events := parseLidarrCalEvents(body, "http://lidarr.local")
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	e := events[0]
	if e["title"] != "Some Artist — The Album" {
		t.Errorf("expected artist-prefixed title, got %v", e["title"])
	}
	if e["foreignArtistId"] != "abc-123" {
		t.Errorf("expected foreignArtistId passthrough, got %v", e["foreignArtistId"])
	}
}

// ── Home Assistant ────────────────────────────────────────────────────────

func TestParseHomeAssistantEvents(t *testing.T) {
	body := []byte(`[
		{"summary": "All-day thing", "start": {"date": "2026-07-25"}},
		{"summary": "Timed meeting", "start": {"dateTime": "2026-07-26T14:00:00-06:00"}, "end": {"dateTime": "2026-07-26T15:00:00-06:00"}},
		{"summary": "", "start": {"date": "2026-07-27"}},
		{"start": {}}
	]`)

	t.Run("single calendar - no title prefix", func(t *testing.T) {
		events, err := parseHomeAssistantEvents(body, "Home", false, "Home Assistant", "http://ha.local")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// The event with neither date nor dateTime should be dropped.
		if len(events) != 3 {
			t.Fatalf("expected 3 events (dateless one dropped), got %d: %v", len(events), events)
		}

		allDay := events[0]
		if allDay["date"] != "2026-07-25" {
			t.Errorf("expected all-day date, got %v", allDay["date"])
		}
		if _, has := allDay["startDT"]; has {
			t.Errorf("all-day event should not carry startDT, got %v", allDay)
		}

		timed := events[1]
		if timed["date"] != "2026-07-26" {
			t.Errorf("expected date derived from dateTime, got %v", timed["date"])
		}
		if timed["startDT"] != "2026-07-26T14:00:00-06:00" {
			t.Errorf("expected startDT passthrough, got %v", timed["startDT"])
		}
		if timed["endDT"] != "2026-07-26T15:00:00-06:00" {
			t.Errorf("expected endDT passthrough, got %v", timed["endDT"])
		}

		untitled := events[2]
		if untitled["title"] != "(no title)" {
			t.Errorf("expected fallback title for empty summary, got %v", untitled["title"])
		}
		if untitled["uiUrl"] != "http://ha.local/calendar" {
			t.Errorf("expected uiUrl with /calendar suffix, got %v", untitled["uiUrl"])
		}
	})

	t.Run("multiple calendars - title prefixed with calendar name", func(t *testing.T) {
		events, err := parseHomeAssistantEvents(body, "Family", true, "Home Assistant", "http://ha.local")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if events[0]["title"] != "Family: All-day thing" {
			t.Errorf("expected calendar-name-prefixed title, got %v", events[0]["title"])
		}
	})

	t.Run("malformed JSON returns error", func(t *testing.T) {
		if _, err := parseHomeAssistantEvents([]byte("not json"), "Home", false, "Home Assistant", "http://ha.local"); err == nil {
			t.Error("expected error for malformed JSON")
		}
	})
}

// ── Sports ────────────────────────────────────────────────────────────────

func TestComputeSportsCalEvents(t *testing.T) {
	// Pin time.Local to UTC so the game-time-to-local-date conversion inside
	// computeSportsCalEvents is deterministic regardless of the machine
	// running the test — this test is about the title/filter logic, not
	// about timezone shifting (that's covered separately by TestLocalDate).
	origLocal := time.Local
	time.Local = time.UTC
	defer func() { time.Local = origLocal }()

	orig := timeNow
	timeNow = func() time.Time { return time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC) }
	defer func() { timeNow = orig }()

	data := &SportsPanelData{
		Schedule: []SportsScheduleGame{
			{League: "NHL", HomeAbbr: "BOS", AwayAbbr: "COL", StartTime: "2026-07-20T18:00:00Z", IsFavorite: true},
			{League: "NHL", HomeAbbr: "SJS", AwayAbbr: "DAL", StartTime: "2026-07-21T18:00:00Z", IsFavorite: false},
			{League: "NHL", HomeAbbr: "WPG", AwayAbbr: "VGK", StartTime: "2026-07-10T18:00:00Z"}, // in the past — dropped
			{League: "NHL", HomeAbbr: "TBL", AwayAbbr: "FLA", StartTime: "2026-07-22T18:00:00Z", IsTBD: true}, // no confirmed time — dropped
			{League: "NHL", HomeAbbr: "NYR", AwayAbbr: "NYI", StartTime: ""}, // no start time at all — dropped
		},
	}

	events := computeSportsCalEvents("Sports", data)
	if len(events) != 2 {
		t.Fatalf("expected 2 events (past/TBD/dateless dropped), got %d: %v", len(events), events)
	}

	fav := events[0]
	if fav["title"] != "⭐ NHL COL @ BOS" {
		t.Errorf("expected star-prefixed title for favorite matchup, got %v", fav["title"])
	}
	if fav["date"] != "2026-07-20" {
		t.Errorf("expected date derived from StartTime, got %v", fav["date"])
	}

	nonFav := events[1]
	if nonFav["title"] != "NHL DAL @ SJS" {
		t.Errorf("expected unstarred title for non-favorite matchup, got %v", nonFav["title"])
	}
}
