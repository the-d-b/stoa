# Docker control panel

The Docker control panel lets you view running containers and manage them (start, stop, restart) directly from the Stoa dashboard.

---

## What it shows

For each configured Docker host:
- Container name, image, and current state (`running`, `exited`, `paused`, etc.)
- For running containers: CPU%, memory used, memory limit, memory%
- Status description (e.g. "Up 3 days", "Exited (0) 2 hours ago")

---

## Setup

Docker is configured globally by an admin, not per-panel.

**Admin → Docker**

1. **Enable Docker** — toggle the feature on
2. **Add hosts** — one or more Docker endpoints
3. **Assign groups** — which groups of users can access the panel

### Host types

**Local** — connects via the Unix socket (`/var/run/docker.sock`). Use this when the Stoa container and the Docker daemon are on the same host.

```
Type: local
```

For the socket to be accessible, mount it in the Stoa container:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**Do not use `:ro`.** Start, stop, and restart actions send POST requests through the socket. A read-only mount prevents write access to the socket, so the action buttons will fail. If you only want passive container listing and don't need management actions, `:ro` is safe — but the buttons will return errors.

**Remote** — connects to a Docker daemon exposed over HTTP. Use this for managing containers on a different machine or for Docker setups that expose the TCP socket.

```
Type: remote
URL: http://192.168.1.10:2375
```

**Warning:** Docker's unauthenticated TCP socket (`2375`) should only be used on a trusted internal network. Enable TLS and mutual authentication for any internet-facing Docker daemon.

---

## Access control

**Admins** always have access to the Docker panel regardless of group configuration.

**Regular users** need to be in one of the configured Docker groups. If no groups are configured, only admins can see the panel.

To grant access: Admin → Docker → Groups → add the group(s) whose members should see Docker.

---

## Container actions

From the Docker panel, users with access can:
- **Start** a stopped container
- **Stop** a running container
- **Restart** a container

Actions take effect immediately and the panel refreshes automatically.

---

## Multiple hosts

Add multiple hosts to manage containers across different machines from a single panel view. Each host appears as a separate section in the panel, with its containers listed independently.

If a host is unreachable, its section shows an error message — other hosts continue to display normally.

---

## See also: Docker Apps panel

This panel is for **managing** containers (start/stop/restart, resource stats). For an **app launcher** view — icon/name/link tiles auto-discovered from `homepage.*` labels on your containers, grouped and collapsible — see [Docker Apps](integrations/docker-apps/). Both panels share the same Admin → Docker configuration (enable + host list + access groups); no separate setup needed to use both.
