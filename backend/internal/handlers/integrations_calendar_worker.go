package handlers

// Calendar event pre-computation. Every calendar-eligible integration type
// computes its events on its OWN worker's existing tick (refreshCache, the
// sports worker, or the Google ticker) and stores them here — the calendar
// panel's job at view time is a pure map lookup plus a cheap date-range
// filter, never a live fetch. This is deliberately a separate store from
// panelCache: writes here must NOT broadcast over SSE (calendar data doesn't
// need push propagation, and keeping it off that channel avoids adding to
// the EventSource buffer-growth problem that channel already has).
//
// Events are stored UNFILTERED across calMaxWindowDays — each calendar
// panel's own `daysAhead` narrows the window at serve time, the same
// broad-fetch/narrow-serve split Home Assistant's entity filter already uses.

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"
)

const calMaxWindowDays = 90

var (
	calEventsCache   = map[string][]map[string]interface{}{}
	calEventsCacheMu sync.RWMutex
)

func calEventsGet(key string) ([]map[string]interface{}, bool) {
	calEventsCacheMu.RLock()
	defer calEventsCacheMu.RUnlock()
	ev, ok := calEventsCache[key]
	return ev, ok
}

func calEventsSet(key string, events []map[string]interface{}) {
	calEventsCacheMu.Lock()
	calEventsCache[key] = events
	calEventsCacheMu.Unlock()
}

func calEventsDelete(key string) {
	calEventsCacheMu.Lock()
	delete(calEventsCache, key)
	calEventsCacheMu.Unlock()
}

// calEventsGetOrCompute returns cached events if present, otherwise computes
// once synchronously (cold start / never-ticked-yet integration) and warms
// the cache so subsequent views are pure reads.
func calEventsGetOrCompute(key string, compute func() ([]map[string]interface{}, error)) []map[string]interface{} {
	if ev, ok := calEventsGet(key); ok {
		return ev
	}
	ev, err := compute()
	if err != nil {
		logErrorf("CAL", "%s live fallback fetch error: %v", key, err)
		return nil
	}
	calEventsSet(key, ev)
	return ev
}

// calEventComputers maps an integration type to the function that computes
// its calendar events. Used by the generic refreshCache hook — every type
// here rides its own worker's existing tick, no dedicated calendar poll.
var calEventComputers = map[string]func(db *sql.DB, integrationID string) ([]map[string]interface{}, error){
	"sonarr":        computeSonarrCalEvents,
	"radarr":        computeRadarrCalEvents,
	"readarr":       computeReadarrCalEvents,
	"lidarr":        computeLidarrCalEvents,
	"kapowarr":      computeKapowarrCalEvents,
	"mylar3":        computeMylar3CalEvents,
	"maintainerr":   computeMaintainerrCalEvents,
	"actualbudget":  computeActualBudgetCalEvents,
	"fireflyiii":    computeFireflyCalEvents,
	"homeassistant": computeHomeAssistantCalEvents,
	"caldav":        computeCaldavCalEvents,
	"lubelogger":    computeLubeLoggerCalEvents,
	"monica":        computeMonicaCalEvents,
}

// calWindowFor returns the fetch window for one integration's background
// calendar computation. The window size is the integration's OWN configured
// daysAhead — an admin-set ceiling on the integration itself, not derived
// from scanning panels. This is the one thing that governs upstream query
// size; calendar panels using this integration as a source can only ever
// display up to this ceiling (the source adder UI clamps to it), never more,
// so there is exactly one number that decides how much gets fetched.
func calWindowFor(db *sql.DB, integrationID string) (start, end time.Time) {
	days := integrationDaysAhead(db, integrationID, 30)
	now := timeNow()
	return now, now.AddDate(0, 0, days)
}

// integrationDaysAhead reads the daysAhead ceiling from an integration's own
// config JSON, clamped to [1, calMaxWindowDays]. Returns fallback if unset,
// invalid, or the integration doesn't exist.
func integrationDaysAhead(db *sql.DB, integrationID string, fallback int) int {
	var cfgStr string
	if db.QueryRow(`SELECT COALESCE(config,'{}') FROM integrations WHERE id=?`, integrationID).Scan(&cfgStr) != nil {
		return fallback
	}
	var cfg struct {
		DaysAhead float64 `json:"daysAhead"`
	}
	if json.Unmarshal([]byte(cfgStr), &cfg) != nil || cfg.DaysAhead <= 0 {
		return fallback
	}
	days := int(cfg.DaysAhead)
	if days > calMaxWindowDays {
		days = calMaxWindowDays
	}
	return days
}

