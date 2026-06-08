# Uptime Kuma

**Category:** Monitoring | **Status:** Tested | **Polling:** 60 s

---

## Integration

**Secret format:** Blank (no auth) or plain API key (Kuma 1.23+)

> Kuma 1.23+: Settings -> API Keys -> Add. Older versions run without auth - leave blank.

**URL required:** Required

**Example URL:** `http://192.168.1.10:3001`

### Setup

1. Kuma 1.23+: Settings -> API Keys -> create key (older: leave blank)
2. Admin -> Secrets -> New: paste key or leave blank
3. Admin -> Integrations -> New: type Uptime Kuma, URL = http://kuma:3001, secret
4. Admin -> Panels -> New: type Uptime Kuma

---

## Panel

Monitor status (up/down/pending), response times, uptime percentages, incident history.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Up/down count + overall status |
| 2-3x | Monitor list with status dots + response times |
| 4x+ | Full monitor list + uptime bars + incident history |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*