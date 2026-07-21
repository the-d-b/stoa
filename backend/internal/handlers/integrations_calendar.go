package handlers

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/teambition/rrule-go"
)

// icsFetch downloads an ICS feed, returning an error on network failure or
// non-200 status so the caller can fall back to cached data.
func icsFetch(icsURL string) ([]byte, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(icsURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d from ICS feed", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// dueItem is one upcoming dated item from an integration (Actual Budget
// schedule, Firefly III bill, Kapowarr issue release), cached per integration.
// Link optionally deep-links the event; sources without one fall back to the
// integration UI URL.
type dueItem struct {
	Title   string `json:"title"`
	DueDate string `json:"dueDate"` // YYYY-MM-DD
	Link    string `json:"link,omitempty"`
}

// dueSoonEvents converts due items into calendar events. Each item due within
// [today, today+daysAhead] appears 3 days BEFORE its due date (clamped to
// today) so bills surface as "due soon" with time to act.
func dueSoonEvents(items []dueItem, intName, uiURL, color string, daysAhead int, now time.Time) []map[string]interface{} {
	today := now.Format("2006-01-02")
	end := now.AddDate(0, 0, daysAhead).Format("2006-01-02")
	events := []map[string]interface{}{}
	for _, it := range items {
		if it.DueDate < today || it.DueDate > end {
			continue
		}
		due, err := time.Parse("2006-01-02", it.DueDate)
		if err != nil {
			continue
		}
		eventDate := due.AddDate(0, 0, -3).Format("2006-01-02")
		if eventDate < today {
			eventDate = today
		}
		events = append(events, map[string]interface{}{
			"source": intName,
			"date":   eventDate,
			"title":  fmt.Sprintf("Due soon: %s (%s)", it.Title, due.Format("Jan 2")),
			"color":  color,
			"uiUrl":  uiURL,
		})
	}
	return events
}

// integrationName returns the display name of an integration for use as a
// calendar pill label, with a fallback when unset.
func integrationName(db *sql.DB, integrationID, fallback string) string {
	var name string
	db.QueryRow(`SELECT COALESCE(name,'') FROM integrations WHERE id=?`, integrationID).Scan(&name)
	if name == "" {
		return fallback
	}
	return name
}

// localDate extracts the YYYY-MM-DD date in local server time from a UTC timestamp.
// Radarr/Lidarr return UTC midnight — without this, users west of UTC see dates
// shifted one day earlier than the arr app shows.
func localDate(raw string) string {
	if raw == "" {
		return ""
	}
	if len(raw) <= 10 {
		return raw // already a plain date
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return raw[:10] // fallback: just trim
	}
	return t.Local().Format("2006-01-02")
}

func fetchCalendarData(db *sql.DB, config map[string]interface{}) (map[string]interface{}, error) {
	sources, _ := config["sources"].([]interface{})
	logDebugf("CAL", "fetchCalendarData: %d sources", len(sources))

	events := []map[string]interface{}{}

	for _, src := range sources {
		source, _ := src.(map[string]interface{})
		if source == nil {
			continue
		}
		srcType := stringVal(source, "type")
		integrationID := stringVal(source, "integrationId")

		logDebugf("CAL", "source: type=%q integrationId=%q", srcType, integrationID)
		if integrationID == "" && srcType != "ical" {
			continue
		}

		daysAhead := 30
		if v, ok := source["daysAhead"].(float64); ok {
			daysAhead = int(v)
		}

		calStart := timeNow().Format("2006-01-02")
		calEnd := timeNow().AddDate(0, 0, daysAhead).Format("2006-01-02")

		// lookupAndFilter reads a source's pre-computed events (worker-populated,
		// or a one-time live fallback on cold start) and applies this panel's
		// own daysAhead window at serve time — never a live fetch on the
		// common (warm-cache) path.
		lookupAndFilter := func(cacheKey string, compute func() ([]map[string]interface{}, error)) {
			raw := calEventsGetOrCompute(cacheKey, compute)
			for _, e := range raw {
				date, _ := e["date"].(string)
				if date < calStart || date > calEnd {
					continue
				}
				events = append(events, e)
			}
		}

		switch srcType {
		case "sonarr":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeSonarrCalEvents(db, integrationID)
			})

		case "radarr":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeRadarrCalEvents(db, integrationID)
			})

		case "readarr":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeReadarrCalEvents(db, integrationID)
			})

		case "lidarr":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeLidarrCalEvents(db, integrationID)
			})

		case "weather":
			// Read from integration cache — same data as weather panel
			logDebugf("CAL", "fetching weather for integration %s", integrationID)
			wd, werr := getWeatherData(db, integrationID, map[string]interface{}{"integrationId": integrationID})
			if werr != nil {
				logErrorf("CAL", "weather error for %s: %v", integrationID, werr)
				continue
			}
			logDebugf("CAL", "weather ok for %s, city=%s, days=%d", integrationID, wd.City, len(wd.Daily))
			// Build one event per day from the 7-day forecast
			for _, day := range wd.Daily {
				if day.Date == "" {
					continue
				}
				tmp := day.MaxF
				tmpMin := day.MinF
				if wd.Unit == "c" {
					tmp = day.MaxC
					tmpMin = day.MinC
				}
				city := wd.City
				title := fmt.Sprintf("%s %s %.0f°/%.0f°", city, day.Icon, tmp, tmpMin)
				events = append(events, map[string]interface{}{
					"source": "weather",
					"date":   day.Date,
					"title":  title,
					"icon":   day.Icon,
					"color":  "#60a5fa",
					"tagId":  integrationID,
				})
			}

		case "google":
			calendarID := stringVal(source, "calendarId")
			if calendarID == "" {
				calendarID = "primary"
			}
			lookupAndFilter(googleCalKey(integrationID, calendarID), func() ([]map[string]interface{}, error) {
				accessToken, aerr := GetValidAccessToken(db, integrationID)
				if aerr != nil {
					return nil, aerr
				}
				gStart, gEnd := calWindowFor(db, integrationID)
				return computeGoogleCalEvents(accessToken, calendarID, gStart, gEnd)
			})

		case "sports":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeSportsCalEventsLive(db, integrationID)
			})

		case "actualbudget":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeActualBudgetCalEvents(db, integrationID)
			})

		case "fireflyiii":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeFireflyCalEvents(db, integrationID)
			})

		case "homeassistant":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeHomeAssistantCalEvents(db, integrationID)
			})

		case "caldav":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeCaldavCalEvents(db, integrationID)
			})

		case "kapowarr":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeKapowarrCalEvents(db, integrationID)
			})

		case "mylar3":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeMylar3CalEvents(db, integrationID)
			})

		case "maintainerr":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeMaintainerrCalEvents(db, integrationID)
			})

		case "ical":
			icsURL := stringVal(source, "icsUrl")
			if icsURL == "" {
				logDebugf("CAL", "ical: no icsUrl in source config")
				continue
			}
			label := stringVal(source, "label")
			if label == "" {
				label = "Calendar"
			}
			color := stringVal(source, "color")
			if color == "" {
				color = "#0078d4"
			}

			cacheKey := "ical:" + icsURL
			var vevents []icsVEvent
			haveCache := false
			if cached, ok := cacheGetFresh(cacheKey, 15*time.Minute); ok {
				if ev, ok2 := cached.([]icsVEvent); ok2 {
					vevents, haveCache = ev, true
				}
			}
			if !haveCache {
				body, ferr := icsFetch(icsURL)
				if ferr != nil {
					logErrorf("CAL", "ical: fetch error: %v", ferr)
					// Fall back to stale cache rather than dropping the source
					if cached, ok := cacheGet(cacheKey); ok {
						if ev, ok2 := cached.([]icsVEvent); ok2 {
							vevents, haveCache = ev, true
						}
					}
					if !haveCache {
						continue
					}
				} else {
					vevents = parseICSVEvents(body)
					cacheSet(cacheKey, vevents)
					logDebugf("CAL", "ical: fetched %d raw events from %s", len(vevents), icsURL)
				}
			}

			// Expand recurring series into concrete instances within the window
			now := timeNow().Local()
			winStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
			winEnd := winStart.AddDate(0, 0, daysAhead+1)
			rawEvents := expandICSEvents(vevents, winStart, winEnd)

			today := timeNow().Format("2006-01-02")
			endDate := timeNow().AddDate(0, 0, daysAhead).Format("2006-01-02")
			for _, ev := range rawEvents {
				if ev.Date < today || ev.Date > endDate {
					continue
				}
				e := map[string]interface{}{
					"source": label,
					"date":   ev.Date,
					"title":  ev.Summary,
					"color":  color,
				}
				if ev.StartDT != "" {
					e["startDT"] = ev.StartDT
				}
				if ev.EndDT != "" {
					e["endDT"] = ev.EndDT
				}
				events = append(events, e)
			}

		case "lubelogger":
			lookupAndFilter(integrationID, func() ([]map[string]interface{}, error) {
				return computeLubeLoggerCalEvents(db, integrationID)
			})

		}
	}

	// ── Kanban due dates ───────────────────────────────────────────────────
	for _, src := range sources {
		source, _ := src.(map[string]interface{})
		if source == nil || stringVal(source, "type") != "kanban" {
			continue
		}
		panelID := stringVal(source, "panelId")
		if panelID == "" {
			continue
		}
		var panelTitle string
		db.QueryRow("SELECT COALESCE(title,'') FROM panels WHERE id=?", panelID).Scan(&panelTitle)
		rows, err := db.Query(`
			SELECT kc.title, kc.due_date, kb.id, kb.name
			FROM kanban_cards kc
			JOIN kanban_boards kb ON kc.board_id=kb.id
			WHERE kb.panel_id=?
			  AND kc.due_date IS NOT NULL AND kc.due_date != ''
			  AND kc.status NOT IN ('completed','cancelled')
			ORDER BY kc.due_date ASC
		`, panelID)
		if err != nil {
			continue
		}
		for rows.Next() {
			var title, dueDate, boardID, boardName string
			rows.Scan(&title, &dueDate, &boardID, &boardName)
			source := boardName
			if panelTitle != "" {
				source = panelTitle + " › " + boardName
			}
			events = append(events, map[string]interface{}{
				"source":  source,
				"date":    dueDate,
				"title":   title,
				"color":   "#8b5cf6",
				"boardId": boardID,
			})
		}
		rows.Close()
	}

	// ── Checklist due dates ─────────────────────────────────────────────────
	// Any checklist source type pulls due-date items from checklist panels
	for _, src := range sources {
		source, _ := src.(map[string]interface{})
		if source == nil || stringVal(source, "type") != "checklist" {
			continue
		}
		panelID := stringVal(source, "panelId")
		if panelID == "" {
			continue
		}
		rows, err := db.Query(`
			SELECT text, due_date FROM checklist_items
			WHERE panel_id = ? AND due_date IS NOT NULL AND completed = 0
		`, panelID)
		if err != nil {
			continue
		}
		for rows.Next() {
			var text, dueDate string
			rows.Scan(&text, &dueDate)
			// Show as event on the day BEFORE the due date ("due tomorrow")
			due, err := time.Parse("2006-01-02", dueDate)
			if err != nil {
				continue
			}
			eventDate := due.AddDate(0, 0, -1).Format("2006-01-02")
			events = append(events, map[string]interface{}{
				"date":   eventDate,
				"title":  "Due tomorrow: " + text,
				"color":  "#f59e0b",
				"source": "checklist",
			})
		}
		rows.Close()
	}

	logDebugf("CAL", "fetchCalendarData: returning %d total events", len(events))
	return map[string]interface{}{"events": events}, nil
}

