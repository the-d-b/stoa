package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ── Unraid types ──────────────────────────────────────────────────────────────

// unraidBigInt handles Unraid's BigInt fields, which may serialize as quoted
// strings (e.g. "1099511627776") when values exceed JavaScript's safe integer range.
type unraidBigInt int64

func (n *unraidBigInt) UnmarshalJSON(data []byte) error {
	if len(data) == 0 || string(data) == "null" {
		return nil
	}
	if len(data) >= 2 && data[0] == '"' {
		s := string(data[1 : len(data)-1])
		v, err := strconv.ParseInt(s, 10, 64)
		if err == nil {
			*n = unraidBigInt(v)
		}
		return nil
	}
	var f float64
	if err := json.Unmarshal(data, &f); err == nil {
		*n = unraidBigInt(int64(f))
	}
	return nil
}

type UnraidPanelData struct {
	UIURL         string              `json:"uiUrl"`
	Hostname      string              `json:"hostname"`
	Version       string              `json:"version"`
	CPUModel      string              `json:"cpuModel"`
	CPUCores      int                 `json:"cpuCores"`
	CPUThreads    int                 `json:"cpuThreads"`
	CPUPercent    float64             `json:"cpuPercent"`
	CPUTempC      float64             `json:"cpuTempC,omitempty"`
	RAMTotalGB    float64             `json:"ramTotalGb"`
	RAMUsedGB     float64             `json:"ramUsedGb"`
	RAMPercent    float64             `json:"ramPercent"`
	ArrayState    string              `json:"arrayState"`
	ArrayUsedGB   float64             `json:"arrayUsedGb"`
	ArrayTotalGB  float64             `json:"arrayTotalGb"`
	ArrayPercent  float64             `json:"arrayPercent"`
	ReadIOPS      float64             `json:"readIops"`
	WriteIOPS     float64             `json:"writeIops"`
	Pools         []UnraidPool        `json:"pools"`
	DiskSummary   UnraidDiskSummary   `json:"diskSummary"`
	ParityCheck   *UnraidParityCheck  `json:"parityCheck,omitempty"`
	DockerRunning int                 `json:"dockerRunning"`
	DockerStopped int                 `json:"dockerStopped"`
	VMRunning     int                 `json:"vmRunning"`
	VMStopped     int                 `json:"vmStopped"`
	NetInterfaces []UnraidNetIface    `json:"netInterfaces"`
	Shares        []UnraidShare       `json:"shares"`
	Alerts        []UnraidAlert       `json:"alerts"`
}

// UnraidPool is a storage pool (or the main array, if it has any capacity) —
// deliberately high-level, matching a "how much space, how healthy" view
// rather than enumerating member disks (the Stoa TrueNAS panel's Pools
// section is the model here). Cache pools with more than one physical member
// (e.g. a striped/mirrored pool) come back from Unraid's API as one row per
// physical slot with the SAME capacity numbers duplicated on each row rather
// than one row per pool — grouped here by matching fsSize, since there's no
// real pool-identity field to key on. This is a best-effort heuristic, not
// a guarantee: a member disk that returns entirely-null stats at query time
// (seen in practice on a drive with real, periodic I/O errors) won't be
// grouped in, though that case is separately caught by DiskSummary below.
type UnraidPool struct {
	Name    string  `json:"name"`
	Status  string  `json:"status"`
	Color   string  `json:"color"`
	UsedGB  float64 `json:"usedGb"`
	TotalGB float64 `json:"totalGb"`
	Percent float64 `json:"percent"`
}

// UnraidDiskSummary is a count, not a list — "12 disks, all healthy" rather
// than 12 individual rows, per how this panel is meant to be read at a
// glance. Issues names only the disks worth calling out. SmartStatus is a
// coarse OK/UNKNOWN enum with no attribute-level detail (no reallocated-
// sector counts, etc.), and UNKNOWN is expected/normal for USB flash disks
// (which don't support standard ATA SMART) — those are never flagged.
// Even for real drives this is not a fully reliable signal: on this
// integration's own test hardware, a drive independently confirmed (via the
// Unraid UI) to be actively throwing hundreds of I/O errors read back as
// SMART "OK" through this API. Treat Issues as a hint worth checking in
// Unraid's own UI, not a guarantee of health either way.
type UnraidDiskSummary struct {
	Total   int      `json:"total"`
	Healthy int      `json:"healthy"`
	Issues  []string `json:"issues"`
}

