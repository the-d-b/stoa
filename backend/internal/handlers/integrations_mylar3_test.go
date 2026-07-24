package handlers

import "testing"

func TestMylar3StringOrNum(t *testing.T) {
	m := map[string]interface{}{
		"strField": "5",
		"numField": float64(5),
		"floatVal": float64(5.5),
	}
	if got := mylar3StringOrNum(m, "strField"); got != "5" {
		t.Errorf("string field = %q, want \"5\"", got)
	}
	if got := mylar3StringOrNum(m, "numField"); got != "5" {
		t.Errorf("numeric field = %q, want \"5\"", got)
	}
	if got := mylar3StringOrNum(m, "floatVal"); got != "5.5" {
		t.Errorf("fractional field = %q, want \"5.5\"", got)
	}
	if got := mylar3StringOrNum(m, "missing"); got != "" {
		t.Errorf("missing key = %q, want empty", got)
	}
}

func TestParseMylar3UpcomingItems(t *testing.T) {
	body := []byte(`[
		{
			"ComicName": "Some Comic",
			"ComicID": "12345",
			"Issue_Number": "7",
			"ReleaseDate": "2026-07-25"
		},
		{
			"ComicName": "No Issue Number",
			"ComicID": "999",
			"ReleaseDate": "2026-07-26"
		},
		{
			"ComicName": "No Comic ID",
			"Issue_Number": "1",
			"ReleaseDate": "2026-07-27"
		},
		{
			"ComicName": "Missing Date"
		},
		{
			"ReleaseDate": "2026-07-28"
		}
	]`)

	items, err := parseMylar3UpcomingItems(body, "http://mylar3.local")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// "Missing Date" (no ReleaseDate) and the nameless entry (no ComicName) are both dropped.
	if len(items) != 3 {
		t.Fatalf("expected 3 items, got %d: %v", len(items), items)
	}

	byTitle := map[string]dueItem{}
	for _, it := range items {
		byTitle[it.Title] = it
	}

	withNum, ok := byTitle["Some Comic #7"]
	if !ok {
		t.Fatalf("missing issue-numbered title, got %v", byTitle)
	}
	if withNum.Link != "http://mylar3.local/comicDetails?ComicID=12345" {
		t.Errorf("link = %q, want comicDetails link with ComicID", withNum.Link)
	}

	if _, ok := byTitle["No Issue Number"]; !ok {
		t.Errorf("expected bare title when Issue_Number absent, got %v", byTitle)
	}

	noID, ok := byTitle["No Comic ID #1"]
	if !ok {
		t.Fatalf("missing title for entry without ComicID, got %v", byTitle)
	}
	if noID.Link != "" {
		t.Errorf("expected empty link when ComicID absent, got %q", noID.Link)
	}
}

func TestParseMylar3UpcomingItemsMalformedJSON(t *testing.T) {
	if _, err := parseMylar3UpcomingItems([]byte("not json"), "http://mylar3.local"); err == nil {
		t.Error("expected error for malformed JSON")
	}
}
