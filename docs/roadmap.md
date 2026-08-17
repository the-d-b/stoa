# Stoa Roadmap

Aggregated from scattered notes. Organized, not prioritized — grouped by what kind of work each item actually is, since that varies a lot more than the original list showed (a panel test and a native Android app are very different asks).

---

## 1. Integration testing backlog

Existing integrations that are built but not yet validated against a real instance. Original difficulty tiers kept as-is:

**Easier** (probably just need an instance spun up): Pi-hole, NextDNS, WG-Easy, Home Assistant, Firefly III, Traefik, Monica, Homebox, Wger, FitTrackee, Keycloak

**Harder** (need something already in place to test against): Unraid, OMV, Synology DSM, pfSense, Cloudflare, Paperless, Docspell, Strava, Twitch, Netbird, RomM, Pterodactyl, OpenWrt

**Much harder** (real infrastructure/hardware/licenses required): QNAP QTS, Omada SDN, UniFi, Frigate, Blue Iris, Scrutiny, Spotify

---

## 2. Integrations to evaluate

Not yet decided whether these deserve a Stoa integration at all — research first: FMD2, Mihon, Diun, Pinchflat, Crunchyroll, MangaFire, IoT smart-home devices/apps

---

## 3. Plex Music polish

More testing + a rename (the panel now shows non-music content via the Watchlist, so "Plex Music" may not fit anymore). Already tracked with full context in [`tech-debt.md`](./tech-debt.md), including the bigger open question of unifying system + personal Plex into one integration type with a server/account mode choice, and whether the same split makes sense for Jellyfin/Emby.

---

## 4. New integration/panel candidates

Grouped by scope — these range from "an afternoon" to "a new product surface":

**Extends an existing panel:**
- Google Find My Device, Apple AirTags → additional Map panel source types, alongside the existing Life360 support

**New self-contained panels:**
- Google Drive integration (upload/download capability)
- Speedtest panel

**Infrastructure / architecture-level** (affects Stoa's own data layer, not just a new integration):
- PostgreSQL, Redis — probably not worth it. At single-household self-hosted scale, SQLite + the in-process cache is very likely sufficient; no concrete driver (e.g. multi-tenant/hosted ambitions) identified that would change that math. Keeping on the list as "evaluate if a real need shows up," not as a live plan.

**Docker orchestration — deploy apps through a Portainer integration:**
- Not a hypothetical: came directly out of validating ~50 integrations for testing/docs — deploying each test instance by hand (Radarr, Sonarr, Plex, Transmission, etc., wired to share libraries/config with each other) turned into real, repeated manual work. Tried Dockge for this and found it inadequate for the "deploy several services sharing config with a couple of clicks" use case specifically. Surprised nothing already does this well.
- Rough shape: (1) a straightforward Portainer integration, (2) config options in Stoa describing what a "stack" of shared-library services looks like, (3) a UI that pushes the deployment through the Portainer integration. Believed to be less work than it sounds — smaller than the "new feature category" framing might imply, partly because there's real prior art to lean on rather than designing from scratch: the Portainer API itself, community-created Portainer templates, and the general approach Swizzin and DockSTARTer already take to batch-deploying pre-wired app stacks. Still a genuine step up in trust level from anything Stoa does today (deploying infrastructure, not just reading or nudging it via an existing app's own write API like Radarr's) — sequence after the holistic security review (§5), given the review matters more once Stoa can create infrastructure, not just call other apps' write endpoints.

**AI assistant:**
- Chat interface over Stoa's aggregated *current-state* data and existing write actions — e.g. "add this to Radarr," "how's CPU right now," "what's trending on TMDB," "do any of my Lidarr artists have concerts coming up." Deliberately scoped to what Stoa already knows/can query live — no historical/trend data store implied or needed. Still cuts across every integration Stoa has, so it'd need its own scoping pass whenever it's picked up, but smaller than "build analytics infrastructure first."

**Notifications:**
- Push/notify on events (download finished, CVE found, etc.) instead of leaving it to each app's own notifications. Real potential upside over app-native notifications: one unified notification across multiple instances of the same tool (e.g. 3 separate Deluge instances notifying as one). Currently **blocked**, not just unbuilt — see [`tech-debt.md`](./tech-debt.md) for why (Stoa's workers only run while the dashboard is open).

**New client surfaces** (not panels — new ways to run/access Stoa itself):
- Native Android app — probably not worth it unless there's a concrete need a PWA can't cover (the web app is already mobile-usable); a home-screen PWA gets most of the value for far less effort.
- Kiosk mode: wall-mounted touchscreen (Pi + browser) tuned for that form factor. Judged as genuinely distinct from "browse on your phone" (an always-on ambient household display), not a smaller version of the same thing — more clearly justified than the Android app idea.

---

## 5. Holistic reviews

- Full code review
- Full security review

Both are standalone efforts, not tied to a specific feature. Note: `/code-review ultra` exists for a multi-agent cloud review pass and could be a reasonable way to kick either of these off when it's time.
