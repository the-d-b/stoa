package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
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

// cachedDueItems returns due items from the cache if younger than maxAge,
// fetching on miss. On fetch failure it falls back to stale cache rather than
// dropping the source.
func cachedDueItems(cacheKey string, maxAge time.Duration, fetch func() ([]dueItem, error)) ([]dueItem, bool) {
	if cached, ok := cacheGetFresh(cacheKey, maxAge); ok {
		if items, ok2 := cached.([]dueItem); ok2 {
			return items, true
		}
	}
	items, err := fetch()
	if err != nil {
		log.Printf("[CAL] %s fetch error: %v", cacheKey, err)
		if cached, ok := cacheGet(cacheKey); ok {
			if stale, ok2 := cached.([]dueItem); ok2 {
				return stale, true
			}
		}
		return nil, false
	}
	cacheSet(cacheKey, items)
	log.Printf("[CAL] %s: %d upcoming items", cacheKey, len(items))
	return items, true
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
	log.Printf("[CAL] fetchCalendarData: %d sources", len(sources))

	events := []map[string]interface{}{}

	for _, src := range sources {
		source, _ := src.(map[string]interface{})
		if source == nil { continue }
		srcType := stringVal(source, "type")
		integrationID := stringVal(source, "integrationId")

		log.Printf("[CAL] source: type=%q integrationId=%q", srcType, integrationID)
		if integrationID == "" && srcType != "ical" { continue }

		daysAhead := 30
		if v, ok := source["daysAhead"].(float64); ok {
			daysAhead = int(v)
		}

		calStart := timeNow().Format("2006-01-02")
		calEnd := timeNow().AddDate(0, 0, daysAhead).Format("2006-01-02")

		switch srcType {
		case "sonarr":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] sonarr resolveIntegration error: %v", err)
				continue
			}
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v3/calendar?includeSeries=true&unmonitored=true&start=%s&end=%s", calStart, calEnd), skipTLS)
			if err != nil {
				log.Printf("[CAL] sonarr fetch error: %v", err)
				continue
			}
			var episodes []map[string]interface{}
			json.Unmarshal(upcoming, &episodes)
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

		case "radarr":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] radarr resolveIntegration error: %v", err)
				continue
			}
			// unmonitored=true returns all movies regardless of monitored status
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v3/calendar?unmonitored=true&start=%s&end=%s", calStart, calEnd), skipTLS)
			if err != nil {
				log.Printf("[CAL] radarr fetch error: %v", err)
				continue
			}
			var movies []map[string]interface{}
			json.Unmarshal(upcoming, &movies)
			today := timeNow().Format("2006-01-02")
			for _, m := range movies {
				title, _ := m["title"].(string)
				titleSlug, _ := m["titleSlug"].(string)
				// Emit a separate event for each future release date
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
				log.Printf("[CAL] radarr %q: %d future releases", title, len(releases))
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

		case "readarr":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] readarr resolveIntegration error: %v", err)
				continue
			}
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v1/calendar?unmonitored=true&start=%s&end=%s", calStart, calEnd), skipTLS)
			if err != nil {
				log.Printf("[CAL] readarr fetch error: %v", err)
				continue
			}
			var books []map[string]interface{}
			json.Unmarshal(upcoming, &books)
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

		case "lidarr":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] lidarr resolveIntegration error: %v", err)
				continue
			}
			// unmonitored=true returns all albums regardless of monitored status
			upcoming, err := arrGet(apiURL, apiKey,
				fmt.Sprintf("/api/v1/calendar?unmonitored=true&start=%s&end=%s", calStart, calEnd), skipTLS)
			if err != nil {
				log.Printf("[CAL] lidarr fetch error: %v", err)
				continue
			}
			var albums []map[string]interface{}
			json.Unmarshal(upcoming, &albums)
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

		case "weather":
			// Read from integration cache — same data as weather panel
			log.Printf("[CAL] fetching weather for integration %s", integrationID)
			wd, werr := getWeatherData(db, integrationID, map[string]interface{}{"integrationId": integrationID})
			if werr != nil {
				log.Printf("[CAL] weather error for %s: %v", integrationID, werr)
				continue
			}
			log.Printf("[CAL] weather ok for %s, city=%s, days=%d", integrationID, wd.City, len(wd.Daily))
			// Build one event per day from the 7-day forecast
			for _, day := range wd.Daily {
				if day.Date == "" { continue }
				tmp := day.MaxF
				tmpMin := day.MinF
				if wd.Unit == "c" { tmp = day.MaxC; tmpMin = day.MinC }
				city := wd.City
				title := fmt.Sprintf("%s %s %.0f°/%.0f°", city, day.Icon, tmp, tmpMin)
				events = append(events, map[string]interface{}{
					"source":  "weather",
					"date":    day.Date,
					"title":   title,
					"icon":    day.Icon,
					"color":   "#60a5fa",
					"tagId":   integrationID,
				})
			}

		case "google":
			calendarID := stringVal(source, "calendarId")
			if calendarID == "" {
				calendarID = "primary"
			}

			accessToken, aerr := GetValidAccessToken(db, integrationID)
			if aerr != nil {
				log.Printf("[CAL] google: GetValidAccessToken error: %v", aerr)
				continue
			}

			timeMin := timeNow()
			timeMax := timeNow().AddDate(0, 0, daysAhead)

			items, gerr := FetchGoogleCalendarEvents(accessToken, calendarID, timeMin, timeMax)
			if gerr != nil {
				log.Printf("[CAL] google: FetchGoogleCalendarEvents error: %v", gerr)
				continue
			}

			for _, item := range items {
				start, _ := item["start"].(map[string]interface{})
				end, _ := item["end"].(map[string]interface{})
				if start == nil {
					continue
				}
				date, startDT, endDT := "", "", ""
				if d, ok := start["date"].(string); ok {
					date = d // all-day event
				} else if dt, ok := start["dateTime"].(string); ok && len(dt) >= 10 {
					date = dt[:10]
					startDT = dt // pass raw RFC3339 to frontend for local tz formatting
					if end != nil {
						if et, ok2 := end["dateTime"].(string); ok2 {
							endDT = et
						}
					}
				}
				if date == "" {
					continue
				}
				if eventDate, err := time.Parse("2006-01-02", date); err == nil {
					if eventDate.Before(timeNow().Truncate(24 * time.Hour)) {
						continue
					}
				}
				summary, _ := item["summary"].(string)
				if summary == "" {
					summary = "(no title)"
				}
				events = append(events, map[string]interface{}{
					"source":  "google",
					"date":    date,
					"title":   summary,
					"startDT": startDT,
					"endDT":   endDT,
					"color":   "#34d399",
				})
			}

		case "sports":
			// Read from sports integration cache — convert schedule to calendar events
			// Look up integration name for use as pill label
			var intName string
			db.QueryRow(`SELECT COALESCE(name,'Sports') FROM integrations WHERE id=?`, integrationID).Scan(&intName)
			if intName == "" { intName = "Sports" }
			cached, ok := cacheGet(integrationID)
			if !ok {
				// Cache miss — fetch live
				sportsData, serr := FetchSportsData(db, integrationID)
				if serr != nil {
					log.Printf("[CAL] sports: fetch error: %v", serr)
					continue
				}
				cacheSet(integrationID, sportsData)
				cached = sportsData
			}
			// Type-assert to SportsPanelData
			sportsData, ok := cached.(*SportsPanelData)
			if !ok {
				// Try JSON round-trip if cached as interface{}
				if b, jerr := json.Marshal(cached); jerr == nil {
					var sd SportsPanelData
					if jerr2 := json.Unmarshal(b, &sd); jerr2 == nil {
						sportsData = &sd
						ok = true
					}
				}
			}
			if !ok || sportsData == nil {
				log.Printf("[CAL] sports: could not read cached data for %s", integrationID)
				continue
			}
			// Convert upcoming schedule games to calendar events
			log.Printf("[CAL] sports: %d schedule items, %d games", len(sportsData.Schedule), len(sportsData.Games))
			todayDate := timeNow().Local().Format("2006-01-02")
			for _, g := range sportsData.Schedule {
				if g.StartTime == "" { continue }
				var t time.Time
				var terr error
				for _, fmt2 := range []string{time.RFC3339, "2006-01-02T15:04Z", "2006-01-02T15:04:05Z"} {
					t, terr = time.Parse(fmt2, g.StartTime)
					if terr == nil { break }
				}
				if terr != nil {
					log.Printf("[CAL] sports: bad startTime %q: %v", g.StartTime, terr)
					continue
				}
				// Skip TBD/if-necessary games -- no confirmed time yet
				if g.IsTBD {
					continue
				}
				// Use local time for date so games tonight don't appear as tomorrow
				date := t.Local().Format("2006-01-02")
				// Include today and future games
				if date < todayDate { continue }
				title := fmt.Sprintf("%s %s @ %s", g.League, g.AwayAbbr, g.HomeAbbr)
				if g.IsFavorite {
					title = "⭐ " + title
				}
				events = append(events, map[string]interface{}{
					"source":  intName,
					"date":    date,
					"startDT": g.StartTime,
					"title":   title,
					"color":   "#f97316",
					"league":  g.League,
				})
			}

		case "actualbudget":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] actualbudget resolveIntegration error: %v", err)
				continue
			}
			if uiURL == "" {
				uiURL = apiURL
			}
			items, ok := cachedDueItems("abschedules:"+integrationID, 15*time.Minute, func() ([]dueItem, error) {
				return abFetchScheduleItems(apiURL, apiKey, skipTLS)
			})
			if !ok {
				continue
			}
			intName := integrationName(db, integrationID, "Actual Budget")
			events = append(events, dueSoonEvents(items, intName, uiURL, "#14b8a6", daysAhead, timeNow())...)

		case "fireflyiii":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] fireflyiii resolveIntegration error: %v", err)
				continue
			}
			if uiURL == "" {
				uiURL = apiURL
			}
			items, ok := cachedDueItems("ffbills:"+integrationID, 15*time.Minute, func() ([]dueItem, error) {
				return ffFetchBillItems(apiURL, apiKey, skipTLS)
			})
			if !ok {
				continue
			}
			intName := integrationName(db, integrationID, "Firefly III")
			events = append(events, dueSoonEvents(items, intName, uiURL, "#ec4899", daysAhead, timeNow())...)

		case "homeassistant":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] homeassistant resolveIntegration error: %v", err)
				continue
			}
			if uiURL == "" {
				uiURL = apiURL
			}
			calBody, cerr := haGet(apiURL, apiKey, "/api/calendars", skipTLS)
			if cerr != nil {
				log.Printf("[CAL] homeassistant calendars list error: %v", cerr)
				continue
			}
			var cals []struct {
				EntityID string `json:"entity_id"`
				Name     string `json:"name"`
			}
			if err := json.Unmarshal(calBody, &cals); err != nil {
				log.Printf("[CAL] homeassistant calendars parse error: %v", err)
				continue
			}
			intName := integrationName(db, integrationID, "Home Assistant")
			// One pill for the whole integration; calendar names go into event
			// titles instead (only when there is more than one calendar)
			prefixNames := len(cals) > 1
			startISO := timeNow().UTC().Format("2006-01-02T15:04:05Z")
			endISO := timeNow().AddDate(0, 0, daysAhead).UTC().Format("2006-01-02T15:04:05Z")
			for _, cal := range cals {
				evBody, eerr := haGet(apiURL, apiKey,
					fmt.Sprintf("/api/calendars/%s?start=%s&end=%s", url.PathEscape(cal.EntityID), startISO, endISO), skipTLS)
				if eerr != nil {
					log.Printf("[CAL] homeassistant %s events error: %v", cal.EntityID, eerr)
					continue
				}
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
				if err := json.Unmarshal(evBody, &items); err != nil {
					log.Printf("[CAL] homeassistant %s events parse error: %v", cal.EntityID, err)
					continue
				}
				for _, it := range items {
					date, startDT, endDT := "", "", ""
					if it.Start.Date != "" {
						date = it.Start.Date // all-day event
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
					if prefixNames && cal.Name != "" {
						title = cal.Name + ": " + title
					}
					e := map[string]interface{}{
						"source": intName,
						"date":   date,
						"title":  title,
						"color":  "#22d3ee",
						"uiUrl":  strings.TrimRight(uiURL, "/") + "/calendar",
					}
					if startDT != "" {
						e["startDT"] = startDT
					}
					if endDT != "" {
						e["endDT"] = endDT
					}
					events = append(events, e)
				}
			}

		case "caldav":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] caldav resolveIntegration error: %v", err)
				continue
			}
			cacheKey := "caldavevents:" + integrationID
			var vevents []icsVEvent
			haveCache := false
			if cached, ok := cacheGetFresh(cacheKey, 15*time.Minute); ok {
				if ev, ok2 := cached.([]icsVEvent); ok2 {
					vevents, haveCache = ev, true
				}
			}
			if !haveCache {
				// Fetch the max selectable window; serve-time filtering narrows
				fetched, ferr := caldavReportEvents(apiURL, apiKey, timeNow().AddDate(0, 0, -1), timeNow().AddDate(0, 0, 91), skipTLS)
				if ferr != nil {
					log.Printf("[CAL] caldav fetch error: %v", ferr)
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
					vevents = fetched
					cacheSet(cacheKey, vevents)
					log.Printf("[CAL] caldav: fetched %d raw events", len(vevents))
				}
			}

			intName := integrationName(db, integrationID, "CalDAV")
			now := timeNow().Local()
			winStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
			winEnd := winStart.AddDate(0, 0, daysAhead+1)
			today := timeNow().Format("2006-01-02")
			endDate := timeNow().AddDate(0, 0, daysAhead).Format("2006-01-02")
			for _, ev := range expandICSEvents(vevents, winStart, winEnd) {
				if ev.Date < today || ev.Date > endDate {
					continue
				}
				e := map[string]interface{}{
					"source": intName,
					"date":   ev.Date,
					"title":  ev.Summary,
					"color":  "#818cf8",
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

		case "kapowarr":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] kapowarr resolveIntegration error: %v", err)
				continue
			}
			if uiURL == "" {
				uiURL = apiURL
			}
			// Hourly cache — one detail request per monitored volume, and
			// comic release dates change rarely
			items, ok := cachedDueItems("kapreleases:"+integrationID, time.Hour, func() ([]dueItem, error) {
				return kapowarrFetchReleaseItems(apiURL, uiURL, apiKey, skipTLS)
			})
			if !ok {
				continue
			}
			intName := integrationName(db, integrationID, "Kapowarr")
			for _, it := range items {
				if it.DueDate < calStart || it.DueDate > calEnd {
					continue
				}
				link := it.Link
				if link == "" {
					link = uiURL
				}
				events = append(events, map[string]interface{}{
					"source": intName,
					"date":   it.DueDate,
					"title":  it.Title,
					"color":  "#facc15",
					"uiUrl":  link,
				})
			}

		case "mylar3":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] mylar3 resolveIntegration error: %v", err)
				continue
			}
			if uiURL == "" {
				uiURL = apiURL
			}
			items, ok := cachedDueItems("mylarupcoming:"+integrationID, 15*time.Minute, func() ([]dueItem, error) {
				return mylar3FetchReleaseItems(apiURL, uiURL, apiKey, skipTLS)
			})
			if !ok {
				continue
			}
			intName := integrationName(db, integrationID, "Mylar3")
			for _, it := range items {
				if it.DueDate < calStart || it.DueDate > calEnd {
					continue
				}
				link := it.Link
				if link == "" {
					link = uiURL
				}
				events = append(events, map[string]interface{}{
					"source": intName,
					"date":   it.DueDate,
					"title":  it.Title,
					"color":  "#84cc16",
					"uiUrl":  link,
				})
			}

		case "maintainerr":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			if err != nil {
				log.Printf("[CAL] maintainerr resolveIntegration error: %v", err)
				continue
			}
			if uiURL == "" {
				uiURL = apiURL
			}
			items, ok := cachedDueItems("mtractions:"+integrationID, 15*time.Minute, func() ([]dueItem, error) {
				return maintainerrFetchActionItems(apiURL, uiURL, apiKey, skipTLS)
			})
			if !ok {
				continue
			}
			intName := integrationName(db, integrationID, "Maintainerr")
			for _, it := range items {
				if it.DueDate < calStart || it.DueDate > calEnd {
					continue
				}
				link := it.Link
				if link == "" {
					link = uiURL
				}
				events = append(events, map[string]interface{}{
					"source": intName,
					"date":   it.DueDate,
					"title":  it.Title,
					"color":  "#ef4444",
					"uiUrl":  link,
				})
			}

		case "ical":
			icsURL := stringVal(source, "icsUrl")
			if icsURL == "" {
				log.Printf("[CAL] ical: no icsUrl in source config")
				continue
			}
			label := stringVal(source, "label")
			if label == "" { label = "Calendar" }
			color := stringVal(source, "color")
			if color == "" { color = "#0078d4" }

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
					log.Printf("[CAL] ical: fetch error: %v", ferr)
					// Fall back to stale cache rather than dropping the source
					if cached, ok := cacheGet(cacheKey); ok {
						if ev, ok2 := cached.([]icsVEvent); ok2 {
							vevents, haveCache = ev, true
						}
					}
					if !haveCache { continue }
				} else {
					vevents = parseICSVEvents(body)
					cacheSet(cacheKey, vevents)
					log.Printf("[CAL] ical: fetched %d raw events from %s", len(vevents), icsURL)
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
				if ev.Date < today || ev.Date > endDate { continue }
				e := map[string]interface{}{
					"source": label,
					"date":   ev.Date,
					"title":  ev.Summary,
					"color":  color,
				}
				if ev.StartDT != "" { e["startDT"] = ev.StartDT }
				if ev.EndDT != ""   { e["endDT"]   = ev.EndDT }
				events = append(events, e)
			}

		case "lubelogger":
			apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
			_ = uiURL
			if err != nil {
				log.Printf("[CAL] lubelogger resolveIntegration error: %v", err)
				continue
			}
			vBody, err := lubeGet(apiURL, apiKey, "/api/vehicles", skipTLS)
			if err != nil {
				log.Printf("[CAL] lubelogger vehicles error: %v", err)
				continue
			}
			var vehicles []struct {
				ID    int             `json:"id"`
				Year  json.RawMessage `json:"year"`
				Make  string          `json:"make"`
				Model string          `json:"model"`
			}
			if err := json.Unmarshal(vBody, &vehicles); err != nil {
				log.Printf("[CAL] lubelogger vehicles parse error: %v", err)
				continue
			}
			urgencyColor := map[string]string{
				"past due":    "#ef4444",
				"very urgent": "#f97316",
				"urgent":      "#f59e0b",
				"not urgent":  "#6366f1",
			}
			for _, vehicle := range vehicles {
				year := strings.Trim(string(vehicle.Year), `"`)
				vehicleName := strings.TrimSpace(year + " " + vehicle.Make + " " + vehicle.Model)
				rBody, _ := lubeGet(apiURL, apiKey, fmt.Sprintf("/api/vehicle/reminders?vehicleId=%d", vehicle.ID), skipTLS)
				if rBody == nil {
					continue
				}
				var reminders []struct {
					Description string `json:"description"`
					Urgency     string `json:"urgency"`
					DueDate     string `json:"dueDate"`
				}
				if json.Unmarshal(rBody, &reminders) != nil {
					continue
				}
				for _, r := range reminders {
					if r.DueDate == "" {
						continue // mileage-only reminders have no calendar date
					}
					u := strings.ToLower(r.Urgency)
					color := urgencyColor[u]
					if color == "" {
						color = "#6366f1"
					}
					events = append(events, map[string]interface{}{
						"source": "lubelogger",
						"date":   r.DueDate,
						"title":  fmt.Sprintf("%s — %s", vehicleName, r.Description),
						"color":  color,
						"uiUrl":  uiURL,
					})
				}
			}

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
		if source == nil || stringVal(source, "type") != "checklist" { continue }
		panelID := stringVal(source, "panelId")
		if panelID == "" { continue }
		rows, err := db.Query(`
			SELECT text, due_date FROM checklist_items
			WHERE panel_id = ? AND due_date IS NOT NULL AND completed = 0
		`, panelID)
		if err != nil { continue }
		for rows.Next() {
			var text, dueDate string
			rows.Scan(&text, &dueDate)
			// Show as event on the day BEFORE the due date ("due tomorrow")
			due, err := time.Parse("2006-01-02", dueDate)
			if err != nil { continue }
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

	log.Printf("[CAL] fetchCalendarData: returning %d total events", len(events))
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
			if !inEvent { continue }
			colonIdx := strings.IndexByte(line, ':')
			if colonIdx < 0 { continue }
			propFull, value := line[:colonIdx], line[colonIdx+1:]
			parts := strings.SplitN(propFull, ";", 2)
			propName := strings.ToUpper(parts[0])
			params := ""
			if len(parts) > 1 { params = parts[1] }

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
		if ev.Cancelled { return }
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
				if occ.Equal(ex) { skip = true; break }
			}
			if !skip {
				for _, ov := range overrides[ev.UID] {
					if occ.Equal(ov.RecurrenceID) { skip = true; break }
				}
			}
			if skip { continue }
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
		log.Printf("[CAL] ical: bad RRULE %q: %v", ev.RRule, err)
		return []time.Time{ev.Start}
	}
	opt.Dtstart = ev.Start
	r, err := rrule.NewRRule(*opt)
	if err != nil {
		log.Printf("[CAL] ical: RRULE build error %q: %v", ev.RRule, err)
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
			if sb.Len() > 0 { sb.WriteByte('\n') }
			sb.WriteString(line)
		}
	}
	return sb.String()
}

// icsParseTime parses an iCal date/datetime value into a time.Time.
// allDay is true for date-only values (parsed at local midnight).
func icsParseTime(value, params string) (t time.Time, allDay, ok bool) {
	value = strings.TrimSpace(value)
	if value == "" { return time.Time{}, false, false }

	isDateOnly := strings.Contains(params, "VALUE=DATE") ||
		(len(value) == 8 && !strings.Contains(value, "T"))

	if isDateOnly && len(value) >= 8 {
		t, err := time.ParseInLocation("20060102", value[:8], time.Local)
		if err != nil { return time.Time{}, false, false }
		return t, true, true
	}

	// Expect YYYYMMDDTHHmmss[Z]
	if len(value) < 15 { return time.Time{}, false, false }
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
	if err != nil { return time.Time{}, false, false }
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
