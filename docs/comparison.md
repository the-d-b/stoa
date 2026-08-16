# Dashboard comparison

How Stoa compares to other popular self-hosted dashboard apps. Last updated July 2026 — features change; check each project's docs for the latest.

### Beyond the checklist

The table below is a feature checklist, but the more meaningful gap isn't any single row in it. Most of these tools — Stoa included, originally — are viewports: they display the state of your other services and link out to them. As Stoa has grown, it's increasingly become something else: it *acts* on your infrastructure instead of only showing it. Add a movie to Radarr or a show to Sonarr straight from a discovery panel. Create a real calendar event from inside Stoa. Play your Plex or Navidrome library — including personal, per-person playlists and radio stations — directly in the browser, not just see that it's running. Combined with genuine multi-user awareness (each household member gets their own personal integrations and panels, not just a shared login), Stoa is less "a dashboard that competes with the tools below" and more "a personal, interactive command center for a household" — those tools were the inspiration, not really the competition anymore.

✅ Supported &nbsp;&nbsp; 🟡 Partial / limited &nbsp;&nbsp; ❌ Not supported

| | Multi-user & roles | Per-user layout | Named views | 90+ live integrations | Real-time (WS/SSE) | Google Calendar | Location map | Sports scores | Stocks & Crypto | Docker management | Notes & Checklists | Kanban boards | Glyphs & Tickers | OAuth / SSO | Audit log |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Stoa** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Homepage** | ❌ | ❌ | 🟡 | ✅ | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ | 🟡 | ❌ | ❌ |
| **Homarr** | ✅ | 🟡 | ✅ | ✅ | ❌ | 🟡 | ❌ | ❌ | 🟡 | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Organizr** | ✅ | 🟡 | ✅ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Dashy** | 🟡 | ❌ | ✅ | ✅ | ❌ | 🟡 | ❌ | 🟡 | 🟡 | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Glance** | ❌ | ❌ | 🟡 | 🟡 | ❌ | 🟡 | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ |
| **Heimdall** | 🟡 | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ |
| **Flame** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ |

---

### Notes

**Multi-user & roles** — Stoa supports users, groups, and tag-based access control with full per-user panel ordering. Homarr and Organizr have multi-user but limited per-user layout isolation. Homepage has no authentication layer at all — it delegates to a reverse proxy.

**Per-user layout** — Stoa users each have their own panel order, active tags, and portico configurations that don't affect anyone else. Homarr and Organizr offer some per-user access but shared layout state.

**Named views** — Stoa's porticos are saved views with independent tag filters, layouts, column assignments, and panel ordering, with a live scaled preview. Homepage tabs and Homarr boards are closer to separate pages than personalized views.

**Real-time (WS/SSE)** — Stoa maintains persistent WebSocket connections to TrueNAS and SSE streams to OPNsense, updating every 1–2 seconds without polling. Homepage has some live widgets but no persistent connections.

**Google Calendar** — Stoa uses a real OAuth 2.0 flow — users authorize with their Google account and all personal calendars are available. Homepage and Homarr support iCal URLs only, which requires generating a shareable link from Google Calendar settings and doesn't access private calendars directly.

**Location map** — Stoa's Map panel plots live GPS/presence markers from any added location source (Life360 today) on a Leaflet map, with a full-screen view, a per-person roster, and battery/charging/driving status. No other app dashboard in this list has a presence map — it's normally the domain of home-automation platforms.

**Docker management** — Stoa supports start, stop, and restart across local (Unix socket) and remote Docker hosts. Homarr also supports container management. Homepage displays container status only. Flame auto-discovers containers via Docker labels but offers no management actions. Stoa also has its own label-based auto-discovery — a separate Docker Apps panel reads Homepage's own `homepage.name`/`icon`/`href` label convention and turns labeled containers into launcher tiles, so a Homepage config migrates or runs alongside Stoa with no re-tagging.

**Kanban boards** — Stoa's Kanban panel runs multiple task boards per panel with both list and status (board) views, drag-to-reorder on desktop, full-text search, and due dates fed from a calendar source. Task boards are unique among these app dashboards — the others stop at simple notes at most.

**Glyphs & Tickers** — Stoa's header/footer widgets (clock, weather, server stats, ping) and scrolling tickers (sports, stocks, crypto, RSS) are sticky — they stay visible as you scroll and across all portico views. Homepage has "info widgets" (weather, clock, stocks) that render above the panel grid but scroll off with the page. Glance has "head-widgets," a full-width area above the column layout that can show a live markets strip — the closest equivalent in any other app — but it isn't a scrolling ticker and doesn't persist across navigation.

**Audit log** — Stoa logs authentication events, password resets, and admin actions to a queryable audit log. No other app in this list has audit logging.
