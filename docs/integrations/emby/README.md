# Emby

**Category:** Media Servers | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** Plain API key

> Emby -> Settings -> Advanced -> API Keys

**URL required:** Required

**Example URL:** `http://192.168.1.10:8096`

### Setup

1. Emby -> Settings -> Advanced -> API Keys -> + New Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Emby, URL, secret
4. Admin -> Panels -> New: type Emby

---

## Panel

Active streams with user, media title, and progress. Library counts by type. Server version.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Stream count + playing title |
| 2-3x | Stream list + library counts |
| 4x+ | Full stream detail + library breakdown |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*