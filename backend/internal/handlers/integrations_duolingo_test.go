package handlers

import (
	"testing"
	"time"
)

func TestDuoStreakDoneToday(t *testing.T) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skip("America/New_York tzdata not available in this environment")
	}
	// duoStreakDoneToday calls now.Local(), which resolves against the
	// package-level time.Local — override it so the test is deterministic
	// regardless of what timezone the machine actually running it is in.
	orig := time.Local
	time.Local = loc
	defer func() { time.Local = orig }()

	// Reproduces the reported bug: it's 9:00 PM Eastern on July 21 (practiced
	// today), which is already 1:00 AM UTC on July 22 — one hour into
	// "tomorrow" by UTC's clock, several hours before the user's own day
	// has actually ended.
	nowUTC := time.Date(2026, 7, 22, 1, 0, 0, 0, time.UTC)

	if !duoStreakDoneToday("2026-07-21", nowUTC) {
		t.Error("practiced today (server-local) should count as done, even though UTC already thinks it's tomorrow")
	}

	// Genuinely at risk: last practice was yesterday (server-local), not today
	if duoStreakDoneToday("2026-07-20", nowUTC) {
		t.Error("practice from yesterday should NOT count as done today")
	}

	// Boundary: exactly midnight local (04:00 UTC = 00:00 EDT) on the
	// practice day still counts
	midnightUTC := time.Date(2026, 7, 21, 4, 0, 0, 0, time.UTC)
	if !duoStreakDoneToday("2026-07-21", midnightUTC) {
		t.Error("endDate equal to today (server-local) should count as done")
	}
}
