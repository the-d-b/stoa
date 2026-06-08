# Readarr

**Category:** Media Management | **Status:** Tested | **Polling:** 30 min

---

## Integration

**Secret format:** Plain API key

> Readarr -> Settings -> General -> Security -> API Key

**URL required:** Required

**Example URL:** `http://192.168.1.10:8787`

### Setup

1. Readarr -> Settings -> General -> copy the API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Readarr, URL, secret
4. Admin -> Panels -> New: type Readarr

---

## Panel

Upcoming book and audiobook releases, recently added titles, missing books, book and author counts.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Upcoming releases + missing count |
| 2-3x | Queue list + recent titles |
| 4x+ | Full schedule + library stats |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

**Calendar:** Readarr release dates appear on the Calendar panel.