---
id: frigate
name: Frigate
category: Digital Life
tags: [cameras, nvr, smart-home, self-hosted]
official_url: https://frigate.video
status: needs-testing
polling: 15s
secret_format: none
url_required: true
example_url: http://192.168.1.10:5000
---

# Frigate

## What is Frigate?

Frigate is an open-source network video recorder (NVR) with real-time, local AI object detection. It processes your IP camera feeds on your own hardware (optionally with a Coral TPU or GPU) to detect people, cars, and animals, recording and alerting without sending video to the cloud. It integrates tightly with Home Assistant.

**Official site:** [frigate.video](https://frigate.video)

---

## Getting the key

Most homelab Frigate instances run without auth (port 5000) — leave the secret blank. If you enabled built-in Frigate authentication, get a Bearer token from Frigate → Settings → Users.

- **Secret format:** blank (unauthenticated) or Bearer token
- **URL:** required — point at your Frigate port, e.g. `http://192.168.1.10:5000`

---

## Add it to Stoa

1. **Admin → Secrets → New** — leave blank, or paste a Bearer token if auth is enabled.
2. **Admin → Integrations → New** — select **Frigate**, enter the URL, choose the secret (or none).
3. **Admin → Panels → New** — select **Frigate**.

---

## Panel

NVR camera panel — camera roster with detection FPS, zone configuration with object filters, recent detection events by label and score, and detector inference speed.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Camera count + zone count + detector speed + event count |
| 2-3x | Stat chips + camera list with FPS + events feed |
| 4x+ | Three-column: cameras + zones + events feed |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Live streams: Use a Text/HTML panel with `<img src=http://frigate:5000/api/camera_name/stream>` to embed live MJPEG streams.
