package handlers

import "testing"

func TestKapowarrUnwrapArray(t *testing.T) {
	t.Run("bare array", func(t *testing.T) {
		arr := kapowarrUnwrapArray([]byte(`[{"id": 1}, {"id": 2}]`))
		if len(arr) != 2 {
			t.Fatalf("expected 2 items, got %d: %v", len(arr), arr)
		}
	})

	t.Run("wrapped in result envelope", func(t *testing.T) {
		arr := kapowarrUnwrapArray([]byte(`{"result": [{"id": 1}, {"id": 2}, {"id": 3}]}`))
		if len(arr) != 3 {
			t.Fatalf("expected 3 items, got %d: %v", len(arr), arr)
		}
	})

	t.Run("result key present but not an array", func(t *testing.T) {
		arr := kapowarrUnwrapArray([]byte(`{"result": "not an array"}`))
		if arr != nil {
			t.Errorf("expected nil, got %v", arr)
		}
	})

	t.Run("neither shape matches", func(t *testing.T) {
		arr := kapowarrUnwrapArray([]byte(`{"other": "stuff"}`))
		if arr != nil {
			t.Errorf("expected nil, got %v", arr)
		}
	})

	t.Run("malformed JSON", func(t *testing.T) {
		arr := kapowarrUnwrapArray([]byte("not json"))
		if arr != nil {
			t.Errorf("expected nil, got %v", arr)
		}
	})
}

func TestKapowarrInt(t *testing.T) {
	m := map[string]interface{}{
		"volumes": float64(12),
		"total":   "not a number",
	}

	if got := kapowarrInt(m, "volumes"); got != 12 {
		t.Errorf("kapowarrInt single key = %d, want 12", got)
	}
	if got := kapowarrInt(m, "missing_key", "volumes"); got != 12 {
		t.Errorf("kapowarrInt should fall through to the first present key, got %d", got)
	}
	if got := kapowarrInt(m, "total"); got != 0 {
		t.Errorf("kapowarrInt on a non-numeric value = %d, want 0", got)
	}
	if got := kapowarrInt(m, "nonexistent"); got != 0 {
		t.Errorf("kapowarrInt on a missing key = %d, want 0", got)
	}
}

func TestParseKapowarrVolumeDetail(t *testing.T) {
	today := "2026-07-19"
	body := []byte(`{
		"result": {
			"title": "Some Series",
			"issues": [
				{"issue_number": "1", "date": "2026-07-25"},
				{"issue_number": "2", "date": "2026-07-10"},
				{"issue_number": "", "date": "2026-08-01"},
				{"issue_number": "3", "date": null}
			]
		}
	}`)

	items, err := parseKapowarrVolumeDetail(body, 42, "http://kapowarr.local", today)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Issue #2 is before today (dropped), issue #3 has a nil date (dropped).
	if len(items) != 2 {
		t.Fatalf("expected 2 items (past/dateless issues dropped), got %d: %v", len(items), items)
	}

	byTitle := map[string]dueItem{}
	for _, it := range items {
		byTitle[it.Title] = it
	}

	i1, ok := byTitle["Some Series #1"]
	if !ok {
		t.Fatalf("missing issue #1 event, got %v", items)
	}
	if i1.DueDate != "2026-07-25" {
		t.Errorf("issue #1 date = %q, want 2026-07-25", i1.DueDate)
	}
	if i1.Link != "http://kapowarr.local/volumes/42" {
		t.Errorf("issue #1 link = %q, want http://kapowarr.local/volumes/42", i1.Link)
	}

	// Empty issue_number should fall back to the bare series title (no "#" suffix).
	if _, ok := byTitle["Some Series"]; !ok {
		t.Errorf("expected bare title for issue with empty issue_number, got %v", byTitle)
	}
}

func TestParseKapowarrVolumeDetailMalformedJSON(t *testing.T) {
	if _, err := parseKapowarrVolumeDetail([]byte("not json"), 1, "http://kapowarr.local", "2026-07-19"); err == nil {
		t.Error("expected error for malformed JSON")
	}
}
