# Bazarr

**Category:** Media Management | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** Plain API key

> Bazarr -> Settings -> General -> Security -> API Key

**URL required:** Required

**Example URL:** `http://192.168.1.10:6767`

### Setup

1. Bazarr -> Settings -> General -> copy API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Bazarr, URL, secret
4. Admin -> Panels -> New: type Bazarr

---

## Panel

Missing subtitle counts for TV and movies, per-provider health, and monthly download volume.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Missing subtitle total + provider issues |
| 2-3x | Missing counts + provider list |
| 4x+ | Provider health + download stats + Sonarr/Radarr status |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*