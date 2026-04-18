# CLI reference — stoa-cli

`stoa-cli` is a separate binary for administrative tasks. It connects directly to the SQLite database, so it works even when the Stoa server is stopped.

---

## Installation

`stoa-cli` is built alongside `stoa` and included in the Docker image.

```bash
# Docker
docker exec stoa stoa-cli [command]

# Local build
cd backend
go build -o stoa-cli ./cmd/stoa-cli
```

---

## Database path

`stoa-cli` needs to know where the database is. In order of precedence:

1. `--db <path>` flag
2. `STOA_DB_PATH` environment variable
3. Default: `/data/db/stoa.db`

```bash
stoa-cli --db /custom/path/stoa.db user list
```

---

## User management

### `user list`
List all users with their ID, username, email, role, and account type.

```bash
stoa-cli user list
```

### `user create`
Create a new local user interactively.

```bash
stoa-cli user create
```

### `user reset-password`
Reset a user's password. Prompts for the username and new password.

```bash
stoa-cli user reset-password
```

---

## Configuration

### `config show`
Display the current Stoa configuration (mode, OAuth settings, etc.).

```bash
stoa-cli config show
```

### `config set-mode`
Switch between single-user and multi-user deployment modes.

```bash
stoa-cli config set-mode single
stoa-cli config set-mode multi
```

**Note:** Switching modes is experimental and may affect data visibility. Only do this if you're intentionally changing your deployment.

---

## Geo-IP

### `geo stats`
Show geo-IP database statistics — entry count, database version, coverage.

```bash
stoa-cli geo stats
```

### `geo prune`
Remove old geo-IP cache entries to reduce database size.

```bash
stoa-cli geo prune                  # prune entries older than 30 days (default)
stoa-cli geo prune --older-than 7d  # prune entries older than 7 days
```

---

## Storage

### `storage prune`
Remove orphaned storage entries — records that reference deleted panels or users.

```bash
stoa-cli storage prune           # show what would be removed
stoa-cli storage prune --dry-run # same, explicitly dry-run
```

---

## Database

### `db check`
Run SQLite integrity checks on the database.

```bash
stoa-cli db check
```

### `db backup`
Create a hot backup of the database (safe to run while Stoa is running).

```bash
stoa-cli db backup /backups/stoa-$(date +%Y%m%d).db
```

---

## Bookmarks

### `bookmarks export`
Export all bookmarks to a JSON file.

```bash
stoa-cli bookmarks export bookmarks.json
```

### `bookmarks import`
Import bookmarks from a JSON file. By default, merges with existing bookmarks.

```bash
stoa-cli bookmarks import bookmarks.json           # merge
stoa-cli bookmarks import bookmarks.json --replace # replace all existing
```