// ── Sonarr / Radarr / Readarr / Lidarr ──────────────────────────────────────

func computeSonarrCalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	calStart, calEnd := calWindowFor(db, integrationID)
	upcoming, err := arrGet(apiURL, apiKey,
		fmt.Sprintf("/api/v3/calendar?includeSeries=true&unmonitored=true&start=%s&end=%s",
			calStart.Format("2006-01-02"), calEnd.Format("2006-01-02")), skipTLS)
	if err != nil {
		return nil, err
	}
	return parseSonarrCalEvents(upcoming, uiURL), nil
}

// parseSonarrCalEvents shapes a Sonarr /api/v3/calendar response into
// calendar events. Split out from computeSonarrCalEvents for testability
// against fixture JSON, same reasoning as the Sports response parsers.
func parseSonarrCalEvents(body []byte, uiURL string) []map[string]interface{} {
	var episodes []map[string]interface{}
	json.Unmarshal(body, &episodes)
	events := []map[string]interface{}{}
	for _, ep := range episodes {
		series, _ := ep["series"].(map[string]interface{})
		seriesTitle, titleSlug := "", ""
		if series != nil {
			seriesTitle, _ = series["title"].(string)
			titleSlug, _ = series["titleSlug"].(string)
		}
		epTitle, _ := ep["title"].(string)
		airDateRaw, _ := ep["airDate"].(string)
		airDate := localDate(airDateRaw)
		events = append(events, map[string]interface{}{
			"source": "sonarr", "date": airDate,
			"title":       fmt.Sprintf("%s — %s", seriesTitle, epTitle),
			"seriesTitle": seriesTitle, "epTitle": epTitle,
			"titleSlug": titleSlug, "uiUrl": uiURL,
			"color": "#60a5fa", "hasFile": ep["hasFile"] == true,
		})
	}
	return events
}

func computeRadarrCalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	calStart, calEnd := calWindowFor(db, integrationID)
	upcoming, err := arrGet(apiURL, apiKey,
		fmt.Sprintf("/api/v3/calendar?unmonitored=true&start=%s&end=%s",
			calStart.Format("2006-01-02"), calEnd.Format("2006-01-02")), skipTLS)
	if err != nil {
		return nil, err
	}
	today := calStart.Format("2006-01-02")
	return parseRadarrCalEvents(upcoming, uiURL, today), nil
}

// parseRadarrCalEvents shapes a Radarr /api/v3/calendar response into
// calendar events. A movie can produce up to three events — one per release
// type (cinema/digital/physical) — but only release dates on or after
// `today` are included, since Radarr's calendar response includes past
// releases too and those aren't "upcoming" from the calendar panel's
// perspective. Split out from computeRadarrCalEvents for testability.
func parseRadarrCalEvents(body []byte, uiURL string, today string) []map[string]interface{} {
	var movies []map[string]interface{}
	json.Unmarshal(body, &movies)
	events := []map[string]interface{}{}
	for _, m := range movies {
		title, _ := m["title"].(string)
		titleSlug, _ := m["titleSlug"].(string)
		type releaseInfo struct{ date, label string }
		var releases []releaseInfo
		for _, pair := range []struct{ key, label string }{
			{"inCinemas", "In Cinemas"},
			{"digitalRelease", "Digital"},
			{"physicalRelease", "Physical"},
		} {
			if raw, _ := m[pair.key].(string); raw != "" {
				d := localDate(raw)
				if d >= today {
					releases = append(releases, releaseInfo{d, pair.label})
				}
			}
		}
		for _, rel := range releases {
			events = append(events, map[string]interface{}{
				"source":    "radarr",
				"date":      rel.date,
				"title":     fmt.Sprintf("%s (%s)", title, rel.label),
				"titleSlug": titleSlug,
				"uiUrl":     uiURL,
				"color":     "#f59e0b",
				"hasFile":   m["hasFile"] == true,
			})
		}
	}
	return events
}

func computeReadarrCalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	calStart, calEnd := calWindowFor(db, integrationID)
	upcoming, err := arrGet(apiURL, apiKey,
		fmt.Sprintf("/api/v1/calendar?unmonitored=true&start=%s&end=%s",
			calStart.Format("2006-01-02"), calEnd.Format("2006-01-02")), skipTLS)
	if err != nil {
		return nil, err
	}
	return parseReadarrCalEvents(upcoming, uiURL), nil
}

