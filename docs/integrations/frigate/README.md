# Frigate

**Category:** Smart Home | **Status:** Need Testing | **Polling:** 15 s

---

## Integration

**Secret format:** Blank (unauthenticated) or Bearer token

> Most home lab Frigate instances run without auth (port 5000). If you enabled built-in Frigate authentication, get a token from Frigate -> Settings -> Users.

**URL required:** Required

**Example URL:** `http://192.168.1.10:5000`

### Setup

1. Leave blank for unauthenticated instances (common on port 5000)
2. If auth enabled: Frigate -> Settings -> Users -> generate Bearer token
3. Admin -> Integrations -> New: type Frigate, URL = http://frigate:5000, secret (or blank)
4. Admin -> Panels -> New: type Frigate

---

## Panel

NVR camera panel - camera roster with detection FPS, zone configuration with object filters, recent detection events by label and score, and detector inference speed.

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

Live streams: Use a Text/HTML panel with <img src=http://frigate:5000/api/camera_name/stream> to embed live MJPEG streams.