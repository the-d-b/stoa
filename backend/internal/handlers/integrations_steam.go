package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
)

// ── Steam types ───────────────────────────────────────────────────────────────

type SteamPlayer struct {
	SteamID      string `json:"steamId"`
	Username     string `json:"username"`
	AvatarURL    string `json:"avatarUrl"`
	ProfileURL   string `json:"profileUrl"`
	OnlineState  string `json:"onlineState"` // "online","offline","in-game"
	GamePlaying  string `json:"gamePlaying,omitempty"`
}

type SteamGame struct {
	AppID       int    `json:"appId"`
	Name        string `json:"name"`
	PlaytimeMin int    `json:"playtimeMin"` // total lifetime minutes
	Recent2Wk  int    `json:"recent2wk"`  // minutes last 2 weeks
	IconURL     string `json:"iconUrl,omitempty"`
	HeaderURL   string `json:"headerUrl"`
}

type SteamAchievement struct {
	AppID       int    `json:"appId"`
	GameName    string `json:"gameName"`
	Name        string `json:"name"`
	Description string `json:"description"`
	IconURL     string `json:"iconUrl"`
	Unlocked    int64  `json:"unlocked"` // unix timestamp
}

type SteamFeatured struct {
	AppID       int     `json:"appId"`
	Name        string  `json:"name"`
	HeaderURL   string  `json:"headerUrl"`
	DiscountPct int     `json:"discountPct"`
	FinalPrice  float64 `json:"finalPrice"` // USD
}

type SteamPanelData struct {
	Player      SteamPlayer      `json:"player"`
	TotalGames  int              `json:"totalGames"`
	TotalHours  float64          `json:"totalHours"`
	TopPlayed   []SteamGame      `json:"topPlayed"`     // top 10 by playtime
	Recent      []SteamGame      `json:"recent"`        // played last 2 weeks
	Achievements []SteamAchievement `json:"achievements"` // recent unlocks from top 3 played
	Featured    []SteamFeatured  `json:"featured"`      // store sales
	NewReleases []SteamFeatured  `json:"newReleases"`   // new on Steam
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

func steamGet(url string) ([]byte, error) {
	resp, err := http.Get(url)
	if err != nil { return nil, err }
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// ── Vanity URL resolver ───────────────────────────────────────────────────────

func SteamResolveVanity(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vanity := r.URL.Query().Get("vanity")
		apiKey := r.URL.Query().Get("key")
		if vanity == "" || apiKey == "" {
			writeError(w, http.StatusBadRequest, "vanity and key required")
			return
		}
		body, err := steamGet(fmt.Sprintf(
			"https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=%s&vanityurl=%s",
			apiKey, vanity))
		if err != nil {
			writeError(w, http.StatusBadGateway, "steam api error")
			return
		}
		var res struct {
			Response struct {
				SteamID string `json:"steamid"`
				Success int    `json:"success"`
			} `json:"response"`
		}
		json.Unmarshal(body, &res)
		if res.Response.Success != 1 {
			writeError(w, http.StatusNotFound, "vanity URL not found")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"steamId": res.Response.SteamID})
	}
}

// ── Main fetcher ──────────────────────────────────────────────────────────────

