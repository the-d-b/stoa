# Grocy

**Category:** Food & Home | **Status:** Need Testing | **Polling:** 5 min

---

## Integration

**Secret format:** Plain API key

> Grocy -> Manage API Keys (or Settings -> User API Keys) -> create key

**URL required:** Required

**Example URL:** `http://192.168.1.10:80`

### Setup

1. Grocy -> Manage API Keys -> create a new key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Grocy, URL = http://grocy:80, secret
4. Admin -> Panels -> New: type Grocy

---

## Panel

Household management panel - food expiry tracker with urgency color coding, overdue chore list, pending tasks with due dates, and shopping list.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Expired count + expiring count + overdue chores + tasks + shopping |
| 2-3x | Stat chips + food expiry list + overdue chores list |
| 4x+ | Left: stats + food expiry + all chores | Right: tasks + shopping list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Expiry urgency: red = expired, orange = <2 days, amber = <5 days, yellow = <7 days.