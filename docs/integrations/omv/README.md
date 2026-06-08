# OpenMediaVault

**Category:** Storage | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** username:password

> Your OMV WebUI login. Format: admin:yourpassword

**URL required:** Required

**Example URL:** `http://192.168.1.10`

### Setup

1. Format secret as admin:yourpassword
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type OpenMediaVault, URL, secret
4. Admin -> Panels -> New: type OpenMediaVault

---

## Panel

CPU usage, memory usage, per-interface network throughput, filesystem usage, disk temperatures and SMART status.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Compact stats only |
| 2-3x | Network + filesystem rows |
| 4x+ | Full disk table + all stats |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*