// parseReadarrCalEvents shapes a Readarr /api/v1/calendar response into
// calendar events. Split out from computeReadarrCalEvents for testability.
func parseReadarrCalEvents(body []byte, uiURL string) []map[string]interface{} {
	var books []map[string]interface{}
	json.Unmarshal(body, &books)
	events := []map[string]interface{}{}
	for _, bk := range books {
		title, _ := bk["title"].(string)
		rawDate, _ := bk["releaseDate"].(string)
		date := localDate(rawDate)
		if date == "" {
			continue
		}
		titleSlug, _ := bk["titleSlug"].(string)
		author := ""
		if a, ok := bk["author"].(map[string]interface{}); ok {
			author, _ = a["authorName"].(string)
		}
		displayTitle := title
		if author != "" {
			displayTitle = fmt.Sprintf("%s — %s", author, title)
		}
		events = append(events, map[string]interface{}{
			"source":    "readarr",
			"date":      date,
			"title":     displayTitle,
			"titleSlug": titleSlug,
			"uiUrl":     uiURL,
			"color":     "#6ee7b7",
			"hasFile":   bk["hasFile"] == true,
		})
	}
	return events
}

func computeLidarrCalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	calStart, calEnd := calWindowFor(db, integrationID)
	upcoming, err := arrGet(apiURL, apiKey,
		fmt.Sprintf("/api/v1/calendar?unmonitored=true&start=%s&end=%s",
			calStart.Format("2006-01-02"), calEnd.Format("2006-01-02")), skipTLS)
	if err != nil {
		return nil, err
	}
	return parseLidarrCalEvents(upcoming, uiURL), nil
}

// parseLidarrCalEvents shapes a Lidarr /api/v1/calendar response into
// calendar events. Split out from computeLidarrCalEvents for testability.
func parseLidarrCalEvents(body []byte, uiURL string) []map[string]interface{} {
	var albums []map[string]interface{}
	json.Unmarshal(body, &albums)
	events := []map[string]interface{}{}
	for _, al := range albums {
		title, _ := al["title"].(string)
		rawDate, _ := al["releaseDate"].(string)
		date := localDate(rawDate)
		artist := ""
		foreign := ""
		if a, ok := al["artist"].(map[string]interface{}); ok {
			artist, _ = a["artistName"].(string)
			foreign, _ = a["foreignArtistId"].(string)
		}
		events = append(events, map[string]interface{}{
			"source":          "lidarr",
			"date":            date,
			"title":           fmt.Sprintf("%s — %s", artist, title),
			"uiUrl":           uiURL,
			"color":           "#a78bfa",
			"foreignArtistId": foreign,
		})
	}
	return events
}

// ── Kapowarr / Mylar3 / Maintainerr / Actual Budget / Firefly III ─────────

func computeKapowarrCalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = apiURL
	}
	items, err := kapowarrFetchReleaseItems(apiURL, uiURL, apiKey, skipTLS)
	if err != nil {
		return nil, err
	}
	intName := integrationName(db, integrationID, "Kapowarr")
	events := []map[string]interface{}{}
	for _, it := range items {
		link := it.Link
		if link == "" {
			link = uiURL
		}
		events = append(events, map[string]interface{}{
			"source": intName, "date": it.DueDate, "title": it.Title,
			"color": "#facc15", "uiUrl": link,
		})
	}
	return events, nil
}

func computeMylar3CalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = apiURL
	}
	items, err := mylar3FetchReleaseItems(apiURL, uiURL, apiKey, skipTLS)
	if err != nil {
		return nil, err
	}
	intName := integrationName(db, integrationID, "Mylar3")
	events := []map[string]interface{}{}
	for _, it := range items {
		link := it.Link
		if link == "" {
			link = uiURL
		}
		events = append(events, map[string]interface{}{
			"source": intName, "date": it.DueDate, "title": it.Title,
			"color": "#84cc16", "uiUrl": link,
		})
	}
	return events, nil
}

func computeMaintainerrCalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = apiURL
	}
	items, err := maintainerrFetchActionItems(apiURL, uiURL, apiKey, skipTLS)
	if err != nil {
		return nil, err
	}
	intName := integrationName(db, integrationID, "Maintainerr")
	events := []map[string]interface{}{}
	for _, it := range items {
		link := it.Link
		if link == "" {
			link = uiURL
		}
		events = append(events, map[string]interface{}{
			"source": intName, "date": it.DueDate, "title": it.Title,
			"color": "#ef4444", "uiUrl": link,
		})
	}
	return events, nil
}

func computeActualBudgetCalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = apiURL
	}
	items, err := abFetchScheduleItems(apiURL, apiKey, skipTLS)
	if err != nil {
		return nil, err
	}
	intName := integrationName(db, integrationID, "Actual Budget")
	return dueSoonEvents(items, intName, uiURL, "#14b8a6", calMaxWindowDays, timeNow()), nil
}

func computeFireflyCalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = apiURL
	}
	items, err := ffFetchBillItems(apiURL, apiKey, skipTLS)
	if err != nil {
		return nil, err
	}
	intName := integrationName(db, integrationID, "Firefly III")
	return dueSoonEvents(items, intName, uiURL, "#ec4899", calMaxWindowDays, timeNow()), nil
}

// ── Home Assistant ───────────────────────────────────────────────────────

func computeHomeAssistantCalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = apiURL
	}
	calBody, err := haGet(apiURL, apiKey, "/api/calendars", skipTLS)
	if err != nil {
		return nil, err
	}
	var cals []struct {
		EntityID string `json:"entity_id"`
		Name     string `json:"name"`
	}
	if err := json.Unmarshal(calBody, &cals); err != nil {
		return nil, err
	}
	intName := integrationName(db, integrationID, "Home Assistant")
	prefixNames := len(cals) > 1
	calStart, calEnd := calWindowFor(db, integrationID)
	startISO := calStart.UTC().Format("2006-01-02T15:04:05Z")
	endISO := calEnd.UTC().Format("2006-01-02T15:04:05Z")
	events := []map[string]interface{}{}
	for _, cal := range cals {
		evBody, eerr := haGet(apiURL, apiKey,
			fmt.Sprintf("/api/calendars/%s?start=%s&end=%s", url.PathEscape(cal.EntityID), startISO, endISO), skipTLS)
		if eerr != nil {
			logErrorf("CAL", "homeassistant %s events error: %v", cal.EntityID, eerr)
			continue
		}
		calEvents, perr := parseHomeAssistantEvents(evBody, cal.Name, prefixNames, intName, uiURL)
		if perr != nil {
			logErrorf("CAL", "homeassistant %s events parse error: %v", cal.EntityID, perr)
			continue
		}
		events = append(events, calEvents...)
	}
	return events, nil
}

// parseHomeAssistantEvents shapes one calendar's /api/calendars/{entity_id}
// response into calendar events. All-day events carry only a "date" field;
// timed events carry a "dateTime" and additionally populate startDT/endDT for
// panels that render exact times. When the integration exposes more than one
// calendar (prefixNames), each event's title is prefixed with its calendar's
// name so events from different calendars stay distinguishable once merged.
// Split out from computeHomeAssistantCalEvents for testability.
func parseHomeAssistantEvents(body []byte, calName string, prefixNames bool, intName string, uiURL string) ([]map[string]interface{}, error) {
	var items []struct {
		Summary string `json:"summary"`
		Start   struct {
			Date     string `json:"date"`
			DateTime string `json:"dateTime"`
		} `json:"start"`
		End struct {
			DateTime string `json:"dateTime"`
		} `json:"end"`
	}
	if err := json.Unmarshal(body, &items); err != nil {
		return nil, err
	}
	events := []map[string]interface{}{}
	for _, it := range items {
		date, startDT, endDT := "", "", ""
		if it.Start.Date != "" {
			date = it.Start.Date
		} else if len(it.Start.DateTime) >= 10 {
			date = it.Start.DateTime[:10]
			startDT = it.Start.DateTime
			endDT = it.End.DateTime
		}
		if date == "" {
			continue
		}
		title := it.Summary
		if title == "" {
			title = "(no title)"
		}
		if prefixNames && calName != "" {
			title = calName + ": " + title
		}
		e := map[string]interface{}{
			"source": intName, "date": date, "title": title,
			"color": "#22d3ee", "uiUrl": strings.TrimRight(uiURL, "/") + "/calendar",
		}
		if startDT != "" {
			e["startDT"] = startDT
		}
		if endDT != "" {
			e["endDT"] = endDT
		}
		events = append(events, e)
	}
	return events, nil
}

