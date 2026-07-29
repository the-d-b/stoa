---
id: wger
name: wger
category: Digital Life
tags: [fitness, self-hosted]
official_url: https://wger.de
status: needs-testing
polling: 15min
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:80
---

# wger

## What is wger?

wger is a self-hosted workout manager and fitness tracker. It lets you plan workout routines, log training sessions, track body weight and nutrition, and browse an exercise database — an open-source alternative to commercial fitness apps.

**Official site:** [wger.de](https://wger.de)

---

## Getting the key

wger → **Dashboard → API → Permanent API key** — copy it.

- **Secret format:** plain API key
- **URL:** required — point at your wger port, e.g. `http://192.168.1.10:80`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the key.
2. **Admin → Integrations → New** — select **wger**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **wger**.

---

## Panel

Workout manager panel — total workout count, recent session log (date, impression, notes), and weight history entries.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total workouts + last session date |
| 2-3x | Recent session list |
| 4x+ | Session list + weight log chart |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
