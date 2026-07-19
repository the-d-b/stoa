# Firefly III

**Category:** Finance | **Status:** Need Testing | **Polling:** 60 min

---

## Integration

**Secret format:** Personal Access Token (PAT)

> Firefly III -> Profile -> OAuth -> Personal Access Tokens -> Create new token

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. Firefly III -> Profile (top-right) -> OAuth -> Personal Access Tokens -> create token
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Firefly III, URL = http://firefly:8080, secret
4. Admin -> Panels -> New: type Firefly III

---

## Panel

Monthly summary figures (earned, spent, net worth, bills paid/unpaid, left to spend, net savings) and asset account balances.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Net worth + earned + spent + left to spend |
| 2-3x | Summary chips + full monthly summary + account list |
| 4x+ | Large net-worth header + monthly summary column + account balances column |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Calendar

Add Firefly III as a calendar source (Profile/Admin → Calendar panel → Calendar sources → **Stoa integration**) to see upcoming bill payment dates and recurring transactions on the calendar. Each expected payment appears as an all-day "Due soon" event 3 days before its due date; recurring bills show every occurrence in the window. See [Calendar](../calendar/README.md#firefly-iii) for details.

---

## Notes

Summary figures cover the current calendar month. Polls hourly - financial data changes infrequently.