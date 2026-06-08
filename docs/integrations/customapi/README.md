# Custom API

**Category:** Productivity | **Status:** Tested | **Requires integration:** No - data stored locally in Stoa

---

## Panel

A generic panel that makes a GET request to any URL and displays the JSON response as formatted text. Useful for services not natively supported in Stoa, simple status endpoints, or custom scripts that expose JSON.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Status indicator + key value |
| 2-3x | Formatted JSON response |
| 4x+ | Full JSON with syntax highlighting |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

The integration URL is the endpoint to call. An optional Bearer token can be stored as a secret.