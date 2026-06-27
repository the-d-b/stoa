package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type GhostfolioHolding struct {
	Name                  string  `json:"name"`
	Symbol                string  `json:"symbol"`
	Currency              string  `json:"currency"`
	Value                 float64 `json:"value"`
	AllocationCurrent     float64 `json:"allocationCurrent"` // fraction 0-1
	NetPerformancePct     float64 `json:"netPerformancePct"` // fraction 0-1
	NetPerformance        float64 `json:"netPerformance"`
	Quantity              float64 `json:"quantity"`
	MarketPrice           float64 `json:"marketPrice"`
}

type GhostfolioPanelData struct {
	UIURL            string              `json:"uiUrl"`
	IntegrationID    string              `json:"integrationId"`
	Currency         string              `json:"currency"`
	CurrentValue     float64             `json:"currentValue"`
	TotalInvestment  float64             `json:"totalInvestment"`
	TodayChangePct   float64             `json:"todayChangePct"`   // fraction
	TodayChangeAmt   float64             `json:"todayChangeAmt"`   // currency amount
	YearChangePct    float64             `json:"yearChangePct"`
	AllTimeChangePct float64             `json:"allTimeChangePct"`
	AllTimeChangeAmt float64             `json:"allTimeChangeAmt"`
	Holdings         []GhostfolioHolding `json:"holdings"`
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

// ghostfolioAuth exchanges a security token for a short-lived JWT.
func ghostfolioAuth(baseURL, securityToken string, skipTLS bool) (string, error) {
	client := httpClient(skipTLS)
	body, _ := json.Marshal(map[string]string{"accessToken": securityToken})
	req, err := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+"/api/v1/auth/anonymous", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return "", fmt.Errorf("authentication failed — check Ghostfolio security token")
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d from Ghostfolio auth", resp.StatusCode)
	}
	raw, _ := io.ReadAll(resp.Body)
	var r struct {
		AuthToken string `json:"authToken"`
	}
	if json.Unmarshal(raw, &r) != nil || r.AuthToken == "" {
		return "", fmt.Errorf("unexpected auth response from Ghostfolio")
	}
	return r.AuthToken, nil
}

func ghostfolioGet(baseURL, jwt, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+jwt)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Ghostfolio %s", resp.StatusCode, path)
	}
	return io.ReadAll(resp.Body)
}

