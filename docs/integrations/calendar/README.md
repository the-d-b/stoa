# Calendar

**Category:** Productivity | **Status:** ✅ Tested | **Requires integration:** No — sources configured per panel

---

## Panel

A multi-source calendar that aggregates events from any combination of:

- **Sonarr / Radarr / Lidarr / Readarr** — upcoming episode/movie/music/book releases
- **Google Calendar** — personal or shared Google calendars (via OAuth)
- **ICS / Outlook / Nextcloud** — any calendar published as an `.ics` feed, including Outlook (Microsoft 365 / Outlook.com) and Nextcloud (read-only)
- **CalDAV** — any RFC 4791 calendar server (Nextcloud, Fastmail, Radicale, Baïkal, Synology) — **read and write**
- **Checklist panels** — due dates from Stoa checklist items
- **Kanban panels** — due dates from Stoa kanban cards
- **LubeLogger** — upcoming vehicle maintenance reminders
- **Actual Budget** — upcoming scheduled transactions (bills), surfaced 3 days before their due date
- **Firefly III** — upcoming bill payment dates and recurring transactions, surfaced 3 days before their due date
- **Kapowarr** — upcoming comic issue release dates for monitored volumes
- **Mylar3** — upcoming comic issue release dates for monitored series
- **Maintainerr** — scheduled media cleanup actions (deletions, unmonitors) per collection
- **Home Assistant** — events from all HA calendar entities (local calendars, synced Google/CalDAV, waste collection, birthdays, …)
- **Weather** — daily forecast events

Each source is configured independently with its own label, color, and days-ahead window (7–90 days).

### Height behavior

| Height | What you see |
|---|---|
| 1x | Today's event count + next upcoming event |
| 2-3x | Week-at-a-glance with event list |
| 4x+ | Full month calendar with event detail |

### Full-screen view

At 2x+ heights, the ⛶ button next to the month navigation opens a full-screen calendar overlay (desktop only): a large month grid with in-cell event chips and weather icons, free navigation to any month past or future, a day agenda beside the grid, and per-source filter pills. Months outside the sources' fetch windows render as an empty calendar — handy for just looking up dates. Press Escape or click the backdrop to close.

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending — add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Source setup

Sources are managed per panel: **Profile → Calendar panel → Edit → Calendar sources** (for personal panels), or **Admin → Panels → Edit → Calendar sources** (for system panels).

---

### ICS / Outlook / Nextcloud

No integration required — just a URL.

Stoa fetches the `.ics` feed from the URL on each poll, parses events, and applies your configured days-ahead window. The URL is stored in the panel config and never leaves your Stoa server.

#### Getting the Outlook publish URL (Microsoft 365 / Outlook.com)

1. Open **Outlook on the web** (`outlook.office365.com` or `outlook.com`)
2. Go to **Settings** (gear icon) → **Calendar** → **Shared calendars**
3. Under **Publish a calendar**, select the calendar you want to share
4. Set permissions to **"Can view all details"**
5. Click **Publish** — two links appear; copy the **ICS** link (ends in `/calendar.ics`)
6. In Stoa: add source → **ICS / Outlook / Nextcloud** → paste the URL, give it a label, pick a days-ahead window

> **Note:** The published ICS URL contains a secret token — treat it like a password. Anyone with the URL can read your calendar. Stoa fetches it server-side only; it is never exposed to the browser.

> **Corporate networks:** If your Stoa server cannot reach `outlook.office365.com` directly (e.g., it is air-gapped or on a restricted VLAN), the feed will fail silently. Stoa must have outbound HTTPS access to the URL you provide.

#### Other ICS sources

The same setup works for any standards-compliant `.ics` / iCal feed:

| Source | How to get the URL |
|---|---|
| Apple iCloud | iCloud.com → Calendar → share icon next to a calendar → **Public Calendar** → copy the `webcal://` URL (change `webcal://` to `https://` before pasting) |
| Nextcloud | Nextcloud → Calendar → share icon → **Copy private link** (ends in `?export`) |
| Fastmail | Fastmail → Calendar → gear → **Export / Subscribe** → ICS URL |
| Proton Calendar | Proton Calendar → calendar settings → **Copy link** |
| Any CalDAV server | Use the calendar's direct `.ics` export URL |

