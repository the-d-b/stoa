---
id: blueiris
name: Blue Iris
category: Digital Life
tags: [cameras, nvr, smart-home]
official_url: https://blueirissoftware.com
status: needs-testing
polling: 30s
secret_format: username-password
url_required: true
example_url: http://192.168.1.10:81
---

# Blue Iris

## What is Blue Iris?

Blue Iris is a Windows-based professional NVR / video-surveillance application. It records and manages many IP cameras with motion- and AI-triggered alerts, profiles, and remote access via web and mobile — a long-standing choice for Windows camera setups.

**Official site:** [blueirissoftware.com](https://blueirissoftware.com)

---

## Getting the key

Create a Blue Iris user account with permission to access the JSON API (Blue Iris → **Users and Passwords**). Use it in `username:password` form.

- **Secret format:** `username:password`
- **URL:** required — point at the Blue Iris web server, e.g. `http://192.168.1.10:81`

---

## Add it to Stoa

1. Blue Iris → **Users and Passwords** → create an API user.
2. **Admin → Secrets → New** — paste `username:password`.
3. **Admin → Integrations → New** — select **Blue Iris**, enter the URL, choose the secret.
4. **Admin → Panels → New** — select **Blue Iris**.

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

Live streams: Blue Iris MJPEG streams at `http://host:81/mjpg/shortname?user=admin&pw=password`. Embed in a Text/HTML panel.
