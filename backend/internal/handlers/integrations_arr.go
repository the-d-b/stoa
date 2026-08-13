package handlers

import (
	"bytes"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/the-d-b/stoa/internal/auth"
	"github.com/the-d-b/stoa/internal/models"
)

// Package-level HTTP clients with connection pooling and TLS session reuse.
// Creating a new client per request defeats keep-alive and TLS resumption.
var (
	_httpClient            *http.Client
	_httpClientSkipTLS     *http.Client
	_httpClientOnce        sync.Once
	_httpClientSkipTLSOnce sync.Once
)

func httpClient(skipTLS bool) *http.Client {
	if skipTLS {
		_httpClientSkipTLSOnce.Do(func() {
			_httpClientSkipTLS = &http.Client{
				Timeout: 30 * time.Second,
				Transport: loggingTransport{base: &http.Transport{
					TLSClientConfig:     &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
					MaxIdleConns:        50,
					MaxIdleConnsPerHost: 10,
					IdleConnTimeout:     90 * time.Second,
					TLSHandshakeTimeout: 10 * time.Second,
				}},
			}
		})
		return _httpClientSkipTLS
	}
	_httpClientOnce.Do(func() {
		_httpClient = &http.Client{
			Timeout: 30 * time.Second,
			Transport: loggingTransport{base: &http.Transport{
				MaxIdleConns:        50,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
				TLSHandshakeTimeout: 10 * time.Second,
			}},
		}
	})
	return _httpClient
}

// ── Shared arr HTTP helper ────────────────────────────────────────────────────

func arrPost(apiURL, apiKey, path string, skipTLS bool, bodyJSON []byte) ([]byte, error) {
	url := strings.TrimRight(apiURL, "/") + path
	req, err := http.NewRequest("POST", url, bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("X-Api-Key", apiKey)
	}
	resp, err := httpClient(skipTLS).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		msg := string(rb)
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return rb, fmt.Errorf("HTTP %d: %s", resp.StatusCode, msg)
	}
	return rb, nil
}

func arrGet(apiURL, apiKey, path string, skipTLS ...bool) ([]byte, error) {
	url := strings.TrimRight(apiURL, "/") + path
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("X-Api-Key", apiKey)
	}
	client := httpClient(len(skipTLS) > 0 && skipTLS[0])
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from %s", resp.StatusCode, url)
	}
	return io.ReadAll(resp.Body)
}

// ── Add-defaults options (quality profiles + root folders) ────────────────────

type arrQualityProfile struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type arrRootFolder struct {
	Path string `json:"path"`
}

// GetArrOptions lists quality profiles and root folders for a Radarr/Sonarr
// (or any Servarr-family) integration — used to populate the "default
// quality profile" / "default root folder" pickers on the integration's own
// config, so add-to-Radarr/Sonarr actions don't have to blindly take
// whichever profile/folder the server happens to return first.
func GetArrOptions(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		integrationID := r.URL.Query().Get("integrationId")
		if integrationID == "" {
			writeError(w, http.StatusBadRequest, "integrationId required")
			return
		}
		claims := r.Context().Value(auth.UserContextKey).(*models.Claims)
		if !userCanAccessIntegration(db, claims, integrationID) {
			writeError(w, http.StatusForbidden, "not authorized")
			return
		}
		apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
		if err != nil {
			writeError(w, http.StatusNotFound, "integration not found")
			return
		}

		var profiles []arrQualityProfile
		if b, err := arrGet(apiURL, apiKey, "/api/v3/qualityprofile", skipTLS); err == nil {
			json.Unmarshal(b, &profiles) //nolint:errcheck
		}
		var folders []arrRootFolder
		if b, err := arrGet(apiURL, apiKey, "/api/v3/rootfolder", skipTLS); err == nil {
			json.Unmarshal(b, &folders) //nolint:errcheck
		}
		if profiles == nil {
			profiles = []arrQualityProfile{}
		}
		if folders == nil {
			folders = []arrRootFolder{}
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"qualityProfiles": profiles,
			"rootFolders":     folders,
		})
	}
}
