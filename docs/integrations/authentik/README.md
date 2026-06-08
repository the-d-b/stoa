# Authentik

**Category:** VPN & Security | **Status:** Need Testing | **Polling:** 5 min

---

## Integration

**Secret format:** API token

> Authentik -> Admin interface -> System -> API Tokens -> Create

**URL required:** Required

**Example URL:** `https://auth.example.com`

### Setup

1. Authentik -> Admin -> System -> API Tokens -> create token
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Authentik, URL = https://your-authentik, secret
4. Admin -> Panels -> New: type Authentik

---

## Panel

Login counts, failed login attempts, recent failure details, active sessions.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Login count + failed attempts |
| 2-3x | Login stats + recent failures |
| 4x+ | Full login history + session detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*