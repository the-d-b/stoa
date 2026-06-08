# Jellystat

**Category:** Media Servers | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** Plain API key

> Jellystat -> Settings -> API Key

**URL required:** Required

**Example URL:** `http://192.168.1.10:3004`

### Setup

1. Jellystat -> Settings -> generate or copy API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Jellystat, URL, secret
4. Admin -> Panels -> New: type Jellystat

---

## Panel

Watch history, most played content, top users, and views by library type. Time range configurable (7 / 30 / 90 days).

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total watch time + top title |
| 2-3x | Recent history + top users |
| 4x+ | Full stats + history + user breakdown |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*