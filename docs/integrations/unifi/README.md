---
id: unifi
name: UniFi
category: Network & Security
tags: [network, wifi]
official_url: https://ui.com
status: needs-testing
polling: 30s
secret_format: api-key
url_required: true
example_url: https://192.168.1.10
---

# UniFi

## What is UniFi?

Ubiquiti UniFi is a networking platform managed by the UniFi Network Application (controller). It centrally configures and monitors UniFi access points, switches, and gateways — clients, WiFi, WAN health, and events — across your whole network from one console.

**Official site:** [ui.com](https://ui.com)

---

## Getting the key

On UniFi v9.3.43+: **Settings → Control Plane → Integrations → API Keys → Create**. On older versions, use the `username:password` of an admin account.

- **Secret format:** plain API key (v9.3.43+) or `username:password` (legacy)
- **URL:** required, HTTPS — e.g. `https://192.168.1.10`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the API key (or `username:password`).
2. **Admin → Integrations → New** — select **UniFi**, enter the URL, choose the secret. Enable **Skip TLS verify** for the self-signed certificate.
3. **Admin → Panels → New** — select **UniFi**.

---

## Panel

Device inventory (APs, switches, gateways with online/offline), connected client list, WAN status, real-time event log. WebSocket connection for instant updates.

### Height behavior

| Height | What you see |
|---|---|
| 1x | WAN status + device count + client count |
| 2-3x | Device type badges + WAN IP + speedtest + recent events |
| 4x+ | Full device list with radio/port/WAN detail + client list + event log |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Enable Skip TLS verify for the self-signed UniFi certificate.
