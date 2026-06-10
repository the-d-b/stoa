package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
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
	ID       string `json:"id"`
	Name     string `json:"name"`
	Budgeted int64  `json:"budgeted"` // cents
	Spent    int64  `json:"spent"`    // cents (negative = expense)
	Balance  int64  `json:"balance"`  // cents
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
	BudgetName     string            `json:"budgetName"`
	Month          string            `json:"month"`
	Income         int64             `json:"income"`  // cents
	Spent          int64             `json:"spent"`   // cents
	Balance        int64             `json:"balance"` // cents
	CategoryGroups []ABCategoryGroup `json:"categoryGroups"`
	Accounts       []ABAccount       `json:"accounts"`
}

// ABAllData is cached per integration — all budgets for the connected Actual instance.
// GetPanelData applies a budgetId filter from panel config at serve time so multiple
// panels sharing the same integration can each display a different budget.
type ABAllData struct {
	Budgets []ABPanelData `json:"budgets"`
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
		snippet, _ := io.ReadAll(resp.Body)
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return nil, fmt.Errorf("HTTP %d from actual-http-api: %s", resp.StatusCode, snippet)
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

// fetchActualBudgetPanelData fetches ALL budgets from the Actual instance.
// Returns ABAllData for caching. Panel-specific budgetId filtering is applied
// later in GetPanelData via filterABData, matching the Home Assistant pattern.
func fetchActualBudgetPanelData(db *sql.DB, config map[string]interface{}) (*ABAllData, error) {
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

	body, err := abGet(baseURL, apiKey, "/v1/budgets", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("listing budgets: %w", err)
	}
	var rawBudgets []struct {
		GroupID string `json:"groupId"`
		Name    string `json:"name"`
	}
	if err := abUnwrap(body, &rawBudgets); err != nil {
		return nil, fmt.Errorf("parsing budgets: %w", err)
	}
	if len(rawBudgets) == 0 {
		return nil, fmt.Errorf("no budgets found in Actual — create a budget first")
	}

	// Deduplicate by groupId — the sidecar can return the same budget
	// under multiple file states (remote + local).
	seen := map[string]bool{}
	var uniqueBudgets []struct {
		GroupID string
		Name    string
	}
	for _, rb := range rawBudgets {
		if rb.GroupID != "" && !seen[rb.GroupID] {
			seen[rb.GroupID] = true
			uniqueBudgets = append(uniqueBudgets, struct {
				GroupID string
				Name    string
			}{rb.GroupID, rb.Name})
		}
	}

	month := time.Now().Format("2006-01")
	budgets := make([]ABPanelData, len(uniqueBudgets))
	// Sequential — actual-http-api is stateful: only one budget can be open at a time.
	// Concurrent fetches race on the open/close state and produce 404 "No budget file is open".
	for i, rb := range uniqueBudgets {
		budgets[i] = abFetchOneBudget(baseURL, uiURL, apiKey, integrationID, rb.GroupID, rb.Name, month, skipTLS)
	}

	return &ABAllData{Budgets: budgets}, nil
}

// abFetchOneBudget fetches the current month summary and open account balances
// for a single budget, running account balance requests concurrently.
func abFetchOneBudget(baseURL, uiURL, apiKey, integrationID, budgetID, budgetName, month string, skipTLS bool) ABPanelData {
	out := ABPanelData{
		UIURL:          uiURL,
		IntegrationID:  integrationID,
		BudgetID:       budgetID,
		BudgetName:     budgetName,
		Month:          month,
		CategoryGroups: []ABCategoryGroup{},
		Accounts:       []ABAccount{},
	}

	// ── Current month summary ─────────────────────────────────────────────────
	monthPath := "/v1/budgets/" + budgetID + "/months/" + month
	if body, err := abGet(baseURL, apiKey, monthPath, skipTLS); err != nil {
		log.Printf("[AB] %s (%s) month fetch error: %v", budgetName, budgetID, err)
	} else {
		var m struct {
			Income         int64 `json:"totalIncome"` // API returns negative (inflow), we negate below
			Spent          int64 `json:"totalSpent"`  // API returns positive (outflow)
			Balance        int64 `json:"totalBalance"` // API returns negative when surplus, we negate
			CategoryGroups []struct {
				ID         string `json:"id"`
				Name       string `json:"name"`
				Hidden     bool   `json:"hidden"`
				Categories []struct {
					ID       string `json:"id"`
					Name     string `json:"name"`
					Budgeted int64  `json:"budgeted"`
					Spent    int64  `json:"spent"`
					Balance  int64  `json:"balance"`
					// carryover omitted — actual-http-api returns bool (false) when empty, not int64
				} `json:"categories"`
			} `json:"categoryGroups"`
		}
		if err := abUnwrap(body, &m); err != nil {
			log.Printf("[AB] %s (%s) month parse error: %v — body: %.200s", budgetName, budgetID, err, body)
		} else {
				out.Income = -m.Income  // negate: API gives negative for inflows
			out.Spent = m.Spent     // keep: API gives positive for outflows; frontend does Math.abs()
			out.Balance = -m.Balance // negate: API gives negative when you have a surplus
			log.Printf("[AB] %s (%s) month=%s income=%d spent=%d balance=%d groups=%d", budgetName, budgetID, month, out.Income, out.Spent, out.Balance, len(m.CategoryGroups))
			for _, g := range m.CategoryGroups {
				if g.Hidden {
					continue
				}
				group := ABCategoryGroup{ID: g.ID, Name: g.Name, Hidden: g.Hidden}
				for _, c := range g.Categories {
					cat := ABCategory{
						ID: c.ID, Name: c.Name,
						Budgeted: c.Budgeted, Spent: c.Spent, Balance: c.Balance,
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
	if body, err := abGet(baseURL, apiKey, "/v1/budgets/"+budgetID+"/accounts", skipTLS); err != nil {
		log.Printf("[AB] %s (%s) accounts fetch error: %v", budgetName, budgetID, err)
	} else {
		var rawAccounts []struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			Type      string `json:"type"`
			OffBudget bool   `json:"offbudget"`
			Closed    bool   `json:"closed"`
		}
		if err := abUnwrap(body, &rawAccounts); err != nil {
			log.Printf("[AB] %s (%s) accounts parse error: %v", budgetName, budgetID, err)
		} else {
			log.Printf("[AB] %s (%s) accounts raw=%d", budgetName, budgetID, len(rawAccounts))
			type balResult struct {
				acc ABAccount
				idx int
			}
			var open []struct{ ID, Name, Type string; OffBudget bool }
			for _, a := range rawAccounts {
				if !a.Closed {
					open = append(open, struct{ ID, Name, Type string; OffBudget bool }{a.ID, a.Name, a.Type, a.OffBudget})
				}
			}
			balResults := make([]balResult, len(open))
			var wg sync.WaitGroup
			for i, a := range open {
				wg.Add(1)
				go func(idx int, id, name, typ string, offBudget bool) {
					defer wg.Done()
					acc := ABAccount{ID: id, Name: name, Type: typ, OffBudget: offBudget}
					if balBody, err := abGet(baseURL, apiKey, "/v1/budgets/"+budgetID+"/accounts/"+id+"/balance", skipTLS); err != nil {
						log.Printf("[AB] %s balance fetch error for %s: %v", budgetName, name, err)
					} else {
						var bal struct{ Data int64 `json:"data"` }
						if json.Unmarshal(balBody, &bal) == nil {
							acc.Balance = bal.Data
						}
					}
					balResults[idx] = balResult{acc, idx}
				}(i, a.ID, a.Name, a.Type, a.OffBudget)
			}
			wg.Wait()
			for _, r := range balResults {
				out.Accounts = append(out.Accounts, r.acc)
			}
			log.Printf("[AB] %s (%s) done: %d accounts loaded", budgetName, budgetID, len(out.Accounts))
		}
	}

	return out
}

// ── Connection test ───────────────────────────────────────────────────────────

func testActualBudgetConnection(baseURL, apiKey string, skipTLS bool) error {
	body, err := abGet(baseURL, apiKey, "/v1/budgets", skipTLS)
	if err != nil {
		return err
	}
	var budgets []struct {
		GroupID string `json:"groupId"`
	}
	if abUnwrap(body, &budgets) != nil {
		return fmt.Errorf("unexpected response from actual-http-api")
	}
	return nil
}