// ── iCal / ICS parser ─────────────────────────────────────────────────────────

type icsEvent struct {
	Summary string
	Date    string // YYYY-MM-DD
	StartDT string // RFC3339, empty for all-day events
	EndDT   string // RFC3339, empty for all-day events
}

// icsVEvent is one raw VEVENT from the feed, before recurrence expansion.
type icsVEvent struct {
	UID             string
	Summary         string
	Cancelled       bool
	Start           time.Time
	AllDay          bool
	Duration        time.Duration
	RRule           string // raw RRULE value; empty for one-off events
	ExDates         []time.Time
	RecurrenceID    time.Time // set when this VEVENT overrides one instance of a series
	HasRecurrenceID bool
}

// parseICSVEvents parses a raw ICS feed into VEVENT entries with recurrence
// metadata intact. Handles line folding (RFC 5545 §3.1), date-only and datetime
// DTSTART/DTEND, UTC "Z" suffix, and TZID parameters (including Windows
// timezone names as published by Outlook/M365).
func parseICSVEvents(data []byte) []icsVEvent {
	unfolded := icsUnfold(data)
	var events []icsVEvent
	var inEvent bool
	var cur icsVEvent
	var end time.Time
	var hasEnd bool

	for _, line := range strings.Split(unfolded, "\n") {
		line = strings.TrimRight(line, "\r")
		switch line {
		case "BEGIN:VEVENT":
			inEvent = true
			cur = icsVEvent{}
			end, hasEnd = time.Time{}, false
		case "END:VEVENT":
			if inEvent && !cur.Start.IsZero() && cur.Summary != "" {
				if hasEnd && end.After(cur.Start) {
					cur.Duration = end.Sub(cur.Start)
				}
				events = append(events, cur)
			}
			inEvent = false
		default:
			if !inEvent {
				continue
			}
			colonIdx := strings.IndexByte(line, ':')
			if colonIdx < 0 {
				continue
			}
			propFull, value := line[:colonIdx], line[colonIdx+1:]
			parts := strings.SplitN(propFull, ";", 2)
			propName := strings.ToUpper(parts[0])
			params := ""
			if len(parts) > 1 {
				params = parts[1]
			}

			switch propName {
			case "UID":
				cur.UID = value
			case "SUMMARY":
				cur.Summary = icsUnescape(value)
			case "STATUS":
				if strings.EqualFold(strings.TrimSpace(value), "CANCELLED") {
					cur.Cancelled = true
				}
			case "DTSTART":
				if t, allDay, ok := icsParseTime(value, params); ok {
					cur.Start, cur.AllDay = t, allDay
				}
			case "DTEND":
				if t, _, ok := icsParseTime(value, params); ok {
					end, hasEnd = t, true
				}
			case "RRULE":
				cur.RRule = value
			case "EXDATE":
				// May appear multiple times, each with comma-separated values
				for _, v := range strings.Split(value, ",") {
					if t, _, ok := icsParseTime(v, params); ok {
						cur.ExDates = append(cur.ExDates, t)
					}
				}
			case "RECURRENCE-ID":
				if t, _, ok := icsParseTime(value, params); ok {
					cur.RecurrenceID = t
					cur.HasRecurrenceID = true
				}
			}
		}
	}
	return events
}

