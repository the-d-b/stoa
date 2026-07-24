package handlers

import "testing"

func TestProxmoxParseFastStatus(t *testing.T) {
	body := []byte(`{"data":{"cpu":0.33,"maxcpu":4,"memory":{"used":4294967296,"total":8589934592},"netin":1000000,"netout":500000}}`)
	cpuPct, memPct, netIn, netOut, err := proxmoxParseFastStatus(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cpuPct != 33 {
		t.Errorf("cpuPct = %v, want 33", cpuPct)
	}
	if memPct < 49.9 || memPct > 50.1 {
		t.Errorf("memPct = %v, want ~50", memPct)
	}
	if netIn != 8 || netOut != 4 {
		t.Errorf("expected 8/4 Mbps (bytes*8/1e6), got in=%v out=%v", netIn, netOut)
	}
}

func TestProxmoxParseFastStatus_ZeroMemTotal(t *testing.T) {
	body := []byte(`{"data":{"cpu":0.1,"memory":{"used":0,"total":0},"netin":0,"netout":0}}`)
	_, memPct, _, _, err := proxmoxParseFastStatus(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if memPct != 0 {
		t.Errorf("expected memPct=0 (not NaN/Inf) when total=0, got %v", memPct)
	}
}

func TestProxmoxParseFastStatus_MalformedJSON(t *testing.T) {
	if _, _, _, _, err := proxmoxParseFastStatus([]byte("not json")); err == nil {
		t.Error("expected error for malformed JSON")
	}
}
