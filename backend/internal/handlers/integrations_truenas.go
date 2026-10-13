package handlers

import (
	"database/sql"
	"fmt"
)

// ── TrueNAS types ─────────────────────────────────────────────────────────────

type TrueNASPanelData struct {
	UIURL         string         `json:"uiUrl"`
	Hostname      string         `json:"hostname"`
	Version       string         `json:"version"`
	TotalRAM      string         `json:"totalRam"`
	CPUModel      string         `json:"cpuModel"`
	CPUCores      int            `json:"cpuCores"`
	CPUPercent    float64        `json:"cpuPercent"`
	CPUTempC      float64        `json:"cpuTempC"`
	RAMUsedGB     float64        `json:"ramUsedGb"`
	RAMTotalGB    float64        `json:"ramTotalGb"`
	RAMPercent    float64        `json:"ramPercent"`
	ARCUsedGB     float64        `json:"arcUsedGb"`
	DiskReadMBs   float64        `json:"diskReadMbs"`
	DiskWriteMBs  float64        `json:"diskWriteMbs"`
	DiskBusy      float64        `json:"diskBusy"`
	NetInterfaces []TrueNASIface `json:"netInterfaces"`
	Pools         []TrueNASPool  `json:"pools"`
	Alerts        []TrueNASAlert `json:"alerts"`
	Disks         []TrueNASDisk  `json:"disks"`
	VMs           []TrueNASVM    `json:"vms"`
	Apps          []TrueNASApp   `json:"apps"`
}

type TrueNASIface struct {
	Name   string  `json:"name"`
	RxMBs  float64 `json:"rxMbs"`
	TxMBs  float64 `json:"txMbs"`
	LinkUp bool    `json:"linkUp"`
}

type TrueNASPool struct {
	Name    string  `json:"name"`
	Status  string  `json:"status"`
	UsedGB  float64 `json:"usedGb"`
	TotalGB float64 `json:"totalGb"`
	Percent float64 `json:"percent"`
}

type TrueNASAlert struct {
	Level   string `json:"level"`
	Message string `json:"message"`
}

type TrueNASDisk struct {
	Name  string  `json:"name"`
	TempC float64 `json:"tempC"`
}

type TrueNASVM struct {
	Name   string `json:"name"`
	Status string `json:"status"`
}

type TrueNASApp struct {
	Name            string `json:"name"`
	Status          string `json:"status"`
	UpdateAvailable bool   `json:"updateAvailable"`
}

// fetchTrueNASPanelData is the cache-miss fallback for on-demand panel/glyph
// requests — the background worker (truenas_websocket.go) keeps the cache hot
// under normal operation; this only runs cold-start/race-window requests that
// land before the worker's first cache write. Goes over the same native
// WebSocket API as the worker — TrueNAS deprecated its REST API in 25.x and
// removes it entirely in 26.04.
func fetchTrueNASPanelData(db *sql.DB, config map[string]interface{}) (*TrueNASPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	apiURL, uiURL, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data, err := tnFetchPanelDataSync(apiURL, apiKey, uiURL, skipTLS)
	if err != nil {
		return nil, fmt.Errorf("truenas unreachable — check URL, API key, and TLS settings: %w", err)
	}
	return data, nil
}

// testTrueNASConnection verifies a TrueNAS integration's URL/API key/TLS
// settings by dialing and authenticating over the native WebSocket API.
func testTrueNASConnection(apiURL, apiKey string, skipTLS bool) error {
	return tnTestConnection(apiURL, apiKey, skipTLS)
}
