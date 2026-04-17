package handlers

import (
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Package-level HTTP clients with connection pooling and TLS session reuse.
// Creating a new client per request defeats keep-alive and TLS resumption.
var (
	_httpClient *http.Client
	_httpClientSkipTLS *http.Client
	_httpClientOnce    sync.Once
	_httpClientSkipTLSOnce sync.Once
)

func httpClient(skipTLS bool) *http.Client {
	if skipTLS {
		_httpClientSkipTLSOnce.Do(func() {
			_httpClientSkipTLS = &http.Client{
				Timeout: 15 * time.Second,
				Transport: &http.Transport{
					TLSClientConfig:     &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
					MaxIdleConns:        50,
					MaxIdleConnsPerHost: 10,
					IdleConnTimeout:     90 * time.Second,
					TLSHandshakeTimeout: 10 * time.Second,
				},
			}
		})
		return _httpClientSkipTLS
	}
	_httpClientOnce.Do(func() {
		_httpClient = &http.Client{
			Timeout: 15 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        50,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
				TLSHandshakeTimeout: 10 * time.Second,
			},
		}
	})
	return _httpClient
}

// ── Shared arr HTTP helper ────────────────────────────────────────────────────

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

