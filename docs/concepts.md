# Concepts

Understanding these five concepts will make everything else in Stoa click.

---

## Users

Every person gets their own login. Users are either **admins** (full access to all settings and content) or **regular users** (can personalize their own experience within shared content).

- Admins create system panels, integrations, tags, and groups
- Regular users can reorder panels, set their layout, add personal panels and integrations, and activate tags
- Every user gets their own panel order, portico layout, glyphs, and tickers
- Local accounts always work regardless of OAuth configuration — useful as a fallback if SSO breaks

---

## Groups

Groups organize users and control access to content. A panel shared with a group is visible to every member of that group.

- Users can belong to multiple groups
- The **default group** is special — new users are automatically added to it. Anything shared with the default group is visible to everyone by default
- Create groups for different teams, roles, or household members

---

## Tags

Tags are how users filter what appears on their dashboard. You assign tags to panels; users activate the tags they care about.

- Tags are for **filtering**, not access control — access is managed through groups
- A panel can have multiple tags
- A user can have multiple tags active at once
- Users can also create **personal tags** visible only to them, layered on top of system tags

---

## Panels

Panels are the widgets on the dashboard — Sonarr queues, server stats, bookmarks, media info, and more.

- **System panels** are created by admins and shared with groups — all group members see them
- **Personal panels** are created by users and visible only to them
- Each panel connects to an **integration** for its data
- Panels have a height (1x, 2x, 4x, 8x) that controls how much vertical space they occupy
- Panel order is per-user — reordering your dashboard doesn't affect anyone else

---

## Porticos

Porticos (στοά) are named views of your dashboard — like tabs or saved filter presets.

- Each portico has its own set of active tags, so switching porticos instantly changes which panels are shown
- Porticos have their own panel order, independent of other porticos
- Each portico can use a different **layout mode** (Stylos, Seira, Rema, or Custom)
- **Dynamic panel height** can be toggled per-portico — cards grow to fit their content instead of being clipped at a fixed height
- The **Home** portico always shows panels with all of your active tags
- The **live preview** in Profile → Porticos shows a scaled-down thumbnail of the actual dashboard for that portico, updating whenever you change tags, layout, or column assignments

A typical use: one portico for work services (tagged "work"), one for media (tagged "media"), one for infrastructure (tagged "infra"). Switching between them is one click.

---

## How they fit together

```
Admin creates:
  Integration (TrueNAS credentials)
    ↓
  System Panel (TrueNAS panel, connected to integration)
    ↓
  Tags assigned to panel ("infra", "storage")
    ↓
  Group sharing (panel visible to "homelab" group)

User:
  Is member of "homelab" group → sees the panel
  Activates "infra" tag → panel appears
  Creates a Portico tagged "infra" → one-click view of all infra panels
  Reorders panels → their order, doesn't affect others
```

---

## Data flow

Understanding how data moves from your services to your dashboard helps explain why panels sometimes show slightly stale data — and why that's intentional.

```
Your service  →  Stoa backend  →  SQLite cache  →  Frontend panel
(Sonarr, etc.)   (Go process)     (on disk)        (React UI)
```

**Backend polling:** When you create an integration, the backend starts polling your service on a configurable interval (e.g. every 30 seconds for OPNsense, every 30 minutes for Sonarr). Each poll fetches fresh data from the service, processes it, and writes the result to the SQLite database. The integration record in the database holds both the connection config and the most recently fetched payload.

**The cache:** The backend stores the last successful response in the database. If your service goes offline briefly, panels continue to show the last known data rather than an error. When the service comes back, the next successful poll updates the cache automatically.

**Frontend panels:** When you open the dashboard, each panel calls `/api/panels/{id}/data` to retrieve the cached payload from the database. The backend decrypts credentials, checks if the cache is fresh enough, re-fetches if needed, and returns the data. The panel renders it immediately — there's no direct connection between your browser and the service being monitored.

**Why this matters:**
- Panels load fast because they read from a local database, not from your (potentially slow) services on every page load
- Sensitive credentials (API keys, passwords) stay on the server — they're never sent to the browser
- Refresh rate is controlled per-integration; a Sonarr queue doesn't need sub-second updates, but a torrent client speed display might want 15-second polling
- OAuth integrations (Spotify, Twitch, YouTube, Strava) store encrypted access and refresh tokens in the database; the backend refreshes them silently before they expire