// expandICSEvents flattens raw VEVENTs into concrete calendar instances within
// [winStart, winEnd]. Recurring series (RRULE) are expanded per occurrence,
// EXDATE-deleted instances are dropped, and RECURRENCE-ID override VEVENTs
// (moved/renamed/cancelled single instances) replace their master occurrence.
func expandICSEvents(vevents []icsVEvent, winStart, winEnd time.Time) []icsEvent {
	// Series overrides grouped by UID
	overrides := map[string][]icsVEvent{}
	for _, ev := range vevents {
		if ev.HasRecurrenceID && ev.UID != "" {
			overrides[ev.UID] = append(overrides[ev.UID], ev)
		}
	}

	var out []icsEvent
	emit := func(ev icsVEvent, start time.Time) {
		if ev.Cancelled {
			return
		}
		if ev.AllDay {
			out = append(out, icsEvent{Summary: ev.Summary, Date: start.Format("2006-01-02")})
			return
		}
		e := icsEvent{
			Summary: ev.Summary,
			Date:    start.Local().Format("2006-01-02"),
			StartDT: start.UTC().Format(time.RFC3339),
		}
		if ev.Duration > 0 {
			e.EndDT = start.Add(ev.Duration).UTC().Format(time.RFC3339)
		}
		out = append(out, e)
	}

	for _, ev := range vevents {
		if ev.HasRecurrenceID {
			// Override instances are emitted below, replacing master occurrences
			continue
		}
		if ev.RRule == "" {
			emit(ev, ev.Start)
			continue
		}
		occurrences := icsExpandRRule(ev, winStart, winEnd)
		for _, occ := range occurrences {
			skip := false
			for _, ex := range ev.ExDates {
				if occ.Equal(ex) {
					skip = true
					break
				}
			}
			if !skip {
				for _, ov := range overrides[ev.UID] {
					if occ.Equal(ov.RecurrenceID) {
						skip = true
						break
					}
				}
			}
			if skip {
				continue
			}
			emit(ev, occ)
		}
	}

	// Moved/renamed single instances carry their own DTSTART
	for _, ovs := range overrides {
		for _, ov := range ovs {
			emit(ov, ov.Start)
		}
	}
	return out
}

