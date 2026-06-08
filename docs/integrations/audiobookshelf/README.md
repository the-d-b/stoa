# Audiobookshelf

**Category:** Photos & Libraries | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** username:password or plain API key

> Your ABS login, or get a token from ABS -> Settings -> Users -> your user -> API Token.

**URL required:** Required

**Example URL:** `http://192.168.1.10:13378`

### Setup

1. ABS -> Settings -> Users -> your user -> copy API Token (or use username:password)
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type Audiobookshelf, URL, secret
4. Admin -> Panels -> New: type Audiobookshelf

---

## Panel

In-progress audiobooks and podcasts with a mini audio player. Select any in-progress item to play directly from the dashboard with seek controls and progress sync.

### Height behavior

| Height | What you see |
|---|---|
| 1x | In-progress count + currently playing |
| 2-3x | In-progress list |
| 4x+ | Full player with controls + seek bar |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Playback controls proxy through the Stoa backend - credentials stay on the server.