# Tdarr

**Category:** Media Management | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** Blank (no auth) or API key or username:password (reverse-proxy layer)

> Tdarr -> Tools -> API Keys for single-token auth. Leave blank for unauthenticated instances.

**URL required:** Required

**Example URL:** `http://192.168.1.10:8265`

### Setup

1. If using auth: Tdarr -> Tools -> API Keys -> create a key
2. Admin -> Secrets -> New: paste key (or leave blank)
3. Admin -> Integrations -> New: type Tdarr, URL, secret
4. Admin -> Panels -> New: type Tdarr

---

## Panel

Active and idle worker summary, per-worker progress (file, %, ETA), total files, files transcoded, files health-checked, space saved.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Active workers + space saved |
| 2-3x | Worker list with progress and ETA |
| 4x+ | Full worker detail with node and worker-type breakdown |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*