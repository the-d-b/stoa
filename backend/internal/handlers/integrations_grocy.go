package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type GrocyProduct struct {
	Name           string  `json:"name"`
	Amount         float64 `json:"amount"`
	BestBeforeDate string  `json:"bestBeforeDate"`
	DaysFromNow    int     `json:"daysFromNow"` // negative = expired
}

type GrocyChore struct {
	Name          string `json:"name"`
	NextExecution string `json:"nextExecution"`
	LastTracked   string `json:"lastTracked"`
	IsOverdue     bool   `json:"isOverdue"`
	DaysOverdue   int    `json:"daysOverdue"`
}

type GrocyTask struct {
	Name      string `json:"name"`
	DueDate   string `json:"dueDate"`
	Category  string `json:"category"`
	IsOverdue bool   `json:"isOverdue"`
}

type GrocyShoppingItem struct {
	ProductName string  `json:"productName"`
	Amount      float64 `json:"amount"`
	Note        string  `json:"note"`
}

type GrocyPanelData struct {
	UIURL         string              `json:"uiUrl"`
	IntegrationID string              `json:"integrationId"`
	ExpiringCount int                 `json:"expiringCount"` // due/overdue
	ExpiredCount  int                 `json:"expiredCount"`
	OverdueChores int                 `json:"overdueChores"`
	PendingTasks  int                 `json:"pendingTasks"`
	Products      []GrocyProduct      `json:"products"` // expiring + expired
	Chores        []GrocyChore        `json:"chores"`
	Tasks         []GrocyTask         `json:"tasks"`
	ShoppingItems []GrocyShoppingItem `json:"shoppingItems"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func grocyGet(baseURL, apiKey, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("GROCY-API-KEY", apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed — check Grocy API key")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Grocy", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchGrocyPanelData(db *sql.DB, config map[string]interface{}) (*GrocyPanelData, error) {
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
	if apiKey == "" {
		return nil, fmt.Errorf("API key required — generate one in Grocy → Manage API Keys")
	}

	out := &GrocyPanelData{UIURL: uiURL, IntegrationID: integrationID}
	now := time.Now().UTC()

	// ── Product name lookup ───────────────────────────────────────────────────
	productNames := map[string]string{}
	if body, err := grocyGet(baseURL, apiKey, "/api/objects/products", skipTLS); err == nil {
		var products []struct {
			ID   json.RawMessage `json:"id"`
			Name string          `json:"name"`
		}
		if json.Unmarshal(body, &products) == nil {
			for _, p := range products {
				idStr := strings.Trim(string(p.ID), `"`)
				productNames[idStr] = p.Name
			}
		}
	}

	resolveName := func(rawID json.RawMessage) string {
		idStr := strings.Trim(string(rawID), `"`)
		if name, ok := productNames[idStr]; ok {
			return name
		}
		return idStr
	}

	// ── Volatile stock (expiring/expired) ─────────────────────────────────────
	if body, err := grocyGet(baseURL, apiKey, "/api/stock/volatile", skipTLS); err == nil {
		var r struct {
			DueProducts     []json.RawMessage `json:"due_products"`
			OverdueProducts []json.RawMessage `json:"overdue_products"`
			ExpiredProducts []json.RawMessage `json:"expired_products"`
		}
		if json.Unmarshal(body, &r) == nil {
			type stockEntry struct {
				ProductID      json.RawMessage `json:"product_id"`
				Amount         float64         `json:"amount"`
				BestBeforeDate string          `json:"best_before_date"`
				Product        *struct {
					Name string `json:"name"`
				} `json:"product"`
			}

			parseEntry := func(raw json.RawMessage) {
				var e stockEntry
				if json.Unmarshal(raw, &e) != nil {
					return
				}
				name := ""
				if e.Product != nil && e.Product.Name != "" {
					name = e.Product.Name
				} else {
					name = resolveName(e.ProductID)
				}
				daysFromNow := 0
				if e.BestBeforeDate != "" && len(e.BestBeforeDate) >= 10 {
					if d, err := time.Parse("2006-01-02", e.BestBeforeDate[:10]); err == nil {
						daysFromNow = int(d.Sub(now).Hours() / 24)
					}
				}
				if daysFromNow < 0 {
					out.ExpiredCount++
				} else {
					out.ExpiringCount++
				}
				out.Products = append(out.Products, GrocyProduct{
					Name:           name,
					Amount:         e.Amount,
					BestBeforeDate: e.BestBeforeDate,
					DaysFromNow:    daysFromNow,
				})
			}

			for _, raw := range r.ExpiredProducts {
				parseEntry(raw)
			}
			for _, raw := range r.DueProducts {
				parseEntry(raw)
			}
			for _, raw := range r.OverdueProducts {
				parseEntry(raw)
			}
		}
	}
	// Sort: expired first (most negative daysFromNow), then by days ascending
	sort.Slice(out.Products, func(i, j int) bool {
		return out.Products[i].DaysFromNow < out.Products[j].DaysFromNow
	})

	// ── Chores ────────────────────────────────────────────────────────────────
	if body, err := grocyGet(baseURL, apiKey, "/api/chores", skipTLS); err == nil {
		var chores []struct {
			ChoreName                  string `json:"chore_name"`
			NextEstimatedExecutionTime string `json:"next_estimated_execution_time"`
			LastTrackedTime            string `json:"last_tracked_time"`
		}
		if json.Unmarshal(body, &chores) == nil {
			for _, c := range chores {
				isOverdue := false
				daysOverdue := 0
				if c.NextEstimatedExecutionTime != "" {
					if t, err := time.Parse("2006-01-02 15:04:05", c.NextEstimatedExecutionTime); err == nil {
						if t.Before(now) {
							isOverdue = true
							daysOverdue = int(now.Sub(t).Hours() / 24)
						}
					}
				}
				if isOverdue {
					out.OverdueChores++
				}
				out.Chores = append(out.Chores, GrocyChore{
					Name:          c.ChoreName,
					NextExecution: c.NextEstimatedExecutionTime,
					LastTracked:   c.LastTrackedTime,
					IsOverdue:     isOverdue,
					DaysOverdue:   daysOverdue,
				})
			}
		}
		// Sort: overdue first then by next execution
		sort.Slice(out.Chores, func(i, j int) bool {
			if out.Chores[i].IsOverdue != out.Chores[j].IsOverdue {
				return out.Chores[i].IsOverdue
			}
			return out.Chores[i].NextExecution < out.Chores[j].NextExecution
		})
	}

	// ── Tasks ─────────────────────────────────────────────────────────────────
	if body, err := grocyGet(baseURL, apiKey, "/api/tasks", skipTLS); err == nil {
		var tasks []struct {
			Name       string          `json:"name"`
			DueDate    string          `json:"due_date"`
			Done       json.RawMessage `json:"done"`
			CategoryID json.RawMessage `json:"category_id"`
		}
		if json.Unmarshal(body, &tasks) == nil {
			for _, t := range tasks {
				doneStr := strings.Trim(string(t.Done), `"`)
				if doneStr == "1" || doneStr == "true" {
					continue
				}
				isOverdue := false
				if t.DueDate != "" && len(t.DueDate) >= 10 {
					if d, err := time.Parse("2006-01-02", t.DueDate[:10]); err == nil {
						if d.Before(now) {
							isOverdue = true
						}
					}
				}
				out.PendingTasks++
				out.Tasks = append(out.Tasks, GrocyTask{
					Name:      t.Name,
					DueDate:   t.DueDate,
					IsOverdue: isOverdue,
				})
			}
		}
		sort.Slice(out.Tasks, func(i, j int) bool {
			if out.Tasks[i].IsOverdue != out.Tasks[j].IsOverdue {
				return out.Tasks[i].IsOverdue
			}
			if out.Tasks[i].DueDate == "" {
				return false
			}
			if out.Tasks[j].DueDate == "" {
				return true
			}
			return out.Tasks[i].DueDate < out.Tasks[j].DueDate
		})
	}

	// ── Shopping list ─────────────────────────────────────────────────────────
	if body, err := grocyGet(baseURL, apiKey, "/api/objects/shopping_list", skipTLS); err == nil {
		var items []struct {
			ProductID json.RawMessage `json:"product_id"`
			Amount    float64         `json:"amount"`
			Note      string          `json:"note"`
			Done      json.RawMessage `json:"done"`
		}
		if json.Unmarshal(body, &items) == nil {
			for _, item := range items {
				doneStr := strings.Trim(string(item.Done), `"`)
				if doneStr == "1" || doneStr == "true" {
					continue
				}
				name := item.Note
				if productID := strings.Trim(string(item.ProductID), `"null`); productID != "" && productID != "ull" {
					if pname, ok := productNames[productID]; ok {
						name = pname
					}
				}
				if name == "" {
					continue
				}
				out.ShoppingItems = append(out.ShoppingItems, GrocyShoppingItem{
					ProductName: name,
					Amount:      item.Amount,
					Note:        item.Note,
				})
			}
		}
	}

	return out, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testGrocyConnection(baseURL, apiKey string, skipTLS bool) error {
	if apiKey == "" {
		return fmt.Errorf("API key required")
	}
	body, err := grocyGet(baseURL, apiKey, "/api/system/info", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		GrocyVersion struct {
			Version string `json:"Version"`
		} `json:"grocy_version"`
	}
	if json.Unmarshal(body, &r) != nil || r.GrocyVersion.Version == "" {
		return fmt.Errorf("unexpected response from Grocy")
	}
	return nil
}
