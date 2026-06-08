# Tautulli

**Category:** Media Servers | **Status:** Tested | **Polling:** 60 s

---

## Integration

**Secret format:** Plain API key

> Tautulli -> Settings -> Web Interface -> API Key

**URL required:** Required

**Example URL:** `http://192.168.1.10:8181`

### Setup

1. Tautulli -> Settings -> Web Interface -> copy API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Tautulli, URL, secret
4. Admin -> Panels -> New: type Tautulli

---

## Panel

Current streams, most played content, recently played history, user statistics.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Active stream count + currently playing |
| 2-3x | Stream list + recently played |
| 4x+ | Full stats + history + top users |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Requires Plex to be running and connected.