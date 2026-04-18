# Stoa

A self-hosted homelab dashboard — fast, modern, and built to stay out of your way.

Stoa connects to your services (Sonarr, TrueNAS, Proxmox, OPNsense, Plex, and more), pulls live data, and presents it in a clean, responsive dashboard. It supports multiple users, groups, tag-based filtering, and real-time updates via SSE and WebSocket.

![Stoa Dashboard](docs/screenshot.png)

---

## Features

- **Live data** — TrueNAS and OPNsense push updates in real-time via WebSocket/SSE. Other integrations poll on configurable intervals.
- **Multi-user** — users, groups, and tag-based access control. Each user gets their own layout.
- **Layout modes** — Stylos (column-fill), Seira (row-fill), and Rema (collapsible rows).
- **Porticos** — named dashboard views with independent tag filters and panel ordering.
- **Personal panels** — users can add their own integrations alongside shared system panels.
- **Bookmarks** — built-in bookmark manager with nested folders.
- **Glyphs & Tickers** — persistent status indicators and live data tickers.
- **OAuth/SSO** — supports Authentik, Keycloak, and any OIDC-compatible provider.
- **CLI** — `stoa-cli` for user management, database backup, and maintenance.

---

## Quick start

### Docker Compose

```yaml
services:
  stoa:
    image: ghcr.io/the-d-b/stoa:latest
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data/db
    environment:
      - STOA_JWT_SECRET=change-me-to-something-long-and-random
    restart: unless-stopped
```

```bash
docker compose up -d
```

Then open `http://localhost:8080` and follow the setup wizard.

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `STOA_JWT_SECRET` | **Yes** | — | Secret for signing JWTs. Use a long random string. |
| `STOA_DB_PATH` | No | `/data/db/stoa.db` | Path to the SQLite database file. |
| `STOA_PORT` | No | `8080` | Port to listen on. |
| `STOA_GEO_DB_PATH` | No | `/data/db/GeoLite2-City.mmdb` | Path to MaxMind GeoLite2 database for geo-IP lookup. |

---

## Setup wizard

On first run, Stoa walks you through:

1. **Deployment mode** — Single user (just you) or Multi user (teams, households, groups).
2. **Admin account** — Your permanent local admin account. Works even if OAuth is misconfigured.
3. **Authentication** — Configure OAuth/SSO, or use local accounts only.
4. **Tags** — Create your first tags for filtering panels.
5. **Groups** — (Multi-user only) Create your first group with tag assignments.

You can re-run parts of the setup from **Admin → Settings** at any time.

---

## CLI — stoa-cli

`stoa-cli` is a separate binary for administration tasks, useful in Docker environments or automation scripts.

```bash
# Docker
docker exec stoa stoa-cli user list

# Local
stoa-cli --db /data/db/stoa.db user list
```

### Commands

| Command | Description |
|---|---|
| `user list` | List all users |
| `user create` | Create a new user |
| `user reset-password` | Reset a user's password |
| `config show` | Show current configuration |
| `config set-mode <single\|multi>` | Switch deployment mode |
| `geo stats` | Show geo-IP database statistics |
| `geo prune [--older-than Nd]` | Remove old geo-IP cache entries |
| `storage prune [--dry-run]` | Remove orphaned storage entries |
| `db check` | Verify database integrity |
| `db backup <output.db>` | Create a database backup |
| `bookmarks export <output.json>` | Export bookmarks to JSON |
| `bookmarks import <input.json> [--replace]` | Import bookmarks from JSON |

---

## Documentation

- [Concepts — Users, Groups, Tags, Panels, Porticos](docs/concepts.md)
- [Integrations](docs/integrations.md)
- [Layout modes — Stylos, Seira, Rema](docs/layouts.md)
- [OAuth / SSO setup](docs/oauth.md)
- [CLI reference](docs/cli.md)

---

## Development

```bash
# Backend
cd backend
go run ./cmd/stoa

# Frontend
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api` to `localhost:8080`.

---

## License

MIT
