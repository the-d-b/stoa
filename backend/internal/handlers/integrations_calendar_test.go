package handlers

import (
	"strings"
	"testing"
	"time"
)

func TestDueSoonEvents(t *testing.T) {
	now := time.Date(2026, 7, 19, 8, 0, 0, 0, time.Local)
	items := []dueItem{
		{Title: "Electric", DueDate: "2026-07-28"}, // due in 9d → event on 25th
		{Title: "Rent", DueDate: "2026-07-20"},     // due tomorrow → lead clamps to today
		{Title: "Water", DueDate: "2026-07-19"},    // due today → clamps to today
		{Title: "Old bill", DueDate: "2026-07-18"}, // past due → dropped
		{Title: "Far out", DueDate: "2026-09-01"},  // beyond 30d window → dropped
		{Title: "Bad date", DueDate: "not-a-date"}, // unparseable → dropped
	}

	events := dueSoonEvents(items, "My Budget", "http://actual.local", "#14b8a6", 30, now)

	if len(events) != 3 {
		t.Fatalf("expected 3 events, got %d: %v", len(events), events)
	}
	byTitle := map[string]map[string]interface{}{}
	for _, e := range events {
		byTitle[e["title"].(string)] = e
	}

	if e := byTitle["Due soon: Electric (Jul 28)"]; e == nil {
		t.Errorf("missing Electric event, got %v", byTitle)
	} else {
		if e["date"] != "2026-07-25" {
			t.Errorf("Electric: expected event 3 days before due, got %v", e["date"])
		}
		if e["source"] != "My Budget" {
			t.Errorf("Electric: source should be integration name, got %v", e["source"])
		}
		if e["uiUrl"] != "http://actual.local" {
			t.Errorf("Electric: expected uiUrl, got %v", e["uiUrl"])
		}
		if e["color"] != "#14b8a6" {
			t.Errorf("Electric: expected passed-through color, got %v", e["color"])
		}
	}
	if e := byTitle["Due soon: Rent (Jul 20)"]; e == nil || e["date"] != "2026-07-19" {
		t.Errorf("Rent: expected lead time clamped to today, got %v", e)
	}
	if e := byTitle["Due soon: Water (Jul 19)"]; e == nil || e["date"] != "2026-07-19" {
		t.Errorf("Water: expected due-today event on today, got %v", e)
	}
}

func TestICSRecurrenceExpansion(t *testing.T) {
	// Window: 2026-07-17 .. 2026-07-31 (matches "today" at time of writing)
	winStart := time.Date(2026, 7, 17, 0, 0, 0, 0, time.Local)
	winEnd := winStart.AddDate(0, 0, 14)

	ics := strings.Join([]string{
		"BEGIN:VCALENDAR",
		"BEGIN:VEVENT",
		"UID:standup@test",
		"SUMMARY:Daily Standup",
		"DTSTART;TZID=Mountain Standard Time:20260105T090000",
		"DTEND;TZID=Mountain Standard Time:20260105T091500",
		"RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
		"EXDATE;TZID=Mountain Standard Time:20260720T090000",
		"END:VEVENT",
		"BEGIN:VEVENT",
		"UID:standup@test",
		"SUMMARY:Standup (moved)",
		"RECURRENCE-ID;TZID=Mountain Standard Time:20260721T090000",
		"DTSTART;TZID=Mountain Standard Time:20260721T110000",
		"DTEND;TZID=Mountain Standard Time:20260721T111500",
		"END:VEVENT",
		"BEGIN:VEVENT",
		"UID:standup@test",
		"SUMMARY:Daily Standup",
		"STATUS:CANCELLED",
		"RECURRENCE-ID;TZID=Mountain Standard Time:20260722T090000",
		"DTSTART;TZID=Mountain Standard Time:20260722T090000",
		"END:VEVENT",
		"BEGIN:VEVENT",
		"UID:oneoff@test",
		"SUMMARY:Dentist",
		"DTSTART;TZID=Mountain Standard Time:20260723T140000",
		"DTEND;TZID=Mountain Standard Time:20260723T150000",
		"END:VEVENT",
		"BEGIN:VEVENT",
		"UID:oldseries@test",
		"SUMMARY:Ended Series",
		"DTSTART;TZID=Mountain Standard Time:20250101T100000",
		"RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20250601T000000Z",
		"END:VEVENT",
		"END:VCALENDAR",
	}, "\r\n")

	vevents := parseICSVEvents([]byte(ics))
	if len(vevents) != 5 {
		t.Fatalf("expected 5 raw vevents, got %d", len(vevents))
	}

	events := expandICSEvents(vevents, winStart, winEnd)
	byDate := map[string][]string{}
	for _, e := range events {
		byDate[e.Date] = append(byDate[e.Date], e.Summary)
	}
	t.Logf("expanded events by date: %v", byDate)

	// Fri 7/17 should have a standup
	if !contains(byDate["2026-07-17"], "Daily Standup") {
		t.Errorf("expected standup on 2026-07-17")
	}
	// Mon 7/20: EXDATE deleted
	if contains(byDate["2026-07-20"], "Daily Standup") {
		t.Errorf("EXDATE instance 2026-07-20 should be removed")
	}
	// Tue 7/21: replaced by moved override
	if contains(byDate["2026-07-21"], "Daily Standup") {
		t.Errorf("overridden instance 2026-07-21 should not appear as master")
	}
	if !contains(byDate["2026-07-21"], "Standup (moved)") {
		t.Errorf("expected moved override on 2026-07-21")
	}
	// Wed 7/22: cancelled override
	if contains(byDate["2026-07-22"], "Daily Standup") {
		t.Errorf("cancelled instance 2026-07-22 should be removed")
	}
	// One-off passes through
	if !contains(byDate["2026-07-23"], "Dentist") {
		t.Errorf("expected one-off Dentist on 2026-07-23")
	}
	// Ended series contributes nothing
	for d, evs := range byDate {
		if contains(evs, "Ended Series") {
			t.Errorf("ended series should not appear (found on %s)", d)
		}
	}
	// Weekend: no standups
	if len(byDate["2026-07-18"]) != 0 || len(byDate["2026-07-19"]) != 0 {
		t.Errorf("no events expected on weekend, got %v / %v", byDate["2026-07-18"], byDate["2026-07-19"])
	}

	// Timezone check: 9:00 MDT == 15:00 UTC
	for _, e := range events {
		if e.Summary == "Daily Standup" && e.Date == "2026-07-17" {
			if e.StartDT != "2026-07-17T15:00:00Z" {
				t.Errorf("expected 9am MDT = 15:00Z, got %s", e.StartDT)
			}
		}
	}
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
