package handlers

import (
	"encoding/json"
	"testing"
)

func TestToWebSocketURL(t *testing.T) {
	cases := []struct {
		in, want string
		wantErr  bool
	}{
		{"https://truenas.local", "wss://truenas.local", false},
		{"http://truenas.local:8080", "ws://truenas.local:8080", false},
		{"https://truenas.local/", "wss://truenas.local", false}, // trailing slash trimmed before parse
		{"ftp://truenas.local", "wss://truenas.local", false},    // unknown scheme defaults to wss
		{"://not a url", "", true},
	}
	for _, tc := range cases {
		got, err := toWebSocketURL(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("toWebSocketURL(%q) = %q, want error", tc.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("toWebSocketURL(%q) unexpected error: %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("toWebSocketURL(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// tnFindCall returns the handler for a given RPC method from tnSlowCalls'
// result, failing the test if it isn't present.
func tnFindCall(t *testing.T, calls []tnCall, method string) func(json.RawMessage) {
	t.Helper()
	for _, c := range calls {
		if c.method == method {
			return c.handle
		}
	}
	t.Fatalf("no tnCall registered for method %q", method)
	return nil
}

func TestTnSlowCalls_SystemInfo(t *testing.T) {
	data := &TrueNASPanelData{}
	handle := tnFindCall(t, tnSlowCalls(data), "system.info")
	handle(json.RawMessage(`{"hostname":"nas1","version":"TrueNAS-SCALE-24.10","model":"Xeon E-2288G","cores":8}`))
	if data.Hostname != "nas1" || data.Version != "TrueNAS-SCALE-24.10" || data.CPUModel != "Xeon E-2288G" || data.CPUCores != 8 {
		t.Errorf("system.info handler produced unexpected data: %+v", data)
	}
}

func TestTnSlowCalls_PoolQuery(t *testing.T) {
	data := &TrueNASPanelData{}
	handle := tnFindCall(t, tnSlowCalls(data), "pool.query")
	handle(json.RawMessage(`[
		{"name": "tank", "status": "ONLINE", "size": 1073741824000, "allocated": 536870912000}
	]`))
	if len(data.Pools) != 1 {
		t.Fatalf("expected 1 pool, got %d", len(data.Pools))
	}
	p := data.Pools[0]
	if p.Name != "tank" || p.Status != "ONLINE" {
		t.Errorf("pool identity wrong: %+v", p)
	}
	if p.Percent < 49.9 || p.Percent > 50.1 {
		t.Errorf("expected ~50%% usage, got %.2f", p.Percent)
	}
}

func TestTnSlowCalls_AlertList(t *testing.T) {
	data := &TrueNASPanelData{}
	handle := tnFindCall(t, tnSlowCalls(data), "alert.list")
	longMsg := ""
	for i := 0; i < 150; i++ {
		longMsg += "x"
	}
	handle(json.RawMessage(`[
		{"level": "WARNING", "formatted": "Pool degraded", "dismissed": false},
		{"level": "CRITICAL", "formatted": "Dismissed one", "dismissed": true},
		{"level": "INFO", "formatted": "` + longMsg + `", "dismissed": false}
	]`))
	if len(data.Alerts) != 2 {
		t.Fatalf("expected 2 alerts (dismissed one dropped), got %d: %+v", len(data.Alerts), data.Alerts)
	}
	if data.Alerts[0].Message != "Pool degraded" {
		t.Errorf("first alert message = %q, want unchanged short message", data.Alerts[0].Message)
	}
	longResult := data.Alerts[1].Message
	if len([]rune(longResult)) != 121 || longResult[len(longResult)-len("…"):] != "…" {
		t.Errorf("expected 120-char truncation + ellipsis, got %d runes: %q", len([]rune(longResult)), longResult)
	}
}

func TestTnSlowCalls_DiskQuery(t *testing.T) {
	data := &TrueNASPanelData{}
	handle := tnFindCall(t, tnSlowCalls(data), "disk.query")
	handle(json.RawMessage(`[
		{"name": "sda", "temperature": 38.5},
		{"name": "sdb", "temperature": 0}
	]`))
	if len(data.Disks) != 1 {
		t.Fatalf("expected 1 disk (zero-temp one dropped), got %d: %+v", len(data.Disks), data.Disks)
	}
	if data.Disks[0].Name != "sda" || data.Disks[0].TempC != 38.5 {
		t.Errorf("unexpected disk: %+v", data.Disks[0])
	}
}

func TestTnSlowCalls_VMQuery(t *testing.T) {
	data := &TrueNASPanelData{}
	handle := tnFindCall(t, tnSlowCalls(data), "vm.query")
	handle(json.RawMessage(`[{"name": "vm1", "status": {"state": "RUNNING"}}]`))
	if len(data.VMs) != 1 || data.VMs[0].Name != "vm1" || data.VMs[0].Status != "RUNNING" {
		t.Errorf("unexpected vms: %+v", data.VMs)
	}
}

func TestTnSlowCalls_AppQuery(t *testing.T) {
	data := &TrueNASPanelData{}
	handle := tnFindCall(t, tnSlowCalls(data), "app.query")
	handle(json.RawMessage(`[{"name": "plex", "state": "RUNNING", "update_available": true}]`))
	if len(data.Apps) != 1 || !data.Apps[0].UpdateAvailable {
		t.Errorf("unexpected apps: %+v", data.Apps)
	}
}

func TestTnApplyRealtime(t *testing.T) {
	base := TrueNASPanelData{Hostname: "nas1"} // fields untouched by realtime must survive
	fields := json.RawMessage(`{
		"cpu": {"cpu": {"usage": 12.5, "temp": 45.0}},
		"memory": {"physical_memory_total": 17179869184, "physical_memory_available": 8589934592, "arc_size": 2147483648},
		"disks": {"read_bytes": 1048576, "write_bytes": 2097152, "busy": 5.5},
		"interfaces": {
			"eno1": {"link_state": "LINK_STATE_UP", "received_bytes_rate": 1048576, "sent_bytes_rate": 524288},
			"eno2": {"link_state": "LINK_STATE_DOWN", "received_bytes_rate": 0, "sent_bytes_rate": 0}
		}
	}`)

	fresh, err := tnApplyRealtime(base, fields)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if fresh.Hostname != "nas1" {
		t.Error("expected fields not present in the realtime message to survive from base")
	}
	if fresh.CPUPercent != 12.5 || fresh.CPUTempC != 45.0 {
		t.Errorf("CPU fields wrong: percent=%v temp=%v", fresh.CPUPercent, fresh.CPUTempC)
	}
	if fresh.RAMTotalGB < 15.9 || fresh.RAMTotalGB > 16.1 {
		t.Errorf("expected ~16GB total RAM, got %v", fresh.RAMTotalGB)
	}
	if fresh.RAMPercent < 49.9 || fresh.RAMPercent > 50.1 {
		t.Errorf("expected ~50%% RAM used, got %v", fresh.RAMPercent)
	}
	if fresh.ARCUsedGB < 1.9 || fresh.ARCUsedGB > 2.1 {
		t.Errorf("expected ~2GB ARC, got %v", fresh.ARCUsedGB)
	}
	if fresh.DiskReadMBs != 1 || fresh.DiskWriteMBs != 2 {
		t.Errorf("expected 1/2 MB disk IO, got read=%v write=%v", fresh.DiskReadMBs, fresh.DiskWriteMBs)
	}
	if len(fresh.NetInterfaces) != 2 {
		t.Fatalf("expected 2 interfaces, got %d", len(fresh.NetInterfaces))
	}
	byName := map[string]TrueNASIface{}
	for _, i := range fresh.NetInterfaces {
		byName[i.Name] = i
	}
	if !byName["eno1"].LinkUp {
		t.Error("expected eno1 to be link up")
	}
	if byName["eno2"].LinkUp {
		t.Error("expected eno2 to be link down")
	}
}

func TestTnApplyRealtime_NoAggregateCPU(t *testing.T) {
	// When the "cpu" aggregate key is absent (only per-core entries present),
	// CPU fields must be left untouched rather than zeroed out.
	base := TrueNASPanelData{CPUPercent: 99, CPUTempC: 50}
	fresh, err := tnApplyRealtime(base, json.RawMessage(`{"cpu": {"cpu0": {"usage": 5.0}}}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fresh.CPUPercent != 99 || fresh.CPUTempC != 50 {
		t.Errorf("expected CPU fields to survive from base when aggregate key absent, got %+v", fresh)
	}
}

func TestTnApplyRealtime_MalformedJSON(t *testing.T) {
	base := TrueNASPanelData{Hostname: "nas1"}
	_, err := tnApplyRealtime(base, json.RawMessage("not json"))
	if err == nil {
		t.Error("expected error for malformed JSON")
	}
}
