# LubeLogger

**Category:** Smart Home | **Status:** Need Testing | **Polling:** 15 min

---

## Integration

**Secret format:** username:password or Bearer token

> Your LubeLogger login, or an API token from LubeLogger -> Settings -> API.

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. Format as username:password or get API token from LubeLogger -> Settings
2. Admin -> Secrets -> New: paste credential
3. Admin -> Integrations -> New: type LubeLogger, URL = http://lubelogger:8080, secret
4. Admin -> Panels -> New: type LubeLogger

---

## Panel

Vehicle maintenance panel - urgency-color-coded reminder list per vehicle, odometer readings, and service history log.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Fleet count + overdue/urgent chips |
| 2-3x | Chips + per-vehicle reminder lists |
| 4x+ | All vehicles with full reminder lists + combined service history |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Calendar: Add LubeLogger as a calendar source to see date-bound maintenance reminders on the calendar.