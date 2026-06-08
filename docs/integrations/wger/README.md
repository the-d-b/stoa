# wger

**Category:** Health & Fitness | **Status:** Need Testing | **Polling:** 15 min

---

## Integration

**Secret format:** Plain API key

> wger -> Dashboard -> API -> Permanent API key

**URL required:** Required

**Example URL:** `http://192.168.1.10:80`

### Setup

1. wger -> Dashboard -> API -> copy Permanent API key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type wger, URL = http://wger:80, secret
4. Admin -> Panels -> New: type wger

---

## Panel

Workout manager panel - total workout count, recent session log (date, impression, notes), and weight history entries.

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