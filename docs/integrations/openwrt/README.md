# OpenWrt

**Category:** Networking | **Status:** Need Testing | **Polling:** 5 s

---

## Integration

**Secret format:** username:password

> Your OpenWrt login. Default username is root. Format: root:yourpassword

**URL required:** Required

**Example URL:** `http://192.168.1.1`

### Setup

1. Format secret as root:yourpassword
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type OpenWrt, URL = http://router-ip, secret
4. Admin -> Panels -> New: type OpenWrt

---

## Panel

Hostname, uptime, load average, memory usage, per-interface traffic rates (Mbps deltas), and WiFi client list with signal strength and per-client TX/RX rates.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Compact bar |
| 2-3x | Load/memory bars + interface list |
| 4x+ | All + WiFi client list with signal bars |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Uses ubus JSON-RPC. Polls every 5 seconds for live interface stats.