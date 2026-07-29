---
id: sports
name: Sports
category: Online Content
tags: [sports, built-in]
official_url: https://www.espn.com
status: tested
polling: 5min
secret_format: none
url_required: false
---

# Sports

## What is Sports?

Sports is a built-in Stoa feature — not a self-hosted app you deploy — showing scores, standings, and schedules for NHL, NFL, NBA, and MLB, sourced from ESPN's public API. No key is needed; you pick which leagues to show per panel.

**Data source:** [espn.com](https://www.espn.com)

---

## Getting the key

None — ESPN's public API requires no credentials.

- **Secret format:** none
- **URL:** none (ESPN public API)

---

## Add it to Stoa

1. **Admin → Integrations → New** — select **Sports**, no URL, no secret.
2. **Admin → Panels → New** — select **Sports**, and select the leagues to display in the panel config.

---

## Panel

Scores, standings, and schedules for NHL, NFL, NBA, and MLB from ESPN's public API.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Live game scores + standing summary |
| 2-3x | Scores + standings by division |
| 4x+ | Full scores + standings + schedule |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Configure which leagues (NHL, NFL, NBA, MLB) to display in the panel config.
