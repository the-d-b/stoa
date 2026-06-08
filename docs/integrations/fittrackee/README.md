# Fittrackee

**Category:** Health & Fitness | **Status:** Need Testing | **Polling:** 15 min

---

## Integration

**Secret format:** email:password

> Your Fittrackee login. Format: user@example.com:yourpassword

**URL required:** Required

**Example URL:** `http://192.168.1.10:5000`

### Setup

1. Format as email:password (your Fittrackee login)
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type Fittrackee, URL = http://fittrackee:5000, secret
4. Admin -> Panels -> New: type Fittrackee

---

## Panel

Activity tracker panel - total workouts, sports, distance, duration, and ascent. Recent workout list with sport type, title, distance, speed, and ascent per activity.

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