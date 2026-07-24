package handlers

import "testing"

// ── Traffic stream ────────────────────────────────────────────────────────

func TestOpnsenseApplyTraffic(t *testing.T) {
	evt := opnsenseTrafficEvent{
		Interfaces: map[string]struct {
			InBytes  int64  `json:"inbytes"`
			OutBytes int64  `json:"outbytes"`
			Name     string `json:"name"`
		}{
			"igb0": {InBytes: 125000, OutBytes: 62500, Name: "WAN"}, // 1 Mbps in, 0.5 Mbps out
			"igb1": {InBytes: 0, OutBytes: 0, Name: "LAN"},          // idle — dropped
			"igb2": {InBytes: -100, OutBytes: 500, Name: ""},        // negative delta clamps to 0; empty name falls back to uppercased id
		},
	}
	prev := OPNsensePanelData{Interfaces: []OPNsenseInterface{{Device: "stale", Name: "Stale"}}}

	got := opnsenseApplyTraffic(prev, evt)

	// igb1 (idle) must not appear at all.
	if len(got.Interfaces) != 2 {
		t.Fatalf("expected 2 interfaces (idle one dropped), got %d: %+v", len(got.Interfaces), got.Interfaces)
	}
	// Sorted by device name: igb0 before igb2.
	if got.Interfaces[0].Device != "igb0" || got.Interfaces[1].Device != "igb2" {
		t.Errorf("expected sorted by device, got %+v", got.Interfaces)
	}
	if got.Interfaces[0].Name != "WAN" {
		t.Errorf("expected iface Name to pass through, got %q", got.Interfaces[0].Name)
	}
	if got.Interfaces[0].InMbps != 1 || got.Interfaces[0].OutMbps != 0.5 {
		t.Errorf("expected 1/0.5 Mbps, got in=%v out=%v", got.Interfaces[0].InMbps, got.Interfaces[0].OutMbps)
	}
	if got.Interfaces[1].Name != "IGB2" {
		t.Errorf("expected empty Name to fall back to uppercased device id, got %q", got.Interfaces[1].Name)
	}
	if got.Interfaces[1].InMbps != 0 {
		t.Errorf("expected negative delta clamped to 0, got %v", got.Interfaces[1].InMbps)
	}
}

// ── Firewall event accumulation ──────────────────────────────────────────

func TestOpnsenseFWEventKey(t *testing.T) {
	labeled := opnsenseFWEvent{Action: "block", Label: "Default deny"}
	if got := opnsenseFWEventKey(labeled); got != "block|Default deny" {
		t.Errorf("labeled key = %q, want %q", got, "block|Default deny")
	}

	unlabeled := opnsenseFWEvent{Action: "pass", Label: "", RuleNr: "12345"}
	if got := opnsenseFWEventKey(unlabeled); got != "pass|rule-12345" {
		t.Errorf("unlabeled key = %q, want %q", got, "pass|rule-12345")
	}
}

func TestOpnsenseBuildFWEvents(t *testing.T) {
	counts := map[string]int{
		"block|Default deny": 42,
		"pass|rule-12345":    3,
	}
	events := opnsenseBuildFWEvents(counts)
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
	byAction := map[string]OPNsenseFWEvent{}
	for _, e := range events {
		byAction[e.Action] = e
	}
	if byAction["block"].Label != "Default deny" || byAction["block"].Count != 42 {
		t.Errorf("unexpected block event: %+v", byAction["block"])
	}
	if byAction["pass"].Label != "rule-12345" || byAction["pass"].Count != 3 {
		t.Errorf("unexpected pass event (rule-number fallback should land in Label): %+v", byAction["pass"])
	}
}

// ── Shared response parsers ──────────────────────────────────────────────

func TestOpnsenseParseFirmwareStatus(t *testing.T) {
	version, updateAvail := opnsenseParseFirmwareStatus([]byte(`{"status":"update","product_version":"24.7.10"}`))
	if version != "24.7.10" || !updateAvail {
		t.Errorf("version=%q updateAvail=%v, want 24.7.10/true", version, updateAvail)
	}

	version, updateAvail = opnsenseParseFirmwareStatus([]byte(`{"status":"none","product_version":"24.7.10"}`))
	if updateAvail {
		t.Errorf("expected updateAvail=false for status=none, got true")
	}
}

func TestOpnsenseParseGateways(t *testing.T) {
	body := []byte(`{"items": [
		{"name": "WAN_DHCP", "status_translated": "Online", "delay": "12.3 ms", "loss": "0.0 %", "address": "203.0.113.1"},
		{"name": "VPN_GW", "status_translated": "Offline", "delay": "~", "loss": "~", "address": "198.51.100.1"},
		{"name": "Disabled group", "status_translated": "none", "delay": "~", "loss": "~", "address": "~"},
		{"name": "Empty address", "status_translated": "none", "delay": "~", "loss": "~", "address": ""}
	]}`)
	gws := opnsenseParseGateways(body)
	// The "~"-address and empty-address entries are placeholder groups, not real gateways.
	if len(gws) != 2 {
		t.Fatalf("expected 2 real gateways, got %d: %+v", len(gws), gws)
	}
	if gws[0].Status != "online" {
		t.Errorf("expected online status, got %q", gws[0].Status)
	}
	if gws[1].Status != "offline" {
		t.Errorf("expected offline status, got %q", gws[1].Status)
	}
	if gws[1].RTT != "" || gws[1].Loss != "" {
		t.Errorf("expected '~' RTT/Loss normalized to empty, got RTT=%q Loss=%q", gws[1].RTT, gws[1].Loss)
	}
}

