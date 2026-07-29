---
id: tandoor
name: Tandoor
category: Digital Life
tags: [recipes, self-hosted]
official_url: https://tandoor.dev
status: tested
polling: 15min
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:8080
---

# Tandoor

## What is Tandoor?

Tandoor is a self-hosted recipe manager and meal planner. It organizes recipes with rich metadata and photos, imports them from the web, plans meals across the week, and builds shopping lists — a powerful open-source recipe database.

**Official site:** [tandoor.dev](https://tandoor.dev)

---

## Getting the key

Tandoor → **Settings → API Tokens** → create a token with read access → copy it. (Tandoor's Copy button can silently fail; paste into a text editor first to verify.)

- **Secret format:** API token (Stoa adds `Bearer` automatically)
- **URL:** required — base URL of your Tandoor instance, e.g. `http://192.168.1.10:8080`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the token (no prefix).
2. **Admin → Integrations → New** — select **Tandoor**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Tandoor**.

---

## Panel

Recipe and meal planning panel — full-panel photo carousel of random recipes, weekly 7-day meal plan, and shopping list. Photos auto-advance every 4 seconds and pause on hover.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Stat chips: recipe count · meals this week · shopping items |
| 2–3x | Full-panel recipe photo carousel with recipe name overlay |
| 4x+ | Photo carousel (top) + stat chips + 7-day meal plan + shopping list (scrollable) |

### Photo carousel

- Shows up to 6 randomly selected recipes each poll cycle — refreshes every 15 minutes so the panel looks different throughout the day
- Recipes without photos are excluded from the carousel
- Click any photo to open the recipe in Tandoor
- Dot navigation at bottom-right; hover to pause auto-advance

### Meal plan

- Displays all 7 days of the current week (Mon–Sun)
- Today's row is highlighted in accent color
- Entries link to the Tandoor meal plan page

### Screenshots

| | Dark | Light |
|---|---|---|
| **1x** | ![1x dark](./screenshots/1x-dark.png) | ![1x light](./screenshots/1x-light.png) |
| **2x** | ![2x dark](./screenshots/2x-dark.png) | ![2x light](./screenshots/2x-light.png) |
| **4x** | ![4x dark](./screenshots/4x-dark.png) | ![4x light](./screenshots/4x-light.png) |

---

## Notes

- Recipe images are proxied through Stoa (auth-gated) — they will not load if the backend cannot reach your Tandoor instance
- The meal plan uses Tandoor's `from_date` datetime field; times are stripped to date-only for display
- Shopping list shows unchecked entries from Tandoor's shopping list