// perfFromBody parses the v2 portfolio performance response.
func perfFromBody(body []byte) (changePct, changeAmt, currentValue, totalInvestment float64) {
	var r struct {
		Performance struct {
			CurrentNetWorth                          float64 `json:"currentNetWorth"`
			CurrentValueInBaseCurrency               float64 `json:"currentValueInBaseCurrency"`
			NetPerformance                           float64 `json:"netPerformance"`
			NetPerformancePercentage                 float64 `json:"netPerformancePercentage"`
			NetPerformanceWithCurrencyEffect         float64 `json:"netPerformanceWithCurrencyEffect"`
			NetPerformancePercentageWithCurrencyEffect float64 `json:"netPerformancePercentageWithCurrencyEffect"`
			TotalInvestment                          float64 `json:"totalInvestment"`
		} `json:"performance"`
	}
	json.Unmarshal(body, &r)
	p := r.Performance
	changePct = p.NetPerformancePercentage
	changeAmt = p.NetPerformance
	currentValue = p.CurrentValueInBaseCurrency
	if currentValue == 0 {
		currentValue = p.CurrentNetWorth
	}
	totalInvestment = p.TotalInvestment
	return
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchGhostfolioPanelData(db *sql.DB, config map[string]interface{}) (*GhostfolioPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("integrationId required")
	}
	baseURL, uiURL, securityToken, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = baseURL
	}
	if securityToken == "" {
		return nil, fmt.Errorf("security token required — copy it from Ghostfolio → User Account → Security Token")
	}

	jwt, err := ghostfolioAuth(baseURL, securityToken, skipTLS)
	if err != nil {
		return nil, err
	}

	out := &GhostfolioPanelData{UIURL: uiURL, IntegrationID: integrationID}

	// ── Currency from user settings ───────────────────────────────────────────
	if body, err := ghostfolioGet(baseURL, jwt, "/api/v1/user", skipTLS); err == nil {
		var r struct {
			Settings struct {
				BaseCurrency string `json:"baseCurrency"`
			} `json:"settings"`
		}
		if json.Unmarshal(body, &r) == nil && r.Settings.BaseCurrency != "" {
			out.Currency = r.Settings.BaseCurrency
		}
	}
	if out.Currency == "" {
		out.Currency = "USD"
	}

	// ── All-time performance ──────────────────────────────────────────────────
	if body, err := ghostfolioGet(baseURL, jwt, "/api/v2/portfolio/performance?range=max", skipTLS); err == nil {
		_, changeAmt, currentValue, totalInvestment := perfFromBody(body)
		out.CurrentValue = currentValue
		out.TotalInvestment = totalInvestment
		out.AllTimeChangeAmt = changeAmt
		if totalInvestment > 0 {
			out.AllTimeChangePct = changeAmt / totalInvestment
		}
	}

	// ── Today's performance ───────────────────────────────────────────────────
	if body, err := ghostfolioGet(baseURL, jwt, "/api/v2/portfolio/performance?range=1d", skipTLS); err == nil {
		pct, amt, cv, _ := perfFromBody(body)
		out.TodayChangePct = pct
		out.TodayChangeAmt = amt
		if cv > 0 && out.CurrentValue == 0 {
			out.CurrentValue = cv
		}
	}

	// ── 1-year performance ────────────────────────────────────────────────────
	if body, err := ghostfolioGet(baseURL, jwt, "/api/v2/portfolio/performance?range=1y", skipTLS); err == nil {
		pct, _, _, _ := perfFromBody(body)
		out.YearChangePct = pct
	}

	// ── Holdings ──────────────────────────────────────────────────────────────
	// Current Ghostfolio returns {"holdings": [...]} — an array where name/symbol/currency
	// are nested inside assetProfile. Cash holdings are excluded from display but
	// included in the CurrentValue total.
	if body, err := ghostfolioGet(baseURL, jwt, "/api/v1/portfolio/holdings", skipTLS); err == nil {
		var wrapper struct {
			Holdings []struct {
				Quantity               float64 `json:"quantity"`
				ValueInBaseCurrency    float64 `json:"valueInBaseCurrency"`
				AllocationInPercentage float64 `json:"allocationInPercentage"`
				Investment             float64 `json:"investment"`
				NetPerformance         float64 `json:"netPerformance"`
				NetPerformancePercent  float64 `json:"netPerformancePercent"`
				MarketPrice            float64 `json:"marketPrice"`
				AssetProfile           struct {
					Name          string `json:"name"`
					Symbol        string `json:"symbol"`
					Currency      string `json:"currency"`
					AssetSubClass string `json:"assetSubClass"`
				} `json:"assetProfile"`
			} `json:"holdings"`
		}
		if json.Unmarshal(body, &wrapper) == nil {
			for _, h := range wrapper.Holdings {
				if h.AssetProfile.AssetSubClass == "CASH" {
					continue
				}
				name := h.AssetProfile.Name
				if name == "" {
					name = h.AssetProfile.Symbol
				}
				out.Holdings = append(out.Holdings, GhostfolioHolding{
					Name:              name,
					Symbol:            h.AssetProfile.Symbol,
					Currency:          h.AssetProfile.Currency,
					Value:             h.ValueInBaseCurrency,
					AllocationCurrent: h.AllocationInPercentage,
					NetPerformancePct: h.NetPerformancePercent,
					NetPerformance:    h.NetPerformance,
					Quantity:          h.Quantity,
					MarketPrice:       h.MarketPrice,
				})
			}
			sort.Slice(out.Holdings, func(i, j int) bool {
				return out.Holdings[i].Value > out.Holdings[j].Value
			})
			// Recalculate allocation as fraction of non-cash assets so the donut
			// reflects investment composition rather than being dominated by cash.
			var nonCashTotal float64
			for _, h := range out.Holdings {
				nonCashTotal += h.Value
			}
			if nonCashTotal > 0 {
				for i := range out.Holdings {
					out.Holdings[i].AllocationCurrent = out.Holdings[i].Value / nonCashTotal
				}
			}
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testGhostfolioConnection(baseURL, securityToken string, skipTLS bool) error {
	if securityToken == "" {
		return fmt.Errorf("security token required")
	}
	_, err := ghostfolioAuth(baseURL, securityToken, skipTLS)
	return err
}
