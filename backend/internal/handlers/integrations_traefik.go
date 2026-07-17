package handlers

import (
	"crypto/tls"
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

type TraefikSection struct {
	Total    int `json:"total"`
	Warnings int `json:"warnings"`
	Errors   int `json:"errors"`
}

type TraefikRouter struct {
	Name        string   `json:"name"`
	Provider    string   `json:"provider"`
	Status      string   `json:"status"` // "enabled", "warning", "disabled"
	Rule        string   `json:"rule"`
	EntryPoints []string `json:"entryPoints"`
	Service     string   `json:"service"`
	HasTLS      bool     `json:"tls"`
	Middlewares []string `json:"middlewares"`
}

type TraefikService struct {
	Name         string `json:"name"`
	Provider     string `json:"provider"`
	Type         string `json:"type"`   // "loadbalancer", "weighted", "mirror"
	Status       string `json:"status"` // "enabled", "warning", "disabled"
	ServersUp    int    `json:"serversUp"`
	ServersDown  int    `json:"serversDown"`
	ServersTotal int    `json:"serversTotal"`
	// Servers exposed for detail view; populated only when health checks active
	Servers []TraefikServer `json:"servers,omitempty"`
}

type TraefikServer struct {
	URL    string `json:"url"`
	Status string `json:"status"` // "UP", "DOWN"
}

type TraefikPanelData struct {
	UIURL         string           `json:"uiUrl"`
	IntegrationID string           `json:"integrationId"`
	Version       string           `json:"version"`
	Providers     []string         `json:"providers"`
	Features      TraefikFeatures  `json:"features"`
	Routers       []TraefikRouter  `json:"routers"`
	Services      []TraefikService `json:"services"`
	// Overview section counts
	HTTPRouters  TraefikSection `json:"httpRouters"`
	HTTPServices TraefikSection `json:"httpServices"`
	TCPRouters   TraefikSection `json:"tcpRouters"`
	// Computed service health across all services with health checks
	TotalChecked int `json:"totalChecked"`
	ServicesUp   int `json:"servicesUp"`
	ServicesDown int `json:"servicesDown"`
}

type TraefikFeatures struct {
	Tracing   string `json:"tracing"`
	Metrics   string `json:"metrics"`
	AccessLog bool   `json:"accessLog"`
}

// ── HTTP client ───────────────────────────────────────────────────────────────

func traefikClient(skipTLS bool) *http.Client {
	tlsCfg := &tls.Config{Renegotiation: tls.RenegotiateOnceAsClient}
	if skipTLS {
		tlsCfg.InsecureSkipVerify = true //nolint:gosec
	}
	return &http.Client{
		Transport: &http.Transport{TLSClientConfig: tlsCfg},
		Timeout:   15 * time.Second,
	}
}

func traefikGet(client *http.Client, baseURL, path, apiKey string) ([]byte, error) {
	req, err := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if apiKey != "" {
		if strings.Contains(apiKey, ":") {
			// username:password → Basic Auth
			idx := strings.Index(apiKey, ":")
			req.SetBasicAuth(apiKey[:idx], apiKey[idx+1:])
		} else {
			req.Header.Set("Authorization", "Bearer "+apiKey)
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("authentication required (HTTP %d) — check API key or Basic Auth credentials", resp.StatusCode)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── Data fetching ─────────────────────────────────────────────────────────────

func traefikFetchVersion(client *http.Client, baseURL, apiKey string) string {
	body, err := traefikGet(client, baseURL, "/api/version", apiKey)
	if err != nil {
		return ""
	}
	var v struct {
		Version string `json:"Version"`
	}
	json.Unmarshal(body, &v)
	return v.Version
}

type rawTraefikOverview struct {
	HTTP struct {
		Routers     *TraefikSection `json:"routers"`
		Services    *TraefikSection `json:"services"`
		Middlewares *TraefikSection `json:"middlewares"`
	} `json:"http"`
	TCP struct {
		Routers  *TraefikSection `json:"routers"`
		Services *TraefikSection `json:"services"`
	} `json:"tcp"`
	Features  TraefikFeatures `json:"features"`
	Providers []string        `json:"providers"`
}

func traefikFetchOverview(client *http.Client, baseURL, apiKey string) (*rawTraefikOverview, error) {
	body, err := traefikGet(client, baseURL, "/api/overview", apiKey)
	if err != nil {
		return nil, err
	}
	var ov rawTraefikOverview
	if err := json.Unmarshal(body, &ov); err != nil {
		return nil, fmt.Errorf("parse overview: %w", err)
	}
	return &ov, nil
}

func traefikFetchRouters(client *http.Client, baseURL, apiKey string) ([]TraefikRouter, error) {
	body, err := traefikGet(client, baseURL, "/api/http/routers", apiKey)
	if err != nil {
		return nil, err
	}
	var raw []struct {
		Name        string   `json:"name"`
		Provider    string   `json:"provider"`
		Status      string   `json:"status"`
		Rule        string   `json:"rule"`
		EntryPoints []string `json:"entryPoints"`
		Service     string   `json:"service"`
		TLS         *struct {
			CertResolver string `json:"certResolver"`
		} `json:"tls"`
		Middlewares []string `json:"middlewares"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("parse routers: %w", err)
	}

	out := make([]TraefikRouter, 0, len(raw))
	for _, r := range raw {
		if r.Provider == "internal" {
			continue // skip api@internal, dashboard@internal, etc.
		}
		out = append(out, TraefikRouter{
			Name:        r.Name,
			Provider:    r.Provider,
			Status:      r.Status,
			Rule:        r.Rule,
			EntryPoints: r.EntryPoints,
			Service:     r.Service,
			HasTLS:      r.TLS != nil,
			Middlewares: r.Middlewares,
		})
	}

	// Sort: errors first, then warnings, then enabled; within each by name
	sort.Slice(out, func(i, j int) bool {
		pi, pj := traefikStatusPriority(out[i].Status), traefikStatusPriority(out[j].Status)
		if pi != pj {
			return pi < pj
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

func traefikFetchServices(client *http.Client, baseURL, apiKey string) ([]TraefikService, error) {
	body, err := traefikGet(client, baseURL, "/api/http/services", apiKey)
	if err != nil {
		return nil, err
	}
	var raw []struct {
		Name         string            `json:"name"`
		Provider     string            `json:"provider"`
		Type         string            `json:"type"`
		Status       string            `json:"status"`
		ServerStatus map[string]string `json:"serverStatus"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("parse services: %w", err)
	}

	out := make([]TraefikService, 0, len(raw))
	for _, r := range raw {
		if r.Provider == "internal" {
			continue
		}
		svc := TraefikService{
			Name:     r.Name,
			Provider: r.Provider,
			Type:     r.Type,
			Status:   r.Status,
		}
		for url, st := range r.ServerStatus {
			svc.ServersTotal++
			srv := TraefikServer{URL: url, Status: st}
			if st == "UP" {
				svc.ServersUp++
			} else {
				svc.ServersDown++
			}
			svc.Servers = append(svc.Servers, srv)
		}
		if len(svc.Servers) > 0 {
			sort.Slice(svc.Servers, func(i, j int) bool {
				return svc.Servers[i].URL < svc.Servers[j].URL
			})
		}
		out = append(out, svc)
	}

	// Sort: services with down servers first, then by name
	sort.Slice(out, func(i, j int) bool {
		iDown := out[i].ServersDown > 0
		jDown := out[j].ServersDown > 0
		if iDown != jDown {
			return iDown
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

func traefikStatusPriority(status string) int {
	switch status {
	case "disabled":
		return 0
	case "warning":
		return 1
	default:
		return 2
	}
}

// ── Panel data builder ────────────────────────────────────────────────────────

func fetchTraefikPanelData(db *sql.DB, config map[string]interface{}) (*TraefikPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}

	client := traefikClient(skipTLS)

	ov, err := traefikFetchOverview(client, apiURL, apiKey)
	if err != nil {
		return nil, fmt.Errorf("overview: %w", err)
	}

	routers, err := traefikFetchRouters(client, apiURL, apiKey)
	if err != nil {
		return nil, fmt.Errorf("routers: %w", err)
	}

	services, err := traefikFetchServices(client, apiURL, apiKey)
	if err != nil {
		return nil, fmt.Errorf("services: %w", err)
	}

	version := traefikFetchVersion(client, apiURL, apiKey)

	d := &TraefikPanelData{
		UIURL:         uiURL,
		IntegrationID: integrationID,
		Version:       version,
		Providers:     ov.Providers,
		Features:      ov.Features,
		Routers:       routers,
		Services:      services,
	}
	if ov.HTTP.Routers != nil {
		d.HTTPRouters = *ov.HTTP.Routers
	}
	if ov.HTTP.Services != nil {
		d.HTTPServices = *ov.HTTP.Services
	}
	if ov.TCP.Routers != nil {
		d.TCPRouters = *ov.TCP.Routers
	}

	// Compute aggregate service health for services with active health checks
	for _, svc := range services {
		if svc.ServersTotal > 0 {
			d.TotalChecked++
			if svc.ServersDown > 0 {
				d.ServicesDown++
			} else {
				d.ServicesUp++
			}
		}
	}

	return d, nil
}

// ── Connection test ───────────────────────────────────────────────────────────

func testTraefikConnection(apiURL, apiKey string, skipTLS bool) error {
	client := traefikClient(skipTLS)
	body, err := traefikGet(client, apiURL, "/api/overview", apiKey)
	if err != nil {
		return fmt.Errorf("API unreachable: %w — make sure the Traefik API is enabled (--api=true) and accessible", err)
	}
	var check struct {
		HTTP interface{} `json:"http"`
	}
	if err := json.Unmarshal(body, &check); err != nil || check.HTTP == nil {
		return fmt.Errorf("unexpected response — not a Traefik API endpoint")
	}
	return nil
}
