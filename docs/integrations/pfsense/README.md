# pfSense

**Category:** Networking | **Status:** Need Testing | **Polling:** 5 s

---

## Integration

**Secret format:** username:password

> Your pfSense WebUI login. Requires the pfSense-pkg-API package to be installed.

**URL required:** Required

**Example URL:** `https://192.168.1.1`

### Setup

1. Install pfSense-pkg-API from pfSense -> System -> Package Manager
2. Format secret as admin:yourpassword
3. Admin -> Secrets -> New: paste the credential
4. Admin -> Integrations -> New: type pfSense, URL = https://pfsense-ip, secret

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