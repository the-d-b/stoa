package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"

	"github.com/gorilla/mux"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type TandoorRecipe struct {
	ID          int      `json:"id"`
	Name        string   `json:"name"`
	Rating      float64  `json:"rating"`
	WorkingTime int      `json:"workingTime"`
	Keywords    []string `json:"keywords"`
	HasImage    bool     `json:"hasImage"`
}

type TandoorMealEntry struct {
	Date     string `json:"date"`
	MealType string `json:"mealType"`
	Recipe   string `json:"recipe"`
}

type TandoorShoppingEntry struct {
	Food   string  `json:"food"`
	Unit   string  `json:"unit"`
	Amount float64 `json:"amount"`
}

type TandoorPanelData struct {
	UIURL         string                 `json:"uiUrl"`
	IntegrationID string                 `json:"integrationId"`
	RecipeCount   int                    `json:"recipeCount"`
	Recipes       []TandoorRecipe        `json:"recipes"`
	MealPlan      []TandoorMealEntry     `json:"mealPlan"`
	Shopping      []TandoorShoppingEntry `json:"shopping"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func tandoorGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		msg := strings.TrimSpace(string(body))
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, msg)
	}
	return body, nil
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

func fetchTandoorPanelData(db *sql.DB, config map[string]interface{}) (*TandoorPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("integrationId required")
	}
	baseURL, uiURL, token, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	if uiURL == "" {
		uiURL = baseURL
	}
	if token == "" {
		return nil, fmt.Errorf("API token required — generate one in Tandoor → Settings → API Token")
	}

	// Random recipes for photo carousel (also gives total count)
	recipeBody, err := tandoorGet(baseURL, token, "/api/recipe/?page_size=6&random=true", skipTLS)
	if err != nil {
		return nil, fmt.Errorf("recipes: %w", err)
	}
	var recipeResp struct {
		Count   int `json:"count"`
		Results []struct {
			ID          int     `json:"id"`
			Name        string  `json:"name"`
			Rating      float64 `json:"rating"`
			WorkingTime int     `json:"working_time"`
			Image       string  `json:"image"`
			Keywords    []struct {
				Name string `json:"name"`
			} `json:"keywords"`
		} `json:"results"`
	}
	if err := json.Unmarshal(recipeBody, &recipeResp); err != nil {
		return nil, fmt.Errorf("recipes parse: %w", err)
	}

	recipes := make([]TandoorRecipe, 0, len(recipeResp.Results))
	for _, r := range recipeResp.Results {
		kws := make([]string, 0, len(r.Keywords))
		for _, k := range r.Keywords {
			kws = append(kws, k.Name)
		}
		recipes = append(recipes, TandoorRecipe{
			ID:          r.ID,
			Name:        r.Name,
			Rating:      r.Rating,
			WorkingTime: r.WorkingTime,
			Keywords:    kws,
			HasImage:    r.Image != "",
		})
	}

	// This week's meal plan Mon–Sun
	now := timeNow()
	weekday := int(now.Weekday())
	if weekday == 0 {
		weekday = 7 // Sunday → 7 (ISO week: Mon=1..Sun=7)
	}
	monday := now.AddDate(0, 0, -(weekday - 1))
	sunday := monday.AddDate(0, 0, 6)
	fromDate := monday.Format("2006-01-02")
	toDate := sunday.Format("2006-01-02")

	mealBody, _ := tandoorGet(baseURL, token,
		"/api/meal-plan/?from_date="+fromDate+"&to_date="+toDate+"&page_size=50", skipTLS)
	mealPlan := []TandoorMealEntry{}
	if mealBody != nil {
		var mealResp struct {
			Results []struct {
				Date   string `json:"date"`
				Title  string `json:"title"`
				Recipe *struct {
					Name string `json:"name"`
				} `json:"recipe"`
				MealType struct {
					Name string `json:"name"`
				} `json:"meal_type"`
			} `json:"results"`
		}
		if json.Unmarshal(mealBody, &mealResp) == nil {
			for _, m := range mealResp.Results {
				name := m.Title
				if name == "" && m.Recipe != nil {
					name = m.Recipe.Name
				}
				if name == "" {
					continue
				}
				mealPlan = append(mealPlan, TandoorMealEntry{
					Date:     m.Date,
					MealType: m.MealType.Name,
					Recipe:   name,
				})
			}
			sort.Slice(mealPlan, func(i, j int) bool {
				return mealPlan[i].Date < mealPlan[j].Date
			})
		}
	}

	// Unchecked shopping list entries
	shopBody, _ := tandoorGet(baseURL, token, "/api/shopping-list-entry/?checked=false&page_size=50", skipTLS)
	shopping := []TandoorShoppingEntry{}
	if shopBody != nil {
		var shopResp struct {
			Results []struct {
				Amount float64 `json:"amount"`
				Food   *struct {
					Name string `json:"name"`
				} `json:"food"`
				Unit *struct {
					Name string `json:"name"`
				} `json:"unit"`
			} `json:"results"`
		}
		if json.Unmarshal(shopBody, &shopResp) == nil {
			for _, s := range shopResp.Results {
				if s.Food == nil {
					continue
				}
				unit := ""
				if s.Unit != nil {
					unit = s.Unit.Name
				}
				shopping = append(shopping, TandoorShoppingEntry{
					Food:   s.Food.Name,
					Unit:   unit,
					Amount: s.Amount,
				})
			}
		}
	}

	return &TandoorPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		RecipeCount:   recipeResp.Count,
		Recipes:       recipes,
		MealPlan:      mealPlan,
		Shopping:      shopping,
	}, nil
}

// ── Image proxy ───────────────────────────────────────────────────────────────

func ProxyTandoorImage(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		integID := vars["integrationId"]
		recipeID := vars["recipeId"]

		baseURL, _, token, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}

		// Fetch the recipe to get its image URL
		body, err := tandoorGet(baseURL, token, "/api/recipe/"+recipeID+"/", skipTLS)
		if err != nil {
			http.Error(w, "recipe not found", http.StatusNotFound)
			return
		}
		var recipe struct {
			Image string `json:"image"`
		}
		if err := json.Unmarshal(body, &recipe); err != nil || recipe.Image == "" {
			http.Error(w, "no image", http.StatusNotFound)
			return
		}

		// Proxy the image file (Tandoor returns full absolute URL in image field)
		client := httpClient(skipTLS)
		req, err := http.NewRequest("GET", recipe.Image, nil)
		if err != nil {
			http.Error(w, "request error", http.StatusBadGateway)
			return
		}
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, "image fetch failed", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			http.Error(w, "image unavailable", resp.StatusCode)
			return
		}

		imgBody, err := io.ReadAll(resp.Body)
		if err != nil {
			http.Error(w, "read error", http.StatusBadGateway)
			return
		}
		ct := resp.Header.Get("Content-Type")
		if ct == "" {
			ct = http.DetectContentType(imgBody)
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(imgBody)
	}
}

// ── Test ──────────────────────────────────────────────────────────────────────

func testTandoorConnection(baseURL, token string, skipTLS bool) error {
	body, err := tandoorGet(baseURL, token, "/api/recipe/?page_size=1", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		Count int `json:"count"`
	}
	if err := json.Unmarshal(body, &r); err != nil {
		return fmt.Errorf("unexpected response from Tandoor")
	}
	return nil
}