func TestOpnsenseParseInterfacesInfo(t *testing.T) {
	body := []byte(`{"rows": [
		{"identifier": "igb0", "description": "WAN", "enabled": true, "addr4": "203.0.113.5/24"},
		{"identifier": "igb1", "description": "LAN", "enabled": false, "addr4": "192.168.1.1/24"},
		{"identifier": "lo0", "description": "Loopback", "enabled": true, "addr4": "127.0.0.1/8"},
		{"identifier": "", "description": "No id", "enabled": true, "addr4": "0.0.0.0/0"}
	]}`)
	ifaces := opnsenseParseInterfacesInfo(body)
	// Disabled, loopback, and no-identifier rows are all excluded.
	if len(ifaces) != 1 {
		t.Fatalf("expected 1 interface, got %d: %+v", len(ifaces), ifaces)
	}
	wan, ok := ifaces["igb0"]
	if !ok {
		t.Fatalf("missing igb0, got %+v", ifaces)
	}
	if wan.Name != "WAN" || wan.Addr != "203.0.113.5" {
		t.Errorf("expected CIDR suffix stripped, got %+v", wan)
	}
}

func TestOpnsenseParseDNSStats(t *testing.T) {
	body := []byte(`{"data":{"total":{"num":{"queries":"15234","cachehits":"9821","cachemiss":"5413"}}}}`)
	queries, hits, miss := opnsenseParseDNSStats(body)
	if queries != 15234 || hits != 9821 || miss != 5413 {
		t.Errorf("got queries=%d hits=%d miss=%d, want 15234/9821/5413", queries, hits, miss)
	}
}

func TestOpnsenseParsePFStates(t *testing.T) {
	if got := opnsenseParsePFStates([]byte(`{"current":"4821"}`)); got != 4821 {
		t.Errorf("got %d, want 4821", got)
	}
}

func TestOpnsenseParseTopTalkers(t *testing.T) {
	body := []byte(`{"wan": {"records": [
		{"rate_bits_in": 5000000, "rate_bits_out": 1000000, "rname": "host1.example.com.", "address": "192.168.1.10"},
		{"rate_bits_in": 2000000, "rate_bits_out": 500000, "rname": "", "address": "192.168.1.11"},
		{"rate_bits_in": 1000000, "rate_bits_out": 100000, "rname": "host3.example.com.", "address": "192.168.1.12"},
		{"rate_bits_in": 900000, "rate_bits_out": 90000, "rname": "host4.", "address": "192.168.1.13"},
		{"rate_bits_in": 800000, "rate_bits_out": 80000, "rname": "host5.", "address": "192.168.1.14"},
		{"rate_bits_in": 700000, "rate_bits_out": 70000, "rname": "host6.", "address": "192.168.1.15"}
	]}}`)
	talkers := opnsenseParseTopTalkers(body, "wan", 5)
	if len(talkers) != 5 {
		t.Fatalf("expected limit of 5, got %d", len(talkers))
	}
	if talkers[0].Host != "host1.example.com" {
		t.Errorf("expected trailing dot trimmed, got %q", talkers[0].Host)
	}
	if talkers[1].Host != "192.168.1.11" {
		t.Errorf("expected empty rname to fall back to address, got %q", talkers[1].Host)
	}
	if talkers[0].InMbps != 5 || talkers[0].OutMbps != 1 {
		t.Errorf("expected 5/1 Mbps, got in=%v out=%v", talkers[0].InMbps, talkers[0].OutMbps)
	}

	t.Run("unknown interface key yields nil", func(t *testing.T) {
		if got := opnsenseParseTopTalkers(body, "lan", 5); got != nil {
			t.Errorf("expected nil for absent interface key, got %v", got)
		}
	})
}

// ── Batch apply (worker slow loop) ───────────────────────────────────────

func TestOpnsenseApplySlowResults(t *testing.T) {
	data := &OPNsensePanelData{
		Interfaces: []OPNsenseInterface{{Device: "igb0", Name: "WAN"}},
	}
	results := map[string][]byte{
		"firmware_status": []byte(`{"status":"update","product_version":"24.7.10"}`),
		"gateways":        []byte(`{"items":[{"name":"WAN_DHCP","status_translated":"Online","delay":"1 ms","loss":"0%","address":"1.2.3.4"}]}`),
		"interfaces_info": []byte(`{"rows":[{"identifier":"igb0","enabled":true,"addr4":"203.0.113.5/24"}]}`),
		"dns":             []byte(`{"data":{"total":{"num":{"queries":"100","cachehits":"50","cachemiss":"50"}}}}`),
		"pf":              []byte(`{"current":"123"}`),
		"top_talkers":     []byte(`{"wan":{"records":[{"rate_bits_in":1000000,"rate_bits_out":500000,"rname":"","address":"1.2.3.4"}]}}`),
	}

	opnsenseApplySlowResults(data, results)

	if data.Version != "24.7.10" || !data.UpdateAvail {
		t.Errorf("firmware fields wrong: version=%q updateAvail=%v", data.Version, data.UpdateAvail)
	}
	if len(data.Gateways) != 1 {
		t.Errorf("expected 1 gateway, got %d", len(data.Gateways))
	}
	// interfaces_info enriches the EXISTING igb0 entry in place (IPAddr/Status),
	// it does not append new interface rows — that only happens on the traffic tick.
	if len(data.Interfaces) != 1 || data.Interfaces[0].IPAddr != "203.0.113.5" || data.Interfaces[0].Status != "up" {
		t.Errorf("expected existing interface enriched with addr/status, got %+v", data.Interfaces)
	}
	if data.DNSQueries != 100 || data.PFStates != 123 {
		t.Errorf("dns/pf fields wrong: %+v", data)
	}
	if len(data.TopTalkers) != 1 {
		t.Errorf("expected 1 top talker, got %d", len(data.TopTalkers))
	}
}
