# Lychee

**Category:** Photos & Libraries | **Status:** Need Testing | **Polling:** 30 min

---

## Integration

**Secret format:** username:password

> Your Lychee login credentials. Format: admin:yourpassword

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. Format secret as username:password
2. Admin -> Secrets -> New: paste the formatted credential
3. Admin -> Integrations -> New: type Lychee, URL, secret
4. Admin -> Panels -> New: type Lychee

---

## Panel

Photo count, album count, storage usage, user count, and a photo preview carousel.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Photo/album counts |
| 2-3x | Stat chips + preview thumbnails |
| 4x+ | Full stats + preview carousel |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*