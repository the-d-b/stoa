package handlers

// CalDAV (RFC 4791) client — read via REPORT calendar-query, write via PUT of
// a single-VEVENT ICS. Covers Nextcloud, Fastmail, Radicale, Baïkal, Synology
// and other standard CalDAV servers.
//
// The integration's URL must point at a specific calendar collection, e.g.
// https://cloud.example.com/remote.php/dav/calendars/alice/personal/
// The secret is "username:password" — use an app password where the server
// supports them (Nextcloud: Settings → Security → Devices & sessions).

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// caldavDo issues a CalDAV request with Basic auth from a "user:pass" secret.
func caldavDo(method, fullURL, userpass, body string, headers map[string]string, skipTLS bool) (*http.Response, error) {
	req, err := http.NewRequest(method, fullURL, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	if user, pass, ok := strings.Cut(userpass, ":"); ok {
		req.SetBasicAuth(user, pass)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	return httpClient(skipTLS).Do(req)
}

// testCaldavConnection verifies the URL is a DAV collection and the
// credentials are accepted (PROPFIND Depth 0 → 207 multistatus).
func testCaldavConnection(baseURL, userpass string, skipTLS bool) error {
	if !strings.Contains(userpass, ":") {
		return fmt.Errorf("caldav secret must be username:password (use an app password)")
	}
	body := `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>`
	resp, err := caldavDo("PROPFIND", strings.TrimRight(baseURL, "/")+"/", userpass, body, map[string]string{
		"Depth":        "0",
		"Content-Type": "application/xml; charset=utf-8",
	}, skipTLS)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return fmt.Errorf("authentication failed — check username:password (app password)")
	}
	if resp.StatusCode != 207 {
		return fmt.Errorf("HTTP %d from CalDAV server — URL should be a calendar collection", resp.StatusCode)
	}
	return nil
}

// caldavReportEvents fetches raw VEVENTs intersecting [start, end] via a
// calendar-query REPORT. Recurring events come back as master VEVENTs (plus
// any overrides); expansion happens locally via expandICSEvents.
func caldavReportEvents(baseURL, userpass string, start, end time.Time, skipTLS bool) ([]icsVEvent, error) {
	body := fmt.Sprintf(`<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="%s" end="%s"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`,
		start.UTC().Format("20060102T150405Z"), end.UTC().Format("20060102T150405Z"))

	resp, err := caldavDo("REPORT", strings.TrimRight(baseURL, "/")+"/", userpass, body, map[string]string{
		"Depth":        "1",
		"Content-Type": "application/xml; charset=utf-8",
	}, skipTLS)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed — check username:password")
	}
	if resp.StatusCode != 207 {
		return nil, fmt.Errorf("HTTP %d from CalDAV REPORT", resp.StatusCode)
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// Namespace-agnostic multistatus parse — encoding/xml matches local names
	var ms struct {
		Responses []struct {
			Propstats []struct {
				CalendarData string `xml:"prop>calendar-data"`
			} `xml:"propstat"`
		} `xml:"response"`
	}
	if err := xml.Unmarshal(raw, &ms); err != nil {
		return nil, fmt.Errorf("parsing multistatus: %w", err)
	}

	var vevents []icsVEvent
	for _, r := range ms.Responses {
		for _, ps := range r.Propstats {
			if strings.TrimSpace(ps.CalendarData) == "" {
				continue
			}
			vevents = append(vevents, parseICSVEvents([]byte(ps.CalendarData))...)
		}
	}
	return vevents, nil
}

// icsEscape escapes text values per RFC 5545 §3.3.11 (inverse of icsUnescape).
func icsEscape(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, ";", `\;`)
	s = strings.ReplaceAll(s, ",", `\,`)
	s = strings.ReplaceAll(s, "\r\n", `\n`)
	s = strings.ReplaceAll(s, "\n", `\n`)
	return s
}

// caldavCreateEvent PUTs a new single-VEVENT ICS into the collection. Empty
// startDT creates an all-day event on date (DTEND exclusive, next day); with
// startDT, an empty endDT defaults to one hour after start.
func caldavCreateEvent(baseURL, userpass, title, date, startDT, endDT string, skipTLS bool) error {
	var timing string
	if startDT == "" {
		d, err := time.Parse("2006-01-02", date)
		if err != nil {
			return fmt.Errorf("invalid date %q", date)
		}
		timing = fmt.Sprintf("DTSTART;VALUE=DATE:%s\r\nDTEND;VALUE=DATE:%s\r\n",
			d.Format("20060102"), d.AddDate(0, 0, 1).Format("20060102"))
	} else {
		start, err := time.Parse(time.RFC3339, startDT)
		if err != nil {
			return fmt.Errorf("invalid start time %q", startDT)
		}
		end := start.Add(time.Hour)
		if endDT != "" {
			if e, err2 := time.Parse(time.RFC3339, endDT); err2 == nil {
				end = e
			}
		}
		timing = fmt.Sprintf("DTSTART:%s\r\nDTEND:%s\r\n",
			start.UTC().Format("20060102T150405Z"), end.UTC().Format("20060102T150405Z"))
	}

	randBytes := make([]byte, 16)
	rand.Read(randBytes) //nolint:errcheck
	uid := hex.EncodeToString(randBytes) + "@stoa"

	ics := "BEGIN:VCALENDAR\r\n" +
		"VERSION:2.0\r\n" +
		"PRODID:-//stoa//calendar//EN\r\n" +
		"BEGIN:VEVENT\r\n" +
		"UID:" + uid + "\r\n" +
		"DTSTAMP:" + timeNow().UTC().Format("20060102T150405Z") + "\r\n" +
		"SUMMARY:" + icsEscape(title) + "\r\n" +
		timing +
		"END:VEVENT\r\n" +
		"END:VCALENDAR\r\n"

	putURL := strings.TrimRight(baseURL, "/") + "/" + uid + ".ics"
	resp, err := caldavDo("PUT", putURL, userpass, ics, map[string]string{
		"Content-Type":  "text/calendar; charset=utf-8",
		"If-None-Match": "*",
	}, skipTLS)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return fmt.Errorf("CalDAV server rejected the write — check the account has write access to this calendar")
	}
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		if len(b) > 200 {
			b = b[:200]
		}
		return fmt.Errorf("CalDAV PUT HTTP %d: %s", resp.StatusCode, b)
	}
	return nil
}
