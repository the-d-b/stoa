# Jellyfin

**Category:** Media Servers | **Status:** Tested | **Polling:** 60 s

---

## Integration

**Secret format:** Plain API key

> Jellyfin -> Administration -> Dashboard -> API Keys -> + button

**URL required:** Required

**Example URL:** `http://192.168.1.10:8096`

### Setup

1. Jellyfin -> Administration -> Dashboard -> API Keys -> create a key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Jellyfin, URL, secret
4. Admin -> Panels -> New: type Jellyfin

---

## Panel

Active streams with user, title, progress, and transcode vs. direct play status. Library counts. Server name and version.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Stream count + currently playing title |
| 2-3x | Stream list + library counts |
| 4x+ | Full stream detail with transcode status + library breakdown |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*