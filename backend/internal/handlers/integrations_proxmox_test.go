package handlers

import "testing"

func TestProxmoxParseNodeStatus(t *testing.T) {
	t.Run("valid response", func(t *testing.T) {
		body := []byte(`{"data":{"cpu":0.15,"memory":{"used":8589934592,"total":17179869184},"cpuinfo":{"cpus":8}}}`)
		cpu, mem, ok := proxmoxParseNodeStatus(body, 4)
		if !ok {
			t.Fatal("expected ok=true")
		}
		if cpu.Used != 15 {
			t.Errorf("expected 15%% CPU, got %v", cpu.Used)
		}
		if cpu.Label != "15% · 8 cores" {
			t.Errorf("cpu label = %q, want %q", cpu.Label, "15% · 8 cores")
		}
		if mem.Used < 49.9 || mem.Used > 50.1 {
			t.Errorf("expected ~50%% mem, got %v", mem.Used)
		}
		if mem.Label != "8.0 / 16 GB" {
			t.Errorf("mem label = %q, want %q", mem.Label, "8.0 / 16 GB")
		}
	})

	t.Run("cpuinfo.cpus absent falls back to maxCPUFallback", func(t *testing.T) {
		body := []byte(`{"data":{"cpu":0.5,"memory":{"used":1,"total":2}}}`)
		cpu, _, ok := proxmoxParseNodeStatus(body, 6)
		if !ok {
			t.Fatal("expected ok=true")
		}
		if cpu.Label != "50% · 6 cores" {
			t.Errorf("expected fallback core count, got %q", cpu.Label)
		}
	})

	t.Run("memory.total zero signals fallback needed", func(t *testing.T) {
		body := []byte(`{"data":{"cpu":0.5,"memory":{"used":0,"total":0}}}`)
		_, _, ok := proxmoxParseNodeStatus(body, 4)
		if ok {
			t.Error("expected ok=false when memory.total is 0 (no permission / empty response)")
		}
	})

	t.Run("short body signals fallback needed", func(t *testing.T) {
		_, _, ok := proxmoxParseNodeStatus([]byte(`{}`), 4)
		if ok {
			t.Error("expected ok=false for a too-short body")
		}
	})
}

func TestProxmoxParseClusterResources(t *testing.T) {
	body := []byte(`{"data":[
		{"node":"pve1","cpu":0.25,"maxcpu":4,"mem":4294967296,"maxmem":8589934592},
		{"node":"pve2","cpu":0.75,"maxcpu":8,"mem":1,"maxmem":0}
	]}`)

	cpu, mem, ok := proxmoxParseClusterResources(body, "pve1")
	if !ok {
		t.Fatal("expected ok=true for matching node")
	}
	if cpu.Used != 25 || cpu.Label != "25% · 4 cores" {
		t.Errorf("unexpected cpu: %+v", cpu)
	}
	if mem.Used < 49.9 || mem.Used > 50.1 {
		t.Errorf("expected ~50%% mem, got %v", mem.Used)
	}

	t.Run("node present but maxmem zero is treated as no data", func(t *testing.T) {
		_, _, ok := proxmoxParseClusterResources(body, "pve2")
		if ok {
			t.Error("expected ok=false for maxmem=0 entry")
		}
	})

	t.Run("node not found", func(t *testing.T) {
		_, _, ok := proxmoxParseClusterResources(body, "pve99")
		if ok {
			t.Error("expected ok=false for absent node")
		}
	})
}

func TestProxmoxParseStorage(t *testing.T) {
	body := []byte(`{"data":[
		{"storage":"local", "used":10737418240, "total":107374182400, "active":1, "enabled":1},
		{"storage":"disabled-store", "used":0, "total":100, "active":0, "enabled":0},
		{"storage":"zero-total", "used":0, "total":0, "active":1, "enabled":1}
	]}`)
	storage := proxmoxParseStorage(body)
	if len(storage) != 1 {
		t.Fatalf("expected 1 storage (disabled/zero-total excluded), got %d: %+v", len(storage), storage)
	}
	if storage[0].Name != "local" {
		t.Errorf("unexpected storage: %+v", storage[0])
	}
	if storage[0].Percent < 9.9 || storage[0].Percent > 10.1 {
		t.Errorf("expected ~10%% usage, got %v", storage[0].Percent)
	}
	if !storage[0].Active {
		t.Error("expected Active=true")
	}
}

