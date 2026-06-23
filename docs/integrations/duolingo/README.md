# Duolingo

**Category:** Learning | **Status:** Tested | **Polling:** 5 min

---

## Integration

**Secret format:** `your-duolingo-username`

**URL required:** None — always uses `duolingo.com`

### Getting your username

Your Duolingo username is visible in your profile URL: `https://www.duolingo.com/profile/USERNAME`

It is also shown in the app under **Profile → Edit Profile**.

> **Note:** This integration uses Duolingo's public profile API. No password or authentication token is required. Your profile data must be publicly accessible (the default for all Duolingo accounts).

### Setup

1. Admin → Secrets → New
   - **Name:** e.g. `duolingo-username`
   - **Value:** your Duolingo username (e.g. `the-d-b`)
2. Admin → Integrations → New: type **Duolingo**, leave URL blank, select the secret
3. Admin → Panels → New: type **Duolingo**, select the integration

---

## Panel

Live Duolingo profile showing current streak with countdown timer, XP, crowns, league, avatar, and active courses with progress bars.

### Features

- **Streak badge** — current day streak with fire emoji
- **Streak countdown** — live timer showing time until local midnight when streak will expire; turns green when today's lesson is complete
- **Milestone progress** (4x only) — progress bar toward next streak milestone (7, 14, 30, 60, 90, 180, 365, 500, 730, 1000…)
- **Courses** — all enrolled courses with flag emoji, crowns (9999 shown as ∞), and XP bar; active course listed first
- **Stats chips** — Total XP, total crowns, longest streak, league badge
- **Avatar** — shows owl 🦉 for default Duolingo avatars

### Height behavior

| Height | What you see |
|---|---|
| 1x | Streak · countdown warning · active course · total XP |
| 2–3x | Avatar · name · streak badge · streak status · all courses |
| 4x+ | Full profile · XP/crowns/league chips · streak badge · streak status · milestone progress bar · courses · profile link |

### Screenshots

| | Dark | Light |
|---|---|---|
| **1x** | ![1x dark](./screenshots/1x-dark.png) | ![1x light](./screenshots/1x-light.png) |
| **2x** | ![2x dark](./screenshots/2x-dark.png) | ![2x light](./screenshots/2x-light.png) |
| **4x** | ![4x dark](./screenshots/4x-dark.png) | ![4x light](./screenshots/4x-light.png) |

---

## Notes

- Duolingo's public API does not require authentication. If your profile is private or your username is incorrect, the panel will show an error.
- Crowns at 9999 indicate course mastery (Duolingo's maximum). The API returns 9999 for completed skill trees.
- The streak countdown uses your **local midnight**, not UTC.
- League data is not always present in the API response; the league badge is hidden when unavailable.
- Google-linked Duolingo accounts have a username set separately from the Google email — check your profile page to confirm it.