// icsExpandRRule expands one recurring VEVENT's RRULE into occurrence start
// times within the window. Returns just the base instance on parse failure so
// a malformed rule degrades to pre-expansion behavior.
func icsExpandRRule(ev icsVEvent, winStart, winEnd time.Time) []time.Time {
	opt, err := rrule.StrToROptionInLocation(ev.RRule, ev.Start.Location())
	if err != nil {
		logErrorf("CAL", "ical: bad RRULE %q: %v", ev.RRule, err)
		return []time.Time{ev.Start}
	}
	opt.Dtstart = ev.Start
	r, err := rrule.NewRRule(*opt)
	if err != nil {
		logErrorf("CAL", "ical: RRULE build error %q: %v", ev.RRule, err)
		return []time.Time{ev.Start}
	}
	return r.Between(winStart, winEnd, true)
}

// icsUnfold joins continuation lines (lines beginning with space/tab).
func icsUnfold(data []byte) string {
	s := strings.ReplaceAll(string(data), "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	var sb strings.Builder
	for _, line := range strings.Split(s, "\n") {
		if len(line) > 0 && (line[0] == ' ' || line[0] == '\t') {
			sb.WriteString(line[1:])
		} else {
			if sb.Len() > 0 {
				sb.WriteByte('\n')
			}
			sb.WriteString(line)
		}
	}
	return sb.String()
}

// icsParseTime parses an iCal date/datetime value into a time.Time.
// allDay is true for date-only values (parsed at local midnight).
func icsParseTime(value, params string) (t time.Time, allDay, ok bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false, false
	}

	isDateOnly := strings.Contains(params, "VALUE=DATE") ||
		(len(value) == 8 && !strings.Contains(value, "T"))

	if isDateOnly && len(value) >= 8 {
		t, err := time.ParseInLocation("20060102", value[:8], time.Local)
		if err != nil {
			return time.Time{}, false, false
		}
		return t, true, true
	}

	// Expect YYYYMMDDTHHmmss[Z]
	if len(value) < 15 {
		return time.Time{}, false, false
	}
	stamp := value[:15]
	var err error

	if strings.HasSuffix(value, "Z") {
		t, err = time.ParseInLocation("20060102T150405", stamp, time.UTC)
	} else {
		tzID := ""
		for _, p := range strings.Split(params, ";") {
			if strings.HasPrefix(p, "TZID=") {
				tzID = strings.TrimPrefix(p, "TZID=")
				// Strip any surrounding quotes Outlook sometimes adds
				tzID = strings.Trim(tzID, `"'`)
			}
		}
		if tzID != "" {
			if loc := icsLoadLocation(tzID); loc != nil {
				t, err = time.ParseInLocation("20060102T150405", stamp, loc)
			} else {
				// Unknown TZID — treat as UTC
				t, err = time.ParseInLocation("20060102T150405", stamp, time.UTC)
			}
		} else {
			// Floating time — use server local timezone
			t, err = time.ParseInLocation("20060102T150405", stamp, time.Local)
		}
	}
	if err != nil {
		return time.Time{}, false, false
	}
	return t, false, true
}

