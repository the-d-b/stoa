# Prowlarr

**Category:** Media Management | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** Plain API key

> Prowlarr -> Settings -> General -> Security -> API Key

**URL required:** Required

**Example URL:** `http://192.168.1.10:9696`

### Setup

1. Prowlarr -> Settings -> General -> copy API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Prowlarr, URL, secret
4. Admin -> Panels -> New: type Prowlarr

---

## Panel

Indexer health across torrent and usenet sources, per-indexer grab counts and response times, connected *arr app sync status, system health issues.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Enabled/total indexers + health issues |
| 2-3x | Health donut + indexer list |
| 4x+ | Full indexer roster + app sync + lifetime stats |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*