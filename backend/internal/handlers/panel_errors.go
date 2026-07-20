package handlers

import (
	"fmt"
	"strings"
)

// friendlyPanelError translates raw Go network / HTTP errors into human-readable
// panel error messages. Called by GetPanelData before writing the error response.
func friendlyPanelError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()

	// Integration config problems — keep these terse
	switch msg {
	case "no integration configured":
		return "No integration selected — edit this panel to choose an integration"
	case "integration not found":
		return "Integration not found — check Admin → Integrations"
	case "integration disabled":
		return "Integration disabled — re-enable it in Admin → Integrations or Profile → My Integrations"
	}

	// TLS / certificate errors
	if containsAny(msg, "certificate", "x509", "tls: ", "TLS") {
		return "TLS/certificate error — enable Skip TLS in integration settings"
	}

	// Connection refused (service not running or wrong port)
	if containsAny(msg, "connection refused", "actively refused") {
		if host := hostPortFromNetError(msg); host != "" {
			return fmt.Sprintf("Connection refused (%s) — is the service running on the right port?", host)
		}
		return "Connection refused — check host and port in integration settings"
	}

	// DNS / hostname not found
	if containsAny(msg, "no such host", "name does not resolve", "does not exist", "NXDOMAIN") {
		return "Host not found — check the URL in integration settings"
	}

	// Timeouts
	if containsAny(msg, "deadline exceeded", "Client.Timeout", "i/o timeout", "timed out") {
		return "Connection timed out — is the service reachable from Stoa?"
	}

	// Routing / firewall
	if strings.Contains(msg, "no route to host") {
		return "No route to host — check network or firewall settings"
	}
	if strings.Contains(msg, "network is unreachable") {
		return "Network unreachable — check Stoa's network configuration"
	}

	// HTTP status codes (as returned by arrGet / similar helpers)
	if strings.Contains(msg, "HTTP 401") {
		return "Unauthorized (401) — check the API key in integration settings"
	}
	if strings.Contains(msg, "HTTP 403") {
		return "Forbidden (403) — API key may lack required permissions"
	}
	if strings.Contains(msg, "HTTP 404") {
		return "Not found (404) — verify the URL and integration type"
	}
	if strings.Contains(msg, "HTTP 500") {
		return "Service error (500) — the remote service encountered an internal error"
	}
	if strings.Contains(msg, "HTTP 502") {
		return "Bad gateway (502) — check if the service is healthy"
	}
	if strings.Contains(msg, "HTTP 503") {
		return "Service unavailable (503) — the remote service is down or overloaded"
	}

	// Strip verbose Go URL-wrapper prefix: Get "http://...": <actual error>
	// This leaves the underlying net error without the noisy quoted URL prefix.
	if idx := strings.Index(msg, `": `); idx != -1 {
		tail := msg[idx+3:]
		if containsAny(tail, "dial", "connect", "lookup", "EOF") {
			msg = tail
		}
	}

	return msg
}

func containsAny(s string, substrs ...string) bool {
	for _, sub := range substrs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

// hostPortFromNetError extracts "host:port" from Go dial error strings.
// e.g. "dial tcp 192.168.1.10:8989: connect: connection refused" → "192.168.1.10:8989"
func hostPortFromNetError(msg string) string {
	fields := strings.Fields(msg)
	for i, f := range fields {
		if f == "tcp" && i+1 < len(fields) {
			candidate := strings.TrimRight(fields[i+1], ":")
			if strings.Contains(candidate, ":") {
				return candidate
			}
		}
	}
	return ""
}
