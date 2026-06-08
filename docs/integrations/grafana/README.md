# Grafana

**Category:** Monitoring | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** Service Account token (glsa_...)

> Grafana -> Administration -> Service Accounts -> Add service account -> Add token. Assign Viewer role (or Admin role for dashboard/user counts).

**URL required:** Required

**Example URL:** `http://192.168.1.10:3000`

### Setup

1. Grafana -> Administration -> Service Accounts -> Add -> create token
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Grafana, URL = http://grafana:3000, secret
4. Admin -> Panels -> New: type Grafana

---

## Panel

Datasource health for every configured Grafana datasource, active alerts from unified alerting, and instance metadata (version, database, org, dashboard/user counts).

### Height behavior

| Height | What you see |
|---|---|
| 1x | N/M datasources healthy + firing alerts + version |
| 2-3x | Datasource health donut + chips + alert list + datasource list |
| 4x+ | Donut + full chips + three-column: datasource roster / alert list / instance detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Dashboard count and user count require the Service Account to have Admin role.