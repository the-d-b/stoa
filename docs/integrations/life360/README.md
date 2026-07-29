---
id: life360
name: Life360
category: Digital Life
tags: [location, cloud]
official_url: https://www.life360.com
status: experimental
polling: 2min
secret_format: api-key
url_required: false
---

# Life360

## What is Life360?

Life360 is a family location-sharing app that shows where "circle" members are on a live map, with driving and check-in features. It has no official API — Stoa reads it through an unofficial, browser-extracted session token, which makes this integration **experimental** and prone to breaking without warning (see below). Life360 has no standalone panel; it's a GPS **source** for the Map panel.

**Official site:** [life360.com](https://www.life360.com)

---

## Important: this is not a normal integration

Life360 has no official or public API. Stoa talks to the same undocumented REST API the Life360 mobile app uses, and Life360/Cloudflare actively try to block third-party use of it — expect occasional `403`/`429` errors even with everything configured correctly.

More importantly: **the normal email+password login stops working entirely once your Life360 account's phone number is verified**, which is true for most real accounts. There is no stable API key for this integration. Instead, the secret is a **session token you extract by hand from your browser**, and it can expire or be invalidated at any time with no warning and no automatic refresh — when that happens, the integration starts failing and you repeat the extraction steps below.

If that tradeoff isn't worth it for you, this integration isn't a good fit — there's currently no more reliable way to pull Life360 data into Stoa.

---

## Getting the key

1. Log into [life360.com](https://www.life360.com/login) in your browser
2. Open DevTools (F12) → **Application** tab (Chrome/Edge) or **Storage** tab (Firefox) → **Cookies** → `https://www.life360.com`
3. Find the cookie named `LIFE360_AUTH_TOKEN` and copy its value

When it stops working (an auth error appears on the integration), repeat these steps with a fresh token.

- **Secret format:** session bearer token (not an API key)
- **URL:** none — Stoa always calls Life360's fixed API host

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the token value.
2. **Admin → Integrations → New** — select **Life360**, enter the secret (no URL needed).
3. **Admin → Panels → New** — select **Map**, then add this Life360 integration as a source (Admin → Panels → your Map panel → Map sources).

---

## Panel

Life360 has no standalone panel — it's a **source** for the Map panel, the same way Sonarr or Google Calendar are sources for the Calendar panel. Add one or more Life360 integrations as Map sources to show every circle member as a marker, with name, address, battery level, and last-update time.

See the Map panel's own height behavior in its create/edit description — broadly: 1x shows a compact "N tracked" summary (no map, too small to be useful), 2–3x shows the live map, and 4x+ adds a roster list with per-person filter pills below the map. A maximize button opens a full-screen map with the same roster.

---

## Notes

- **Reliability:** This is the single least stable integration in Stoa, by design of Life360's own API — not a Stoa bug. If it stops working, the token has almost certainly expired; re-extract it.
- **Rate limits:** Life360's unofficial API rate-limits aggressively. The default 2-minute polling interval is deliberately conservative — don't lower it much further, or you'll see more `429` errors.
- **Circles:** All circles associated with the account are fetched and merged into one member list; there's no per-circle filtering.
- **Location freshness:** Markers reflect wherever Life360 last recorded a fix for that person, not a live continuous trace — accuracy and recency depend entirely on Life360's own app on their device.
- **Avatars:** Life360's member avatar images require their own session to load and can't be embedded directly, so markers use a colored initial instead.
