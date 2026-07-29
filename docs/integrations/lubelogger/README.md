---
id: lubelogger
name: LubeLogger
category: Digital Life
tags: [vehicles, self-hosted]
official_url: https://lubelogger.com
status: tested
polling: 15min
secret_format: username-password
url_required: true
example_url: http://192.168.1.10:8080
---

# LubeLogger

## What is LubeLogger?

LubeLogger is a self-hosted vehicle-maintenance and fuel-mileage tracker. It records service history, odometer readings, and upcoming maintenance reminders per vehicle, helping you stay on top of oil changes, registrations, and repairs across your fleet.

**Official site:** [lubelogger.com](https://lubelogger.com)

---

## Getting the key

If authentication is enabled in LubeLogger, use your login in `username:password` form. If auth is disabled (the default for self-hosted installs), leave the secret blank.

- **Secret format:** `username:password`, or blank if auth is disabled
- **URL:** required — point at your LubeLogger address, e.g. `http://192.168.1.10:8080`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `username:password`, or create a blank secret if auth is disabled.
2. **Admin → Integrations → New** — select **LubeLogger**, enter the URL, choose the secret → **Save**.
3. **Admin → Panels → New** — select **LubeLogger**.

---

## Panel

Vehicle maintenance dashboard with a per-vehicle carousel. Each slide shows the vehicle photo (at 4x+), urgency-color-coded reminders, and recent service history. The carousel auto-advances every 30 seconds. Navigation dots at the bottom let you jump to any vehicle manually.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Fleet count chip + overdue/urgent/all-good summary |
| 2–3x | Auto-advancing carousel — vehicle name, odometer, reminders, service history (no photo) |
| 4x+ | Same carousel with vehicle photo above the data |

### Screenshots

| | Dark | Light |
|---|---|---|
| **1x** | ![1x dark](./screenshots/1x-dark.png) | ![1x light](./screenshots/1x-light.png) |
| **2x** | ![2x dark](./screenshots/2x-dark.png) | ![2x light](./screenshots/2x-light.png) |
| **4x** | ![4x dark](./screenshots/4x-dark.png) | ![4x light](./screenshots/4x-light.png) |

---

## Notes

- **No auth:** LubeLogger allows anonymous access by default — leave the secret blank and it works out of the box
- **Vehicle photos:** Upload a photo to each vehicle in LubeLogger (Vehicle → Edit → Image) and it will appear in the 4x+ panel view
- **Reminders:** Urgency levels are color-coded — purple (not urgent) → amber (urgent) → orange (very urgent) → red (past due)
- **Calendar:** Add LubeLogger as a calendar source in Stoa to see date-bound maintenance reminders on the calendar panel
- **Carousel:** With multiple vehicles the panel cycles automatically every 30 seconds; clicking a dot resets the timer and jumps to that vehicle