type UnraidAlert struct {
	Level   string `json:"level"` // "warning" | "error"
	Message string `json:"message"`
}

type UnraidParityCheck struct {
	Status   string  `json:"status"`
	Speed    string  `json:"speed"`
	Duration int     `json:"duration"`
	Progress float64 `json:"progress"`
}

type UnraidNetIface struct {
	Name  string  `json:"name"`
	RxMBs float64 `json:"rxMbs"`
	TxMBs float64 `json:"txMbs"`
}

type UnraidShare struct {
	Name string `json:"name"`
}

// unraidArrayPayload is the wire shape of the `array` field — used both by
// the regular polling query and by the live arraySubscription push, which
// returns the identical UnraidArray type. A named type (rather than the
// inline anonymous struct this used to be) lets unraidApplyArray parse
// either source with one implementation.
type unraidArrayPayload struct {
	State    string `json:"state"`
	Capacity struct {
		Kilobytes struct {
			Free  unraidBigInt `json:"free"`
			Total unraidBigInt `json:"total"`
			Used  unraidBigInt `json:"used"`
		} `json:"kilobytes"`
	} `json:"capacity"`
	Disks []struct {
		Name      string       `json:"name"`
		Size      unraidBigInt `json:"size"`
		Temp      int          `json:"temp"`
		Status    string       `json:"status"` // ArrayDiskStatus enum, e.g. "DISK_OK"
		NumErrors unraidBigInt `json:"numErrors"`
		NumReads  unraidBigInt `json:"numReads"`  // cumulative I/O read requests, not bytes
		NumWrites unraidBigInt `json:"numWrites"` // cumulative I/O write requests, not bytes
	} `json:"disks"`
	Caches []struct {
		Name      string       `json:"name"`
		FSType    string       `json:"fsType"`
		FSSize    unraidBigInt `json:"fsSize"` // KB, nullable — null on an unreadable/failing pool member
		FSUsed    unraidBigInt `json:"fsUsed"`
		Temp      int          `json:"temp"`
		Status    string       `json:"status"`
		NumErrors unraidBigInt `json:"numErrors"`
		NumReads  unraidBigInt `json:"numReads"`
		NumWrites unraidBigInt `json:"numWrites"`
	} `json:"caches"`
	ParityCheckStatus *struct {
		Status   string `json:"status"` // ParityCheckStatus enum: NEVER_RUN/RUNNING/PAUSED/COMPLETED/CANCELLED/FAILED
		Speed    string `json:"speed"`
		Duration int    `json:"duration"`
		Progress int    `json:"progress"`
	} `json:"parityCheckStatus"`
}

// unraidArraySubQuery is the field selection shared between the regular
// query's `array { ... }` block and the arraySubscription's live push.
const unraidArraySubQuery = `state capacity { kilobytes { free total used } } disks { name size temp status numErrors numReads numWrites } caches { name fsType fsSize fsFree fsUsed temp status numErrors numReads numWrites } parityCheckStatus { status speed duration progress }`