func fetchSteamPanel(db *sql.DB, config map[string]interface{}) (*SteamPanelData, error) {
	steamID, _ := config["steamId"].(string)
	apiKey, _ := config["apiKey"].(string)
	if steamID == "" || apiKey == "" {
		return nil, fmt.Errorf("steamId and API key required")
	}

	data := &SteamPanelData{}

	// ── Player summary ────────────────────────────────────────────────────────
	body, err := steamGet(fmt.Sprintf(
		"https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=%s&steamids=%s",
		apiKey, steamID))
	if err != nil { return nil, fmt.Errorf("player summary: %w", err) }
	var ps struct {
		Response struct {
			Players []struct {
				SteamID       string `json:"steamid"`
				PersonaName   string `json:"personaname"`
				Avatar        string `json:"avatarfull"`
				ProfileURL    string `json:"profileurl"`
				PersonaState  int    `json:"personastate"`
				GameExtraInfo string `json:"gameextrainfo"`
			} `json:"players"`
		} `json:"response"`
	}
	json.Unmarshal(body, &ps)
	if len(ps.Response.Players) > 0 {
		p := ps.Response.Players[0]
		state := "offline"
		if p.PersonaState == 1 { state = "online" }
		if p.GameExtraInfo != "" { state = "in-game" }
		data.Player = SteamPlayer{
			SteamID:     p.SteamID,
			Username:    p.PersonaName,
			AvatarURL:   p.Avatar,
			ProfileURL:  p.ProfileURL,
			OnlineState: state,
			GamePlaying: p.GameExtraInfo,
		}
	}

	// ── Owned games ───────────────────────────────────────────────────────────
	body, err = steamGet(fmt.Sprintf(
		"https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=%s&steamid=%s"+
			"&include_appinfo=true&include_played_free_games=true",
		apiKey, steamID))
	if err != nil { return nil, fmt.Errorf("owned games: %w", err) }
	var og struct {
		Response struct {
			GameCount int `json:"game_count"`
			Games     []struct {
				AppID           int    `json:"appid"`
				Name            string `json:"name"`
				PlaytimeForever int    `json:"playtime_forever"`
				ImgIconURL      string `json:"img_icon_url"`
			} `json:"games"`
		} `json:"response"`
	}
	json.Unmarshal(body, &og)
	data.TotalGames = og.Response.GameCount

	var totalMin int
	var games []SteamGame
	for _, g := range og.Response.Games {
		totalMin += g.PlaytimeForever
		iconURL := ""
		if g.ImgIconURL != "" {
			iconURL = fmt.Sprintf("https://media.steampowered.com/steamcommunity/public/images/apps/%d/%s.jpg",
				g.AppID, g.ImgIconURL)
		}
		games = append(games, SteamGame{
			AppID:       g.AppID,
			Name:        g.Name,
			PlaytimeMin: g.PlaytimeForever,
			IconURL:     iconURL,
			HeaderURL:   fmt.Sprintf("https://cdn.cloudflare.steamstatic.com/steam/apps/%d/header.jpg", g.AppID),
		})
	}
	data.TotalHours = float64(totalMin) / 60.0

	// Top 10 by playtime
	sort.Slice(games, func(i, j int) bool { return games[i].PlaytimeMin > games[j].PlaytimeMin })
	if len(games) > 10 { data.TopPlayed = games[:10] } else { data.TopPlayed = games }

	// ── Recent activity (last 2 weeks) ────────────────────────────────────────
	body, err = steamGet(fmt.Sprintf(
		"https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=%s&steamid=%s&count=10",
		apiKey, steamID))
	if err == nil {
		var rp struct {
			Response struct {
				Games []struct {
					AppID          int    `json:"appid"`
					Name           string `json:"name"`
					Playtime2weeks int    `json:"playtime_2weeks"`
				} `json:"games"`
			} `json:"response"`
		}
		json.Unmarshal(body, &rp)
		for _, g := range rp.Response.Games {
			data.Recent = append(data.Recent, SteamGame{
				AppID:      g.AppID,
				Name:       g.Name,
				Recent2Wk: g.Playtime2weeks,
				HeaderURL:  fmt.Sprintf("https://cdn.cloudflare.steamstatic.com/steam/apps/%d/header.jpg", g.AppID),
			})
		}
	}

	// ── Achievements — only for top 3 most played (avoid API flood) ───────────
	top3 := data.TopPlayed
	if len(top3) > 3 { top3 = top3[:3] }
	for _, g := range top3 {
		body, err = steamGet(fmt.Sprintf(
			"https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=%s&steamid=%s&appid=%d&l=en",
			apiKey, steamID, g.AppID))
		if err != nil { continue }
		var ach struct {
			PlayerStats struct {
				Achievements []struct {
					APIName    string `json:"apiname"`
					Achieved   int    `json:"achieved"`
					UnlockTime int64  `json:"unlocktime"`
					Name       string `json:"name"`
					Description string `json:"description"`
				} `json:"achievements"`
			} `json:"playerstats"`
		}
		if json.Unmarshal(body, &ach) != nil { continue }
		// Only recently unlocked, newest first
		var unlocked []SteamAchievement
		for _, a := range ach.PlayerStats.Achievements {
			if a.Achieved == 1 {
				unlocked = append(unlocked, SteamAchievement{
					AppID:       g.AppID,
					GameName:    g.Name,
					Name:        a.Name,
					Description: a.Description,
					IconURL:     fmt.Sprintf("https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/%d/%s.jpg", g.AppID, a.APIName),
					Unlocked:    a.UnlockTime,
				})
			}
		}
		sort.Slice(unlocked, func(i, j int) bool { return unlocked[i].Unlocked > unlocked[j].Unlocked })
		if len(unlocked) > 5 { unlocked = unlocked[:5] }
		data.Achievements = append(data.Achievements, unlocked...)
	}
	// Sort all achievements by unlock time, keep top 10
	sort.Slice(data.Achievements, func(i, j int) bool { return data.Achievements[i].Unlocked > data.Achievements[j].Unlocked })
	if len(data.Achievements) > 10 { data.Achievements = data.Achievements[:10] }

	// ── Featured/sales + new releases from Steam store ──────────────────────
	body, err = steamGet("https://store.steampowered.com/api/featuredcategories?cc=us&l=en")
	if err == nil {
		var fc map[string]interface{}
		if json.Unmarshal(body, &fc) == nil {
			// Helper to extract items from a category
			extractItems := func(category string, limit int) []SteamFeatured {
				var out []SteamFeatured
				cat, ok := fc[category].(map[string]interface{})
				if !ok { return out }
				items, ok := cat["items"].([]interface{})
				if !ok { return out }
				for _, item := range items {
					m, ok := item.(map[string]interface{})
					if !ok { continue }
					appID := int(toFloat(m["id"]))
					name, _ := m["name"].(string)
					header, _ := m["large_capsule_image"].(string)
					if header == "" { header, _ = m["header_image"].(string) }
					discountPct := int(toFloat(m["discount_percent"]))
					finalPriceCents := int(toFloat(m["final_price"]))
					if appID == 0 || name == "" { continue }
					out = append(out, SteamFeatured{
						AppID: appID, Name: name, HeaderURL: header,
						DiscountPct: discountPct,
						FinalPrice:  float64(finalPriceCents) / 100,
					})
					if len(out) >= limit { break }
				}
				return out
			}
			data.Featured = extractItems("specials", 8)
			data.NewReleases = extractItems("new_releases", 8)
		}
	}

	// Ensure slices are never nil (marshal to [] not null)
	if data.Recent == nil { data.Recent = []SteamGame{} }
	if data.Achievements == nil { data.Achievements = []SteamAchievement{} }
	if data.Featured == nil { data.Featured = []SteamFeatured{} }
	if data.NewReleases == nil { data.NewReleases = []SteamFeatured{} }
	if data.TopPlayed == nil { data.TopPlayed = []SteamGame{} }

	log.Printf("[STEAM] fetched for steamId=%s games=%d recent=%d achievements=%d featured=%d",
		steamID, data.TotalGames, len(data.Recent), len(data.Achievements), len(data.Featured))
	return data, nil
}

// ── Integration-based fetcher — reads steamId from api_url, key from secret ───

func FetchSteamForIntegration(db *sql.DB, config map[string]interface{}) (interface{}, error) {
	integrationID, _ := config["integrationId"].(string)
	if integrationID == "" {
		return nil, fmt.Errorf("no integrationId in config")
	}
	// api_url stores steamId, secret_id stores API key
	var steamID string
	var secretID sql.NullString
	db.QueryRow(`SELECT api_url, secret_id FROM integrations WHERE id=? AND enabled=1`,
		integrationID).Scan(&steamID, &secretID)
	if steamID == "" {
		return nil, fmt.Errorf("steam integration not configured (no steam ID)")
	}
	var apiKey string
	if secretID.Valid {
		var enc string
		if err := db.QueryRow("SELECT value FROM secrets WHERE id=?", secretID.String).Scan(&enc); err == nil {
			apiKey = decryptSecret(enc)
		}
	}
	if apiKey == "" {
		return nil, fmt.Errorf("steam API key not found")
	}
	steamConfig := map[string]interface{}{
		"steamId": steamID,
		"apiKey":  apiKey,
	}
	return fetchSteamPanel(db, steamConfig)
}

// ── Helpers ───────────────────────────────────────────────────────────────────


