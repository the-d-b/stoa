# TrueNAS

**Category:** Storage | **Status:** Tested | **Polling:** 30 s (WebSocket)

---

## Integration

**Secret format:** Plain API key

> TrueNAS -> Credentials -> API Keys -> Add

**URL required:** Required

**Example URL:** `http://192.168.1.10`

### Setup

1. TrueNAS -> Credentials -> API Keys -> Add -> copy the key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type TrueNAS, URL = http://truenas-ip, secret = key
4. Admin -> Panels -> New: type TrueNAS

---

## Panel

CPU, RAM, ARC, disk I/O, network throughput, pool health, disk temperatures, alerts, VMs, apps. Uses a persistent WebSocket connection - data updates every ~2 seconds.

### Height behavior

| Height | What you see |
|---|---|
| 1x | CPU/RAM/pool summary |
| 2-3x | Host stats + network + pool health |
| 4x+ | Full stats + disk temperatures + VM/app counts |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Works with both TrueNAS SCALE and TrueNAS CORE. WebSocket connection provides ~2s live updates.