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
- **Deliberately scoped down, not general-purpose.** This is a curated catalog of ~15-20 well-known, well-behaved apps (the *arr stack, Plex/Jellyfin/Emby, Transmission/qBittorrent/SABnzbd, and similar), not an attempt to make all ~90 Stoa integrations deployable. Explicitly excludes apps that were themselves painful to stand up during this session's testing pass (Fittrackee, Wger, etc.) — no reason to inherit an app's own rough edges into a "this just works" promise. Not a config-management system guaranteeing correctness for arbitrary user configurations — a small, hand-verified set of known-good stack templates.
- **Storage**: not provisioned by Stoa — the user creates library/download folders themselves; Stoa just captures the paths (a form + DB fields, genuinely simple).
- **Catalog**: needs to be closer to a compose template with variable substitution (paths, `PUID`/`PGID`/`TZ`, shared network, optional VPN-container routing for the downloader) than a bare image-name + volume-map list — but for a small curated set, each template is written and verified once, not derived generically per app.
- **The one piece that's genuine domain-knowledge work, not infrastructure engineering**: path *and* `PUID`/`PGID` consistency across every container in a stack. Sonarr/Radarr hardlink-move files into the library rather than copy them, which only works if the download and library folders are the exact same mountpoint inside every container — get this wrong and nothing errors, it just silently degrades (slow copy+delete, or eventual disk-space surprises) or breaks Plex's ability to see newly-imported files. This is the classic self-hosted-media-stack gotcha (see TRaSH Guides), and the reason a curated catalog beats an open one: the "correct" answer for this specific, extremely well-trodden app combination is already known and only needs to be encoded once, not re-derived per user config.
- **Auto-registering the deployed app as a Stoa integration** (so "1-click deploy" also means "already monitored") is a separate, per-app follow-on — pulling back a freshly-deployed app's API key differs by app (some support pre-seeding it via env var, others only generate it on first boot and need a post-deploy poll) — worth treating as a nice-to-have layered on top of the deploy step, not part of its core scope.
- Rough shape: (1) a straightforward Portainer integration, (2) a small hand-curated catalog of compose templates, (3) a UI that pushes the deployment through the Portainer integration. Real prior art to lean on rather than designing from scratch: the Portainer API itself, community-created Portainer templates, and the general approach Swizzin and DockSTARTer already take to batch-deploying pre-wired app stacks.
- **Security note, independent of catalog size**: Portainer deploy access is effectively host-level (can mount arbitrary paths, run privileged containers) — a genuine step up in trust level from anything Stoa does today, where every existing write action (add to Radarr, create a calendar event) is scoped to that one app's own API and can't escape it. This doesn't shrink just because the app catalog is small — sequence after the holistic security review (§5), given the stakes of the authorization-gap class of bug (already found and fixed once this session in Stoa's existing write-action surface) are meaningfully higher once a bug there could mean host access instead of "someone added a movie to your Radarr."

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
