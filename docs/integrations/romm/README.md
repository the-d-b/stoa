# RomM

**Category:** Gaming | **Status:** Need Testing | **Polling:** 15 min

---

## Integration

**Secret format:** username:password or Bearer token

> Your RomM login, or an API token if configured.

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. Format as username:password or get API token
2. Admin -> Secrets -> New: paste credential
3. Admin -> Integrations -> New: type RomM, URL = http://romm:8080, secret
4. Admin -> Panels -> New: type RomM

---

## Panel

ROM library overview - total platforms, ROMs, and library size, with a per-platform list and a recently-added game cover grid.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total ROMs + platforms + size |
| 2-3x | Platform list + cover grid |
| 4x+ | Platform detail + full cover grid |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*