// ── CalDAV ────────────────────────────────────────────────────────────────

func computeCaldavCalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	calStart, calEnd := calWindowFor(db, integrationID)
	vevents, err := caldavReportEvents(apiURL, apiKey, calStart.AddDate(0, 0, -1), calEnd.AddDate(0, 0, 1), skipTLS)
	if err != nil {
		return nil, err
	}
	intName := integrationName(db, integrationID, "CalDAV")
	now := timeNow().Local()
	winStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	winEnd := winStart.AddDate(0, 0, calMaxWindowDays+1)
	events := []map[string]interface{}{}
	for _, ev := range expandICSEvents(vevents, winStart, winEnd) {
		e := map[string]interface{}{
			"source": intName, "date": ev.Date, "title": ev.Summary, "color": "#818cf8",
		}
		if uiURL != "" {
			e["uiUrl"] = uiURL
		}
		if ev.StartDT != "" {
			e["startDT"] = ev.StartDT
		}
		if ev.EndDT != "" {
			e["endDT"] = ev.EndDT
		}
		events = append(events, e)
	}
	return events, nil
}

// ── Sports ────────────────────────────────────────────────────────────────

// computeSportsCalEvents shapes already-fetched SportsPanelData into calendar
// events. Unlike every other compute function here, this one takes no
// integrationID and makes no network call — it's called from the sports
// worker's own tick with data it already fetched for its own panel purposes,
// so this really is the free, pure-CPU case the others only approximate.
func computeSportsCalEvents(intName string, data *SportsPanelData) []map[string]interface{} {
	events := []map[string]interface{}{}
	todayDate := timeNow().Local().Format("2006-01-02")
	for _, g := range data.Schedule {
		if g.StartTime == "" || g.IsTBD {
			continue
		}
		var t time.Time
		var terr error
		for _, layout := range []string{time.RFC3339, "2006-01-02T15:04Z", "2006-01-02T15:04:05Z"} {
			t, terr = time.Parse(layout, g.StartTime)
			if terr == nil {
				break
			}
		}
		if terr != nil {
			continue
		}
		date := t.Local().Format("2006-01-02")
		if date < todayDate {
			continue
		}
		title := fmt.Sprintf("%s %s @ %s", g.League, g.AwayAbbr, g.HomeAbbr)
		if g.IsFavorite {
			title = "⭐ " + title
		}
		events = append(events, map[string]interface{}{
			"source": intName, "date": date, "startDT": g.StartTime,
			"title": title, "color": "#f97316", "league": g.League,
		})
	}
	return events
}

// computeSportsCalEventsLive is the cold-start fallback (integration not yet
// ticked since boot) — fetches live, unlike computeSportsCalEvents which
// reuses data the worker already has in hand.
func computeSportsCalEventsLive(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	data, err := FetchSportsData(db, integrationID)
	if err != nil {
		return nil, err
	}
	return computeSportsCalEvents(integrationName(db, integrationID, "Sports"), data), nil
}

// ── LubeLogger ────────────────────────────────────────────────────────────

func computeLubeLoggerCalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	vBody, err := lubeGet(apiURL, apiKey, "/api/vehicles", skipTLS)
	if err != nil {
		return nil, err
	}
	// Year can be a number or string upstream — decode loosely rather than a typed struct
	var rawVehicles []map[string]interface{}
	if err := json.Unmarshal(vBody, &rawVehicles); err != nil {
		return nil, err
	}
	events := []map[string]interface{}{}
	for _, v := range rawVehicles {
		id, vehicleName := lubeLoggerVehicleIdentity(v)

		rBody, _ := lubeGet(apiURL, apiKey, fmt.Sprintf("/api/vehicle/reminders?vehicleId=%d", id), skipTLS)
		if rBody == nil {
			continue
		}
		vehicleEvents, perr := parseLubeLoggerReminders(rBody, vehicleName, uiURL)
		if perr != nil {
			continue
		}
		events = append(events, vehicleEvents...)
	}
	return events, nil
}

