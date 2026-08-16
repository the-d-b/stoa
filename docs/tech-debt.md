# Tech debt & deferred design decisions

Known issues and open architectural questions that have been consciously deferred rather than fixed immediately. Each entry should have enough context to pick back up later without re-deriving the investigation.

---

## Dashboard "auto-height" (`dynamicHeight`) doesn't bound internal scroll areas correctly

**Status:** deferred — flat 8-unit safety cap in place, known to be imperfect but acceptable for now.

**The bug:** When a portico has `dynamicHeight` enabled, the panel card's outer height is set to CSS `height: 'auto'` (see `frontend/src/pages/DashboardPage.tsx`, `PanelCard`) instead of a fixed pixel value, with a hardcoded `maxHeight` safety cap of **8 grid units for every panel, regardless of that panel's own configured height** (a 1x panel can balloon to 8x; a 6x panel barely grows at all — the cap isn't proportional to the panel's setting).

The deeper issue: CSS percentage heights (`height: '100%'`, used by nearly every panel component's root wrapper to fill its container) can only resolve against an ancestor with a *definite* height. `height: auto` does not count as definite, even when a `maxHeight` is layered on top. So under `dynamicHeight`, any panel with an internal `flex: 1; minHeight: 0; overflowY: 'auto'` scroll region (the standard pattern for track lists, card lists, etc.) loses its bounded height entirely — the list renders at full intrinsic size (every item, no internal scrollbar) and is only clipped raggedly by the outer `overflow: hidden` + maxHeight, rather than scrolling cleanly within its intended box.

**Confirmed scope:** not specific to any one panel. At least 31 panel/overlay files use the `flex:1 + minHeight:0 + overflowY:'auto'` pattern (PlexMusicPanel, NavidromePanel, SpotifyPanel, KanbanPanel/Overlay, GitHubPanel, TandoorPanel, MealiePanel, HomeAssistantPanel, CalendarOverlay, and others), and an unknown number more use the simpler `height:'100%' + overflow:'auto'` variant (RadarrPanel, TraktPanel, BazarrPanel, etc.) — same root cause, same exposure. Only `OmadaPanel.tsx`'s one small list uses a genuinely ancestor-independent fixed-pixel `maxHeight`, and is unaffected.

**Options considered, not yet chosen:**
1. **Measure real content height in JS** (ResizeObserver / `scrollHeight`) and set a definite pixel height instead of `'auto'`, clamped to a max. Correct fix in principle, but panel content varies enormously in shape (a single stat row vs. a long scrollable list vs. embedded media) — a one-size-fits-all measurement strategy at the `DashboardPage` level may not generalize cleanly across panel types without per-panel awareness.
2. **Cap only the internal scrollable regions**, not the whole panel card — e.g. give scroll containers their own fixed-px `maxHeight` (mirroring `OmadaPanel.tsx`'s approach) so they scroll correctly regardless of what the outer card's height resolves to. Doesn't fully "auto-size" the card to content, but sidesteps the percentage/flex resolution problem entirely.
3. **Make the safety cap proportional to the panel's own configured height** (e.g. 2x whatever the user set) instead of a flat 8 units — wouldn't fix the underlying scroll/clipping bug, but would make the *symptom* proportionate and less surprising (a 4x panel maxing at 8x makes some intuitive sense; a 1x panel maxing at 8x doesn't).

**Current state:** left as-is (flat 8-unit cap, imperfect internal scrolling under `dynamicHeight`). Not urgent — most users don't hit it, and the panel is still usable, just taller than intended in this specific mode.

---

## Plex Music panel: naming, scope, and integration-dependency questions

**Status:** deferred — panel works and is in active use; these are naming/architecture questions to revisit, not bugs.

Raised while reviewing the Plex Music panel after it grew a Watchlist section (movies/TV, not music) as a bonus feature:

1. **Naming/scope mismatch.** "Plex Music" now shows non-music content (the personal Watchlist). The name may no longer accurately describe what the panel does. Worth reconsidering the name, or reconsidering whether Watchlist belongs in this panel at all, once there's a clearer picture of where this is headed (see point 3).

2. **Unique integration-dependency architecture.** Plex Music is currently the *only* integration type in Stoa whose functionality depends on another integration already existing (its `sourceIntegrationId` config borrows connectivity/admin-token from a separate system Plex integration). Every other integration type is self-contained. This was the simplest way to ship a personal Plex companion without duplicating server-connection setup, but it's an architectural one-off worth reconsidering — either lean into it as a deliberate pattern (and make it easy to reuse for future personal-companion integrations) or find a way to make Plex Music independent.

3. **Bigger idea floated: unify system + personal Plex into one integration type.** Instead of two separate integration types ("Plex" = system/shared, "Plex Music" = personal), consider a single "Plex" integration type where, at creation time, the user picks a mode — "server" (today's system-wide Plex integration) or "account" (today's personal Plex Music behavior: home-user connect, per-user now-playing/library/playlists/stations/Watchlist). This would resolve both points above (the dependency goes away since it's the same integration type choosing a mode, not two types where one borrows from the other; naming stops being a problem since "Plex" no longer implies music-only).

   If this direction is taken, the same server/account-mode split should be considered for **Jellyfin and Emby**, which currently only have the system-wide/server model — no personal per-user companion exists for either, but the same rationale that motivated Plex Music (per-user now-playing, personal libraries/lists) could apply equally there.

**Current state:** not started. The existing Plex + Plex Music integration types are unaffected and working; this is purely a forward-looking design question to pick up deliberately, not urgent cleanup.

---

## Notifications aren't feasible today — worker lifecycle is tied to active login sessions

**Status:** blocked on an architecture change; not just unbuilt.

Raised while discussing whether Stoa should notify on events (a download finishing, a discovered CVE, etc.) instead of leaving that to each downloader app's own notification support. The idea has real merit beyond what apps already do on their own — a household running multiple instances of the same tool (e.g. 3 Deluge instances) could get one unified notification instead of three separate app-native ones — but it isn't buildable as-is.

**The blocker:** Stoa's backend integration workers are driven by active SSE client connections (`WorkerManager` in `backend/internal/handlers/cache.go`) — they spin up on the first connected client and spin down 10 minutes (`gracePeriod`, `cache.go:186`) after the last one disconnects, specifically to avoid hammering every configured service's API when nobody has the dashboard open to see the result. That means Stoa has no running process to notice a download finished, or anything else, while nobody has it open — which is exactly when a notification would be needed. This isn't a missing feature so much as a load-bearing design decision (avoid needless API load / "tree falls in the woods") that directly conflicts with what notifications require (an always-on watcher).

**What it would take:** some kind of lightweight, always-on process decoupled from the full per-integration worker lifecycle — e.g. a separate, much-lower-frequency poller for just the handful of "worth notifying about" event types, rather than resurrecting full workers for every integration around the clock. Not scoped further than that yet.

**Current state:** not started, and not really "roadmap-able" until the lifecycle question above has an answer.