---

### CalDAV (read/write)

Requires a CalDAV integration: Admin → Integrations → New → **CalDAV**. The URL must point at a specific **calendar collection**, not the server root — e.g. Nextcloud: `https://cloud.example.com/remote.php/dav/calendars/USERNAME/personal/`. The secret is `username:password`; use an **app password** (Nextcloud: Settings → Security → Devices & sessions). Then add source → **Stoa integration** → select the integration.

Events (all-day and timed, with full recurrence expansion) appear under one pill labeled with the integration's name. CalDAV sources are **writable** — they join Google Calendar in the add-event form. Events are fetched over a 90-day window on the integration's own configured refresh interval (see [Polling](#polling) below); a successful write busts the cache and re-fetches immediately so the new event appears right away rather than waiting for the next tick.

Compared to the ICS source: ICS needs only a share URL but is read-only and depends on the server's publish feature; CalDAV needs credentials but reads the calendar directly and can create events. For a Nextcloud calendar you want to write to, use CalDAV; for one you only watch, either works.

---

### Google Calendar

Requires a Google OAuth integration. See [docs/oauth.md](../../oauth.md) for setup.

Once OAuth is configured, add source → **Google Calendar** → select an account and a calendar.

Each connected Google account refreshes on its own background schedule, set per account in the connected-accounts list (Profile → Google, or Admin → Google Calendar for system accounts) — 15 min, 30 min (default), 1 hour, 3 hours, or 6 hours. Pick a shorter interval for an account whose calendar changes often; there's no per-panel setting since one account can back multiple calendar sources across panels.

#### Creating events (write)

Google Calendar and CalDAV are Stoa's **writable** calendar sources. When a calendar panel has at least one writable source, a **+** button appears next to the month navigation (and **+ Add event** in the full-screen overlay's day agenda). The form takes a title, date, and optional start/end times — leave the start time empty for an all-day event; an end time defaults to one hour after start. When the panel has multiple writable sources, a picker chooses the target.

Anyone who can see the panel can create events on its writable sources.

> **Re-authorization required:** write access uses the `calendar.events` OAuth scope, added in v0.15.3. Google accounts connected before that keep working for **reading**, but event creation will fail with a "reconnect this Google account" error until the account is reconnected (Profile → Google, or Admin → Google for system accounts).

---

### Arr sources (Sonarr / Radarr / Lidarr / Readarr)

Requires the corresponding integration to already be set up. Add source → **Stoa integration** → select the integration. The days-ahead window controls how far forward Stoa looks for scheduled releases.

---

### Actual Budget

Requires an Actual Budget integration (see [Actual Budget](../actualbudget/README.md) for the sidecar setup). Add source → **Stoa integration** → select the integration.

Upcoming scheduled transactions (Actual's **Schedules** feature) from all budgets on the instance appear as all-day events **3 days before** their due date — e.g. a bill due on the 10th shows on the 7th as "Due soon: Electric (Jul 10)". Bills due sooner than 3 days out appear today. Completed schedules are skipped. The event pill is labeled with the integration's name, and clicking an event opens the integration's UI URL. Schedules are polled at most once per 15 minutes.

Each schedule shows only its **next** occurrence — a weekly schedule appears once, not every week in the window (Actual precomputes only the next date).

---

### Firefly III

Requires a Firefly III integration. Add source → **Stoa integration** → select the integration.

Upcoming payment dates from both Firefly's **Bills / Subscriptions** and **Recurring transactions** features appear as all-day events **3 days before** their due date, same behavior as Actual Budget above. Unlike Actual, recurring bills show **every** expected occurrence in the window — Firefly computes the full payment schedule. Inactive bills/recurrences and bill payment dates already matched to a transaction are skipped, and an obligation modeled as both a bill and a recurrence is deduplicated. Polled at most once per 15 minutes.

> **Note:** Firefly only exposes the next few upcoming fire dates per recurring transaction, so with a large days-ahead window a frequent recurrence (e.g. daily) may not show occurrences all the way to the end of the window. Bills always cover the full window.

---

### Kapowarr

Requires a Kapowarr integration. Add source → **Stoa integration** → select the integration.

Upcoming comic issue release dates appear as all-day events on their release date, titled `Volume Title #issue`. Clicking an event opens the volume's page in Kapowarr. The event pill is labeled with the integration's name.

Kapowarr has no calendar API, so Stoa scans each **monitored** volume's issue list for future release dates (unmonitored volumes are skipped, capped at 300 volumes). Because this is one request per volume, it runs on the Kapowarr integration's own configured refresh interval (see [Polling](#polling) below) rather than being fetched at panel-view time.

---

### Home Assistant

Requires a Home Assistant integration. Add source → **Stoa integration** → select the integration.

Events from **all** of the HA instance's calendar entities appear on the calendar — local calendars, calendars synced into HA (Google, CalDAV, Office 365), waste-collection schedules, birthday calendars, and anything else an HA integration exposes as a `calendar.*` entity. Both all-day and timed events are supported (timed events show start/end times). Everything shares one pill labeled with the integration's name; when the instance has more than one calendar, event titles are prefixed with the calendar's name (`Trash pickup: Recycling`). Clicking an event opens HA's calendar view.

> **Duplicate warning:** if HA syncs a calendar that Stoa also reads directly (e.g. the same Google account added as a Google Calendar source), those events will appear twice. Add each calendar from only one side.

---

### Mylar3

Requires a Mylar3 integration. Add source → **Stoa integration** → select the integration.

Upcoming comic issue release dates (Mylar's **Upcoming** view, via the `getUpcoming` API command — a single call, no per-series scanning) appear as all-day events on their release date, titled `Series Name #issue`. Clicking an event opens the series page in Mylar3. The event pill is labeled with the integration's name. Polled at most once per 15 minutes.

---

### Maintainerr

Requires a Maintainerr integration. Add source → **Stoa integration** → select the integration.

Upcoming scheduled media cleanup actions appear as all-day events, aggregated per collection per day — e.g. `Old Movies: 3 items (Delete)`. The date is each media item's collection-add date plus the collection's *Take action after days* setting, and the action label reflects the collection's configured arr action (Delete, Unmonitor/Delete, Unmonitor/Keep, Change Quality, …) — the same data and date math Maintainerr's own calendar page uses (`/api/collections/overlay-data`, a single call). Collections set to "Do nothing" or without a delete-after window are skipped. Clicking an event opens the collection's page in Maintainerr. Polled at most once per 15 minutes.

---

## Polling

Every integration-backed source (Sonarr, Radarr, Readarr, Lidarr, LubeLogger, Kapowarr, Mylar3, Maintainerr, Actual Budget, Firefly III, Home Assistant, CalDAV, sports) computes its calendar events on its **own integration's existing background refresh cycle** — the same worker tick that already refreshes that integration's panel data. Viewing or returning to a calendar panel reads that pre-computed result; it never triggers a live fetch to Sonarr, Radarr, or any other source. This means a calendar panel's freshness for a given source matches that integration's configured refresh interval (Admin → Integrations → refresh interval), and viewing the panel is instant regardless of how many sources it has or how slow any one of them is to respond.

**Google Calendar** works the same way but on its own schedule, since a connected Google account isn't a normal integration: each connected account has an independent refresh interval (default 30 minutes, configurable per account in Profile → Google or Admin → Google Calendar). Token refresh happens transparently as part of that background cycle — no user-facing delay, ever.

**ICS/Outlook/Nextcloud** feeds and **weather** are unaffected — ICS keeps its existing 15-minute cache (it has no "integration" to hook a worker to), and weather already read from its integration's cache before this design existed.

**Writing an event** (Google or CalDAV) immediately invalidates that source's cached events and triggers a background re-fetch, so a newly created event appears on the very next calendar view rather than waiting for the next scheduled tick.

On a cold start — server just booted, or a source was just added as a calendar source before its integration's worker has ticked even once — the very first view for that source falls back to a one-time live fetch to avoid showing an empty calendar, then stays on the fast cached path afterward.
