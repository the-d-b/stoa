# Logging

The backend logs at one of three levels. The default is deliberately quiet.

| Level | What prints |
|---|---|
| `error` (default) | Problems only: failed integration fetches, auth failures, worker backoff, panics, and any non-2xx response served by Stoa's own API |
| `debug` | Everything above, plus cache activity (refreshes, hits, busts), worker start/stop, SSE client lifecycle, and per-source fetch summaries |
| `trace` | Everything above, plus every HTTP request — outbound to integrations (method, URL, status, duration; query strings redacted since some integrations carry API keys there) and inbound to Stoa's API |

## Setting the level

**Container / boot default:** set the `STOA_LOG_LEVEL` environment variable to `error`, `debug`, or `trace`.

```yaml
environment:
  STOA_LOG_LEVEL: debug
```

**At runtime:** Admin → Sessions tab → **Backend log level**. Applies immediately — no restart — and persists across restarts. Precedence at boot: `STOA_LOG_LEVEL` if set, otherwise the persisted admin setting, otherwise `error`. One line is always printed at startup showing the active level and where it came from.

## Format

Lines keep their component identity with a level tag prepended:

```
[ERROR] [CACHE] refresh error abc123 (sonarr): context deadline exceeded
[DEBUG] [CACHE] refreshed abc123 (sonarr)
[TRACE] [HTTP] GET http://sonarr:8989/api/v3/calendar?… → 200 (142ms)
[TRACE] [API] GET /api/panels/xyz/data → 200 (3ms)
```

`grep '\[ERROR\]'` for problems, `grep '\[SONARR\]'`-style component filters still work.

## For contributors

Use the helpers in `internal/handlers/logging.go` — never bare `log.Printf` in handlers:

- `logErrorf("COMPONENT", format, ...)` — something went wrong; prints at every level
- `logDebugf(...)` — operational chatter useful when diagnosing
- `logTracef(...)` — per-request noise; reserved for the HTTP transport and access log

Rule of thumb: if the line prints an `err` value or a non-2xx status, it's `logErrorf`; otherwise it's `logDebugf`. Outbound request tracing is automatic for anything using the shared `httpClient(skipTLS)` or `http.DefaultClient` — do not hand-write per-request trace lines.
