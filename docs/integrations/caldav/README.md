# CalDAV

**Category:** Personal | **Status:** Need Testing | **Requires integration:** Yes

---

## Integration

**Secret format:** `username:password` — use an **app password** where the server supports them

**URL required:** Required — must be a specific **calendar collection**, not the server root

**Example URL (Nextcloud):** `https://cloud.example.com/remote.php/dav/calendars/USERNAME/personal/`

Works with any RFC 4791 CalDAV server: Nextcloud, Fastmail, Radicale, Baïkal, Synology Calendar, and others.

### Setup

1. Create an app password on your calendar server (Nextcloud: Settings → Security → Devices & sessions → "Create new app password")
2. Find your calendar collection URL (Nextcloud: Calendar → three-dot menu on a calendar → Edit → copy the private link, or build it from the pattern above)
3. Stoa → Admin → Secrets → New: `username:app-password`
4. Stoa → Admin → Integrations → New: type **CalDAV**, paste the collection URL, select the secret. The connection test verifies the URL is a DAV collection and the credentials work.
5. Add it to a Calendar panel: Profile/Admin → Calendar panel → Calendar sources → **Stoa integration**

There is no CalDAV panel — this integration exists solely as a calendar source.

---

## Calendar

- **Read:** events are fetched via a CalDAV `REPORT` calendar-query over a 90-day window and cached for 15 minutes (stale cache is served if the server is briefly unreachable). All-day and timed events are supported, and recurring events are expanded locally — including moved and cancelled instances.
- **Write:** CalDAV sources are writable — the calendar panel's **+** button and the full-screen overlay's **+ Add event** can create events on them (title, date, optional start/end times). A successful write busts the read cache so the event appears immediately.

Anyone who can see the panel can create events on its writable sources.

---

## Notes

- **One integration per calendar.** The URL points at a single calendar collection; to read/write several calendars, create one CalDAV integration each.
- **ICS vs CalDAV for Nextcloud:** the [ICS source](../calendar/README.md#ics--outlook--nextcloud) needs only a share link but is read-only; CalDAV needs credentials but can write. Don't add the same calendar both ways or events will appear twice.
- **Timed events** are stored in UTC on the server; display converts to the viewer's local timezone.
