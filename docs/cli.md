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
# Switch to multi-user mode (re-enables all accounts)
stoa-cli config set-mode multi

# Switch to single-user mode — all other accounts are disabled (data preserved)
stoa-cli config set-mode single --user <username>

# Single-user with no login required (auto-login)
stoa-cli config set-mode single --user <username> --no-auth
```

**Flags for `single` mode:**
- `--user <username>` — required; the account that will be the sole active user
- `--no-auth` — skip the login screen entirely; the dashboard loads without a password

**Note:** Other user accounts are disabled (not deleted) when switching to single-user mode. Switching back to `multi` re-enables them all.

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
stoa-cli geo prune                  # prune entries older than 90 days (default)
stoa-cli geo prune --older-than 7d  # prune entries older than 7 days
```

---

## Chat

### `chat prune`
Delete old AI chat messages to reduce database size.

```bash
stoa-cli chat prune --before 2026-01-01            # delete messages before a date
stoa-cli chat prune --before 2026-01-01 --dry-run  # show what would be deleted
```

**Flags:**
- `--before <YYYY-MM-DD>` — required; delete messages created before this date
- `--dry-run` — show the count without deleting anything

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
Copy the raw database file. Safe to run while Stoa is running (SQLite WAL mode ensures consistency). This copies the database only — no icons, uploads, or CSS.

```bash
stoa-cli db backup /backups/stoa-$(date +%Y%m%d).db
```

For a full backup including assets, use `backup create` instead.

---

## Full backups

### `backup create`
Create a full backup archive: database + icons + uploads + custom CSS, packaged as a `.tar.gz`.

```bash
stoa-cli backup create                                            # auto-named output
stoa-cli backup create --output /data/backups/stoa-2026-05.tar.gz
stoa-cli backup create --output /data/backups/stoa.tar.gz --data-dir /data
```

**Flags:**
- `--output <file>` / `-o <file>` — output path (default: `stoa-backup-YYYY-MM-DD-HHMMSS.tar.gz` in current directory)
- `--data-dir <dir>` — data root directory if using a non-standard layout (default: derived from `--db` path)

Safe to run while Stoa is running. The database is snapshotted via `VACUUM INTO` for a clean, consistent copy.

### `backup restore`
Restore a full backup archive. **Stop the Stoa server before restoring.**

```bash
stoa-cli backup restore /data/backups/stoa-2026-05.tar.gz
stoa-cli backup restore /data/backups/stoa-2026-05.tar.gz --yes         # skip confirmation
stoa-cli backup restore /data/backups/stoa-2026-05.tar.gz --data-dir /data
```

**Flags:**
- `--yes` / `-y` — skip the confirmation prompt
- `--data-dir <dir>` — data root directory if using a non-standard layout

The restore command validates the archive manifest before extracting and prints a summary of what it will overwrite.

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
