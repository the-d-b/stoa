# Monica

**Category:** Personal | **Status:** Need Testing | **Polling:** 15 min

---

## Integration

**Secret format:** Bearer token

> Monica -> Settings -> API -> Personal Access Tokens -> Create

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. Monica -> Settings -> API -> Personal Access Tokens -> create token
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Monica, URL = http://monica:8080, secret
4. Admin -> Panels -> New: type Monica

---

## Panel

Personal CRM panel - total contact count and upcoming reminders with contact name, date, and days until. Color-coded for reminders due today or within the week.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Contact count + imminent reminders |
| 2-3x | Reminder list |
| 4x+ | Full reminder list with dates and contact detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*