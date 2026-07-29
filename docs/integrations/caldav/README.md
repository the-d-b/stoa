---
id: caldav
name: CalDAV
category: Digital Life
tags: [calendar, self-hosted]
official_url: https://datatracker.ietf.org/doc/html/rfc4791
status: needs-testing
url_required: true
secret_format: username-password
example_url: https://cloud.example.com/remote.php/dav/calendars/USERNAME/personal/
---

# CalDAV

## What is CalDAV?

CalDAV is an open standard (RFC 4791) for reading and writing calendars over HTTP, supported by Nextcloud, Fastmail, Radicale, Baïkal, Synology Calendar, Apple iCloud, and many others. In Stoa it isn't a panel of its own — you add a CalDAV calendar as a source in a Calendar panel. Because the protocol supports writing, those sources can also create events.

**Standard:** [RFC 4791](https://datatracker.ietf.org/doc/html/rfc4791)

---

## Getting the key

Create an **app password** on your calendar server where supported (Nextcloud: Settings → Security → Devices & sessions → "Create new app password"), then find your calendar collection URL.

- **Secret format:** `username:password` — use an app password where the server supports them
- **URL:** required — must be a specific **calendar collection**, not the server root. Example (Nextcloud): `https://cloud.example.com/remote.php/dav/calendars/USERNAME/personal/`

Works with any RFC 4791 CalDAV server: Nextcloud, Fastmail, Radicale, Baïkal, Synology Calendar, and others.

---

## Add it to Stoa

1. **Admin → Secrets → New** — `username:app-password`.
2. **Admin → Integrations → New** — select **CalDAV**, paste the collection URL, choose the secret. The connection test verifies the URL is a DAV collection and the credentials work.
3. Add it to a Calendar panel: **Profile/Admin → Calendar panel → Calendar sources → Stoa integration**.

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
