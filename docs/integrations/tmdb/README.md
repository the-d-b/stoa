---
id: tmdb
name: TMDB
category: Online Content
tags: [movies, tv, discovery, radarr, sonarr]
official_url: https://www.themoviedb.org
status: tested
polling: 1hr
secret_format: api-key
url_required: false
example_url: ""
---

# TMDB

## What is TMDB?

The Movie Database is a free, community-maintained movie/TV metadata source — the same one Radarr, Sonarr, Plex, Jellyfin, and (until recently) Trakt itself all source posters and metadata from. This integration surfaces TMDB's trending/popular/upcoming/top-rated lists directly in a Stoa panel, with one-click add to Radarr/Sonarr and a rating ceiling so it's safe to put on a panel shared with a household.

**Official site:** [themoviedb.org](https://www.themoviedb.org)

### Why TMDB instead of Trakt?

Trakt ended free API-application access sometime in mid-2026: existing free apps were deactivated and creating a new one now requires a paid VIP subscription, with no official announcement of the change. Stoa's Trakt integration still works if you already have a paid Trakt app, but it isn't being developed further — TMDB replaces the discovery + add-to-Radarr/Sonarr half of what Trakt offered, sourced directly from the same underlying metadata provider instead of through a third party that can change its terms at any time.

One real gap: TMDB is pure metadata — it has no concept of what you've personally watched. If you want "currently watching" / watch history / stats, that isn't something this integration (or TMDB itself) can provide; it would need to come from your media server's own watch-history integration (Tautulli, Jellystat) instead.

---

## Getting the key

- **Secret format:** a TMDB v3 API key or v4 Read Access Token — both work, auto-detected. Get either at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) (free, no VIP or approval process).
- **URL:** none needed — TMDB is a fixed cloud API.

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste your TMDB API key or Read Access Token.
2. **Admin → Integrations → New** — select **TMDB**, choose the secret. Optionally set a **movie ratings ceiling** and **TV ratings ceiling** (free-text, comma-separated — e.g. `PG, PG-13`) here. This is per-integration, not per-panel: one API key has one fixed ceiling. If different panels/users need different ceilings, create a separate TMDB integration (and secret) for each.
3. **Admin → Panels → New** — select **TMDB**. Optionally pick a Radarr and/or Sonarr integration to enable the add-to-library button on cards.
4. *(Optional)* Open the integration again and click **Connect TMDB** to link your personal TMDB account — this adds your own custom lists as an extra section on the panel. Not required for trending/popular/upcoming/top-rated, which work with just the API key.

---

## Panel

Poster carousels across four sections — Trending, Popular, Upcoming, Top Rated — each split into Movies/Shows tabs, plus your personal TMDB lists if connected.

### What's shown

- **Poster carousel per section** — hover the edges to auto-scroll; click a poster to open its TMDB page
- **Add-to-library button** — appears on a card when a Radarr (movies) or Sonarr (shows) integration is configured on the panel; shows adding/added/error state
- **Personal lists** *(only if a TMDB account is connected)* — your account's custom lists, fetched on demand when you expand one rather than eagerly for every list on every refresh

### Height behavior

| Height | What you see |
|---|---|
| 1x | A single compact count — "N titles to discover" |
| 2x+ | Full accordion of sections; first section with content opens automatically |

---

## Notes

- **Rating ceiling — what it does and doesn't cover:** TMDB's `include_adult` flag only excludes literal pornographic content, not mainstream R/NC-17 movies or TV-MA shows. The ratings ceiling here is a separate, proper MPAA/TV-content-rating filter (the same mechanism Trakt's panel used) — set it if you want to actually exclude R-rated or TV-MA content, not just "adult" content.
- **Movies vs. TV, filtering cost:** TMDB's `/discover/movie` endpoint supports server-side certification filtering, but `/discover/tv` does not — there's no way to filter TV shows by rating without a per-title lookup. Because of that, and because TV also needs a per-title lookup for other reasons (see below), this integration uses TMDB's real trending/popular/upcoming/top-rated endpoints for both movies and shows (rather than approximating everything through `/discover`) and enriches with certification only when a filter is actually configured, to avoid paying that cost for nothing.
- **Sonarr adds resolve a TVDB ID on click, not up front:** Radarr adds by TMDB ID, which TMDB provides natively — no extra lookup. Sonarr adds by TVDB ID, which TMDB's TV endpoints don't include by default; that lookup happens lazily, only when you actually click "Add to Sonarr" on a specific show, not eagerly for every show on the panel.
- **Personal lists are fetched on demand:** the panel refresh only pulls your lists' names and item counts, not their contents — a list's items are fetched the first time you expand it, since a personal account can have many lists most of which won't be opened on a given visit.
- **API endpoints used:** `/trending`, `/movie|tv/popular`, `/movie/upcoming`, `/tv/on_the_air`, `/movie|tv/top_rated`, `/movie/{id}/release_dates`, `/tv/{id}/content_ratings`, `/tv/{id}/external_ids`, and (if connected) `/authentication/token/new`, `/authentication/session/new`, `/account`, `/account/{id}/lists`, `/list/{id}`.
