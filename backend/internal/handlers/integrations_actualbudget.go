package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type ABAccount struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	OffBudget bool   `json:"offBudget"`
	Balance   int64  `json:"balance"` // cents
}

type ABCategory struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Budgeted  int64  `json:"budgeted"` // cents
	Spent     int64  `json:"spent"`    // cents (negative = expense)
	Carryover int64  `json:"carryover"`
	Balance   int64  `json:"balance"` // cents
}

type ABCategoryGroup struct {
	ID         string       `json:"id"`
	Name       string       `json:"name"`
	Hidden     bool         `json:"hidden"`
	Budgeted   int64        `json:"budgeted"` // sum of categories
	Spent      int64        `json:"spent"`
	Balance    int64        `json:"balance"`
	Categories []ABCategory `json:"categories"`
}

type ABPanelData struct {
	UIURL          string            `json:"uiUrl"`
	IntegrationID  string            `json:"integrationId"`
	BudgetID       string            `json:"budgetId"`
	Month          string            `json:"month"`
	Income         int64             `json:"income"`  // cents
	Spent          int64             `json:"spent"`   // cents
	Balance        int64             `json:"balance"` // cents
	CategoryGroups []ABCategoryGroup `json:"categoryGroups"`
	Accounts       []ABAccount       `json:"accounts"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func abGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed — check actual-http-api API key")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from actual-http-api", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// abUnwrap unpacks {"data": <payload>}.
func abUnwrap(body []byte, dst interface{}) error {
	var env struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		return err
	}
	return json.Unmarshal(env.Data, dst)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchActualBudgetPanelData(db *sql.DB, config map[string]interface{}) (*ABPanelData, error) {
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

	// ── Resolve budget sync ID ────────────────────────────────────────────────
	budgetID := stringVal(config, "budgetId")
	if budgetID == "" {
		body, err := abGet(baseURL, apiKey, "/v1/budgets", skipTLS)
		if err != nil {
			return nil, fmt.Errorf("listing budgets: %w", err)
		}
		var budgets []struct {
			ID string `json:"id"`
		}
		if abUnwrap(body, &budgets) == nil && len(budgets) > 0 {
			budgetID = budgets[0].ID
		}
		if budgetID == "" {
			return nil, fmt.Errorf("no budgets found — set budgetId in panel config or create a budget in Actual")
		}
	}

	out := &ABPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		BudgetID:      budgetID,
	}

	// ── Current month summary ─────────────────────────────────────────────────
	month := time.Now().Format("2006-01")
	out.Month = month
	if body, err := abGet(baseURL, apiKey, "/v1/budgets/"+budgetID+"/months/"+month, skipTLS); err == nil {
		var m struct {
			Month          string `json:"month"`
			Income         int64  `json:"income"`
			Spent          int64  `json:"spent"`
			Balance        int64  `json:"balance"`
			CategoryGroups []struct {
				ID         string `json:"id"`
				Name       string `json:"name"`
				Hidden     bool   `json:"hidden"`
				Categories []struct {
					ID        string `json:"id"`
					Name      string `json:"name"`
					Budgeted  int64  `json:"budgeted"`
					Spent     int64  `json:"spent"`
					Carryover int64  `json:"carryover"`
					Balance   int64  `json:"balance"`
				} `json:"categories"`
			} `json:"categoryGroups"`
		}
		if abUnwrap(body, &m) == nil {
			out.Income = m.Income
			out.Spent = m.Spent
			out.Balance = m.Balance
			for _, g := range m.CategoryGroups {
				if g.Hidden {
					continue
				}
				group := ABCategoryGroup{
					ID:     g.ID,
					Name:   g.Name,
					Hidden: g.Hidden,
				}
				for _, c := range g.Categories {
					cat := ABCategory{
						ID:        c.ID,
						Name:      c.Name,
						Budgeted:  c.Budgeted,
						Spent:     c.Spent,
						Carryover: c.Carryover,
						Balance:   c.Balance,
					}
					group.Categories = append(group.Categories, cat)
					group.Budgeted += c.Budgeted
					group.Spent += c.Spent
					group.Balance += c.Balance
				}
				if len(group.Categories) > 0 {
					out.CategoryGroups = append(out.CategoryGroups, group)
				}
			}
		}
	}

	// ── Accounts ──────────────────────────────────────────────────────────────
	if body, err := abGet(baseURL, apiKey, "/v1/budgets/"+budgetID+"/accounts", skipTLS); err == nil {
		var rawAccounts []struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			Type      string `json:"type"`
			OffBudget bool   `json:"offbudget"`
			Closed    bool   `json:"closed"`
		}
		if abUnwrap(body, &rawAccounts) == nil {
			// Filter to open accounts only; fetch balances concurrently
			type result struct {
				acc ABAccount
				idx int
			}
			var openAccounts []struct {
				ID        string
				Name      string
				Type      string
				OffBudget bool
			}
			for _, a := range rawAccounts {
				if !a.Closed {
					openAccounts = append(openAccounts, struct {
						ID        string
						Name      string
						Type      string
						OffBudget bool
					}{a.ID, a.Name, a.Type, a.OffBudget})
				}
			}
			results := make([]result, len(openAccounts))
			var wg sync.WaitGroup
			for i, a := range openAccounts {
				wg.Add(1)
				go func(idx int, id, name, typ string, offBudget bool) {
					defer wg.Done()
					acc := ABAccount{ID: id, Name: name, Type: typ, OffBudget: offBudget}
					if balBody, err := abGet(baseURL, apiKey, "/v1/budgets/"+budgetID+"/accounts/"+id+"/balance", skipTLS); err == nil {
						var bal struct {
							Data int64 `json:"data"`
						}
						if json.Unmarshal(balBody, &bal) == nil {
							acc.Balance = bal.Data
						}
					}
					results[idx] = result{acc, idx}
				}(i, a.ID, a.Name, a.Type, a.OffBudget)
			}
			wg.Wait()
			for _, r := range results {
				out.Accounts = append(out.Accounts, r.acc)
			}
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testActualBudgetConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := abGet(baseURL, apiKey, "/v1/budgets", skipTLS)
	if err != nil {
		return err
	}
	var budgets []json.RawMessage
	if abUnwrap(body, &budgets) != nil {
		return fmt.Errorf("unexpected response from actual-http-api")
	}
	return nil
}
