# Unraid

**Category:** Storage | **Status:** Need Testing | **Polling:** 30 s (WebSocket)

---

## Integration

**Secret format:** username:password

> Your Unraid WebUI login. Format: root:yourpassword

**URL required:** Required

**Example URL:** `http://192.168.1.10`

### Setup

1. Format secret as root:yourpassword (or your admin user)
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type Unraid, URL, secret
4. Admin -> Panels -> New: type Unraid

---

## Panel

CPU usage (per-core and aggregate), memory usage, network throughput, array disk temperatures, running VMs and Docker containers. Uses a persistent WebSocket connection for live data.

### Height behavior

| Height | What you see |
|---|---|
| 1x | CPU/RAM/disk summary |
| 2-3x | Host stats + network |
| 4x+ | All + disk temperatures + container/VM detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*