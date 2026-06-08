# Mealie

**Category:** Food & Home | **Status:** Need Testing | **Polling:** 15 min

---

## Integration

**Secret format:** Bearer token

> Mealie -> User Settings -> API Tokens -> Create a long-lived token

**URL required:** Required

**Example URL:** `http://192.168.1.10:9000`

### Setup

1. Mealie -> User Settings -> API Tokens -> create a long-lived token
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Mealie, URL = http://mealie:9000, secret
4. Admin -> Panels -> New: type Mealie

---

## Panel

Recipe manager and meal planner panel - weekly meal plan displayed day-by-day, shopping list with checked/unchecked items, recent recipe list with ratings and cook time, and a total recipe count.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total recipes + meal count + shopping items |
| 2-3x | Stat chips + this week meal plan by day |
| 4x+ | Left: stats + meal plan + shopping list | Right: recent recipes |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Today is highlighted in indigo with a Today badge in the meal plan.