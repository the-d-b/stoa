# stoa

A self-hosted personal dashboard with tag-based filtering, multi-user support, and OAuth SSO.

## Status

🚧 Active development — v0.0.1

## v0.0.1 — Identity Foundation

- First-run setup wizard (admin account + app URL)
- Local admin login (permanent fallback)
- OAuth / OIDC SSO via Authentik (or any OIDC provider)
- First OAuth user auto-promoted to admin
- User management (list, promote/demote, remove)
- Group management (create, delete, assign users)
- Tag management (create, delete, assign to groups)
- Group → tag access control (foundation for v0.0.2 content filtering)
- Clean dark UI with live clock

## Roadmap

- **v0.0.2** — Bookmark manager with tag-based filtering
- **v0.0.3** — Service tiles with live status widgets
- **v0.0.4** — Plugin system for service integrations
- **v0.0.5** — Per-user tag filtering and personalized views

## Stack

- **Backend**: Go + SQLite
- **Frontend**: React + TypeScript + Tailwind CSS
- **Auth**: JWT + OIDC (Authentik)
- **Deploy**: Docker / TrueNAS Custom App

## Deployment

See `truenas-app.yaml` for TrueNAS Custom App deployment.

### Datasets required

```
pool/
  path/
    stoa/
      db/        ← SQLite database
      icons/     ← custom icons (v0.0.3+)
```

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

## License

MIT
