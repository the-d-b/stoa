package handlers

import "testing"

func TestTruenasApplySystemInfo(t *testing.T) {
	data := &TrueNASPanelData{}
	truenasApplySystemInfo(data, []byte(`{"hostname":"nas1","version":"24.10","physmem":17179869184,"model":"Xeon","cores":8}`))
	if data.Hostname != "nas1" || data.Version != "24.10" || data.CPUModel != "Xeon" || data.CPUCores != 8 {
		t.Errorf("unexpected data: %+v", data)
	}
	if data.TotalRAM != "16 GB RAM" {
		t.Errorf("TotalRAM = %q, want \"16 GB RAM\"", data.TotalRAM)
	}
}

func TestTruenasApplySystemInfo_MalformedJSONLeavesDataUntouched(t *testing.T) {
	data := &TrueNASPanelData{Hostname: "unchanged"}
	truenasApplySystemInfo(data, []byte("not json"))
	if data.Hostname != "unchanged" {
		t.Errorf("expected data to be left untouched on parse failure, got %+v", data)
	}
}

func TestTruenasParsePools(t *testing.T) {
	pools := truenasParsePools([]byte(`[
		{"name": "tank", "status": "ONLINE", "size": 1073741824000, "allocated": 536870912000},
		{"name": "empty", "status": "ONLINE", "size": 0, "allocated": 0}
	]`))
	if len(pools) != 2 {
		t.Fatalf("expected 2 pools, got %d", len(pools))
	}
	if pools[0].Percent < 49.9 || pools[0].Percent > 50.1 {
		t.Errorf("expected ~50%% usage, got %.2f", pools[0].Percent)
	}
	// A zero-size pool must not divide by zero — percent stays 0, not NaN/Inf.
	if pools[1].Percent != 0 {
		t.Errorf("expected 0%% for zero-size pool, got %v", pools[1].Percent)
	}
}

func TestTruenasParseAlerts(t *testing.T) {
	alerts := truenasParseAlerts([]byte(`[
		{"level": "WARNING", "formatted": "Pool degraded", "dismissed": false},
		{"level": "CRITICAL", "formatted": "Dismissed", "dismissed": true}
	]`))
	if len(alerts) != 1 || alerts[0].Message != "Pool degraded" {
		t.Errorf("unexpected alerts: %+v", alerts)
	}
}

func TestTruenasParseDiskTemps(t *testing.T) {
	disks := truenasParseDiskTemps([]byte(`[
		{"name": "sda", "temperature": 38.5},
		{"name": "sdb", "temperature": 0}
	]`))
	if len(disks) != 1 || disks[0].Name != "sda" {
		t.Errorf("unexpected disks (expected zero-temp filtered out): %+v", disks)
	}
}

func TestTruenasParseVMs(t *testing.T) {
	vms := truenasParseVMs([]byte(`[{"name": "vm1", "status": {"state": "RUNNING"}}]`))
	if len(vms) != 1 || vms[0].Status != "RUNNING" {
		t.Errorf("unexpected vms: %+v", vms)
	}
}

func TestTruenasParseApps(t *testing.T) {
	apps := truenasParseApps([]byte(`[{"name": "plex", "state": "RUNNING", "update_available": true}]`))
	if len(apps) != 1 || !apps[0].UpdateAvailable {
		t.Errorf("unexpected apps: %+v", apps)
	}
}
