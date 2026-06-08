# UniFi

**Category:** Networking | **Status:** Need Testing | **Polling:** 30 s (WebSocket events)

---

## Integration

**Secret format:** Plain API key (v9.3.43+) or username:password (legacy)

> UniFi v9.3.43+: Settings -> Control Plane -> Integrations -> API Keys -> Create. Older: your UniFi Network Application login.

**URL required:** Required

**Example URL:** `https://192.168.1.10`

### Setup

1. v9.3.43+: Settings -> Control Plane -> Integrations -> API Keys -> create key
2. Older: use username:password of an admin account
3. Admin -> Secrets -> New: paste the credential
4. Admin -> Integrations -> New: type UniFi, URL = https://unifi-controller, secret

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