func TestProxmoxApplyRRD(t *testing.T) {
	t.Run("uses last non-null data point, not the last array element", func(t *testing.T) {
		data := &ProxmoxPanelData{}
		body := []byte(`{"data":[
			{"cpu": 0.1, "netin": 1000.0, "netout": 500.0, "loadavg": 0.5, "iowait": 0.02, "pressurecpusome": 1.5, "pressurememorysome": 2.5, "pressureiosome": 0.5, "temp_cpu0": 45.5},
			{"cpu": null, "netin": null}
		]}`)
		proxmoxApplyRRD(data, body)
		if data.NetIn != 1000.0 || data.NetOut != 500.0 {
			t.Errorf("expected values from the last non-null point, got netIn=%v netOut=%v", data.NetIn, data.NetOut)
		}
		if data.LoadAvg != 0.5 {
			t.Errorf("loadAvg = %v, want 0.5", data.LoadAvg)
		}
		if data.IOWait != 2 {
			t.Errorf("expected iowait scaled to percent (0.02 -> 2), got %v", data.IOWait)
		}
		if len(data.Temps) != 1 || data.Temps[0].Name != "temp_cpu0" || data.Temps[0].TempC != 45.5 {
			t.Errorf("expected 1 temp sensor detected by substring match, got %+v", data.Temps)
		}
	})

	t.Run("zero temperature readings are dropped as no-sensor, not 0C", func(t *testing.T) {
		data := &ProxmoxPanelData{}
		body := []byte(`{"data":[{"cpu": 0.1, "temp_nvme": 0}]}`)
		proxmoxApplyRRD(data, body)
		if len(data.Temps) != 0 {
			t.Errorf("expected 0C readings filtered out, got %+v", data.Temps)
		}
	})

	t.Run("all-null data leaves data untouched", func(t *testing.T) {
		data := &ProxmoxPanelData{NetIn: 42}
		body := []byte(`{"data":[{"cpu": null}]}`)
		proxmoxApplyRRD(data, body)
		if data.NetIn != 42 {
			t.Errorf("expected data untouched when no data point has cpu != null, got NetIn=%v", data.NetIn)
		}
	})
}

func TestProxmoxParseVMList(t *testing.T) {
	body := []byte(`{"data":[
		{"vmid":100,"name":"vm1","status":"running","cpu":0.05,"mem":536870912,"maxmem":1073741824,"uptime":3600},
		{"vmid":101,"name":"vm2","status":"stopped","cpu":0,"mem":0,"maxmem":0,"uptime":0}
	]}`)
	vms := proxmoxParseVMList(body, "qemu")
	if len(vms) != 2 {
		t.Fatalf("expected 2 vms, got %d", len(vms))
	}
	if vms[0].Type != "qemu" {
		t.Errorf("expected type passed through, got %q", vms[0].Type)
	}
	if vms[0].CPU != 5 {
		t.Errorf("expected CPU scaled to percent (0.05 -> 5), got %v", vms[0].CPU)
	}
	if vms[0].MemPct < 49.9 || vms[0].MemPct > 50.1 {
		t.Errorf("expected ~50%% mem, got %v", vms[0].MemPct)
	}
	// maxmem=0 must not divide by zero
	if vms[1].MemPct != 0 {
		t.Errorf("expected 0%% mem for maxmem=0 vm, got %v", vms[1].MemPct)
	}
}

func TestProxmoxSortRunningFirst(t *testing.T) {
	vms := []ProxmoxVM{
		{ID: 1, Status: "stopped"},
		{ID: 2, Status: "running"},
		{ID: 3, Status: "stopped"},
		{ID: 4, Status: "running"},
	}
	sorted := proxmoxSortRunningFirst(vms)
	if len(sorted) != 4 {
		t.Fatalf("expected 4 vms, got %d", len(sorted))
	}
	// Running first, relative order preserved within each group (stable).
	want := []int{2, 4, 1, 3}
	for i, id := range want {
		if sorted[i].ID != id {
			t.Errorf("position %d: got ID=%d, want %d (order: %+v)", i, sorted[i].ID, id, sorted)
			break
		}
	}
}
