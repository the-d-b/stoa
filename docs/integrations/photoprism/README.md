# PhotoPrism

**Category:** Photos & Libraries | **Status:** Tested | **Polling:** 30 min

---

## Integration

**Secret format:** username:password

> Your PhotoPrism login credentials. Format: admin:yourpassword

**URL required:** Required

**Example URL:** `http://192.168.1.10:2342`

### Setup

1. Format secret as username:password (e.g. admin:mypassword)
2. Admin -> Secrets -> New: paste the formatted credential
3. Admin -> Integrations -> New: type PhotoPrism, URL, secret
4. Admin -> Panels -> New: type PhotoPrism

---

## Panel

Photo and video counts, library size, recent imports, indexing status. Photo preview carousel (random thumbnails, refreshed daily).

### Height behavior

| Height | What you see |
|---|---|
| 1x | Photo/video counts + library size |
| 2-3x | Stat chips + preview thumbnails |
| 4x+ | Full stats + large preview carousel |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*