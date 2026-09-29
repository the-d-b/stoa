package handlers

import (
	"database/sql"
	"time"
)

// StartProxmoxWorker polls the full panel data (VMs, storage, CPU/mem/net,
// temps) on the integration's configured refresh interval.
func StartProxmoxWorker(db *sql.DB, ig integrationMeta, stop chan struct{}) {
	go func() {
		if data, err := fetchProxmoxPanelData(db, map[string]interface{}{"integrationId": ig.id}); err == nil {
			cacheSet(ig.id, data)
			ClearIntegrationError(ig.id, ig.name)
		} else {
			RecordIntegrationError(ig.id, ig.name, err.Error())
		}

		ticker := time.NewTicker(time.Duration(ig.refreshSecs) * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-stop:
				return

			case <-ticker.C:
				if data, err := fetchProxmoxPanelData(db, map[string]interface{}{"integrationId": ig.id}); err == nil {
					cacheSet(ig.id, data)
					ClearIntegrationError(ig.id, ig.name)
				} else {
					logErrorf("PROXMOX", "poll error: %v", err)
					RecordIntegrationError(ig.id, ig.name, err.Error())
				}
			}
		}
	}()
}
