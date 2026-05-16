# Contributing

Thanks for your interest in Stoa.

---

## Running locally

**Backend** — Go 1.22+, SQLite (CGO required)

```bash
cd backend
go run ./cmd/stoa
```

The API listens on `:8080`. The database is created at `/data/db/stoa.db` by default — override with `STOA_DB_PATH`.

**Frontend** — Node 20+

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on `:5173` and proxies `/api` requests to the backend at `:8080`.

**Environment:**

```bash
export STOA_SESSION_SECRET="dev-secret-not-for-production"
```

---

## Reporting bugs

Open an issue using the **Bug report** template. Include:
- What you did
- What you expected
- What actually happened
- Stoa version and how you're running it (Docker, local build)
- Relevant logs if applicable (`docker logs stoa-backend`)

---

## Requesting features

Open an issue using the **Feature request** template. Describe the use case — what you're trying to do and why the current behaviour doesn't cover it.

---

## Pull requests

- Open an issue first for anything non-trivial so we can discuss before you invest the time
- Keep PRs focused — one thing per PR
- Match the existing code style (no linters configured, just be consistent)
- Test your changes against a real instance before submitting

---

## Project structure

```
backend/
  cmd/stoa/         — server entry point
  cmd/stoa-cli/     — CLI tool
  internal/
    auth/           — JWT, OAuth
    config/         — environment variable loading
    db/             — database init and migrations
    handlers/       — HTTP handlers (one file per integration)
    migrations/     — SQLite migrations
    models/         — shared types

frontend/
  src/
    api/            — typed API client
    components/     — shared UI components
      admin/        — admin panel components
      panels/       — one component per panel type
    pages/          — route-level page components
```