// unraidApplyArray fills in data's array-state/capacity/Pools/ParityCheck
// fields from a parsed array payload, and returns the summed I/O request
// counters for the caller to diff into an IOPS rate (see unraidTrackIOPS).
// Shared between the slow polling query and the live arraySubscription push
// — safe to call repeatedly on the same *UnraidPanelData (each field it
// touches is a full overwrite, not an append, so a live push can't cause
// Pools or ParityCheck to accumulate duplicates). Does NOT touch data.Alerts
// — a FAILED parity result alerting is the caller's job, so it only fires
// once per (fresh-each-time) slow poll rather than once per live push.
func unraidApplyArray(data *UnraidPanelData, arr unraidArrayPayload) (totalReads, totalWrites int64) {
	for _, d := range arr.Disks {
		totalReads += int64(d.NumReads)
		totalWrites += int64(d.NumWrites)
	}
	for _, c := range arr.Caches {
		totalReads += int64(c.NumReads)
		totalWrites += int64(c.NumWrites)
	}

	data.ArrayState = arr.State
	data.Pools = nil
	kbTotal := float64(arr.Capacity.Kilobytes.Total)
	kbUsed := float64(arr.Capacity.Kilobytes.Used)
	if kbTotal > 0 {
		data.ArrayTotalGB = kbTotal / 1048576
		data.ArrayUsedGB = kbUsed / 1048576
		data.ArrayPercent = kbUsed / kbTotal * 100
		data.Pools = append(data.Pools, UnraidPool{
			Name: "Array", Status: arr.State, Color: unraidArrayStateColor(arr.State),
			UsedGB: data.ArrayUsedGB, TotalGB: data.ArrayTotalGB, Percent: data.ArrayPercent,
		})
	} else {
		data.ArrayTotalGB, data.ArrayUsedGB, data.ArrayPercent = 0, 0, 0
	}

	// Cache pools — grouped by matching fsSize since a multi-disk pool comes
	// back as one row per physical slot with the same capacity duplicated on
	// each row, not one row per pool (see UnraidPool's doc comment). Entries
	// with fsSize 0 are excluded: that's either the boot USB device (which
	// isn't real pool capacity) or a member disk that returned entirely-null
	// stats at query time — the latter is caught separately by the disk
	// health summary rather than guessed at here.
	type poolGroup struct {
		names  []string
		status string
		fsUsed int64
	}
	groups := map[int64]*poolGroup{}
	var groupOrder []int64
	for _, c := range arr.Caches {
		if c.FSSize == 0 {
			continue
		}
		key := int64(c.FSSize)
		g, ok := groups[key]
		if !ok {
			g = &poolGroup{status: c.Status, fsUsed: int64(c.FSUsed)}
			groups[key] = g
			groupOrder = append(groupOrder, key)
		}
		g.names = append(g.names, c.Name)
		if unraidStatusSeverity(c.Status) > unraidStatusSeverity(g.status) {
			g.status = c.Status
		}
	}
	for _, key := range groupOrder {
		g := groups[key]
		// Unraid suffixes additional pool members' slot names with a
		// trailing digit (a real pool "tank" becomes "tank"/"tank2" per
		// member) — the shortest name in the group is the real pool name.
		name := g.names[0]
		for _, n := range g.names {
			if len(n) < len(name) {
				name = n
			}
		}
		totalGB := float64(key) / 1048576
		usedGB := float64(g.fsUsed) / 1048576
		pct := 0.0
		if totalGB > 0 {
			pct = usedGB / totalGB * 100
		}
		data.Pools = append(data.Pools, UnraidPool{
			Name: name, Status: g.status, Color: unraidDiskColor(g.status),
			UsedGB: usedGB, TotalGB: totalGB, Percent: pct,
		})
	}

	// Parity progress card — only while a check is actively running/paused;
	// cleared otherwise so a finished/never-run check doesn't stick around
	// from a stale previous live push.
	data.ParityCheck = nil
	if p := arr.ParityCheckStatus; p != nil && (p.Status == "RUNNING" || p.Status == "PAUSED") {
		data.ParityCheck = &UnraidParityCheck{
			Status: p.Status, Speed: p.Speed, Duration: p.Duration,
			Progress: float64(p.Progress),
		}
	}

	return totalReads, totalWrites
}

// ── GraphQL queries ───────────────────────────────────────────────────────────
//
// Field shapes below are verified against Unraid's real generated schema
// (github.com/unraid/api) and, where noted, against the Homepage dashboard
// project's working Unraid widget query — Unraid's API returns a bare HTTP
// 400 with no field-level detail for any schema-invalid query, so this was
// checked against the real schema rather than guessed. Notably:
//   - info.cpu/info.memory only expose static hardware specs, no utilization
//     — live CPU/RAM % only exists under the separate top-level `metrics`.
//   - there is no `network.iface` field at all — per-interface throughput is
//     `metrics.network[]` (rx/tx), joined by `name` with `networkInterfaces`
//     (IP address) since no single type carries both.
//   - ArrayDisk.status is a plain enum string (DISK_OK, DISK_NP_MISSING, …),
//     not an object with nested color/name fields.
//   - ParityCheck has no bytesChecked/bytesTotal — `progress` is already a
//     computed percent.
//
// docker/vms/shares are each their own separate query rather than one
// combined with the core stats. Docker.containers, Query.vms's domain list,
// and Query.shares are all declared non-nullable in Unraid's schema — if
// Docker isn't running (a valid, real setup on an array/VM-only box) the
// resolver errors, and GraphQL's null-propagation rules require that error
// to bubble up through every non-nullable ancestor with no nullable stop in
// between, nulling the *entire* response's data object — CPU/RAM/array
// included — not just the docker section. Splitting them out means an
// unavailable Docker/VM/share subsystem can't take the rest of the panel
// down with it.
// metrics.network is deliberately NOT in this query — see unraidNetworkQuery.
// It's a rate computation (bytes/sec), and a live incident confirmed it can
// throw ("Float cannot represent non numeric value: NaN") on Unraid's own
// side; being inside the same non-nullable chain as everything else here
// meant that one glitch nulled hostname/CPU/array/temperature too, not just
// network — the same class of trap already found and fixed for docker/vms/
// shares, just a spot that hadn't failed yet at the time.
const unraidCoreQuery = `{
  vars { version }
  info {
    os { hostname platform }
    cpu { brand cores threads }
  }
  metrics {
    cpu { percentTotal }
    memory { total used percentTotal }
    temperature {
      sensors { name type current { value unit } }
    }
  }
  networkInterfaces { name ipAddress }
  array { ` + unraidArraySubQuery + ` }
}`

