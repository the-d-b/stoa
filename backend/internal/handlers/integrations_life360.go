package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

// Life360 has no public/official API. This talks to the same undocumented
// REST API the Life360 mobile app uses, which Life360/Cloudflare actively
// try to block for third parties (expect occasional 403/429 responses).
//
// The normal email+password login flow stops working entirely once a Life360
// account's phone number is verified — true for most real accounts — so the
// secret here is NOT an API key: it's a session bearer token the user
// extracts by hand from their browser after logging into life360.com
// (DevTools → Application → Cookies → LIFE360_AUTH_TOKEN). That token is
// used as-is on every request. It is not a stable credential — it can
// expire or be invalidated at any time with no refresh mechanism, at which
// point the user has to repeat the extraction and update the secret. See
// docs/integrations/life360/README.md for the full extraction steps.

const life360Host = "https://api-cloudfront.life360.com"

// Mimics the Android app's own User-Agent — community Life360 clients treat
// this as necessary to avoid extra Cloudflare bot-detection scrutiny.
const life360UserAgent = "com.life360.android.safetymapd/KOKO/23.50.0 android/13"

type Life360Member struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Latitude   float64 `json:"latitude"`
	Longitude  float64 `json:"longitude"`
	Accuracy   int     `json:"accuracy"` // meters
	Battery    int     `json:"battery"`  // percent
	Charging   bool    `json:"charging"`
	IsDriving  bool    `json:"isDriving"`
	Address    string  `json:"address"`
	UpdatedAt  string  `json:"updatedAt"` // RFC3339
	CircleName string  `json:"circleName"`
}

type Life360PanelData struct {
	Members []Life360Member `json:"members"`
}

func life360Get(token, path string) ([]byte, error) {
	req, err := http.NewRequest("GET", life360Host+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", life360UserAgent)
	req.Header.Set("Cache-Control", "no-cache")
	resp, err := httpClient(false).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed — the extracted session token has likely expired; re-extract it from your browser (see docs)")
	}
	if resp.StatusCode == 429 {
		return nil, fmt.Errorf("rate limited by Life360 — this is common with their unofficial API; try again later")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Life360", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

type life360Circle struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// life360Location mirrors the API's Location object. Nearly every field is a
// string-encoded number — a quirk of the underlying (unofficial) API, not a
// Stoa convention.
type life360Location struct {
	Latitude  string `json:"latitude"`
	Longitude string `json:"longitude"`
	Accuracy  string `json:"accuracy"`
	Timestamp string `json:"timestamp"` // epoch seconds, as a string
	Address1  string `json:"address1"`
	Address2  string `json:"address2"`
	Battery   string `json:"battery"`
	Charge    string `json:"charge"`
	IsDriving string `json:"isDriving"`
}

type life360Member struct {
	ID        string          `json:"id"`
	FirstName string          `json:"firstName"`
	LastName  string          `json:"lastName"`
	Location  life360Location `json:"location"`
}

func life360ParseFloat(s string) float64 {
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

func life360ParseInt(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

func life360ParseBool(s string) bool {
	return s == "1" || s == "true"
}

func fetchLife360PanelData(db *sql.DB, config map[string]interface{}) (*Life360PanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	_, _, apiKey, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if apiKey == "" {
		return nil, fmt.Errorf("Life360 session token required")
	}

	circlesBody, err := life360Get(apiKey, "/v4/circles")
	if err != nil {
		return nil, err
	}
	var circlesResp struct {
		Circles []life360Circle `json:"circles"`
	}
	if json.Unmarshal(circlesBody, &circlesResp) != nil || len(circlesResp.Circles) == 0 {
		return nil, fmt.Errorf("no Life360 circles found on this account")
	}

	data := &Life360PanelData{}
	var lastErr error
	for _, circle := range circlesResp.Circles {
		membersBody, merr := life360Get(apiKey, "/v3/circles/"+circle.ID+"/members")
		if merr != nil {
			lastErr = merr
			logErrorf("LIFE360", "members fetch failed for circle %s: %v", circle.Name, merr)
			continue
		}
		var membersResp struct {
			Members []life360Member `json:"members"`
		}
		if json.Unmarshal(membersBody, &membersResp) != nil {
			continue
		}
		for _, m := range membersResp.Members {
			loc := m.Location
			if loc.Latitude == "" || loc.Longitude == "" {
				continue // member has no current location fix (e.g. never opened the app)
			}
			name := m.FirstName
			if m.LastName != "" {
				name = name + " " + m.LastName
			}
			address := loc.Address1
			if loc.Address2 != "" {
				address = address + ", " + loc.Address2
			}
			updatedAt := ""
			if ts := life360ParseInt(loc.Timestamp); ts > 0 {
				updatedAt = time.Unix(int64(ts), 0).UTC().Format(time.RFC3339)
			}
			data.Members = append(data.Members, Life360Member{
				ID:         m.ID,
				Name:       name,
				Latitude:   life360ParseFloat(loc.Latitude),
				Longitude:  life360ParseFloat(loc.Longitude),
				Accuracy:   life360ParseInt(loc.Accuracy),
				Battery:    life360ParseInt(loc.Battery),
				Charging:   life360ParseBool(loc.Charge),
				IsDriving:  life360ParseBool(loc.IsDriving),
				Address:    address,
				UpdatedAt:  updatedAt,
				CircleName: circle.Name,
			})
		}
	}

	if len(data.Members) == 0 && lastErr != nil {
		return nil, lastErr
	}
	return data, nil
}

// getLife360Data reads from the integration's normal worker cache, falling
// back to a live fetch on a cold cache (mirrors getWeatherData in glyphs.go).
// This is how the Map panel reads Life360 data — Life360 itself is polled
// independently on its own refresh interval, and Map just aggregates
// whatever's already cached, same as Calendar does for its own sources.
func getLife360Data(db *sql.DB, integrationID string) (*Life360PanelData, error) {
	if cached, ok := cacheGet(integrationID); ok {
		if v, ok := cached.(*Life360PanelData); ok {
			return v, nil
		}
	}
	return fetchLife360PanelData(db, map[string]interface{}{"integrationId": integrationID})
}

func testLife360Connection(_ string, apiKey string, _ bool) error {
	if apiKey == "" {
		return fmt.Errorf("Life360 session token required")
	}
	body, err := life360Get(apiKey, "/v4/circles")
	if err != nil {
		return err
	}
	var circlesResp struct {
		Circles []life360Circle `json:"circles"`
	}
	if json.Unmarshal(body, &circlesResp) != nil {
		return fmt.Errorf("unexpected response from Life360")
	}
	if len(circlesResp.Circles) == 0 {
		return fmt.Errorf("no Life360 circles found on this account")
	}
	return nil
}
