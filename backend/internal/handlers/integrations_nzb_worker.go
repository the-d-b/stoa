package handlers

import (
	"database/sql"
	"time"
)

const (
	nzbFastInterval = 5 * time.Second
	nzbCoastDown    = 30 * time.Second
	nzbSpeedBufMax  = 60
)

// StartNZBWorker runs an adaptive-rate background worker for SABnzbd or NZBGet.
// It polls at the configured interval when idle, drops to 5 s during active
// downloads, and holds the 5 s rate for 30 s after the queue drains before
// returning to the idle rate. A 60-entry MB/s ring buffer is maintained and
// injected into each panel data struct for the frontend sparkline.
func StartNZBWorker(db *sql.DB, ig integrationMeta, stop chan struct{}) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				logErrorf("NZB", "worker panic %s: %v", ig.id, r)
			}
		}()

		base := time.Duration(ig.refreshSecs) * time.Second
		config := map[string]interface{}{"integrationId": ig.id}

		var speedBuf []float64
		var lastActiveAt time.Time
		var consecutiveErrors int

		doPoll := func() (active bool) {
			switch ig.igType {
			case "sabnzbd":
				data, err := fetchSABnzbdPanelData(db, config)
				if err != nil {
					logErrorf("NZB", "refresh error %s: %v", ig.id, err)
					RecordIntegrationError(ig.id, ig.name, err.Error())
					consecutiveErrors++
					return false
				}
				consecutiveErrors = 0
				ClearIntegrationError(ig.id, ig.name)
				speedBuf = nzbAppendRing(speedBuf, data.SpeedKBPS/1000)
				data.SpeedHistory = append([]float64{}, speedBuf...)
				cacheSet(ig.id, data)
				return data.QueueCount > 0 && !data.Paused

			case "nzbget":
				data, err := fetchNZBGetPanelData(db, config)
				if err != nil {
					logErrorf("NZB", "refresh error %s: %v", ig.id, err)
					RecordIntegrationError(ig.id, ig.name, err.Error())
					consecutiveErrors++
					return false
				}
				consecutiveErrors = 0
				ClearIntegrationError(ig.id, ig.name)
				speedBuf = nzbAppendRing(speedBuf, float64(data.SpeedBPS)/1_000_000)
				data.SpeedHistory = append([]float64{}, speedBuf...)
				cacheSet(ig.id, data)
				return data.QueueCount > 0 && !data.Paused
			}
			return false
		}

		nextInterval := func(active bool) time.Duration {
			if active || time.Since(lastActiveAt) < nzbCoastDown {
				return nzbFastInterval
			}
			return workerBackoff(base, consecutiveErrors)
		}

		active := doPoll()
		if active {
			lastActiveAt = time.Now()
		}

		timer := time.NewTimer(nextInterval(active))
		defer timer.Stop()

		for {
			select {
			case <-timer.C:
				active = doPoll()
				if active {
					lastActiveAt = time.Now()
				}
				timer.Reset(nextInterval(active))
			case <-stop:
				logDebugf("NZB", "worker stopped: %s", ig.id)
				return
			}
		}
	}()
}

func nzbAppendRing(buf []float64, val float64) []float64 {
	buf = append(buf, val)
	if len(buf) > nzbSpeedBufMax {
		buf = buf[len(buf)-nzbSpeedBufMax:]
	}
	return buf
}