const unraidDockerQuery = `{ docker { containers { names state } } }`
const unraidVMsQuery = `{ vms { domains { name state } } }`
const unraidSharesQuery = `{ shares { name } }`
const unraidNotificationsQuery = `{ notifications { overview { unread { info warning alert total } } } }`
const unraidNetworkQuery = `{ metrics { network { name rxSec txSec } } }`

// unraidDisksQuery is the flat, physical-disk view (Query.disks) — separate
// from array.disks/array.caches, which are logical array/pool slots and can
// aggregate multiple physical disks (e.g. a striped pool) into one row.
const unraidDisksQuery = `{ disks { device name vendor size serialNum interfaceType smartStatus temperature isSpinning } }`

// ── HTTP fetch ────────────────────────────────────────────────────────────────

func fetchUnraidPanelData(db *sql.DB, config map[string]interface{}) (*UnraidPanelData, error) {
	integrationID := stringVal(config, "integrationId")
	if integrationID == "" {
		return nil, fmt.Errorf("no integration configured")
	}
	_, uiURL, _, _, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	// Serve from worker cache when available
	if cached := unraidGetCached(integrationID); cached.Hostname != "" {
		cached.UIURL = uiURL
		return cached, nil
	}
	return unraidHTTPFetch(db, integrationID, uiURL)
}

func unraidHTTPFetch(db *sql.DB, integrationID, uiURL string) (*UnraidPanelData, error) {
	apiURL, _, apiKey, skipTLS, err := resolveIntegration(db, integrationID)
	if err != nil {
		return nil, err
	}
	data, err := unraidFetchAll(integrationID, apiURL, apiKey, skipTLS, true)
	if err != nil {
		return nil, fmt.Errorf("unraid: %w", err)
	}
	data.UIURL = uiURL
	return data, nil
}

