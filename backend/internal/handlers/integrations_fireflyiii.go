package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type FireflyAccount struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Type         string `json:"type"`
	Balance      string `json:"balance"`
	CurrencyCode string `json:"currencyCode"`
	CurrencySymbol string `json:"currencySymbol"`
	Active       bool   `json:"active"`
}

type FireflySummaryItem struct {
	Key          string `json:"key"`
	Title        string `json:"title"`
	Value        string `json:"value"`     // monetary_value raw
	ValueParsed  string `json:"valueParsed"` // formatted
	CurrencyCode string `json:"currencyCode"`
	CurrencySymbol string `json:"currencySymbol"`
	Icon         string `json:"icon"`
}

type FireflyPanelData struct {
	UIURL         string               `json:"uiUrl"`
	IntegrationID string               `json:"integrationId"`
	Version       string               `json:"version"`
	APIVersion    string               `json:"apiVersion"`
	// Summary items (current month)
	Summary       []FireflySummaryItem `json:"summary"`
	// Asset accounts
	Accounts      []FireflyAccount     `json:"accounts"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func fireflyGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.api+json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed — check Firefly III API token")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Firefly III", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchFireflyPanelData(db *sql.DB, config map[string]interface{}) (*FireflyPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("integrationId required")
	}
	baseURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = baseURL
	}

	out := &FireflyPanelData{UIURL: uiURL, IntegrationID: integrationID}

	// ── About (version) ───────────────────────────────────────────────────────
	if body, err := fireflyGet(baseURL, apiKey, "/api/v1/about", skipTLS); err == nil {
		var r struct {
			Data struct {
				Version    string `json:"version"`
				APIVersion string `json:"api_version"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &r) == nil {
			out.Version = r.Data.Version
			out.APIVersion = r.Data.APIVersion
		}
	}

	// ── Summary (current month) ───────────────────────────────────────────────
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	end := now.Format("2006-01-02")
	summaryPath := fmt.Sprintf("/api/v1/summary/basic?start=%s&end=%s", start, end)

	if body, err := fireflyGet(baseURL, apiKey, summaryPath, skipTLS); err == nil {
		// Response is an object keyed by summary type (e.g. "earned-in-EUR")
		var raw map[string]struct {
			Key            string `json:"key"`
			Title          string `json:"title"`
			MonetaryValue  string `json:"monetary_value"`
			CurrencyCode   string `json:"currency_code"`
			CurrencySymbol string `json:"currency_symbol"`
			ValueParsed    string `json:"value_parsed"`
			LocalIcon      string `json:"local_icon"`
		}
		if json.Unmarshal(body, &raw) == nil {
			// Priority order for display
			priority := map[string]int{
				"net-worth":           0,
				"earned":              1,
				"spent":               2,
				"bills-paid":          3,
				"bills-unpaid":        4,
				"left-to-spend":       5,
				"net-savings":         6,
			}
			for k, v := range raw {
				// Derive a clean key prefix (strip currency suffix like -in-EUR)
				cleanKey := k
				if idx := strings.Index(k, "-in-"); idx > 0 {
					cleanKey = k[:idx]
				}
				rank := 99
				if r, ok := priority[cleanKey]; ok {
					rank = r
				}
				_ = rank
				out.Summary = append(out.Summary, FireflySummaryItem{
					Key:            cleanKey,
					Title:          v.Title,
					Value:          v.MonetaryValue,
					ValueParsed:    v.ValueParsed,
					CurrencyCode:   v.CurrencyCode,
					CurrencySymbol: v.CurrencySymbol,
					Icon:           v.LocalIcon,
				})
			}
			// Sort by priority
			rankOf := func(key string) int {
				p := map[string]int{
					"net-worth": 0, "earned": 1, "spent": 2,
					"bills-paid": 3, "bills-unpaid": 4, "left-to-spend": 5, "net-savings": 6,
				}
				if r, ok := p[key]; ok { return r }
				return 99
			}
			for i := 0; i < len(out.Summary); i++ {
				for j := i + 1; j < len(out.Summary); j++ {
					if rankOf(out.Summary[i].Key) > rankOf(out.Summary[j].Key) {
						out.Summary[i], out.Summary[j] = out.Summary[j], out.Summary[i]
					}
				}
			}
		}
	}

	// ── Asset accounts (first page) ───────────────────────────────────────────
	if body, err := fireflyGet(baseURL, apiKey, "/api/v1/accounts?type=asset&page=1", skipTLS); err == nil {
		var r struct {
			Data []struct {
				ID         string `json:"id"`
				Attributes struct {
					Name           string `json:"name"`
					Type           string `json:"type"`
					Active         bool   `json:"active"`
					CurrentBalance string `json:"current_balance"`
					CurrencyCode   string `json:"currency_code"`
					CurrencySymbol string `json:"currency_symbol"`
				} `json:"attributes"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &r) == nil {
			for _, d := range r.Data {
				if !d.Attributes.Active {
					continue
				}
				out.Accounts = append(out.Accounts, FireflyAccount{
					ID:             d.ID,
					Name:           d.Attributes.Name,
					Type:           d.Attributes.Type,
					Balance:        d.Attributes.CurrentBalance,
					CurrencyCode:   d.Attributes.CurrencyCode,
					CurrencySymbol: d.Attributes.CurrencySymbol,
					Active:         d.Attributes.Active,
				})
			}
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testFireflyConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := fireflyGet(baseURL, apiKey, "/api/v1/about", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Data struct {
			Version string `json:"version"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &r) != nil || r.Data.Version == "" {
		return fmt.Errorf("unexpected response from Firefly III")
	}
	return nil
}
