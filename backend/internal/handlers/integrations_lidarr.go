package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
)

type LidarrPanelData struct {
	UIURL        string        `json:"uiUrl"`
	Upcoming     []LidarrAlbum `json:"upcoming"`
	History      []LidarrAlbum `json:"history"`
	Missing      []LidarrAlbum `json:"missing"`
	MissingCount int           `json:"missingCount"`
	ArtistCount  int           `json:"artistCount"`
	AlbumCount   int           `json:"albumCount"`
	OnDiskCount  int           `json:"onDiskCount"`
}

type LidarrAlbum struct {
	ID              int    `json:"id"`
	Title           string `json:"title"`
	ArtistName      string `json:"artistName"`
	ForeignAlbumId  string `json:"foreignAlbumId,omitempty"`
	ForeignArtistId string `json:"foreignArtistId,omitempty"`
	CoverURL        string `json:"coverUrl,omitempty"`
	ReleaseDate  string `json:"releaseDate,omitempty"`
	HasFile      bool   `json:"hasFile"`
	Date         string `json:"date,omitempty"`
}

func fetchLidarrPanelData(db *sql.DB, config map[string]interface{}) (*LidarrPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data := &LidarrPanelData{UIURL: uiURL}

	// Upcoming releases — calendar
	upcStart := timeNow().Format("2006-01-02")
	upcEnd := timeNow().AddDate(0, 0, 90).Format("2006-01-02")
	upcoming, err := arrGet(apiURL, apiKey,
		fmt.Sprintf("/api/v1/calendar?start=%s&end=%s&unmonitored=true&includeArtist=true", upcStart, upcEnd), skipTLS)
	if err == nil {
		var albums []map[string]interface{}
		json.Unmarshal(upcoming, &albums)
		for _, a := range albums {
			data.Upcoming = append(data.Upcoming, lidarrAlbumFromMap(a))
		}
	}

	// Recent history
	hist, err := arrGet(apiURL, apiKey,
		"/api/v1/history?pageSize=5&sortKey=date&sortDirection=descending&eventType=3&includeArtist=true&includeAlbum=true", skipTLS)
	if err == nil {
		var histResp map[string]interface{}
		json.Unmarshal(hist, &histResp)
		if records, ok := histResp["records"].([]interface{}); ok {
			for _, r := range records {
				rec, _ := r.(map[string]interface{})
				if rec == nil { continue }
				album, _ := rec["album"].(map[string]interface{})
				if album == nil { continue }
				a := lidarrAlbumFromMap(album)
				a.Date = stringVal(rec, "date")
				data.History = append(data.History, a)
			}
		}
	}

	// Artist/album counts
	artistsRaw, err := arrGet(apiURL, apiKey, "/api/v1/artist", skipTLS)
	var artists []map[string]interface{}
	if err == nil {
		json.Unmarshal(artistsRaw, &artists)
	}
	if err != nil {
		log.Printf("[LIDARR] artist fetch error: %v", err)
	} else {
		data.ArtistCount = len(artists)
		for _, a := range artists {
			stats, _ := a["statistics"].(map[string]interface{})
			if stats != nil {
				if v, ok := stats["albumCount"].(float64); ok { data.AlbumCount += int(v) }
				if v, ok := stats["trackFileCount"].(float64); ok { data.OnDiskCount += int(v) }
			}
		}
	}

	// Missing albums
	missing, err := arrGet(apiURL, apiKey, "/api/v1/wanted/missing?pageSize=10&sortKey=releaseDate&sortDirection=descending&includeArtist=true", skipTLS)
	if err == nil {
		var wantedResp map[string]interface{}
		json.Unmarshal(missing, &wantedResp)
		if records, ok := wantedResp["records"].([]interface{}); ok {
			for _, r := range records {
				rec, _ := r.(map[string]interface{})
				if rec == nil { continue }
				data.Missing = append(data.Missing, lidarrAlbumFromMap(rec))
			}
		}
	}
	data.MissingCount = len(data.Missing)
	return data, nil
}

func lidarrAlbumFromMap(a map[string]interface{}) LidarrAlbum {
	al := LidarrAlbum{}
	al.Title, _ = a["title"].(string)
	al.ReleaseDate, _ = a["releaseDate"].(string)
	al.ForeignAlbumId, _ = a["foreignAlbumId"].(string)
	if i, ok := a["id"].(float64); ok { al.ID = int(i) }
	al.HasFile = a["statistics"] != nil
	// Extract album cover from images
	if images, ok := a["images"].([]interface{}); ok {
		for _, img := range images {
			if m, ok := img.(map[string]interface{}); ok {
				if ct, _ := m["coverType"].(string); ct == "cover" || ct == "disc" {
					if ru, _ := m["remoteUrl"].(string); ru != "" {
						al.CoverURL = ru
						break
					}
				}
			}
		}
	}
	artist, _ := a["artist"].(map[string]interface{})
	if artist != nil {
		al.ArtistName, _ = artist["artistName"].(string)
		al.ForeignArtistId, _ = artist["foreignArtistId"].(string)
	}
	return al
}
