# Steam

**Category:** Gaming | **Status:** Tested | **Polling:** 5 min

---

## Integration

**Secret format:** Steam Web API key

> Register a free key at https://steamcommunity.com/dev/apikey. Also need your Steam ID64 configured in integration settings.

**URL required:** None (Steam API)

### Setup

1. Register Steam Web API key at steamcommunity.com/dev/apikey
2. Find your Steam ID64 (from your profile URL or steamid.io)
3. Admin -> Secrets -> New: paste the API key
4. Admin -> Integrations -> New: type Steam, no URL, secret = API key (Steam ID64 entered in integration config)

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