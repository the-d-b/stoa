# Sports

**Category:** Content | **Status:** Tested | **Polling:** 5 min

---

## Integration

**Secret format:** Blank - no API key needed

> ESPN public API - no credentials required.

**URL required:** None (ESPN public API)

### Setup

1. Admin -> Integrations -> New: type Sports, no URL, no secret
2. Admin -> Panels -> New: type Sports - select the leagues to display in panel config

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