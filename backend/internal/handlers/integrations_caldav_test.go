package handlers

import (
	"strings"
	"testing"
	"time"
)

// ── Multistatus XML parsing ──────────────────────────────────────────────

func TestParseCaldavMultistatus(t *testing.T) {
	t.Run("Nextcloud-style namespace prefixes (d:/cal:)", func(t *testing.T) {
		xml := `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/calendars/alice/personal/event1.ics</d:href>
    <d:propstat>
      <d:prop>
        <cal:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:event1@test
SUMMARY:Dentist
DTSTART:20260723T140000Z
END:VEVENT
END:VCALENDAR
</cal:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`
		vevents, err := parseCaldavMultistatus([]byte(xml))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(vevents) != 1 || vevents[0].Summary != "Dentist" {
			t.Fatalf("expected 1 vevent named Dentist, got %+v", vevents)
		}
	})

	t.Run("different namespace prefixes still parse (namespace-agnostic by local name)", func(t *testing.T) {
		// Same structure, different prefix letters (D:/C: vs d:/cal:) — a server
		// implementation detail that must not matter, since encoding/xml
		// matches on local element name, not the prefix a server happens to pick.
		xml := `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:propstat>
      <D:prop>
        <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:event2@test
SUMMARY:Standup
DTSTART:20260724T090000Z
END:VEVENT
END:VCALENDAR
</C:calendar-data>
      </D:prop>
    </D:propstat>
  </D:response>
</D:multistatus>`
		vevents, err := parseCaldavMultistatus([]byte(xml))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(vevents) != 1 || vevents[0].Summary != "Standup" {
			t.Fatalf("expected 1 vevent named Standup regardless of namespace prefix, got %+v", vevents)
		}
	})

	t.Run("multiple responses yield multiple vevents", func(t *testing.T) {
		xml := `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:propstat><d:prop><cal:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:a@test
SUMMARY:Event A
DTSTART:20260723T140000Z
END:VEVENT
END:VCALENDAR
</cal:calendar-data></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:propstat><d:prop><cal:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:b@test
SUMMARY:Event B
DTSTART:20260724T140000Z
END:VEVENT
END:VCALENDAR
</cal:calendar-data></d:prop></d:propstat>
  </d:response>
</d:multistatus>`
		vevents, err := parseCaldavMultistatus([]byte(xml))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(vevents) != 2 {
			t.Fatalf("expected 2 vevents, got %d: %+v", len(vevents), vevents)
		}
	})

	t.Run("response with empty calendar-data is skipped, not errored", func(t *testing.T) {
		// Some servers include a response entry for the collection resource
		// itself (no calendar-data) alongside per-event entries.
		xml := `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:propstat><d:prop><cal:calendar-data></cal:calendar-data></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:propstat><d:prop><cal:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:c@test
SUMMARY:Real Event
DTSTART:20260723T140000Z
END:VEVENT
END:VCALENDAR
</cal:calendar-data></d:prop></d:propstat>
  </d:response>
</d:multistatus>`
		vevents, err := parseCaldavMultistatus([]byte(xml))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(vevents) != 1 || vevents[0].Summary != "Real Event" {
			t.Fatalf("expected only the real event, got %+v", vevents)
		}
	})

	t.Run("no responses at all yields empty slice, no error", func(t *testing.T) {
		xml := `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>`
		vevents, err := parseCaldavMultistatus([]byte(xml))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(vevents) != 0 {
			t.Errorf("expected 0 vevents, got %d", len(vevents))
		}
	})

	t.Run("malformed XML returns error", func(t *testing.T) {
		if _, err := parseCaldavMultistatus([]byte("not xml")); err == nil {
			t.Error("expected error for malformed XML")
		}
	})
}

// ── Event-creation timing ────────────────────────────────────────────────

