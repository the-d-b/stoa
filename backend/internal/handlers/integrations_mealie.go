package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type MealieRecipe struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Slug      string  `json:"slug"`
	Rating    float64 `json:"rating"`
	TotalTime string  `json:"totalTime"`
	HasImage  bool    `json:"hasImage"`
}

type MealieMealEntry struct {
	Date     string       `json:"date"`
	MealType string       `json:"mealType"`
	Title    string       `json:"title"`   // custom title (no recipe)
	Recipe   *MealieRecipe `json:"recipe"` // nil if entry has no recipe
}

type MealieShoppingItem struct {
	Note     string  `json:"note"`
	Quantity float64 `json:"quantity"`
	Food     string  `json:"food"`
	Unit     string  `json:"unit"`
	Checked  bool    `json:"checked"`
	Label    string  `json:"label"`
}

type MealieShoppingList struct {
	ID    string               `json:"id"`
	Name  string               `json:"name"`
	Items []MealieShoppingItem `json:"items"`
}

type MealiePanelData struct {
	UIURL         string               `json:"uiUrl"`
	IntegrationID string               `json:"integrationId"`
	HouseholdSlug string               `json:"householdSlug"`
	TotalRecipes  int                  `json:"totalRecipes"`
	MealPlan      []MealieMealEntry    `json:"mealPlan"`
	Recipes       []MealieRecipe       `json:"recipes"`
	ShoppingLists []MealieShoppingList `json:"shoppingLists"`
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func mealieGet(baseURL, token, path string, skipTLS bool) ([]byte, error) {
	client := httpClient(skipTLS)
	fullURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequest("GET", fullURL, nil)
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
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication failed — check Mealie API token")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Mealie", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Panel fetcher ─────────────────────────────────────────────────────────────

func fetchMealiePanelData(db *sql.DB, config map[string]interface{}) (*MealiePanelData, error) {
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
		return nil, fmt.Errorf("API token required — generate one in Mealie → User Settings → API Tokens")
	}

	out := &MealiePanelData{UIURL: uiURL, IntegrationID: integrationID, HouseholdSlug: "home"}

	// ── Household slug (for UI recipe links: /g/{slug}/r/{recipe-slug}) ───────
	if userBody, err := mealieGet(baseURL, apiKey, "/api/users/self", skipTLS); err == nil {
		var user struct {
			Household *struct {
				Slug string `json:"slug"`
			} `json:"household"`
		}
		if json.Unmarshal(userBody, &user) == nil && user.Household != nil && user.Household.Slug != "" {
			out.HouseholdSlug = user.Household.Slug
		}
	}

	// ── Recipe count ──────────────────────────────────────────────────────────
	if body, err := mealieGet(baseURL, apiKey, "/api/recipes?perPage=1&page=1", skipTLS); err == nil {
		var r struct{ Total int `json:"total"` }
		if json.Unmarshal(body, &r) == nil {
			out.TotalRecipes = r.Total
		}
	}

	// ── Random recipes for photo carousel ────────────────────────────────────
	if body, err := mealieGet(baseURL, apiKey, "/api/recipes?orderBy=dateAdded&orderDirection=desc&perPage=50", skipTLS); err == nil {
		var r struct {
			Items []struct {
				ID        string  `json:"id"`
				Name      string  `json:"name"`
				Slug      string  `json:"slug"`
				Rating    float64 `json:"rating"`
				TotalTime string  `json:"totalTime"`
				Image     *string `json:"image"`
			} `json:"items"`
		}
		if json.Unmarshal(body, &r) == nil {
			rng := rand.New(rand.NewSource(time.Now().UnixNano()))
			rng.Shuffle(len(r.Items), func(i, j int) { r.Items[i], r.Items[j] = r.Items[j], r.Items[i] })
			if len(r.Items) > 6 {
				r.Items = r.Items[:6]
			}
			for _, recipe := range r.Items {
				out.Recipes = append(out.Recipes, MealieRecipe{
					ID:        recipe.ID,
					Name:      recipe.Name,
					Slug:      recipe.Slug,
					Rating:    recipe.Rating,
					TotalTime: recipe.TotalTime,
					HasImage:  recipe.Image != nil && *recipe.Image != "",
				})
			}
		}
	}

	// ── This week's meal plan ─────────────────────────────────────────────────
	now := time.Now()
	weekday := int(now.Weekday())
	if weekday == 0 {
		weekday = 7 // treat Sunday as day 7
	}
	monday := now.AddDate(0, 0, 1-weekday)
	sunday := monday.AddDate(0, 0, 6)
	startDate := monday.Format("2006-01-02")
	endDate := sunday.Format("2006-01-02")

	path := fmt.Sprintf("/api/households/mealplans?start_date=%s&end_date=%s&perPage=50", startDate, endDate)
	if body, err := mealieGet(baseURL, apiKey, path, skipTLS); err == nil {
		var r struct {
			Items []struct {
				Date     string `json:"date"`
				EntryType string `json:"entryType"`
				Title    string `json:"title"`
				Recipe   *struct {
					Name      string  `json:"name"`
					Slug      string  `json:"slug"`
					Rating    float64 `json:"rating"`
					TotalTime string  `json:"totalTime"`
				} `json:"recipe"`
			} `json:"items"`
		}
		if json.Unmarshal(body, &r) == nil {
			for _, e := range r.Items {
				entry := MealieMealEntry{
					Date:     e.Date,
					MealType: e.EntryType,
					Title:    e.Title,
				}
				if e.Recipe != nil {
					entry.Recipe = &MealieRecipe{
						Name:      e.Recipe.Name,
						Slug:      e.Recipe.Slug,
						Rating:    e.Recipe.Rating,
						TotalTime: e.Recipe.TotalTime,
					}
				}
				out.MealPlan = append(out.MealPlan, entry)
			}
		}
	}

	// ── Shopping lists ────────────────────────────────────────────────────────
	if body, err := mealieGet(baseURL, apiKey, "/api/households/shopping/lists?perPage=10", skipTLS); err != nil {
		log.Printf("[MEALIE] shopping lists error: %v", err)
	} else {
		preview := string(body)
		if len(preview) > 300 {
			preview = preview[:300]
		}
		log.Printf("[MEALIE] shopping lists response: %s", preview)
	}
	if body, err := mealieGet(baseURL, apiKey, "/api/households/shopping/lists?perPage=10", skipTLS); err == nil {
		var r struct {
			Items []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"items"`
		}
		if json.Unmarshal(body, &r) == nil {
			log.Printf("[MEALIE] shopping lists parsed: %d lists", len(r.Items))
			for _, list := range r.Items {
				sl := MealieShoppingList{ID: list.ID, Name: list.Name}
				// Fetch items for this list
				itemPath := fmt.Sprintf("/api/households/shopping/items?shopping_list_id=%s&perPage=100", list.ID)
				if ibody, ierr := mealieGet(baseURL, apiKey, itemPath, skipTLS); ierr == nil {
					var ir struct {
						Items []struct {
							Note     string  `json:"note"`
							Quantity float64 `json:"quantity"`
							Checked  bool    `json:"checked"`
							Food     *struct{ Name string `json:"name"` }  `json:"food"`
							Unit     *struct{ Name string `json:"name"` }  `json:"unit"`
							Label    *struct{ Name string `json:"name"` }  `json:"label"`
						} `json:"items"`
					}
					if json.Unmarshal(ibody, &ir) == nil {
						for _, item := range ir.Items {
							si := MealieShoppingItem{
								Note:     item.Note,
								Quantity: item.Quantity,
								Checked:  item.Checked,
							}
							if item.Food != nil {
								si.Food = item.Food.Name
							}
							if item.Unit != nil {
								si.Unit = item.Unit.Name
							}
							if item.Label != nil {
								si.Label = item.Label.Name
							}
							sl.Items = append(sl.Items, si)
						}
					}
				}
				out.ShoppingLists = append(out.ShoppingLists, sl)
			}
		}
	}

	return out, nil
}

// ── Image proxy ───────────────────────────────────────────────────────────────

func ProxyMealieImage(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		integID := vars["integrationId"]
		recipeID := vars["recipeId"]

		baseURL, _, token, skipTLS, err := resolveIntegration(db, integID)
		if err != nil {
			http.Error(w, "integration not found", http.StatusNotFound)
			return
		}

		// Mealie images are keyed by recipe UUID, not slug
		imgURL := strings.TrimRight(baseURL, "/") + "/api/media/recipes/" + recipeID + "/images/min-original.webp"
		client := httpClient(skipTLS)
		req, err := http.NewRequest("GET", imgURL, nil)
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

// ── Connection test ───────────────────────────────────────────────────────────

func testMealieConnection(baseURL, apiKey string, skipTLS bool) error {
	if apiKey == "" {
		return fmt.Errorf("API token required")
	}
	body, err := mealieGet(baseURL, apiKey, "/api/users/self", skipTLS)
	if err != nil {
		return err
	}
	var r struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(body, &r) != nil || r.ID == "" {
		return fmt.Errorf("unexpected response from Mealie")
	}
	return nil
}
