# OAuth / SSO setup

Stoa supports any OIDC-compatible identity provider for single sign-on. Authentik is the most common choice for homelab setups.

---

## Supported providers

- **Authentik** — recommended for homelab
- **Keycloak**
- **Okta**
- **Google** (via Google Identity Platform)
- Any provider that exposes a standard OIDC discovery endpoint

---

## Setup in Stoa

Go to **Admin → OAuth Config** and fill in:

| Field | Description |
|---|---|
| Issuer URL | Your provider's OIDC discovery URL — the base URL of your application/provider in the identity provider |
| Client ID | Copied from your OAuth application in the provider |
| Client Secret | Copied from your OAuth application in the provider |
| Redirect URL | Shown automatically — must be registered in your provider |

Click **Test** to verify the issuer URL is reachable before saving.

---

## Setting up in Authentik

1. In Authentik, go to **Applications → Providers → Create**
2. Choose **OAuth2/OpenID Provider**
3. Set the authorization flow and configure:
   - **Client type:** Confidential
   - **Redirect URIs:** Your Stoa URL + `/api/auth/oauth/callback` (e.g. `https://stoa.example.com/api/auth/oauth/callback`)
   - **Scopes:** `openid`, `email`, `profile`
4. Note the **Client ID** and **Client Secret** from the provider
5. Go to **Applications → Applications → Create** and link it to the provider
6. The **Issuer URL** is the provider's slug URL — shown in the provider detail page as the OpenID Configuration URL, minus `/.well-known/openid-configuration`. Example: `https://auth.example.com/application/o/stoa/`

---

## Auth modes

Stoa supports three authentication configurations:

- **OAuth only** — users must log in through the identity provider. Local accounts still work as a fallback.
- **Local only** — username/password login only. No OAuth.
- **Both** — users can choose either method. Useful during migration or for mixed environments.

Set the mode in **Admin → Settings → Authentication**.

---

## How user accounts work with OAuth

When a user logs in via OAuth for the first time, Stoa creates a local account linked to their OAuth identity (matched by email). If a local account with the same email already exists, the OAuth login links to it automatically.

The admin account created during setup is always a local account and is never linked to OAuth — this ensures you can always log in even if your identity provider is unreachable.

---

## Behind a reverse proxy

If Stoa is behind nginx, Caddy, or NPM:

- Pass through the `Authorization` header
- Allow the `/api/auth/oauth/callback` redirect URI
- Do not strip cookies — Stoa uses cookies for OAuth state validation during the login flow

The SSE endpoint (`/api/stream`) requires long-lived connections. For nginx, add to your location block:
```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 3600;
```

For Caddy, buffering is off by default. For NPM, add `proxy_read_timeout 3600;` in the custom locations config.