func TestCaldavEventTiming(t *testing.T) {
	t.Run("all-day event: DTEND is exclusive (next day)", func(t *testing.T) {
		got, err := caldavEventTiming("2026-07-23", "", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := "DTSTART;VALUE=DATE:20260723\r\nDTEND;VALUE=DATE:20260724\r\n"
		if got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	})

	t.Run("all-day event: invalid date errors", func(t *testing.T) {
		if _, err := caldavEventTiming("not-a-date", "", ""); err == nil {
			t.Error("expected error for invalid date")
		}
	})

	t.Run("timed event: explicit end passes through", func(t *testing.T) {
		got, err := caldavEventTiming("", "2026-07-23T14:00:00Z", "2026-07-23T15:30:00Z")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := "DTSTART:20260723T140000Z\r\nDTEND:20260723T153000Z\r\n"
		if got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	})

	t.Run("timed event: empty end defaults to start+1h", func(t *testing.T) {
		got, err := caldavEventTiming("", "2026-07-23T14:00:00Z", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := "DTSTART:20260723T140000Z\r\nDTEND:20260723T150000Z\r\n"
		if got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	})

	t.Run("timed event: unparseable end also defaults to start+1h", func(t *testing.T) {
		got, err := caldavEventTiming("", "2026-07-23T14:00:00Z", "not-a-time")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := "DTSTART:20260723T140000Z\r\nDTEND:20260723T150000Z\r\n"
		if got != want {
			t.Errorf("got %q, want %q (garbage end should fall back, not error)", got, want)
		}
	})

	t.Run("timed event: invalid start errors", func(t *testing.T) {
		if _, err := caldavEventTiming("", "not-a-time", ""); err == nil {
			t.Error("expected error for invalid start time")
		}
	})

	t.Run("timed event: non-UTC offset is normalized to Z", func(t *testing.T) {
		got, err := caldavEventTiming("", "2026-07-23T08:00:00-06:00", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// 8am MDT (-06:00) == 2pm UTC
		want := "DTSTART:20260723T140000Z\r\nDTEND:20260723T150000Z\r\n"
		if got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	})
}

// ── ICS text escaping ────────────────────────────────────────────────────

func TestIcsEscapeUnescapeRoundTrip(t *testing.T) {
	cases := []string{
		"Plain title",
		"Comma, semicolon; backslash\\",
		"Multi\nline\nsummary",
		`path\name`, // the exact case that broke the old sequential-ReplaceAll icsUnescape
		`C:\Users\alice\Documents`,
		"",
		"back\\,to\\;back\\\\escapes",
	}
	for _, in := range cases {
		t.Run(in, func(t *testing.T) {
			esc := icsEscape(in)
			out := icsUnescape(esc)
			if out != in {
				t.Errorf("round-trip mismatch:\n  in:  %q\n  esc: %q\n  out: %q", in, esc, out)
			}
		})
	}
}

func TestIcsEscape(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"a;b", `a\;b`},
		{"a,b", `a\,b`},
		{"a\\b", `a\\b`},
		{"a\nb", `a\nb`},
		{"a\r\nb", `a\nb`},
	}
	for _, tc := range cases {
		if got := icsEscape(tc.in); got != tc.want {
			t.Errorf("icsEscape(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestIcsUnescape(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{`a\;b`, "a;b"},
		{`a\,b`, "a,b"},
		{`a\\b`, "a\\b"},
		{`a\nb`, "a\nb"},
		{`a\Nb`, "a\nb"}, // uppercase N is also valid per RFC 5545
		{`trailing backslash\`, `trailing backslash\`}, // dangling backslash at end-of-string passes through literally
	}
	for _, tc := range cases {
		if got := icsUnescape(tc.in); got != tc.want {
			t.Errorf("icsUnescape(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// Compile-time-ish sanity: parseCaldavMultistatus depends on parseICSVEvents
// producing StartDT in RFC3339 when a plain-UTC DTSTART is given, matching
// what caldavReportEvents ultimately feeds to expandICSEvents. Not testing
// expandICSEvents itself here (TestICSRecurrenceExpansion already covers
// that thoroughly) — just confirming the CalDAV-specific wiring produces
// vevents in the shape expandICSEvents expects.
func TestParseCaldavMultistatusFeedsExpandICSEvents(t *testing.T) {
	xml := `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:propstat><d:prop><cal:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:wired@test
SUMMARY:Wired Through
DTSTART:20260723T140000Z
DTEND:20260723T150000Z
END:VEVENT
END:VCALENDAR
</cal:calendar-data></d:prop></d:propstat>
  </d:response>
</d:multistatus>`
	vevents, err := parseCaldavMultistatus([]byte(xml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	winStart := time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC)
	winEnd := winStart.AddDate(0, 0, 14)
	events := expandICSEvents(vevents, winStart, winEnd)

	found := false
	for _, e := range events {
		if e.Summary == "Wired Through" {
			found = true
			if !strings.HasPrefix(e.StartDT, "2026-07-23T14:00:00") {
				t.Errorf("expected startDT around 2026-07-23T14:00:00, got %q", e.StartDT)
			}
		}
	}
	if !found {
		t.Errorf("expected 'Wired Through' event to survive the full CalDAV -> ICS pipeline, got %+v", events)
	}
}
