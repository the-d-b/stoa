---
id: steam
name: Steam
category: Gaming
tags: [gaming, cloud]
official_url: https://store.steampowered.com
status: tested
polling: 5min
secret_format: api-key
url_required: false
---

# Steam

## What is Steam?

Steam is Valve's digital game-distribution platform — the largest PC gaming store and library manager. Its Web API exposes your public profile, owned games, playtime, achievements, and online status, which is what Stoa reads to build the panel.

**Official site:** [store.steampowered.com](https://store.steampowered.com)

---

## Getting the key

Register a free Steam Web API key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey). You'll also need your **Steam ID64** (from your profile URL or steamid.io), which is entered in the integration settings.

- **Secret format:** Steam Web API key
- **URL:** none — Stoa calls the Steam API directly. Your Steam ID64 is configured in the integration form.

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the API key.
2. **Admin → Integrations → New** — select **Steam**, no URL needed, choose the secret, and enter your Steam ID64.
3. **Admin → Panels → New** — select **Steam**.

---

## Panel

Player profile (online state, current game), owned game count and total hours, top games by playtime, recently played, recent achievement unlocks, Steam store sales and new releases.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Online state + current game + game count |
| 2-3x | Profile + top games + recently played |
| 4x+ | Full profile + top games + achievements + store highlights |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Steam profile must be public for the API to return game data.
