# Komga

**Category:** Photos & Libraries | **Status:** Need Testing | **Polling:** 30 min

---

## Integration

**Secret format:** username:password or plain API key

> Your Komga login credentials, or generate an API key in Komga -> Settings -> API Keys.

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. Format as username:password OR get API key from Komga -> Settings -> API Keys
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type Komga, URL, secret
4. Admin -> Panels -> New: type Komga

---

## Panel

Series count, book count, library list, and a recently-added series strip with cover thumbnails.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Series/book counts |
| 2-3x | Library list + recent series strip |
| 4x+ | Full stats + cover grid |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*