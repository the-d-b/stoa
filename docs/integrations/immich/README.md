# Immich

**Category:** Photos & Libraries | **Status:** Need Testing | **Polling:** 30 min

---

## Integration

**Secret format:** Plain API key

> Immich -> User Settings (top-right avatar) -> API Keys -> New API Key

**URL required:** Required

**Example URL:** `http://192.168.1.10:2283`

### Setup

1. Immich -> top-right avatar -> Account Settings -> API Keys -> create key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Immich, URL, secret
4. Admin -> Panels -> New: type Immich

---

## Panel

Photo and video counts, storage usage, user count, and a photo preview carousel (random thumbnails, refreshed daily).

### Height behavior

| Height | What you see |
|---|---|
| 1x | Photo/video counts + storage used |
| 2-3x | Stat chips + preview thumbnails |
| 4x+ | Full stats + large preview carousel |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*