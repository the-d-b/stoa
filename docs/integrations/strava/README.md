# Strava

**Category:** Health & Fitness | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** clientId:clientSecret

> Strava API settings at strava.com/settings/api -> create an app -> copy Client ID and Client Secret. Format: clientId:clientSecret

**URL required:** None (OAuth - Strava cloud API)

### Setup

1. strava.com/settings/api -> create an app -> copy Client ID and Client Secret
2. Format as clientId:clientSecret
3. Admin -> Secrets -> New: paste the credential
4. Admin -> Integrations -> New: type Strava, no URL, secret = clientId:clientSecret
5. On the integration edit page, click Connect Strava to authorize your account via OAuth

---

## Panel

Running and cycling activity panel - recent activities with distance, pace/speed, elevation. 4-week totals per sport with colored bars. 8-week stacked bar chart at tall heights.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Last activity emoji + name + distance + duration |
| 2-3x | Athlete avatar + location + 4-week summaries + recent activities |
| 4x+ | YTD stat chips + 4-week summaries + 8-week stacked chart + full activity list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

OAuth - must connect your Strava account after creating the integration. Distances shown in miles or km based on athlete preference.