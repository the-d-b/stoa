---
id: plexmusic
name: Plex Music
category: Music
tags: [music, plex, personal, self-hosted]
official_url: https://www.plex.tv
status: tested
polling: 30s
secret_format: none
url_required: false
example_url: ""
---

# Plex Music

## What is this?

A personal companion to Stoa's system-wide Plex integration — instead of showing server-wide sessions and video libraries, this connects **as an individual household member** and gives them a real in-panel music player: pick a playlist, see the track list, and play it right there in the browser (like the Navidrome panel). It also shows their music library stats, what's currently playing on their other Plex sessions, and — as a bonus — their personal Plex Watchlist (movies/TV saved to watch later). Each person in your household can have their own Plex Music integration and panel, isolated from everyone else's.

This exists because Stoa's main Plex integration is deliberately system/shared and video-focused — it has no concept of "whose session is this" beyond display, and nothing music-specific. Standing up Navidrome as a separate music server was considered and passed on; Plex + Plexamp already covers day-to-day listening well, so this fills the one real gap (per-user, personal views) without running a second service.

**v1 scope: Home users only.** Plex Home members (family profiles on your server without their own separate plex.tv email login) connect via an admin-mediated flow described below. External users you've shared libraries with (real, independent plex.tv accounts) aren't supported yet — that's a different, self-service auth flow (PIN-link OAuth) that's a natural v2 addition in the same architectural slot, just deferred to keep this release scoped.

---

## How the connection works (read this — it's not what you'd expect)

Plex Home users don't have their own email/password login — there's nothing for them to "sign into." The only way to get a token for one is for the **server admin's own account** to vouch for them via Plex's switch-user API. Practically, that means:

1. This integration has **no secret of its own** — it borrows connectivity and the admin token from your existing system Plex integration.
2. Connecting is an **in-app picker**, not a redirect to plex.tv: pick which Plex server, save, then pick which Home user profile is you (with a PIN if that profile has one set), and click Connect. No browser round-trip.
3. Behind the scenes, Stoa uses the admin's token to ask Plex to switch into that identity and stores the resulting per-user token.

---

## Add it to Stoa

1. Make sure you already have a **system Plex integration** set up (Admin → Integrations → Plex) — this is the one whose admin token gets borrowed.
2. **Admin → Integrations → New** (or **Profile → My Integrations** for a personal one) — select **Plex Music**, pick the Plex server from the dropdown, save. No secret needed.
3. Open the integration again — under **Plex Account**, pick which Home user you are from the list, enter your PIN if prompted, click **Connect**.
4. **Panels → New** — select **Plex Music**, pick this integration as its source.

---

## Panel

An in-browser music player (playlist selector, scrollable track list, play/pause/prev/next/seek — the same shape as the Navidrome panel), plus a read-only now-playing card for whatever's active on your other Plex sessions, music library stat tiles, and your Watchlist.

### What's shown

- **Player** — pick one of your audio playlists, browse its tracks, and play them right in the panel; audio streams from your Plex server through Stoa
- **Now playing** — informational only, shows what's playing on your *other* Plex sessions/clients (matched by your Plex user ID), with a progress bar. Stoa does not control or send commands to that session — playing something in the Stoa panel is a separate, independent stream
- **Library stats** — artist / album / track counts, summed across all music-type library sections on the server
- **Watchlist** — movies/TV you've added to your Plex Watchlist, as poster art

### Height behavior

| Height | What you see |
|---|---|
| 1x | Now-playing title, or "nothing playing" |
| 2–3x | Now-playing card + library stat tiles |
| 4x+ | Adds playlist selector, track list, in-panel player, and Watchlist |

---

## Notes

- **This is a real player, not a remote control.** Tracks you select in the Stoa panel play through your browser's own audio — it's a separate stream from whatever may be playing on your phone, TV, or other Plex client. It does not pause, resume, or otherwise affect those other sessions.
- **Now-playing card is read-only**: Plex's `/status/sessions` endpoint requires the admin's token to read (a personal/Home-user token gets a 403), so this integration uses the parent system integration's admin token for that one call and filters the result down to your own sessions by Plex user ID. There's no control surface here — it's purely "what's active elsewhere right now."
- **Playlist selection is saved per-panel**, the same as Navidrome — switching playlists via the dropdown persists immediately and survives reloads.
- **Streaming and cover/poster art** are proxied through Stoa exactly like Navidrome: audio is fetched with the Stoa auth token injected, handed to the browser as a blob URL, with Range headers forwarded so seeking works. The browser never talks to your Plex server directly.
- **Watchlist endpoint**: uses `discover.provider.plex.tv` with your **account-level** token (not the per-server token) — the older `metadata.provider.plex.tv` path some other tools still use was deprecated and now returns 404.
- **No Test button**: this integration type has no credentials of its own to test before connecting — its connection state is shown directly via the "Plex Account" status box instead.
- **API endpoints used**: `plex.tv/api/users/` and `plex.tv/api/home/users/{id}/switch` (connect flow, admin token) to obtain both a per-server token and an account-level token; then against your Plex server: `/status/sessions` (admin token), `/library/sections`, `/library/sections/{key}/all`, `/playlists`, `/playlists/{id}/items`, and track streaming (all with the personal per-server token); plus `discover.provider.plex.tv/library/sections/watchlist/all` (account token, cloud-side).
