# Synology DSM

**Category:** Storage | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** username:password

> Your Synology DSM login. Format: admin:yourpassword

**URL required:** Required

**Example URL:** `http://192.168.1.10:5000`

### Setup

1. Format secret as admin:yourpassword (use a dedicated account if possible)
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type Synology, URL = http://nas-ip:5000, secret
4. Admin -> Panels -> New: type Synology

---

## Panel

CPU, memory, network, volume health, disk temperatures and SMART status, shared folder list. Shows hostname, model, DSM version, and uptime.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Compact arcs only |
| 2-3x | Network + volume rows + disk temperatures + shares |
| 4x+ | Full disk table + per-interface network breakdown |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Degraded volumes show an amber warning badge in the panel header at any height.