---
id: keycloak
name: Keycloak
category: Network & Security
tags: [sso, identity, self-hosted]
official_url: https://www.keycloak.org
status: tested
polling: 5min
secret_format: composite
url_required: true
example_url: https://auth.example.com
---

# Keycloak

## What is Keycloak?

Keycloak is an open-source identity and access management server. It provides single sign-on, user federation, and standards-based authentication (OpenID Connect, OAuth2, SAML) for your applications, organized into realms with clients, roles, and MFA — a widely used, enterprise-grade SSO platform.

**Official site:** [keycloak.org](https://www.keycloak.org)

---

## Getting the key

Create a confidential client with a service account, and enable event saving:

1. Keycloak → your realm → **Realm settings → Events** → enable **Save events** (off by default — the events endpoint stays empty otherwise).
2. Keycloak → your realm → **Clients → Create client** → enable **Client authentication** (confidential) and **Service accounts roles**.
3. Client → **Service accounts roles → Assign role** → filter by `realm-management` → assign **view-events** and **query-users**.
4. Client → **Credentials** tab → copy the client secret.

- **Secret format:** `realm:clientId:clientSecret` (e.g. `master:stoa:abc123...`)
- **URL:** required — your Keycloak base URL, e.g. `https://auth.example.com`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `realm:clientId:clientSecret`.
2. **Admin → Integrations → New** — select **Keycloak**, enter the URL, choose the secret. Enable **Skip TLS Verify** if it uses a self-signed certificate.
3. **Admin → Panels → New** — select **Keycloak**.

---

## Panel

Login counts, failed login attempts with IP and timestamp, and active session count. Includes a time range picker (1d / 7d / 30d / ∞) and a donut chart at 4x showing the success/failure split.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Login count + failed attempt count + active sessions |
| 2–3x | Time range pills + login stats + recent failed login list |
| 4x+ | Donut chart (success vs. failures) + time range pills + stats + failures |

### Screenshots

| | Light | Dark |
|---|---|---|
| **1x** | ![1x light](./screenshots/1x-light.png) | ![1x dark](./screenshots/1x-dark.png) |
| **2x** | ![2x light](./screenshots/2x-light.png) | ![2x dark](./screenshots/2x-dark.png) |
| **4x** | ![4x light](./screenshots/4x-light.png) | ![4x dark](./screenshots/4x-dark.png) |

---

## Notes

- **Time range:** Uses Keycloak's native `dateFrom`/`direction=desc` event filtering server-side (unlike Authentik, which filters client-side against a Go time cutoff). The ∞ option fetches up to 1000 most recent events per type — Keycloak's events endpoint has no exact total-count field the way Authentik's pagination does, so very high-volume realms may see a capped rather than exact all-time count
- **Active sessions:** Summed from `/admin/realms/{realm}/client-session-stats` across all clients. This is a best-effort approximation, not an exact figure — a single SSO login touching multiple clients can be counted more than once, since Keycloak has no single "total active sessions in this realm" endpoint
- **Admin console link:** Unlike Authentik, the summary pills link to the plain server URL rather than a deep admin link — Keycloak's admin console URL scheme differs across major versions (legacy vs. new admin console) and isn't stable enough to target reliably
- **Version:** Best-effort, read from `/admin/serverinfo` — doesn't block the rest of the panel if unavailable
- **TLS:** If your Keycloak instance uses a self-signed certificate, enable **Skip TLS Verify** on the integration