// unraidFetchAll issues the core query plus the three isolated
// docker/vms/shares queries, tolerating independent failure of the latter
// three (logged, left at zero/empty) since none of them should be able to
// blank out the core system stats.
//
// trackIOPS should be false when called from the WebSocket worker's 60s slow
// refresh — arraySubscription already feeds the same integration's IOPS
// state on its own, much faster (few-second) cadence, and having both the
// slow poll and the live subscription call unraidTrackIOPS for the same
// integration would corrupt each other's diff timing (each overwrites the
// shared last-sample state regardless of which cadence called it), making
// the "rate" meaningless. It should stay true for the initial pre-WebSocket
// fetch (a genuine first sample, and the live subscription's first diff
// naturally continues from it) and for the full poll-only fallback (no live
// subscription exists there at all).
func unraidFetchAll(integrationID, apiURL, apiKey string, skipTLS, trackIOPS bool) (*UnraidPanelData, error) {
	coreRaw, err := unraidHTTPQuery(apiURL, apiKey, unraidCoreQuery, skipTLS)
	if err != nil {
		return nil, err
	}
	data, totalReads, totalWrites, err := buildUnraidPanelData(coreRaw)
	if err != nil {
		return nil, err
	}
	if trackIOPS {
		data.ReadIOPS, data.WriteIOPS = unraidTrackIOPS(integrationID, totalReads, totalWrites)
	}
	// Go's zero-value for an unset slice serializes as JSON null, not [] —
	// initialize explicitly so the frontend always gets a real (possibly
	// empty) array to call .length/.join on without a null check.
	data.DiskSummary.Issues = []string{}

	if dockerRaw, err := unraidHTTPQuery(apiURL, apiKey, unraidDockerQuery, skipTLS); err == nil {
		var resp struct {
			Docker struct {
				Containers []struct {
					State string `json:"state"`
				} `json:"containers"`
			} `json:"docker"`
		}
		if json.Unmarshal(dockerRaw, &resp) == nil {
			for _, c := range resp.Docker.Containers {
				if c.State == "RUNNING" {
					data.DockerRunning++
				} else {
					data.DockerStopped++
				}
			}
		}
	} else {
		logErrorf("UNRAID", "docker query error: %v", err)
	}

	if vmsRaw, err := unraidHTTPQuery(apiURL, apiKey, unraidVMsQuery, skipTLS); err == nil {
		var resp struct {
			VMs struct {
				Domains []struct {
					State string `json:"state"`
				} `json:"domains"`
			} `json:"vms"`
		}
		if json.Unmarshal(vmsRaw, &resp) == nil {
			for _, v := range resp.VMs.Domains {
				if v.State == "RUNNING" {
					data.VMRunning++
				} else {
					data.VMStopped++
				}
			}
		}
	} else {
		logErrorf("UNRAID", "vms query error: %v", err)
	}

	if sharesRaw, err := unraidHTTPQuery(apiURL, apiKey, unraidSharesQuery, skipTLS); err == nil {
		var resp struct {
			Shares []struct {
				Name string `json:"name"`
			} `json:"shares"`
		}
		if json.Unmarshal(sharesRaw, &resp) == nil {
			for _, s := range resp.Shares {
				if s.Name != "" {
					data.Shares = append(data.Shares, UnraidShare{Name: s.Name})
				}
			}
		}
	} else {
		logErrorf("UNRAID", "shares query error: %v", err)
	}

	// Disk health summary — a count, not a list (see UnraidDiskSummary's doc
	// comment on why, and on how unreliable this signal can be). USB devices
	// (the boot flash) are excluded from Issues since SMART "UNKNOWN" is
	// their normal, permanent state, not a sign of trouble.
	if disksRaw, err := unraidHTTPQuery(apiURL, apiKey, unraidDisksQuery, skipTLS); err == nil {
		var resp struct {
			Disks []struct {
				Device      string `json:"device"`
				Name        string `json:"name"`
				SerialNum   string `json:"serialNum"`
				Interface   string `json:"interfaceType"`
				SmartStatus string `json:"smartStatus"`
			} `json:"disks"`
		}
		if json.Unmarshal(disksRaw, &resp) == nil {
			for _, d := range resp.Disks {
				data.DiskSummary.Total++
				if d.SmartStatus == "OK" {
					data.DiskSummary.Healthy++
					continue
				}
				if d.Interface == "USB" {
					data.DiskSummary.Healthy++ // expected: USB disks don't support SMART
					continue
				}
				label := d.Name
				if d.Device != "" {
					label += " (" + d.Device + ")"
				}
				data.DiskSummary.Issues = append(data.DiskSummary.Issues, label)
			}
		}
	} else {
		logErrorf("UNRAID", "disks query error: %v", err)
	}

	// Unread notifications — the closest thing Unraid's API has to a unified
	// alerts feed.
	if notifRaw, err := unraidHTTPQuery(apiURL, apiKey, unraidNotificationsQuery, skipTLS); err == nil {
		var resp struct {
			Notifications struct {
				Overview struct {
					Unread struct {
						Warning int `json:"warning"`
						Alert   int `json:"alert"`
						Total   int `json:"total"`
					} `json:"unread"`
				} `json:"overview"`
			} `json:"notifications"`
		}
		if json.Unmarshal(notifRaw, &resp) == nil {
			u := resp.Notifications.Overview.Unread
			if u.Total > 0 {
				level := "warning"
				if u.Alert > 0 {
					level = "error"
				}
				data.Alerts = append(data.Alerts, UnraidAlert{
					Level:   level,
					Message: fmt.Sprintf("%d unread Unraid notification(s) — check the Unraid UI", u.Total),
				})
			}
		}
	} else {
		logErrorf("UNRAID", "notifications query error: %v", err)
	}

	// Network throughput — isolated from the core query on purpose (see
	// unraidNetworkQuery's doc comment). Joins onto the interfaces already
	// identified from the core query's networkInterfaces by name.
	if netRaw, err := unraidHTTPQuery(apiURL, apiKey, unraidNetworkQuery, skipTLS); err == nil {
		var resp struct {
			Metrics struct {
				Network []struct {
					Name  string  `json:"name"`
					RxSec float64 `json:"rxSec"`
					TxSec float64 `json:"txSec"`
				} `json:"network"`
			} `json:"metrics"`
		}
		if json.Unmarshal(netRaw, &resp) == nil {
			for _, m := range resp.Metrics.Network {
				for i, iface := range data.NetInterfaces {
					if iface.Name == m.Name {
						data.NetInterfaces[i].RxMBs = m.RxSec / 1048576
						data.NetInterfaces[i].TxMBs = m.TxSec / 1048576
						break
					}
				}
			}
		}
	} else {
		logErrorf("UNRAID", "network metrics query error: %v", err)
	}

	// Remaining alerts — array/pool health and parity check, synthesized
	// since Unraid has no single unified alerts feed covering these.
	if data.ArrayState != "" && data.ArrayState != "STARTED" {
		data.Alerts = append(data.Alerts, UnraidAlert{Level: "error", Message: "Array is " + data.ArrayState})
	}
	for _, p := range data.Pools {
		if p.Color != "RED_ON" && p.Color != "YELLOW_ON" {
			continue
		}
		level := "warning"
		if p.Color == "RED_ON" {
			level = "error"
		}
		data.Alerts = append(data.Alerts, UnraidAlert{Level: level, Message: fmt.Sprintf("Pool %q is %s", p.Name, p.Status)})
	}
	if len(data.DiskSummary.Issues) > 0 {
		data.Alerts = append(data.Alerts, UnraidAlert{
			Level:   "warning",
			Message: fmt.Sprintf("%d disk(s) reporting SMART issues: %s", len(data.DiskSummary.Issues), strings.Join(data.DiskSummary.Issues, ", ")),
		})
	}

	return data, nil
}

