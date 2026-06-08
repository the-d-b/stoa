# Docspell

**Category:** Documents | **Status:** Need Testing | **Polling:** 15 min

---

## Integration

**Secret format:** account:password

> For multi-collective setups: collective/user:password. For single-collective: user:password. Stoa exchanges these for a session token.

**URL required:** Required

**Example URL:** `http://192.168.1.10:7880`

### Setup

1. Format as collective/user:password (or user:password for single-collective)
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type Docspell, URL = http://docspell:7880, secret
4. Admin -> Panels -> New: type Docspell

---

## Panel

Document archive stats (item count, storage, tag count) and a recent document list with name, date, correspondent, folder, and tags.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Items + storage + tags |
| 2-3x | Chips + recent document list |
| 4x+ | Two-column: stats + full recent list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*