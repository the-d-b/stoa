---
id: proxmox
name: Proxmox
category: Storage & Virtualization
tags: [virtualization, self-hosted]
official_url: https://www.proxmox.com
status: tested
polling: 30s
secret_format: api-key
url_required: true
example_url: https://192.168.1.10:8006
---

# Proxmox

## What is Proxmox?

Proxmox VE (Virtual Environment) is an open-source virtualization platform that combines KVM virtual machines and LXC containers under one web interface, with clustering, live migration, software-defined storage, and integrated backups — a self-hosted alternative to VMware ESXi.

**Official site:** [proxmox.com](https://www.proxmox.com)

---

## Getting the key

Proxmox → **Datacenter → Permissions → API Tokens → Add Token** (assign the Viewer role, or disable Privilege Separation). Use the full token string.

- **Secret format:** `user@realm!tokenid:secret` — e.g. `root@pam!stoa:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- **URL:** required, HTTPS — e.g. `https://192.168.1.10:8006`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the full token string.
2. **Admin → Integrations → New** — select **Proxmox**, enter the HTTPS URL, choose the secret. Enable **Skip TLS verify** if using the default self-signed certificate.
3. **Admin → Panels → New** — select **Proxmox**.

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
