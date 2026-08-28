# Dev environment setup (Windows, no Docker)

Running Stoa's backend and frontend directly from source on a Windows workstation, for development or beta testing without a Docker host. Both processes run in the foreground in separate terminals; there's no build/install step beyond the initial tool setup.

---

## Prerequisites

| Tool | Why | Notes |
|---|---|---|
| [Git for Windows](https://git-scm.com/download/win) | Clone the repo | Also provides Git Bash, useful for `openssl` below |
| [Go 1.23+](https://go.dev/dl/) | Backend | Recommend **1.26** specifically — Stoa's production image uses it, and at least one integration (Life360) has broken in the past on older Go due to TLS `ClientHello` fingerprint differences between Go versions. Anything 1.23+ builds and runs fine for general dev work; 1.26 avoids that one class of surprise. |
| A C compiler (MinGW-w64/GCC) | Backend — **required**, not optional | Stoa's SQLite driver (`mattn/go-sqlite3`) uses CGO, which needs a real C compiler to build on Windows. Without this, `go run` fails with an error mentioning `gcc` or gives cgo/C-compiler-not-found errors. Easiest path: install [MSYS2](https://www.msys2.org/), then from the MSYS2 shell run `pacman -S mingw-w64-x86_64-gcc`, then add `C:\msys64\mingw64\bin` to your Windows `PATH`. |
| [Node.js 20 LTS](https://nodejs.org/) | Frontend | Includes `npm`. Stoa's own CI pins Node 20 — matching it avoids version-specific surprises. |

### Verify before continuing

```powershell
git --version
go version              # should report go1.23 or newer
gcc --version            # must succeed — if this fails, the backend will not build
node --version           # v20.x
npm --version
```

If `gcc --version` fails after installing MSYS2, it's almost always a `PATH` problem — open a **new** PowerShell window (PATH changes don't apply to already-open terminals) and try again.

---

## 1. Clone the repo

```powershell
git clone https://github.com/the-d-b/stoa.git
cd stoa
```

Stoa is a two-module monorepo: `backend/` (Go) and `frontend/` (Vite/React), each with their own dependency files (`backend/go.mod`, `frontend/package.json`). You'll run commands from inside each, not the repo root.

---

## 2. Run the backend

Everything below happens in **one terminal**, which you'll leave running.

### Set environment variables

Stoa's config defaults (`backend/internal/config/config.go`) assume a Linux container filesystem (`/data/db`, `/data/icons`, etc.) — those paths don't make sense on a Windows workstation, so override them to a local folder. Do this from PowerShell, in the `backend` directory:

```powershell
cd backend

$env:STOA_SESSION_SECRET = "dev-only-secret-change-me"
$env:STOA_DB_PATH = "./devdata/db/stoa.db"
$env:STOA_ICONS_DIR = "./devdata/icons"
$env:STOA_CSS_DIR = "./devdata/css"
$env:STOA_ATTACHMENTS_DIR = "./devdata/attachments"
```

These folders don't need to exist beforehand — Stoa creates them automatically on startup. `$env:` variables set this way only last for the current PowerShell session; you'll need to re-run this block (or wrap it in a `.ps1` script) each time you open a new terminal to work on the backend.

For a real random session secret instead of the placeholder above, either use Git Bash (which ships `openssl`):

```bash
openssl rand -hex 32
```

or pure PowerShell:

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

### Start it

```powershell
go run ./cmd/stoa
```

First run downloads Go module dependencies automatically (via `go.sum`) — this can take a minute. Success looks like:

```
Stoa listening on :8080
```

Migrations run automatically on every startup — nothing separate to run there. Leave this terminal open; the backend serves the API at `http://localhost:8080` but you won't browse to that directly (see below).

---

## 3. Run the frontend

Open a **second, separate terminal** — the backend needs to keep running in the first one.

```powershell
cd stoa\frontend
npm install
npm run dev
```

`npm install` only needs to run once (or after `package.json` changes). `npm run dev` starts Vite's dev server on **`http://localhost:5173`**, and automatically regenerates the integration catalog first (via the `predev` script) — no separate step needed there either.

Vite is already configured (`frontend/vite.config.ts`) to proxy any `/api/*` request to `http://localhost:8080` — the backend from step 2. This means the browser only ever talks to `localhost:5173`; there's no CORS configuration to worry about, and no need to change `STOA_ALLOWED_ORIGINS`.

---

## 4. First run

Open **`http://localhost:5173`** in a browser. You'll land on the same first-run setup flow as a fresh Docker install — create the first admin account, then proceed as in [Getting started](getting-started.md) from Step 1 onward.

---

## Day-to-day use

- **Both terminals need to stay running** while you use Stoa — `Ctrl+C` in either one stops that half.
- Data persists in `backend/devdata/` between runs (it's just a folder on disk) — stopping and restarting both processes picks up right where you left off. Delete that folder to reset to a clean install.
- Editing frontend code hot-reloads automatically (Vite). Editing backend Go code does **not** hot-reload — stop the backend (`Ctrl+C`) and re-run `go run ./cmd/stoa` to pick up changes. (Re-exporting the `$env:` variables isn't necessary if you're reusing the same terminal — they're still set for that session.)
- If you close and reopen the backend's terminal, re-run the `$env:` block from step 2 before `go run ./cmd/stoa` — those variables don't persist across terminal sessions.

---

## Troubleshooting

**`go run` fails mentioning `gcc`, `cgo`, or "C compiler"** — the C compiler prerequisite above is missing or not on `PATH`. Open a fresh terminal after installing MSYS2 and confirm `gcc --version` works before retrying.

**Frontend loads but every action fails / spinners never resolve** — the backend isn't running, isn't listening on port 8080, or `STOA_PORT` was changed without updating `frontend/vite.config.ts`'s proxy target to match. Check the backend terminal for the `Stoa listening on :8080` line.

**"integration not found" / catalog looks stale after pulling new changes** — `npm run dev`'s `predev` script regenerates the catalog automatically, but only when `npm run dev` itself is (re)started. If you pulled changes to `docs/integrations/*/README.md` while the dev server was already running, stop (`Ctrl+C`) and restart `npm run dev` to pick them up.