func unraidHTTPQuery(baseURL, apiKey, query string, skipTLS bool) (json.RawMessage, error) {
	body := fmt.Sprintf(`{"query":%q}`, query)
	url := strings.TrimRight(baseURL, "/") + "/graphql"
	req, err := http.NewRequest("POST", url, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("x-api-key", apiKey)
	client := httpClient(skipTLS)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("unauthorized — check API key")
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d from Unraid", resp.StatusCode)
	}
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var gqlResp struct {
		Data   json.RawMessage `json:"data"`
		Errors []struct {
			Message string        `json:"message"`
			Path    []interface{} `json:"path"` // GraphQL error paths mix field names (string) and list indices (number)
		} `json:"errors"`
	}
	if err := json.Unmarshal(respBody, &gqlResp); err != nil {
		// A 2xx status that still isn't valid JSON is unusual enough to be
		// worth the raw body — this previously just said "invalid GraphQL
		// response" with no way to tell what Unraid actually sent back.
		snippet := strings.TrimSpace(string(respBody))
		if len(snippet) > 300 {
			snippet = snippet[:300] + "…"
		}
		return nil, fmt.Errorf("invalid GraphQL response: %w (body: %s)", err, snippet)
	}
	// GraphQL can return 200 with specific fields nulled out and an "errors"
	// array explaining why (e.g. a permission-scoped API key) — surfacing
	// these was previously silently discarded, hiding the actual cause.
	for _, e := range gqlResp.Errors {
		logErrorf("UNRAID", "GraphQL field error at %v: %s", e.Path, e.Message)
	}
	return gqlResp.Data, nil
}

// ── Response parsing ──────────────────────────────────────────────────────────

