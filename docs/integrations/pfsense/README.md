---
id: pfsense
name: pfSense
category: Network & Security
tags: [firewall, router, vpn, self-hosted]
official_url: https://www.pfsense.org
status: needs-testing
polling: 5s
secret_format: username-password
url_required: true
example_url: https://192.168.1.1
---

# pfSense

## What is pfSense?

pfSense is an open-source, FreeBSD-based firewall and router platform. It provides stateful firewalling, VPNs (OpenVPN, IPsec, WireGuard), traffic shaping, and a large package ecosystem through a web UI — one of the most widely deployed open-source perimeter firewalls.

**Official site:** [pfsense.org](https://www.pfsense.org)

---

## Getting the key

Install the **pfSense-pkg-API** package (System → Package Manager), then use your pfSense WebUI login in `username:password` form.

- **Secret format:** `username:password` — requires the pfSense-pkg-API package
- **URL:** required, HTTPS — e.g. `https://192.168.1.1`

---

## Add it to Stoa

1. Install **pfSense-pkg-API** from pfSense → System → Package Manager.
2. **Admin → Secrets → New** — paste `admin:yourpassword`.
3. **Admin → Integrations → New** — select **pfSense**, enter the URL, choose the secret. Enable **Skip TLS verify** for the self-signed certificate.
4. **Admin → Panels → New** — select **pfSense**.

---

## Panel

CPU and memory usage, uptime, version, interface traffic rates (Mbps deltas), gateway status with RTT and packet loss, firewall connection state count.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Compact status bar |
| 2-3x | CPU/RAM bars + gateways + interfaces |
| 4x+ | All + PF states fill bar |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Requires the pfSense-pkg-API community package. Enable Skip TLS verify if using the pfSense default self-signed certificate.
