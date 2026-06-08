# Tandoor

**Category:** Food & Home | **Status:** Need Testing | **Polling:** 15 min

---

## Integration

**Secret format:** Bearer token

> Tandoor -> Settings -> API Tokens -> create a token

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. Tandoor -> Settings -> API Tokens -> create a token
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Tandoor, URL = http://tandoor:8080, secret
4. Admin -> Panels -> New: type Tandoor

---

## Panel

Recipe manager panel - total recipe count, weekly meal plan calendar, unchecked shopping list, and recent recipes with ratings, cook times, and keyword tags.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Recipe count + meal count + shopping items + today meals |
| 2-3x | Stat chips + this week meal plan |
| 4x+ | Left: stats + meal plan + shopping list | Right: recent recipes with keywords |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*