// buildUnraidPanelData parses the core query. The extra (totalReads,
// totalWrites) return values are the sum of every disk/cache slot's
// cumulative I/O request counters, for the caller to diff across polls into
// an IOPS rate — see unraidTrackIOPS.
func buildUnraidPanelData(raw json.RawMessage) (*UnraidPanelData, int64, int64, error) {
	data := &UnraidPanelData{}
	if raw == nil {
		return nil, 0, 0, fmt.Errorf("empty response")
	}

	var resp struct {
		Vars struct {
			Version string `json:"version"`
		} `json:"vars"`
		Info struct {
			OS struct {
				Hostname string `json:"hostname"`
			} `json:"os"`
			CPU struct {
				Brand   string `json:"brand"`
				Cores   int    `json:"cores"`
				Threads int    `json:"threads"`
			} `json:"cpu"`
		} `json:"info"`
		Metrics struct {
			CPU struct {
				PercentTotal float64 `json:"percentTotal"`
			} `json:"cpu"`
			Memory struct {
				Total        unraidBigInt `json:"total"`
				Used         unraidBigInt `json:"used"`
				PercentTotal float64      `json:"percentTotal"`
			} `json:"memory"`
			Temperature struct {
				Sensors []struct {
					Name    string `json:"name"`
					Type    string `json:"type"` // SensorType enum: CPU_PACKAGE, CPU_CORE, MOTHERBOARD, …
					Current struct {
						Value float64 `json:"value"`
						Unit  string  `json:"unit"` // CELSIUS/FAHRENHEIT/KELVIN/RANKINE
					} `json:"current"`
				} `json:"sensors"`
			} `json:"temperature"`
		} `json:"metrics"`
		NetworkInterfaces []struct {
			Name      string `json:"name"`
			IPAddress string `json:"ipAddress"`
		} `json:"networkInterfaces"`
		Array unraidArrayPayload `json:"array"`
	}

	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, 0, 0, fmt.Errorf("invalid GraphQL response: %w", err)
	}

	// System info
	data.Hostname = resp.Info.OS.Hostname
	data.Version = resp.Vars.Version
	data.CPUModel = resp.Info.CPU.Brand
	data.CPUCores = resp.Info.CPU.Cores
	data.CPUThreads = resp.Info.CPU.Threads
	data.CPUPercent = resp.Metrics.CPU.PercentTotal

	// CPU temperature — prefer a package-level sensor; fall back to the
	// hottest per-core sensor if that's all the hardware exposes. Real
	// hardware only: a VM typically has no lm-sensors/IPMI backend and will
	// report zero sensors, in which case CPUTempC just stays 0/omitted.
	var foundPackageTemp bool
	for _, s := range resp.Metrics.Temperature.Sensors {
		v := unraidTempToCelsius(s.Current.Value, s.Current.Unit)
		if s.Type == "CPU_PACKAGE" {
			data.CPUTempC = v
			foundPackageTemp = true
			break
		}
		if s.Type == "CPU_CORE" && !foundPackageTemp && v > data.CPUTempC {
			data.CPUTempC = v
		}
	}
	// Fall back to matching the sensor's own name against the standard Linux
	// hwmon driver names for CPU die temperature — confirmed necessary live:
	// on real hardware, Unraid's own sensor classifier filed the actual CPU
	// sensor (AMD's "k10temp" driver) under the generic CUSTOM type rather
	// than CPU_PACKAGE/CPU_CORE, so the type-based match above found nothing
	// despite a perfectly good reading being present.
	if !foundPackageTemp && data.CPUTempC == 0 {
		for _, s := range resp.Metrics.Temperature.Sensors {
			lower := strings.ToLower(s.Name)
			if strings.Contains(lower, "k10temp") || strings.Contains(lower, "coretemp") {
				data.CPUTempC = unraidTempToCelsius(s.Current.Value, s.Current.Unit)
				break
			}
		}
	}

	// Memory (bytes → GB) — only under metrics; info.memory has no usage fields at all
	data.RAMTotalGB = float64(resp.Metrics.Memory.Total) / 1073741824
	data.RAMUsedGB = float64(resp.Metrics.Memory.Used) / 1073741824
	data.RAMPercent = resp.Metrics.Memory.PercentTotal

	totalReads, totalWrites := unraidApplyArray(data, resp.Array)
	// A FAILED parity result should alert even though the progress card only
	// shows for an active check — kept out of unraidApplyArray itself since
	// that function is also called on every live arraySubscription push, and
	// appending to data.Alerts there would duplicate the alert on every push
	// rather than once per (fresh-each-time) slow poll.
	if p := resp.Array.ParityCheckStatus; p != nil && p.Status == "FAILED" {
		data.Alerts = append(data.Alerts, UnraidAlert{Level: "error", Message: "Parity check failed"})
	}

	// Network interfaces — identity/IP only here (skip loopback and anything
	// with no IP); rx/tx rate is filled in separately by unraidFetchAll's
	// isolated network-metrics query (see unraidNetworkQuery's doc comment
	// for why that's not part of this core query), or by the live
	// systemMetricsNetwork subscription once connected.
	for _, iface := range resp.NetworkInterfaces {
		if iface.Name == "lo" || iface.IPAddress == "" {
			continue
		}
		data.NetInterfaces = append(data.NetInterfaces, UnraidNetIface{Name: iface.Name})
	}

	return data, totalReads, totalWrites, nil
}

