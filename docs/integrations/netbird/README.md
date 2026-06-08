# Netbird

**Category:** VPN & Security | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** Personal Access Token (PAT)

> Netbird -> Settings -> Personal Access Tokens -> Create. For self-hosted use your management URL; for cloud use https://api.netbird.io.

**URL required:** Required (self-hosted) or cloud

**Example URL:** `https://api.netbird.io`

### Setup

1. Netbird -> Settings -> Personal Access Tokens -> create a PAT
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Netbird, URL = https://api.netbird.io (or self-hosted URL), secret
4. Admin -> Panels -> New: type Netbird

---

## Panel

WireGuard mesh VPN panel - peer roster with online/offline/expired status, last-seen time, OS, IP, SSH status, group membership, and policy list.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Online/offline/expired + groups + policies |
| 2-3x | Chips + peer list + group list |
| 4x+ | Two-column: full peer detail / groups + policy list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*