# Trakt

**Category:** Content | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** clientId:username

> Client ID from your Trakt API application at trakt.tv/oauth/applications, plus your Trakt username. Format: clientId:username. Requires a public Trakt profile.

**URL required:** None (Trakt API)

### Setup

1. Create a Trakt API application at trakt.tv/oauth/applications - copy the Client ID
2. Format as clientId:yourTraktUsername
3. Admin -> Secrets -> New: paste the credential
4. Admin -> Integrations -> New: type Trakt, no URL, secret = clientId:username
5. Admin -> Panels -> New: type Trakt

---

## Panel

Movie and TV watch tracking panel - currently playing indicator with pulsing red dot when actively scrobbling, all-time movie and episode watch counts, recent watch history, and at 4x+ a 10-point rating distribution bar chart.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Watching indicator (if active) or last watched + type emoji |
| 2-3x | Watching badge + stats chips + watch history |
| 4x+ | Watching badge + stats + rating distribution chart + full history |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

No OAuth flow needed - Trakt exposes public watch history via API key + username. Profile must be public.