# GitHub

**Category:** Development | **Status:** Need Testing | **Polling:** 2 min

---

## Integration

**Secret format:** Personal Access Token (PAT)

> GitHub -> Settings -> Developer settings -> Personal access tokens -> Generate new token (classic). Required scopes: read:user and public_repo.

**URL required:** None (GitHub API)

### Setup

1. GitHub -> Settings -> Developer settings -> Personal access tokens -> Generate new token
2. Required scopes: read:user and public_repo
3. Admin -> Secrets -> New: paste the token
4. Admin -> Integrations -> New: type GitHub, no URL, secret = token
5. Admin -> Panels -> New: type GitHub

---

## Panel

GitHub profile with avatar, bio, follower counts, and public repo count. Top repos by stars with language color dot. 30-day event activity bar chart. Recent event feed with type icon, repo, and detail.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Avatar + name + repo/follower counts + last event |
| 2-3x | Avatar + bio/location + stats + event feed |
| 4x+ | Full profile + 30-day activity chart + top repos + event feed |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Fine-grained PATs work too - grant read access to public repositories.