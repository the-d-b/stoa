---
id: homeassistant
name: Home Assistant
category: Digital Life
tags: [smart-home, automation, self-hosted]
official_url: https://www.home-assistant.io
status: needs-testing
polling: 60s
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:8123
---

# Home Assistant

## What is Home Assistant?

Home Assistant is an open-source home-automation platform that connects and controls your smart-home devices locally. It integrates thousands of brands and protocols under one interface, exposes everything as entities you can automate, and keeps control on your own hardware rather than the cloud.

**Official site:** [home-assistant.io](https://www.home-assistant.io)

---

## Getting the key

Home Assistant → **Profile** (bottom-left) → **Long-Lived Access Tokens → Create Token** (at the very bottom of the Profile page) — copy it.

- **Secret format:** long-lived access token
- **URL:** required — point at your Home Assistant port, e.g. `http://192.168.1.10:8123`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the token.
2. **Admin → Integrations → New** — select **Home Assistant**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Home Assistant**, and configure domain/entity filters in the panel config.

---

## Panel

Entity states for smart home devices. Filter by entity ID or domain (sensor, light, switch, etc.). Shows friendly name, state, unit, and last-changed time.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Entity count + quick state summary |
| 2-3x | Filtered entity list with states |
| 4x+ | Full entity list with last-changed times |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Calendar

Add Home Assistant as a calendar source (Profile/Admin → Calendar panel → Calendar sources → **Stoa integration**) to see events from all of HA's calendar entities on the Stoa calendar — local calendars, synced Google/CalDAV calendars, waste collection, birthdays, and anything else exposed as a `calendar.*` entity. All calendars share one source pill; titles are prefixed with the calendar name when there's more than one. See [Calendar](../calendar/README.md#home-assistant) for details, including a duplicate warning when HA syncs a calendar Stoa also reads directly.

---

## Notes

Entity filters: configure a comma-separated list of domains or entity IDs in the panel config to show only the entities you care about.
