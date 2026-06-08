# Blue Iris

**Category:** Smart Home | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** username:password

> A Blue Iris user account with permission to access the JSON API. Create a dedicated API user in Blue Iris -> Users and Passwords.

**URL required:** Required

**Example URL:** `http://192.168.1.10:81`

### Setup

1. Blue Iris -> Users and Passwords -> create an API user
2. Format as username:password
3. Admin -> Secrets -> New: paste credential
4. Admin -> Integrations -> New: type Blue Iris, URL = http://blueiris-ip:81, secret
5. Admin -> Panels -> New: type Blue Iris

---

## Panel

System signal light (green/yellow/red), camera roster with per-camera status, active profile, recent alert feed with AI memo, trigger and clip counts.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Signal chip + cameras online/total + profile + version |
| 2-3x | Signal + stat chips + camera list + recent alerts |
| 4x+ | Three-column: system name/profiles / camera detail / alert feed |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Live streams: Blue Iris MJPEG streams at http://host:81/mjpg/shortname?user=admin&pw=password. Embed in a Text/HTML panel.