// unraidIOState tracks the last-seen cumulative read/write request counters
// per integration, so unraidTrackIOPS can diff across polls into a rate.
// IOPS isn't a field the GraphQL API exposes directly — see unraidTrackIOPS.
var (
	unraidIOState   = map[string]struct {
		reads, writes int64
		at            time.Time
	}{}
	unraidIOStateMu sync.Mutex
)

// unraidTrackIOPS diffs the current cumulative I/O request counters against
// the last sample for this integration to produce a read/write IOPS rate.
// Returns (0, 0) on the first sample for an integration (nothing to diff
// against yet) or if the counters went backwards (e.g. the array restarted).
func unraidTrackIOPS(integrationID string, reads, writes int64) (readIOPS, writeIOPS float64) {
	unraidIOStateMu.Lock()
	defer unraidIOStateMu.Unlock()
	prev, ok := unraidIOState[integrationID]
	now := time.Now()
	unraidIOState[integrationID] = struct {
		reads, writes int64
		at            time.Time
	}{reads, writes, now}
	if !ok {
		return 0, 0
	}
	elapsed := now.Sub(prev.at).Seconds()
	if elapsed <= 0 || reads < prev.reads || writes < prev.writes {
		return 0, 0
	}
	return float64(reads-prev.reads) / elapsed, float64(writes-prev.writes) / elapsed
}

// unraidDiskColor maps the real ArrayDiskStatus enum to the color keys the
// frontend already understands (GREEN_ON/YELLOW_ON/RED_ON/GREY_OFF) — Unraid's
// classic status-LED naming the frontend was originally written against, kept
// as-is here rather than changing the frontend, since the enum values carry
// the same meaning.
func unraidDiskColor(status string) string {
	switch status {
	case "DISK_OK":
		return "GREEN_ON"
	case "DISK_NEW", "DISK_DSBL_NEW":
		return "YELLOW_ON"
	case "DISK_NP_MISSING", "DISK_INVALID", "DISK_WRONG", "DISK_DSBL", "DISK_NP_DSBL":
		return "RED_ON"
	default: // DISK_NP: slot present, no disk installed
		return "GREY_OFF"
	}
}

// unraidStatusSeverity ranks unraidDiskColor's output so the worst status
// among a pool's member slots can be picked as the pool's overall status.
func unraidStatusSeverity(status string) int {
	switch unraidDiskColor(status) {
	case "RED_ON":
		return 3
	case "YELLOW_ON":
		return 2
	case "GREY_OFF":
		return 1
	default: // GREEN_ON
		return 0
	}
}

// unraidArrayStateColor maps the ArrayState enum to the same color keys
// unraidDiskColor uses, for the main array's own Pool-shaped entry.
func unraidArrayStateColor(state string) string {
	switch state {
	case "STARTED":
		return "GREEN_ON"
	case "RECON_DISK":
		return "YELLOW_ON"
	case "DISABLE_DISK", "TOO_MANY_MISSING_DISKS", "INVALID_EXPANSION", "PARITY_NOT_BIGGEST", "NEW_DISK_TOO_SMALL":
		return "RED_ON"
	default: // STOPPED, NEW_ARRAY, NO_DATA_DISKS, SWAP_DSBL
		return "GREY_OFF"
	}
}

// unraidTempToCelsius normalizes a TemperatureReading to Celsius.
func unraidTempToCelsius(value float64, unit string) float64 {
	switch unit {
	case "FAHRENHEIT":
		return (value - 32) * 5 / 9
	case "KELVIN":
		return value - 273.15
	default: // CELSIUS, or an unrecognized unit — assume Celsius
		return value
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func unraidGetCached(integrationID string) *UnraidPanelData {
	if cached, ok := cacheGet(integrationID); ok {
		if d, ok := cached.(*UnraidPanelData); ok {
			return d
		}
	}
	return &UnraidPanelData{}
}

func testUnraidConnection(apiURL, apiKey string, skipTLS bool) error {
	raw, err := unraidHTTPQuery(apiURL, apiKey, `{ vars { version } }`, skipTLS)
	if err != nil {
		return err
	}
	var resp struct {
		Vars struct {
			Version string `json:"version"`
		} `json:"vars"`
	}
	if json.Unmarshal(raw, &resp) != nil || resp.Vars.Version == "" {
		return fmt.Errorf("unexpected response from Unraid — check API key and URL")
	}
	return nil
}
