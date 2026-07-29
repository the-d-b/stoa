---
id: romm
name: RomM
category: Gaming
tags: [gaming, roms, self-hosted]
official_url: https://romm.app
status: needs-testing
polling: 15min
secret_format: username-password
url_required: true
example_url: http://192.168.1.10:8080
---

# RomM

## What is RomM?

RomM (ROM Manager) is a self-hosted app for organizing and browsing a retro-game ROM collection. It scans your library, enriches it with metadata and box art from external sources, and provides a web UI — including in-browser play — across many platforms.

**Official site:** [romm.app](https://romm.app)

---

## Getting the key

Use your RomM login in `username:password` form, or an API/Bearer token if you've configured one.

- **Secret format:** `username:password` or Bearer token
- **URL:** required — point at your RomM port, e.g. `http://192.168.1.10:8080`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the credential.
2. **Admin → Integrations → New** — select **RomM**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **RomM**.

---

## Panel

ROM library overview — total platforms, ROMs, and library size, with a per-platform list and a recently-added game cover grid.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total ROMs + platforms + size |
| 2-3x | Platform list + cover grid |
| 4x+ | Platform detail + full cover grid |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
