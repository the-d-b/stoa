# Home Assistant

**Category:** Smart Home | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** Long-lived access token

> Home Assistant -> Profile -> Long-Lived Access Tokens -> Create Token (at the very bottom of the Profile page).

**URL required:** Required

**Example URL:** `http://192.168.1.10:8123`

### Setup

1. Home Assistant -> Profile (bottom-left) -> Long-Lived Access Tokens -> Create Token
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Home Assistant, URL = http://homeassistant:8123, secret
4. Admin -> Panels -> New: type Home Assistant - configure domain/entity filters in panel config

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