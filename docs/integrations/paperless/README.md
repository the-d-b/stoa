# Paperless-ngx

**Category:** Documents | **Status:** Need Testing | **Polling:** 5 min

---

## Integration

**Secret format:** API token

> Paperless-ngx -> Settings -> API -> Generate Token

**URL required:** Required

**Example URL:** `http://192.168.1.10:8000`

### Setup

1. Paperless-ngx -> Settings -> API -> Generate Token
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Paperless-ngx, URL = http://paperless:8000, secret
4. Admin -> Panels -> New: type Paperless-ngx

---

## Panel

Total document count, inbox count, document type breakdown (donut chart), tag proportional bars in each tag's own color, correspondent breakdown, and a recent document list with direct links.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total docs + inbox count + correspondent count + tag count |
| 2-3x | Stat chips + recent document list |
| 4x+ | Left: stats + doc type donut + tag bars + correspondent bars | Right: recent document list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Recent document links open directly in the Paperless UI.