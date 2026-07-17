package handlers

import (
	"strings"
	"testing"
	"time"
)

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
