# Getting started

This guide walks you through setting up Stoa from scratch: installing it, creating your first panels, and shaping the dashboard to your preferences.

---

## Installation

### Docker (recommended)

```yaml
services:
  stoa-backend:
    image: ghcr.io/the-d-b/stoa-backend:latest
    container_name: stoa-backend
    volumes:
      - stoa-data:/data
    environment:
      STOA_SESSION_SECRET: "change-me-use-openssl-rand-hex-32"
    restart: unless-stopped
    networks:
      - stoa-net

  stoa-frontend:
    image: ghcr.io/the-d-b/stoa-frontend:latest
    container_name: stoa-frontend
    ports:
      - "8080:80"
    depends_on:
      - stoa-backend
    restart: unless-stopped
    networks:
      - stoa-net

networks:
  stoa-net:

volumes:
  stoa-data:
```

Stoa runs as two containers: `stoa-backend` (Go API + SQLite) and `stoa-frontend` (nginx serving the React app, proxying `/api/` to the backend). Only the frontend port needs to be exposed externally.

See [docker-compose.yml](../docker-compose.yml) for a full reference with all available environment variables.

### Volume mounts

Stoa uses a single data directory (`/data`) that you should mount as a persistent volume. Within it:

| Path | What's stored | Required? |
|---|---|---|
| `/data/db` | SQLite database — all configuration, users, panels, integrations | **Yes** |
| `/data/icons` | Custom bookmark icons uploaded by users | Recommended |
| `/data/css` | Custom CSS sheets uploaded per user for dashboard personalization | Recommended |
| `/data/attachments` | File attachments (notes, checklists) | Recommended |

If you mount the whole `/data` volume (as in the example above), all four subdirectories are covered automatically.

### Optional mounts

These are not part of `/data` and must be mounted separately if you need them:

**`/usr/local/share/ca-certificates`** — Custom CA certificates. Mount your host's CA directory here if any of your integrations use TLS certificates signed by a private CA. Without this, you'd have to enable "Skip TLS verify" on every integration using that CA.

```yaml
volumes:
  - /usr/local/share/ca-certificates:/usr/local/share/ca-certificates:ro
```

**`/var/run/docker.sock`** — Docker socket for the container management panel. Required only if you want to use the Docker control panel feature. Mount **without** `:ro` — start, stop, and restart actions require write access to the socket.

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

If you only want read-only container listing (no start/stop/restart), you can add `:ro`, but the action buttons will fail.

### First run

On first launch, Stoa creates the database and runs all migrations. Navigate to `http://your-host:8080` and you'll be prompted to create the first admin account.

---

## Order of operations

There's a natural setup order in Stoa. Skipping steps creates dependencies you'll need to fill in later.

```
1. Secrets         — store your API keys and credentials
2. Integrations    — connect to your services (reference secrets)
3. Panels          — create widgets that display integration data
4. Groups          — control who sees which panels
5. Tags            — label panels for filtering
6. Porticos        — save named views of your dashboard
7. Layout          — tune column counts, heights, and mode per portico
```

Each level builds on the one above. You don't need to finish every level before using the dashboard, but going out of order means backtracking.

---

## Step 1: Secrets

Secrets store credentials — API keys, passwords, tokens — encrypted at rest. Panels never get raw credentials; they reference a secret by ID.

**Admin → Secrets → New secret**

Give it a descriptive name (e.g. "Sonarr API Key") and paste your credential in the value field. See [Integrations](integrations/) for the format expected by each service.

---

## Step 2: Integrations

Integrations connect Stoa to your services. Each integration has:
- A **type** (Sonarr, Plex, TrueNAS, etc.)
- A **URL** — your service's base URL
- A **secret** — the credential to authenticate with
- Optional: skip TLS verify (for self-signed certificates)

**Admin → Integrations → New integration**

See [Integrations](integrations/) for service-specific setup guides.

### Express setup

If you're adding several Arr apps and Plex at once, use the express setup wizard instead of creating integrations one by one.

**Admin → Express Setup**

The wizard prompts for API keys and URLs for Sonarr, Radarr, Lidarr, Readarr, Plex, Tautulli, and Uptime Kuma. It creates secrets, integrations, and panels for each service you fill in, all in one step. Services already configured are automatically skipped.

---

## Step 3: Panels

Panels are the widgets on the dashboard.

**Admin → Panels → New panel**

Select the panel type, give it a title, select the integration it should use, and set its height (1×, 2×, 4×, or 8×). The panel is created but isn't visible yet — you need to share it with a group first.

**Tip:** Create all your panels before worrying about groups and tags. You can assign sharing and tags in bulk afterward.

---

## Step 4: Groups

Groups control which panels each user sees.

**Admin → Groups**

Every installation has a **default group** — new users are automatically added to it. Panels shared with the default group are visible to everyone by default.

To share a panel with a group: open the panel in Admin → Panels, scroll to the Groups section, and add the group.

For household or team setups, you might create additional groups like "family", "homelab", or "media" and share the relevant panels with each.

---

## Step 5: Tags

Tags let users filter what's visible on their dashboard without changing group membership.

**Admin → Tags → New tag**

After creating tags, assign them to panels in Admin → Panels. A panel can have multiple tags. Users activate the tags they care about — panels without any active tag are hidden.

Without tags, all panels a user can see are always visible. Tags are optional but become valuable once you have more than a few panels.

---

## Step 6: Porticos

Porticos are saved views — each with its own active tag set, layout, and panel order.

### Creating a portico

**Method 1 — From the dashboard:**
1. Use the tag filter to show the panels you want in this view
2. Click the bookmark icon (or "Save as portico") in the top bar
3. Give it a name

**Method 2 — From profile settings:**
1. Open Profile → Porticos
2. Click **+ New portico**
3. Configure tags, layout, and column count

---

## Step 7: Layout

With panels and porticos in place, tune the visual layout for each portico.

**Profile → Porticos → expand a portico**

- **Layout mode:** Stylos (column-fill), Seira (row-fill grid), Rema (flowing rows), Custom (manual column assignment). See [layouts.md](layouts.md) for a full comparison.
- **Columns:** 2–6 depending on the mode
- **Column height** (Stylos): when to wrap to the next column
- **Dynamic height:** let panels grow to fit content instead of clipping at the configured height
- **Panel order:** drag panels in Profile → Panel Order to set their order for this portico

---

## Password management

### Forgot your password (email method)

On the login page, click **Forgot password**. Enter your email address and a reset link is sent. The link expires after 30 minutes.

For this to work, SMTP must be configured — an admin can do that in Admin → Settings → Email.

### Emergency password reset (CLI)

If you can't log in and SMTP isn't configured, use `stoa-cli` directly on the server:

```bash
# Docker
docker exec -it stoa stoa-cli user reset-password

# Local
stoa-cli user reset-password
```

The CLI prompts for the username and new password. This works even when the Stoa server is stopped.

### Admin sending a reset link

Admins can send a reset link to any user from Admin → Users → select user → Send reset link. This emails a link to the user's address without the admin seeing the new password.

---

## What's next

- [Integrations](integrations/) — master chart and per-integration setup guides with panel screenshots
- [Layouts](layouts.md) — Stylos, Seira, Rema, and Custom explained
- [Concepts](concepts.md) — users, groups, tags, panels, and porticos
- [CLI reference](cli.md) — administrative tasks from the command line