// windowsTZ maps Windows timezone names (as published in Outlook/M365 ICS
// feeds) to IANA identifiers. Subset of the CLDR windowsZones mapping covering
// the zones Outlook commonly emits.
var windowsTZ = map[string]string{
	"Dateline Standard Time":          "Etc/GMT+12",
	"Hawaiian Standard Time":          "Pacific/Honolulu",
	"Aleutian Standard Time":          "America/Adak",
	"Alaskan Standard Time":           "America/Anchorage",
	"Pacific Standard Time":           "America/Los_Angeles",
	"Pacific Standard Time (Mexico)":  "America/Tijuana",
	"US Mountain Standard Time":       "America/Phoenix",
	"Mountain Standard Time":          "America/Denver",
	"Mountain Standard Time (Mexico)": "America/Chihuahua",
	"Central Standard Time":           "America/Chicago",
	"Central Standard Time (Mexico)":  "America/Mexico_City",
	"Canada Central Standard Time":    "America/Regina",
	"Central America Standard Time":   "America/Guatemala",
	"Eastern Standard Time":           "America/New_York",
	"Eastern Standard Time (Mexico)":  "America/Cancun",
	"US Eastern Standard Time":        "America/Indiana/Indianapolis",
	"Atlantic Standard Time":          "America/Halifax",
	"SA Pacific Standard Time":        "America/Bogota",
	"SA Western Standard Time":        "America/La_Paz",
	"SA Eastern Standard Time":        "America/Cayenne",
	"Venezuela Standard Time":         "America/Caracas",
	"Newfoundland Standard Time":      "America/St_Johns",
	"E. South America Standard Time":  "America/Sao_Paulo",
	"Argentina Standard Time":         "America/Argentina/Buenos_Aires",
	"Azores Standard Time":            "Atlantic/Azores",
	"Cape Verde Standard Time":        "Atlantic/Cape_Verde",
	"UTC":                             "Etc/UTC",
	"GMT Standard Time":               "Europe/London",
	"Greenwich Standard Time":         "Atlantic/Reykjavik",
	"W. Europe Standard Time":         "Europe/Berlin",
	"Central Europe Standard Time":    "Europe/Budapest",
	"Romance Standard Time":           "Europe/Paris",
	"Central European Standard Time":  "Europe/Warsaw",
	"W. Central Africa Standard Time": "Africa/Lagos",
	"GTB Standard Time":               "Europe/Bucharest",
	"Middle East Standard Time":       "Asia/Beirut",
	"Egypt Standard Time":             "Africa/Cairo",
	"E. Europe Standard Time":         "Europe/Chisinau",
	"South Africa Standard Time":      "Africa/Johannesburg",
	"FLE Standard Time":               "Europe/Kiev",
	"Israel Standard Time":            "Asia/Jerusalem",
	"Arabic Standard Time":            "Asia/Baghdad",
	"Arab Standard Time":              "Asia/Riyadh",
	"Russian Standard Time":           "Europe/Moscow",
	"E. Africa Standard Time":         "Africa/Nairobi",
	"Iran Standard Time":              "Asia/Tehran",
	"Arabian Standard Time":           "Asia/Dubai",
	"Afghanistan Standard Time":       "Asia/Kabul",
	"West Asia Standard Time":         "Asia/Tashkent",
	"Pakistan Standard Time":          "Asia/Karachi",
	"India Standard Time":             "Asia/Kolkata",
	"Sri Lanka Standard Time":         "Asia/Colombo",
	"Nepal Standard Time":             "Asia/Kathmandu",
	"Central Asia Standard Time":      "Asia/Almaty",
	"Bangladesh Standard Time":        "Asia/Dhaka",
	"Myanmar Standard Time":           "Asia/Yangon",
	"SE Asia Standard Time":           "Asia/Bangkok",
	"China Standard Time":             "Asia/Shanghai",
	"Singapore Standard Time":         "Asia/Singapore",
	"Taipei Standard Time":            "Asia/Taipei",
	"Tokyo Standard Time":             "Asia/Tokyo",
	"Korea Standard Time":             "Asia/Seoul",
	"W. Australia Standard Time":      "Australia/Perth",
	"Cen. Australia Standard Time":    "Australia/Adelaide",
	"AUS Central Standard Time":       "Australia/Darwin",
	"AUS Eastern Standard Time":       "Australia/Sydney",
	"E. Australia Standard Time":      "Australia/Brisbane",
	"Tasmania Standard Time":          "Australia/Hobart",
	"West Pacific Standard Time":      "Pacific/Port_Moresby",
	"New Zealand Standard Time":       "Pacific/Auckland",
	"Fiji Standard Time":              "Pacific/Fiji",
}

// icsLoadLocation resolves a TZID to a *time.Location, accepting both IANA
// names and Windows names. Returns nil if the zone is unknown.
func icsLoadLocation(tzID string) *time.Location {
	if loc, err := time.LoadLocation(tzID); err == nil {
		return loc
	}
	if iana, ok := windowsTZ[tzID]; ok {
		if loc, err := time.LoadLocation(iana); err == nil {
			return loc
		}
	}
	return nil
}

// icsUnescape unescapes iCal text values per RFC 5545 §3.3.11.
func icsUnescape(s string) string {
	s = strings.ReplaceAll(s, `\n`, "\n")
	s = strings.ReplaceAll(s, `\N`, "\n")
	s = strings.ReplaceAll(s, `\,`, ",")
	s = strings.ReplaceAll(s, `\;`, ";")
	s = strings.ReplaceAll(s, `\\`, `\`)
	return s
}
