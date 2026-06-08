# Proxmox

**Category:** Storage | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** user@realm!tokenid:secret (full Proxmox API token string)

> Proxmox -> Datacenter -> Permissions -> API Tokens -> Add Token. E.g. root@pam!stoa:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

**URL required:** Required

**Example URL:** `https://192.168.1.10:8006`

### Setup

1. Proxmox -> Datacenter -> Permissions -> API Tokens -> Add Token (assign Viewer role or disable Privilege Separation)
2. Format as user@realm!tokenid:secret (the full string Proxmox shows)
3. Admin -> Secrets -> New: paste the token
4. Admin -> Integrations -> New: type Proxmox, URL = https://proxmox-ip:8006, secret

---

## Panel

Node CPU and memory, storage, running VMs and containers, cluster overview.

### Height behavior

| Height | What you see |
|---|---|
| 1x | CPU/RAM + VM/CT counts |
| 2-3x | Node stats + storage |
| 4x+ | Full cluster + node detail + VM/CT list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Use HTTPS for Proxmox; enable Skip TLS verify if using the default self-signed certificate.