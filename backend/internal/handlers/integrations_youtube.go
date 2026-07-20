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

type YouTubeVideo struct {
	VideoID      string `json:"videoId"`
	Title        string `json:"title"`
	ChannelTitle string `json:"channelTitle"`
	ChannelID    string `json:"channelId"`
	PublishedAt  string `json:"publishedAt"`
	ThumbnailURL string `json:"thumbnailUrl"`
}

type YouTubePanelData struct {
	ChannelTitle    string         `json:"channelTitle"`
	ProfileImageURL string         `json:"profileImageUrl"`
	VideoCount      int            `json:"videoCount"`
	Videos          []YouTubeVideo `json:"videos"`
	CachedAt        string         `json:"cachedAt,omitempty"`
}

func youtubeAPIGet(accessToken, path string) ([]byte, error) {
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/youtube/v3"+path, nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == 401 {
		return nil, fmt.Errorf("youtube: session expired — reconnect your YouTube account from integration settings")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("youtube: HTTP %d", resp.StatusCode)
	}
	return b, nil
}

func fetchYouTubePanelData(db *sql.DB, config map[string]interface{}) (*YouTubePanelData, error) {
	integrationID, _ := config["integrationId"].(string)
	if integrationID == "" {
		return nil, fmt.Errorf("youtube: integrationId required in panel config")
	}

	var channelTitle, profileImageURL string
	var feedCacheJSON sql.NullString
	var feedCachedAt sql.NullTime
	err := db.QueryRow(
		"SELECT channel_title, profile_image_url, feed_cache, feed_cached_at FROM youtube_tokens WHERE integration_id=?",
		integrationID,
	).Scan(&channelTitle, &profileImageURL, &feedCacheJSON, &feedCachedAt)
	if err != nil {
		return nil, fmt.Errorf("youtube: not connected — authorize via integration settings")
	}

	// Return cached feed if fresh (within 55 minutes)
	if feedCacheJSON.Valid && feedCachedAt.Valid && time.Since(feedCachedAt.Time) < 55*time.Minute {
		var videos []YouTubeVideo
		if json.Unmarshal([]byte(feedCacheJSON.String), &videos) == nil {
			return &YouTubePanelData{
				ChannelTitle:    channelTitle,
				ProfileImageURL: profileImageURL,
				VideoCount:      len(videos),
				Videos:          videos,
				CachedAt:        feedCachedAt.Time.Format(time.RFC3339),
			}, nil
		}
	}

	accessToken, err := youtubeGetValidToken(db, integrationID)
	if err != nil {
		// Return stale cache rather than an error, if available
		if feedCacheJSON.Valid {
			var videos []YouTubeVideo
			if json.Unmarshal([]byte(feedCacheJSON.String), &videos) == nil {
				return &YouTubePanelData{
					ChannelTitle:    channelTitle,
					ProfileImageURL: profileImageURL,
					VideoCount:      len(videos),
					Videos:          videos,
				}, nil
			}
		}
		return nil, err
	}

	videos, err := youtubeGetSubscriptionFeed(accessToken)
	if err != nil {
		return nil, err
	}

	if cacheJSON, marshalErr := json.Marshal(videos); marshalErr == nil {
		db.Exec(
			"UPDATE youtube_tokens SET feed_cache=?, feed_cached_at=? WHERE integration_id=?",
			string(cacheJSON), time.Now(), integrationID,
		)
	}

	return &YouTubePanelData{
		ChannelTitle:    channelTitle,
		ProfileImageURL: profileImageURL,
		VideoCount:      len(videos),
		Videos:          videos,
		CachedAt:        time.Now().Format(time.RFC3339),
	}, nil
}

func youtubeGetSubscriptionFeed(accessToken string) ([]YouTubeVideo, error) {
	// Step 1: subscriptions (top 25 by relevance)
	b, err := youtubeAPIGet(accessToken, "/subscriptions?part=snippet&mine=true&maxResults=25&order=relevance")
	if err != nil {
		return nil, err
	}
	var subsResp struct {
		Items []struct {
			Snippet struct {
				ResourceID struct {
					ChannelID string `json:"channelId"`
				} `json:"resourceId"`
				Title string `json:"title"`
			} `json:"snippet"`
		} `json:"items"`
	}
	if json.Unmarshal(b, &subsResp) != nil || len(subsResp.Items) == 0 {
		return []YouTubeVideo{}, nil
	}

	channelIDs := make([]string, 0, len(subsResp.Items))
	channelTitles := map[string]string{}
	for _, item := range subsResp.Items {
		cid := item.Snippet.ResourceID.ChannelID
		if cid != "" {
			channelIDs = append(channelIDs, cid)
			channelTitles[cid] = item.Snippet.Title
		}
	}
	if len(channelIDs) == 0 {
		return []YouTubeVideo{}, nil
	}

	// Step 2: batch fetch upload playlist IDs
	b, err = youtubeAPIGet(accessToken,
		"/channels?part=contentDetails&id="+strings.Join(channelIDs, ",")+"&maxResults=50",
	)
	if err != nil {
		return nil, err
	}
	var channelsResp struct {
		Items []struct {
			ID             string `json:"id"`
			ContentDetails struct {
				RelatedPlaylists struct {
					Uploads string `json:"uploads"`
				} `json:"relatedPlaylists"`
			} `json:"contentDetails"`
		} `json:"items"`
	}
	json.Unmarshal(b, &channelsResp)

	// Step 3: fetch 3 most recent videos per channel
	var allVideos []YouTubeVideo
	for _, ch := range channelsResp.Items {
		uploadsID := ch.ContentDetails.RelatedPlaylists.Uploads
		if uploadsID == "" {
			continue
		}
		pb, err := youtubeAPIGet(accessToken,
			"/playlistItems?part=snippet&playlistId="+uploadsID+"&maxResults=3",
		)
		if err != nil {
			continue
		}
		var plResp struct {
			Items []struct {
				Snippet struct {
					PublishedAt string `json:"publishedAt"`
					Title       string `json:"title"`
					Thumbnails  struct {
						Medium struct {
							URL string `json:"url"`
						} `json:"medium"`
						High struct {
							URL string `json:"url"`
						} `json:"high"`
					} `json:"thumbnails"`
					ResourceID struct {
						VideoID string `json:"videoId"`
					} `json:"resourceId"`
				} `json:"snippet"`
			} `json:"items"`
		}
		if json.Unmarshal(pb, &plResp) != nil {
			continue
		}
		for _, item := range plResp.Items {
			s := item.Snippet
			if s.ResourceID.VideoID == "" {
				continue
			}
			thumb := s.Thumbnails.Medium.URL
			if s.Thumbnails.High.URL != "" {
				thumb = s.Thumbnails.High.URL
			}
			title := s.Title
			if len(title) > 120 {
				title = title[:120] + "…"
			}
			allVideos = append(allVideos, YouTubeVideo{
				VideoID:      s.ResourceID.VideoID,
				Title:        title,
				ChannelTitle: channelTitles[ch.ID],
				ChannelID:    ch.ID,
				PublishedAt:  s.PublishedAt,
				ThumbnailURL: thumb,
			})
		}
	}

	sort.Slice(allVideos, func(i, j int) bool {
		ti, _ := time.Parse(time.RFC3339, allVideos[i].PublishedAt)
		tj, _ := time.Parse(time.RFC3339, allVideos[j].PublishedAt)
		return ti.After(tj)
	})

	if len(allVideos) > 30 {
		allVideos = allVideos[:30]
	}
	if allVideos == nil {
		allVideos = []YouTubeVideo{}
	}
	return allVideos, nil
}
