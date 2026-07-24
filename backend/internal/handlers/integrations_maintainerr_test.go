package handlers

import (
	"testing"
	"time"
)

func TestMaintainerrActionLabel(t *testing.T) {
	cases := []struct {
		action int
		want   string
	}{
		{0, "Delete"},
		{1, "Unmonitor/Delete"},
		{2, "Unmonitor/Delete Existing"},
		{3, "Unmonitor/Keep"},
		{5, "Delete Empty Show"},
		{6, "Unmonitor Empty Show"},
		{7, "Change Quality"},
		{4, "Scheduled Action"},  // DO_NOTHING has no dedicated label — never actually reaches this path in practice, since it's filtered upstream, but the fallback must still be sane
		{99, "Scheduled Action"}, // unknown/future action value
	}
	for _, tc := range cases {
		if got := maintainerrActionLabel(tc.action); got != tc.want {
			t.Errorf("maintainerrActionLabel(%d) = %q, want %q", tc.action, got, tc.want)
		}
	}
}

func TestMaintainerrParseAddDate(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		wantOK  bool
		wantYMD string // year-month-day, to sidestep timezone-of-time-parsed comparisons
	}{
		{"RFC3339", "2026-07-19T14:30:00Z", true, "2026-07-19"},
		{"SQL-ish datetime", "2026-07-19 14:30:00", true, "2026-07-19"},
		{"plain date", "2026-07-19", true, "2026-07-19"},
		{"long garbage with valid 10-char date prefix", "2026-07-19T14:30:00.123456-garbage", true, "2026-07-19"},
		{"total garbage", "not-a-date-at-all", false, ""},
		{"empty", "", false, ""},
		{"too short to even trim", "2026-07", false, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := maintainerrParseAddDate(tc.in)
			if ok != tc.wantOK {
				t.Fatalf("maintainerrParseAddDate(%q) ok = %v, want %v", tc.in, ok, tc.wantOK)
			}
			if !ok {
				return
			}
			if gotYMD := got.Format("2006-01-02"); gotYMD != tc.wantYMD {
				t.Errorf("maintainerrParseAddDate(%q) = %v, want date %s", tc.in, got, tc.wantYMD)
			}
		})
	}
}

func TestParseMaintainerrActionItems(t *testing.T) {
	// Pin time.Local to UTC — parseMaintainerrActionItems converts addDate to
	// local time before adding deleteAfterDays, so the resulting date bucket
	// depends on the machine's zone unless pinned.
	origLocal := time.Local
	time.Local = time.UTC
	defer func() { time.Local = origLocal }()

	body := []byte(`[
		{
			"id": 1,
			"title": "Old Movies",
			"arrAction": 0,
			"deleteAfterDays": 5,
			"media": [
				{"addDate": "2026-07-20T00:00:00Z"},
				{"addDate": "2026-07-20T08:00:00Z"},
				{"addDate": "2026-07-21T00:00:00Z"}
			]
		},
		{
			"id": 2,
			"title": "Keep Forever",
			"arrAction": 4,
			"deleteAfterDays": 10,
			"media": [
				{"addDate": "2026-07-20T00:00:00Z"}
			]
		},
		{
			"id": 3,
			"title": "No Threshold Set",
			"arrAction": 1,
			"media": [
				{"addDate": "2026-07-20T00:00:00Z"}
			]
		},
		{
			"id": 4,
			"title": "Unparseable And Empty Dates",
			"arrAction": 1,
			"deleteAfterDays": 3,
			"media": [
				{"addDate": ""},
				{"addDate": "garbage"}
			]
		}
	]`)

	items, err := parseMaintainerrActionItems(body, "http://maintainerr.local")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// "Keep Forever" (arrAction=4, DO_NOTHING) is skipped entirely.
	// "No Threshold Set" (nil deleteAfterDays) is skipped entirely.
	// "Unparseable And Empty Dates" contributes zero items (both its media entries are unusable).
	// "Old Movies" has 2 media items on 2026-07-20 (addDate+5d=2026-07-25) and
	// 1 on 2026-07-21 (addDate+5d=2026-07-26) — two separate day buckets.
	if len(items) != 2 {
		t.Fatalf("expected 2 aggregated items, got %d: %+v", len(items), items)
	}

	byDate := map[string]dueItem{}
	for _, it := range items {
		byDate[it.DueDate] = it
	}

	twoItems, ok := byDate["2026-07-25"]
	if !ok {
		t.Fatalf("missing bucket for 2026-07-25, got %v", byDate)
	}
	if twoItems.Title != "Old Movies: 2 items (Delete)" {
		t.Errorf("2-item bucket title = %q, want %q", twoItems.Title, "Old Movies: 2 items (Delete)")
	}
	if twoItems.Link != "http://maintainerr.local/collections/1" {
		t.Errorf("link = %q, want collection deep link", twoItems.Link)
	}

	oneItem, ok := byDate["2026-07-26"]
	if !ok {
		t.Fatalf("missing bucket for 2026-07-26, got %v", byDate)
	}
	if oneItem.Title != "Old Movies: 1 item (Delete)" {
		t.Errorf("1-item bucket title = %q, want singular 'item'", oneItem.Title)
	}
}

func TestParseMaintainerrActionItemsMalformedJSON(t *testing.T) {
	if _, err := parseMaintainerrActionItems([]byte("not json"), "http://maintainerr.local"); err == nil {
		t.Error("expected error for malformed JSON")
	}
}
