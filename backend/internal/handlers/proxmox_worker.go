package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

// StartProxmoxWorker runs two loops:
//   - Fast (3s): polls /nodes/{node}/status for CPU, memory, network — cheap call
//   - Slow (60s): runs full fetchProxmoxPanelData for VMs, storage, temps etc
func StartProxmoxWorker(db *sql.DB, ig integrationMeta, stop chan struct{}) {
	go func() {
		// Warm the cache immediately with full data
		if data, err := fetchProxmoxPanelData(db, map[string]interface{}{"integrationId": ig.id}); err == nil {
			cacheSet(ig.id, data)
		}

		fastTick := time.NewTicker(3 * time.Second)
		slowTick := time.NewTicker(time.Duration(ig.refreshSecs) * time.Second)
		defer fastTick.Stop()
		defer slowTick.Stop()

		// Track last known node name so we don't re-resolve on every fast tick
		var cachedNode, cachedAPIURL, cachedAPIKey string
		var cachedSkipTLS bool

		resolveNode := func() bool {
			apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, ig.id)
			if err != nil {
				log.Printf("[PROXMOX] resolve error: %v", err)
				return false
			}
			cachedAPIURL = apiURL
			cachedAPIKey = apiKey
			cachedSkipTLS = skipTLS

			// Get first node name
			body, err := proxmoxGet(apiURL, apiKey, "/nodes", skipTLS)
			if err != nil {
				log.Printf("[PROXMOX] nodes error: %v", err)
				return false
			}
			var resp struct {
				Data []struct {
					Node string `json:"node"`
				} `json:"data"`
			}
			if json.Unmarshal(body, &resp) != nil || len(resp.Data) == 0 {
				return false
			}
			cachedNode = resp.Data[0].Node
			return true
		}

		resolveNode()

		for {
			select {
			case <-stop:
				return

			case <-fastTick.C:
				if cachedNode == "" {
					resolveNode()
					continue
				}
				// Fast poll: just node status — CPU, mem, net
				body, err := proxmoxGet(cachedAPIURL, cachedAPIKey,
					fmt.Sprintf("/nodes/%s/status", cachedNode), cachedSkipTLS)
				if err != nil {
					log.Printf("[PROXMOX] fast poll error: %v", err)
					cachedNode = "" // re-resolve next tick
					continue
				}
				var statusResp struct {
					Data struct {
						CPU    float64 `json:"cpu"`
						MaxCPU int     `json:"maxcpu"`
						Memory struct {
							Used  int64 `json:"used"`
							Total int64 `json:"total"`
						} `json:"memory"`
						NetIn  float64 `json:"netin"`
						NetOut float64 `json:"netout"`
					} `json:"data"`
				}
				if json.Unmarshal(body, &statusResp) != nil {
					continue
				}
				d := statusResp.Data
				cpuPct := d.CPU * 100
				memPct := 0.0
				if d.Memory.Total > 0 {
					memPct = float64(d.Memory.Used) / float64(d.Memory.Total) * 100
				}
				netInMbps := d.NetIn * 8 / 1_000_000
				netOutMbps := d.NetOut * 8 / 1_000_000

				// Merge fast metrics into existing cached data
				existing, ok := cacheGet(ig.id)
				if !ok {
					continue
				}
				// Type-assert to update in place — cache stores *ProxmoxPanelData
				if panel, ok := existing.(*ProxmoxPanelData); ok {
					updated := *panel // copy
					updated.CPU.Used = cpuPct
					updated.Memory.Used = memPct
					updated.NetIn = netInMbps
					updated.NetOut = netOutMbps
					cacheSet(ig.id, &updated)
				}

			case <-slowTick.C:
				// Full refresh — VMs, storage, temps, everything
				if data, err := fetchProxmoxPanelData(db, map[string]interface{}{"integrationId": ig.id}); err == nil {
					cacheSet(ig.id, data)
					// Re-resolve node in case it changed
					resolveNode()
				} else {
					log.Printf("[PROXMOX] slow poll error: %v", err)
				}
			}
		}
	}()
}
