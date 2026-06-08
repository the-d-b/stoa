# QNAP QTS

**Category:** Storage | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** username:password

> Your QNAP WebUI login. Format: admin:yourpassword

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. Format secret as admin:yourpassword
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type QNAP, URL, secret
4. Admin -> Panels -> New: type QNAP

---

## Panel

CPU, memory, aggregate network, volume health, disk temperatures and SMART status, shared folder list. Shows hostname, model, firmware version, and uptime.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Compact arcs only |
| 2-3x | Disk temperature rows + shares |
| 4x+ | Full disk table with model, size, and SMART detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*