# Calendar

**Category:** Productivity | **Status:** ✅ Tested | **Requires integration:** No — sources configured per panel

---

## Panel

A multi-source calendar that aggregates events from any combination of:

- **Sonarr / Radarr / Lidarr / Readarr** — upcoming episode/movie/music/book releases
- **Google Calendar** — personal or shared Google calendars (via OAuth)
- **ICS / Outlook Calendar** — any calendar published as an `.ics` feed, including Outlook (Microsoft 365 / Outlook.com)
- **Checklist panels** — due dates from Stoa checklist items
- **Kanban panels** — due dates from Stoa kanban cards
- **LubeLogger** — upcoming vehicle maintenance reminders
- **Weather** — daily forecast events

Each source is configured independently with its own label, color, and days-ahead window (7–90 days).

### Height behavior

| Height | What you see |
|---|---|
| 1x | Today's event count + next upcoming event |
| 2-3x | Week-at-a-glance with event list |
| 4x+ | Full month calendar with event detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending — add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Source setup

Sources are managed per panel: **Profile → Calendar panel → Edit → Calendar sources** (for personal panels), or **Admin → Panels → Edit → Calendar sources** (for system panels).

---

### ICS / Outlook Calendar

No integration required — just a URL.

Stoa fetches the `.ics` feed from the URL on each poll, parses events, and applies your configured days-ahead window. The URL is stored in the panel config and never leaves your Stoa server.

#### Getting the Outlook publish URL (Microsoft 365 / Outlook.com)

1. Open **Outlook on the web** (`outlook.office365.com` or `outlook.com`)
2. Go to **Settings** (gear icon) → **Calendar** → **Shared calendars**
3. Under **Publish a calendar**, select the calendar you want to share
4. Set permissions to **"Can view all details"**
5. Click **Publish** — two links appear; copy the **ICS** link (ends in `/calendar.ics`)
6. In Stoa: add source → **ICS / Outlook Calendar** → paste the URL, give it a label, pick a days-ahead window

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

### Google Calendar

Requires a Google OAuth integration. See [docs/oauth.md](../../oauth.md) for setup.

Once OAuth is configured, add source → **Google Calendar** → select an account and a calendar.

---

### Arr sources (Sonarr / Radarr / Lidarr / Readarr)

Requires the corresponding integration to already be set up. Add source → **Stoa integration** → select the integration. The days-ahead window controls how far forward Stoa looks for scheduled releases.

---

## Polling

The calendar backend polls each ICS feed at most once per 15 minutes and caches the result. Arr sources and Google Calendar follow their own integration polling cadence. Forcing a manual refresh (panel menu → Refresh) bypasses the cache for that poll.
