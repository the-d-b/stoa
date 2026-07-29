---
id: fittrackee
name: Fittrackee
category: Digital Life
tags: [fitness, self-hosted]
official_url: https://github.com/SamR1/FitTrackee
status: needs-testing
polling: 15min
secret_format: username-password
url_required: true
example_url: http://192.168.1.10:5000
---

# Fittrackee

## What is Fittrackee?

FitTrackee is a self-hosted outdoor-activity tracker. Upload GPX files from your runs, rides, and hikes and it maps them and computes distance, duration, speed, and elevation stats — a private alternative to Strava for the workouts you own.

**Official site:** [github.com/SamR1/FitTrackee](https://github.com/SamR1/FitTrackee)

---

## Getting the key

Use your Fittrackee login in `email:password` form (e.g. `user@example.com:yourpassword`).

- **Secret format:** `email:password`
- **URL:** required — point at your Fittrackee port, e.g. `http://192.168.1.10:5000`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the credential.
2. **Admin → Integrations → New** — select **Fittrackee**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Fittrackee**.

---

## Panel

Activity tracker panel — total workouts, sports, distance, duration, and ascent. Recent workout list with sport type, title, distance, speed, and ascent per activity.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total workouts + distance + duration |
| 2-3x | Stat chips + recent workout list |
| 4x+ | Stat chips + full workout list with all metrics |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
