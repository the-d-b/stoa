# Duolingo

**Category:** Health & Fitness | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** username:password

> Your Duolingo account login. Stoa uses the unofficial Duolingo API - credentials are used to obtain a session JWT cached for 12 hours.

**URL required:** None (unofficial Duolingo API)

### Setup

1. Format as username:password (your Duolingo login)
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type Duolingo, no URL, secret = username:password
4. Admin -> Panels -> New: type Duolingo

---

## Panel

Language learning panel - current streak with fire emoji, daily XP goal progress bar, league tier badge, and list of learning courses with language flag, level, total XP, and proportional XP bar.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Streak + active language + today XP/goal |
| 2-3x | Streak + goal bar + league badge + course list |
| 4x+ | Streak + goal bar + 14-day XP chart + full course list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Uses the unofficial Duolingo API. Profile must be public for some stats.