// lubeLoggerVehicleIdentity extracts a vehicle's ID and builds its display
// name from year/make/model. LubeLogger's API returns year as either a
// number or a string depending on version, so it's decoded loosely via
// fmt.Sprintf rather than a typed field — an absent year becomes the
// "<nil>" string from formatting a nil interface, which is normalized away
// here rather than leaking into the displayed vehicle name.
func lubeLoggerVehicleIdentity(v map[string]interface{}) (id int, vehicleName string) {
	id = int(floatVal(v, "id"))
	year := fmt.Sprintf("%v", v["year"])
	if year == "<nil>" {
		year = ""
	}
	make_, _ := v["make"].(string)
	model, _ := v["model"].(string)
	vehicleName = strings.TrimSpace(year + " " + make_ + " " + model)
	return id, vehicleName
}

// parseLubeLoggerReminders shapes one vehicle's /api/vehicle/reminders
// response into calendar events. Reminders without a due date are dropped —
// LubeLogger tracks mileage-based reminders too, which have no calendar
// date to place them on. Split out from computeLubeLoggerCalEvents for
// testability.
func parseLubeLoggerReminders(body []byte, vehicleName string, uiURL string) ([]map[string]interface{}, error) {
	var reminders []struct {
		Description string `json:"description"`
		Urgency     string `json:"urgency"`
		DueDate     string `json:"dueDate"`
	}
	if err := json.Unmarshal(body, &reminders); err != nil {
		return nil, err
	}
	urgencyColor := map[string]string{
		"past due": "#ef4444", "very urgent": "#f97316", "urgent": "#f59e0b", "not urgent": "#6366f1",
	}
	events := []map[string]interface{}{}
	for _, r := range reminders {
		if r.DueDate == "" {
			continue
		}
		u := strings.ToLower(r.Urgency)
		color := urgencyColor[u]
		if color == "" {
			color = "#6366f1"
		}
		events = append(events, map[string]interface{}{
			"source": "lubelogger", "date": r.DueDate,
			"title": fmt.Sprintf("%s — %s", vehicleName, r.Description),
			"color": color, "uiUrl": uiURL,
		})
	}
	return events, nil
}

// ── Monica ────────────────────────────────────────────────────────────────

// monicaCalMonths is how many months ahead to fetch from Monica's
// month-indexed reminders endpoint. Monica has no date-range query (unlike
// Sonarr/Radarr's ?start=&end=) — the calendar panel's own daysAhead slider
// (up to 90 days) is enforced by lookupAndFilter at serve time, so fetching
// months 0-3 safely covers it.
const monicaCalMonths = 4

func computeMonicaCalEvents(db *sql.DB, integrationID string) ([]map[string]interface{}, error) {
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = apiURL
	}
	intName := integrationName(db, integrationID, "Monica")

	today := timeNow().UTC().Truncate(24 * time.Hour)
	seen := map[int]bool{}
	events := []map[string]interface{}{}
	anyOK := false

	for month := 0; month < monicaCalMonths; month++ {
		b, ferr := monicaGet(apiURL, apiKey, fmt.Sprintf("/api/reminders/upcoming/%d", month), skipTLS)
		if ferr != nil {
			logErrorf("CAL", "monica reminders (month=%d) error: %v", month, ferr)
			continue
		}
		anyOK = true
		var r struct {
			Data []struct {
				ID          int    `json:"id"`
				Title       string `json:"title"`
				PlannedDate string `json:"planned_date"`
				Contact     struct {
					CompleteName string `json:"complete_name"`
				} `json:"contact"`
			} `json:"data"`
		}
		if json.Unmarshal(b, &r) != nil {
			logErrorf("CAL", "monica reminders (month=%d): unexpected response: %s", month, strings.TrimSpace(string(b)))
			continue
		}
		for _, item := range r.Data {
			if seen[item.ID] {
				continue
			}
			t, perr := time.Parse(time.RFC3339Nano, item.PlannedDate)
			if perr != nil {
				logErrorf("CAL", "monica reminders (month=%d): could not parse planned_date %q for reminder id=%d", month, item.PlannedDate, item.ID)
				continue
			}
			t = t.UTC()
			if t.Before(today) {
				continue
			}
			seen[item.ID] = true
			title := item.Title
			if item.Contact.CompleteName != "" {
				title = fmt.Sprintf("%s — %s", item.Contact.CompleteName, item.Title)
			}
			events = append(events, map[string]interface{}{
				"source": intName,
				"date":   t.Format("2006-01-02"),
				"title":  title,
				"color":  "#f472b6",
				"uiUrl":  uiURL,
			})
		}
	}

	if !anyOK {
		return nil, fmt.Errorf("monica unreachable — check URL and credentials (see server log for details)")
	}
	return events, nil
}
