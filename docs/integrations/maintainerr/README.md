# Maintainerr

**Category:** Media Management | **Status:** Need Testing | **Polling:** 5 min

---

## Integration

**Secret format:** Blank (no auth) or Bearer token

> Most Maintainerr instances run without auth. If you added an API key, paste it here.

**URL required:** Required

**Example URL:** `http://192.168.1.10:6246`

### Setup

1. Admin -> Secrets -> New: blank or token
2. Admin -> Integrations -> New: type Maintainerr, URL, secret
3. Admin -> Panels -> New: type Maintainerr

---

## Panel

Active collections, total media in scope, and per-collection detail (type, delete-after window, arr action, media count).

### Height behavior

| Height | What you see |
|---|---|
| 1x | Active collections + total media count |
| 2-3x | Stat chips + collection list |
| 4x+ | Full collection table with type badges and action detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*