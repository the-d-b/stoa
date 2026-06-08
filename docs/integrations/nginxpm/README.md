# Nginx Proxy Manager

**Category:** DNS & Proxy | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** email:password

> Your NPM login. Format: admin@example.com:yourpassword

**URL required:** Required

**Example URL:** `http://192.168.1.10:81`

### Setup

1. Format secret as email:password (your NPM login)
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type Nginx Proxy Manager, URL = http://npm:81, secret
4. Admin -> Panels -> New: type Nginx Proxy Manager

---

## Panel

Proxy host inventory with enabled/disabled status and SSL indicators, SSL certificate expiry countdown, redirect host list, and stream/access-list counts.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Enabled/total hosts + SSL count + expiry alerts |
| 2-3x | Donut (enabled vs total) + stat chips + certificate expiry list |
| 4x+ | Donut + full proxy host list + certificate list + redirect list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Certificate expiry colors: red = expired, orange = <7 days, amber = <30 days, green = healthy.