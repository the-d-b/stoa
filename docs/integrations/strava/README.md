---
id: strava
name: Strava
category: Digital Life
tags: [fitness, cloud, oauth]
official_url: https://www.strava.com
status: needs-testing
polling: 60s
secret_format: oauth
url_required: false
---

# Strava

## What is Strava?

Strava is a popular social fitness platform for tracking running, cycling, and other activities. It records GPS activities, computes stats and segments, and adds a social feed. Stoa connects via OAuth to show your recent activities and rolling totals.

**Official site:** [strava.com](https://www.strava.com)

---

## Getting the key

Create an app at [strava.com/settings/api](https://www.strava.com/settings/api) and copy the **Client ID** and **Client Secret**. After adding the integration you'll authorize your account via OAuth.

- **Secret format:** `clientId:clientSecret`
- **URL:** none — OAuth against Strava's cloud API

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `clientId:clientSecret`.
2. **Admin → Integrations → New** — select **Strava**, no URL, choose the secret.
3. On the integration **edit** page, click **Connect Strava** to authorize your account via OAuth.
4. **Admin → Panels → New** — select **Strava**.

---

## Panel

Running and cycling activity panel — recent activities with distance, pace/speed, elevation. 4-week totals per sport with colored bars. 8-week stacked bar chart at tall heights.

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
