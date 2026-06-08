$base = "C:\projects\stoa\docs\integrations"

$igs = @(
  # Media Servers
  @{id="plex";label="Plex";cat="Media Servers";status="Tested";poll="60 s";
    secret='Plex token (`X-Plex-Token`)';
    secretHint='Sign in at plex.tv, then get your token from any Plex API request header, or visit plex.tv/web in a browser, open DevTools Network tab, find any /library request, and copy the X-Plex-Token query param.';
    url="Required";urlEx="http://192.168.1.10:32400";
    desc="Active streams with user, title, and progress. Library counts. Update availability indicator.";
    p1="Active stream count + currently playing title";p2="Stream list + library counts";p4="Full stream detail + library breakdown + update indicator";
    steps=@("Get your Plex token (see Secret hint above)","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Plex, URL = http://your-plex:32400, secret = above","Admin -> Panels -> New: type Plex, select integration");extra=""},
  @{id="jellyfin";label="Jellyfin";cat="Media Servers";status="Tested";poll="60 s";
    secret='Plain API key';secretHint='Jellyfin -> Administration -> Dashboard -> API Keys -> + button';
    url="Required";urlEx="http://192.168.1.10:8096";
    desc="Active streams with user, title, progress, and transcode vs. direct play status. Library counts. Server name and version.";
    p1="Stream count + currently playing title";p2="Stream list + library counts";p4="Full stream detail with transcode status + library breakdown";
    steps=@("Jellyfin -> Administration -> Dashboard -> API Keys -> create a key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Jellyfin, URL, secret","Admin -> Panels -> New: type Jellyfin");extra=""},
  @{id="emby";label="Emby";cat="Media Servers";status="Need Testing";poll="30 s";
    secret='Plain API key';secretHint='Emby -> Settings -> Advanced -> API Keys';
    url="Required";urlEx="http://192.168.1.10:8096";
    desc="Active streams with user, media title, and progress. Library counts by type. Server version.";
    p1="Stream count + playing title";p2="Stream list + library counts";p4="Full stream detail + library breakdown";
    steps=@("Emby -> Settings -> Advanced -> API Keys -> + New Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Emby, URL, secret","Admin -> Panels -> New: type Emby");extra=""},
  @{id="tautulli";label="Tautulli";cat="Media Servers";status="Tested";poll="60 s";
    secret='Plain API key';secretHint='Tautulli -> Settings -> Web Interface -> API Key';
    url="Required";urlEx="http://192.168.1.10:8181";
    desc="Current streams, most played content, recently played history, user statistics.";
    p1="Active stream count + currently playing";p2="Stream list + recently played";p4="Full stats + history + top users";
    steps=@("Tautulli -> Settings -> Web Interface -> copy API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Tautulli, URL, secret","Admin -> Panels -> New: type Tautulli");
    extra="Requires Plex to be running and connected."},
  @{id="jellystat";label="Jellystat";cat="Media Servers";status="Need Testing";poll="60 s";
    secret='Plain API key';secretHint='Jellystat -> Settings -> API Key';
    url="Required";urlEx="http://192.168.1.10:3004";
    desc="Watch history, most played content, top users, and views by library type. Time range configurable (7 / 30 / 90 days).";
    p1="Total watch time + top title";p2="Recent history + top users";p4="Full stats + history + user breakdown";
    steps=@("Jellystat -> Settings -> generate or copy API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Jellystat, URL, secret","Admin -> Panels -> New: type Jellystat");extra=""},
  @{id="tracearr";label="Tracearr";cat="Media Servers";status="Need Testing";poll="60 s";
    secret='Plain API key';secretHint='Tracearr -> Settings -> API Key';
    url="Required";urlEx="http://192.168.1.10:8000";
    desc="Live stream count, watch history, top users, recent plays, and unacknowledged account-sharing violations. Works across Plex, Jellyfin, and Emby.";
    p1="Live streams + sharing alerts";p2="Recent plays + top users";p4="Full stats + sharing violations detail";
    steps=@("Tracearr -> Settings -> copy API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Tracearr, URL, secret","Admin -> Panels -> New: type Tracearr");extra=""},
  # Media Management
  @{id="sonarr";label="Sonarr";cat="Media Management";status="Tested";poll="30 min";
    secret='Plain API key';secretHint='Sonarr -> Settings -> General -> Security -> API Key';
    url="Required";urlEx="http://192.168.1.10:8989";
    desc="Upcoming episode schedule, recently downloaded episodes, wanted/missing episodes, series and episode counts.";
    p1="Upcoming episode count + queue + wanted counts";p2="Queue list with progress + calendar preview";p4="Full episode schedule + series stats + download queue detail";
    steps=@("Sonarr -> Settings -> General -> copy the API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Sonarr, URL = http://sonarr:8989, secret = key above","Admin -> Panels -> New: type Sonarr, select integration");
    extra="**Calendar:** Sonarr episode air dates appear on the Calendar panel. Add Sonarr as a calendar source in Profile -> Calendar Sources."},
  @{id="radarr";label="Radarr";cat="Media Management";status="Tested";poll="30 min";
    secret='Plain API key';secretHint='Radarr -> Settings -> General -> Security -> API Key';
    url="Required";urlEx="http://192.168.1.10:7878";
    desc="Upcoming movie releases, recently downloaded movies, wanted/missing movies, movie count.";
    p1="Upcoming movies + queue count";p2="Queue list + recent movies";p4="Full release schedule + download queue detail";
    steps=@("Radarr -> Settings -> General -> copy the API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Radarr, URL, secret","Admin -> Panels -> New: type Radarr");
    extra="**Calendar:** Radarr release dates appear on the Calendar panel."},
  @{id="lidarr";label="Lidarr";cat="Media Management";status="Tested";poll="30 min";
    secret='Plain API key';secretHint='Lidarr -> Settings -> General -> Security -> API Key';
    url="Required";urlEx="http://192.168.1.10:8686";
    desc="Upcoming album releases, recently downloaded albums, wanted/missing albums, artist and track counts.";
    p1="Upcoming albums + queue count";p2="Queue list + recent albums";p4="Full release schedule + artist stats";
    steps=@("Lidarr -> Settings -> General -> copy the API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Lidarr, URL, secret","Admin -> Panels -> New: type Lidarr");
    extra="**Calendar:** Lidarr release dates appear on the Calendar panel."},
  @{id="readarr";label="Readarr";cat="Media Management";status="Tested";poll="30 min";
    secret='Plain API key';secretHint='Readarr -> Settings -> General -> Security -> API Key';
    url="Required";urlEx="http://192.168.1.10:8787";
    desc="Upcoming book and audiobook releases, recently added titles, missing books, book and author counts.";
    p1="Upcoming releases + missing count";p2="Queue list + recent titles";p4="Full schedule + library stats";
    steps=@("Readarr -> Settings -> General -> copy the API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Readarr, URL, secret","Admin -> Panels -> New: type Readarr");
    extra="**Calendar:** Readarr release dates appear on the Calendar panel."},
  @{id="bazarr";label="Bazarr";cat="Media Management";status="Need Testing";poll="60 s";
    secret='Plain API key';secretHint='Bazarr -> Settings -> General -> Security -> API Key';
    url="Required";urlEx="http://192.168.1.10:6767";
    desc="Missing subtitle counts for TV and movies, per-provider health, and monthly download volume.";
    p1="Missing subtitle total + provider issues";p2="Missing counts + provider list";p4="Provider health + download stats + Sonarr/Radarr status";
    steps=@("Bazarr -> Settings -> General -> copy API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Bazarr, URL, secret","Admin -> Panels -> New: type Bazarr");extra=""},
  @{id="prowlarr";label="Prowlarr";cat="Media Management";status="Need Testing";poll="60 s";
    secret='Plain API key';secretHint='Prowlarr -> Settings -> General -> Security -> API Key';
    url="Required";urlEx="http://192.168.1.10:9696";
    desc="Indexer health across torrent and usenet sources, per-indexer grab counts and response times, connected *arr app sync status, system health issues.";
    p1="Enabled/total indexers + health issues";p2="Health donut + indexer list";p4="Full indexer roster + app sync + lifetime stats";
    steps=@("Prowlarr -> Settings -> General -> copy API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Prowlarr, URL, secret","Admin -> Panels -> New: type Prowlarr");extra=""},
  @{id="autobrr";label="autobrr";cat="Media Management";status="Need Testing";poll="30 s";
    secret='Plain API key';secretHint='autobrr -> Settings -> API -> API Key';
    url="Required";urlEx="http://192.168.1.10:7474";
    desc="IRC network connection health, cumulative grab/reject/error statistics, and a live feed of recent releases.";
    p1="IRC health + grab/reject counts";p2="Grab donut + IRC networks + recent activity";p4="Full three-column: IRC networks / activity feed / grabs-only feed";
    steps=@("autobrr -> Settings -> API -> copy API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type autobrr, URL, secret","Admin -> Panels -> New: type autobrr");extra=""},
  @{id="overseerr";label="Overseerr / Jellyseerr";cat="Media Management";status="Need Testing";poll="5 min";
    secret='Plain API key';secretHint='Overseerr -> Settings -> General -> API Key  |  Jellyseerr -> same location';
    url="Required";urlEx="http://192.168.1.10:5055";
    desc="Request counts by status, movie vs. TV breakdown, recent pending requests.";
    p1="Pending request count + status breakdown";p2="Request stats + recent pending list";p4="Full request dashboard + status breakdown";
    steps=@("Overseerr/Jellyseerr -> Settings -> General -> copy API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Overseerr, URL, secret","Admin -> Panels -> New: type Overseerr");
    extra="Works for both Overseerr and Jellyseerr - use the same integration type."},
  @{id="tdarr";label="Tdarr";cat="Media Management";status="Need Testing";poll="30 s";
    secret='Blank (no auth) or API key or username:password (reverse-proxy layer)';
    secretHint='Tdarr -> Tools -> API Keys for single-token auth. Leave blank for unauthenticated instances.';
    url="Required";urlEx="http://192.168.1.10:8265";
    desc="Active and idle worker summary, per-worker progress (file, %, ETA), total files, files transcoded, files health-checked, space saved.";
    p1="Active workers + space saved";p2="Worker list with progress and ETA";p4="Full worker detail with node and worker-type breakdown";
    steps=@("If using auth: Tdarr -> Tools -> API Keys -> create a key","Admin -> Secrets -> New: paste key (or leave blank)","Admin -> Integrations -> New: type Tdarr, URL, secret","Admin -> Panels -> New: type Tdarr");extra=""},
  @{id="maintainerr";label="Maintainerr";cat="Media Management";status="Need Testing";poll="5 min";
    secret='Blank (no auth) or Bearer token';
    secretHint='Most Maintainerr instances run without auth. If you added an API key, paste it here.';
    url="Required";urlEx="http://192.168.1.10:6246";
    desc="Active collections, total media in scope, and per-collection detail (type, delete-after window, arr action, media count).";
    p1="Active collections + total media count";p2="Stat chips + collection list";p4="Full collection table with type badges and action detail";
    steps=@("Admin -> Secrets -> New: blank or token","Admin -> Integrations -> New: type Maintainerr, URL, secret","Admin -> Panels -> New: type Maintainerr");extra=""},
  # Photos & Libraries
  @{id="immich";label="Immich";cat="Photos & Libraries";status="Need Testing";poll="30 min";
    secret='Plain API key';secretHint='Immich -> User Settings (top-right avatar) -> API Keys -> New API Key';
    url="Required";urlEx="http://192.168.1.10:2283";
    desc="Photo and video counts, storage usage, user count, and a photo preview carousel (random thumbnails, refreshed daily).";
    p1="Photo/video counts + storage used";p2="Stat chips + preview thumbnails";p4="Full stats + large preview carousel";
    steps=@("Immich -> top-right avatar -> Account Settings -> API Keys -> create key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Immich, URL, secret","Admin -> Panels -> New: type Immich");extra=""},
  @{id="photoprism";label="PhotoPrism";cat="Photos & Libraries";status="Need Testing";poll="30 min";
    secret='username:password';secretHint='Your PhotoPrism login credentials. Format: admin:yourpassword';
    url="Required";urlEx="http://192.168.1.10:2342";
    desc="Photo and video counts, library size, recent imports, indexing status. Photo preview carousel (random thumbnails, refreshed daily).";
    p1="Photo/video counts + library size";p2="Stat chips + preview thumbnails";p4="Full stats + large preview carousel";
    steps=@("Format secret as username:password (e.g. admin:mypassword)","Admin -> Secrets -> New: paste the formatted credential","Admin -> Integrations -> New: type PhotoPrism, URL, secret","Admin -> Panels -> New: type PhotoPrism");extra=""},
  @{id="lychee";label="Lychee";cat="Photos & Libraries";status="Need Testing";poll="30 min";
    secret='username:password';secretHint='Your Lychee login credentials. Format: admin:yourpassword';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="Photo count, album count, storage usage, user count, and a photo preview carousel.";
    p1="Photo/album counts";p2="Stat chips + preview thumbnails";p4="Full stats + preview carousel";
    steps=@("Format secret as username:password","Admin -> Secrets -> New: paste the formatted credential","Admin -> Integrations -> New: type Lychee, URL, secret","Admin -> Panels -> New: type Lychee");extra=""},
  @{id="kavita";label="Kavita";cat="Photos & Libraries";status="Need Testing";poll="30 min";
    secret='Plain API key';secretHint='Kavita -> your username (top-right) -> User Settings -> API Key';
    url="Required";urlEx="http://192.168.1.10:5000";
    desc="Series count, total files, library list, and a recently-added series strip with cover thumbnails.";
    p1="Series/file counts";p2="Library list + recent series strip";p4="Full stats + cover grid";
    steps=@("Kavita -> your username (top-right) -> User Settings -> copy API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Kavita, URL, secret","Admin -> Panels -> New: type Kavita");extra=""},
  @{id="komga";label="Komga";cat="Photos & Libraries";status="Need Testing";poll="30 min";
    secret='username:password or plain API key';secretHint='Your Komga login credentials, or generate an API key in Komga -> Settings -> API Keys.';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="Series count, book count, library list, and a recently-added series strip with cover thumbnails.";
    p1="Series/book counts";p2="Library list + recent series strip";p4="Full stats + cover grid";
    steps=@("Format as username:password OR get API key from Komga -> Settings -> API Keys","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Komga, URL, secret","Admin -> Panels -> New: type Komga");extra=""},
  @{id="audiobookshelf";label="Audiobookshelf";cat="Photos & Libraries";status="Need Testing";poll="60 s";
    secret='username:password or plain API key';secretHint='Your ABS login, or get a token from ABS -> Settings -> Users -> your user -> API Token.';
    url="Required";urlEx="http://192.168.1.10:13378";
    desc="In-progress audiobooks and podcasts with a mini audio player. Select any in-progress item to play directly from the dashboard with seek controls and progress sync.";
    p1="In-progress count + currently playing";p2="In-progress list";p4="Full player with controls + seek bar";
    steps=@("ABS -> Settings -> Users -> your user -> copy API Token (or use username:password)","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Audiobookshelf, URL, secret","Admin -> Panels -> New: type Audiobookshelf");
    extra="Playback controls proxy through the Stoa backend - credentials stay on the server."},
  @{id="navidrome";label="Navidrome";cat="Photos & Libraries";status="Need Testing";poll="30 s";
    secret='username:password';secretHint='Your Navidrome login credentials. Format: admin:yourpassword';
    url="Required";urlEx="http://192.168.1.10:4533";
    desc="Music library browser with built-in player. Choose a playlist, see the track list, and play music directly from the dashboard. Selected playlist persists per panel.";
    p1="Playlist name + track count";p2="Playlist selector + track list";p4="Full player with album art, seek, prev/next";
    steps=@("Format secret as username:password","Admin -> Secrets -> New: paste the formatted credential","Admin -> Integrations -> New: type Navidrome, URL, secret","Admin -> Panels -> New: type Navidrome");extra=""},
  # Storage
  @{id="truenas";label="TrueNAS";cat="Storage";status="Tested";poll="30 s (WebSocket)";
    secret='Plain API key';secretHint='TrueNAS -> Credentials -> API Keys -> Add';
    url="Required";urlEx="http://192.168.1.10";
    desc="CPU, RAM, ARC, disk I/O, network throughput, pool health, disk temperatures, alerts, VMs, apps. Uses a persistent WebSocket connection - data updates every ~2 seconds.";
    p1="CPU/RAM/pool summary";p2="Host stats + network + pool health";p4="Full stats + disk temperatures + VM/app counts";
    steps=@("TrueNAS -> Credentials -> API Keys -> Add -> copy the key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type TrueNAS, URL = http://truenas-ip, secret = key","Admin -> Panels -> New: type TrueNAS");
    extra="Works with both TrueNAS SCALE and TrueNAS CORE. WebSocket connection provides ~2s live updates."},
  @{id="unraid";label="Unraid";cat="Storage";status="Need Testing";poll="30 s (WebSocket)";
    secret='username:password';secretHint='Your Unraid WebUI login. Format: root:yourpassword';
    url="Required";urlEx="http://192.168.1.10";
    desc="CPU usage (per-core and aggregate), memory usage, network throughput, array disk temperatures, running VMs and Docker containers. Uses a persistent WebSocket connection for live data.";
    p1="CPU/RAM/disk summary";p2="Host stats + network";p4="All + disk temperatures + container/VM detail";
    steps=@("Format secret as root:yourpassword (or your admin user)","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Unraid, URL, secret","Admin -> Panels -> New: type Unraid");extra=""},
  @{id="omv";label="OpenMediaVault";cat="Storage";status="Need Testing";poll="30 s";
    secret='username:password';secretHint='Your OMV WebUI login. Format: admin:yourpassword';
    url="Required";urlEx="http://192.168.1.10";
    desc="CPU usage, memory usage, per-interface network throughput, filesystem usage, disk temperatures and SMART status.";
    p1="Compact stats only";p2="Network + filesystem rows";p4="Full disk table + all stats";
    steps=@("Format secret as admin:yourpassword","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type OpenMediaVault, URL, secret","Admin -> Panels -> New: type OpenMediaVault");extra=""},
  @{id="synology";label="Synology DSM";cat="Storage";status="Need Testing";poll="30 s";
    secret='username:password';secretHint='Your Synology DSM login. Format: admin:yourpassword';
    url="Required";urlEx="http://192.168.1.10:5000";
    desc="CPU, memory, network, volume health, disk temperatures and SMART status, shared folder list. Shows hostname, model, DSM version, and uptime.";
    p1="Compact arcs only";p2="Network + volume rows + disk temperatures + shares";p4="Full disk table + per-interface network breakdown";
    steps=@("Format secret as admin:yourpassword (use a dedicated account if possible)","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Synology, URL = http://nas-ip:5000, secret","Admin -> Panels -> New: type Synology");
    extra="Degraded volumes show an amber warning badge in the panel header at any height."},
  @{id="qnap";label="QNAP QTS";cat="Storage";status="Need Testing";poll="30 s";
    secret='username:password';secretHint='Your QNAP WebUI login. Format: admin:yourpassword';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="CPU, memory, aggregate network, volume health, disk temperatures and SMART status, shared folder list. Shows hostname, model, firmware version, and uptime.";
    p1="Compact arcs only";p2="Disk temperature rows + shares";p4="Full disk table with model, size, and SMART detail";
    steps=@("Format secret as admin:yourpassword","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type QNAP, URL, secret","Admin -> Panels -> New: type QNAP");extra=""},
  @{id="proxmox";label="Proxmox";cat="Storage";status="Need Testing";poll="30 s";
    secret='user@realm!tokenid:secret (full Proxmox API token string)';
    secretHint='Proxmox -> Datacenter -> Permissions -> API Tokens -> Add Token. E.g. root@pam!stoa:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
    url="Required";urlEx="https://192.168.1.10:8006";
    desc="Node CPU and memory, storage, running VMs and containers, cluster overview.";
    p1="CPU/RAM + VM/CT counts";p2="Node stats + storage";p4="Full cluster + node detail + VM/CT list";
    steps=@("Proxmox -> Datacenter -> Permissions -> API Tokens -> Add Token (assign Viewer role or disable Privilege Separation)","Format as user@realm!tokenid:secret (the full string Proxmox shows)","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Proxmox, URL = https://proxmox-ip:8006, secret");
    extra="Use HTTPS for Proxmox; enable Skip TLS verify if using the default self-signed certificate."},
  @{id="nextcloud";label="Nextcloud";cat="Storage";status="Need Testing";poll="5 min";
    secret='username:password';secretHint='Use an app password: Nextcloud -> Settings -> Security -> App passwords -> create one. Safer than your main password.';
    url="Required";urlEx="https://cloud.example.com";
    desc="Active users in last 5m/1h/24h, storage free space, share counts by type, app update warnings, server info (PHP, database, memory).";
    p1="Users + files + free space + app updates";p2="Stat chips + active user bars + share breakdown";p4="Three-column: server info / users & activity / shares & storage";
    steps=@("Nextcloud -> Settings -> Security -> App passwords -> generate one","Format as username:app-password","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Nextcloud, URL = https://your-cloud, secret");
    extra="Memory data requires the serverinfo app (enabled by default on most installs)."},
  @{id="scrutiny";label="Scrutiny";cat="Storage";status="Need Testing";poll="5 min";
    secret='Blank - no authentication required';secretHint='Scrutiny runs unauthenticated by default. Leave the API key field empty.';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="Hard drive SMART health - fleet health donut showing passed/warning/failed drive counts, per-drive temperature bars, power-on hours, and reallocated/pending sector warnings.";
    p1="Healthy/warning/failed counts + avg temp";p2="Summary chips + per-drive list with status and temperature";p4="Fleet health donut + full drive detail with model, capacity, temps, sectors";
    steps=@("No credential needed - leave secret blank","Admin -> Integrations -> New: type Scrutiny, URL = http://scrutiny:8080, no secret","Admin -> Panels -> New: type Scrutiny");
    extra="Temperature bars: green <40C, amber 40-49C, red >=50C."},
  # Networking
  @{id="opnsense";label="OPNsense";cat="Networking";status="Tested";poll="30 s (SSE stream)";
    secret='key:secret';secretHint='OPNsense -> System -> Access -> Users -> edit API user -> + New API Key. You get a key + secret pair - join them with a colon: key:secret';
    url="Required";urlEx="https://192.168.1.1";
    desc="Interface traffic rates (live SSE stream), firewall event donut, top WAN talkers, DNS stats, PF states, firmware version.";
    p1="WAN/LAN throughput + PF states";p2="Interface rates + firewall donut";p4="Full dashboard + top talkers + DNS stats";
    steps=@("OPNsense -> System -> Access -> Users -> API user -> + New API Key","Format as key:secret (colon-separated)","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type OPNsense, URL = https://opnsense-ip, secret");
    extra="Enable Skip TLS verify if using the OPNsense self-signed certificate."},
  @{id="pfsense";label="pfSense";cat="Networking";status="Need Testing";poll="5 s";
    secret='username:password';secretHint='Your pfSense WebUI login. Requires the pfSense-pkg-API package to be installed.';
    url="Required";urlEx="https://192.168.1.1";
    desc="CPU and memory usage, uptime, version, interface traffic rates (Mbps deltas), gateway status with RTT and packet loss, firewall connection state count.";
    p1="Compact status bar";p2="CPU/RAM bars + gateways + interfaces";p4="All + PF states fill bar";
    steps=@("Install pfSense-pkg-API from pfSense -> System -> Package Manager","Format secret as admin:yourpassword","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type pfSense, URL = https://pfsense-ip, secret");
    extra="Requires the pfSense-pkg-API community package. Enable Skip TLS verify if using the pfSense default self-signed certificate."},
  @{id="openwrt";label="OpenWrt";cat="Networking";status="Need Testing";poll="5 s";
    secret='username:password';secretHint='Your OpenWrt login. Default username is root. Format: root:yourpassword';
    url="Required";urlEx="http://192.168.1.1";
    desc="Hostname, uptime, load average, memory usage, per-interface traffic rates (Mbps deltas), and WiFi client list with signal strength and per-client TX/RX rates.";
    p1="Compact bar";p2="Load/memory bars + interface list";p4="All + WiFi client list with signal bars";
    steps=@("Format secret as root:yourpassword","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type OpenWrt, URL = http://router-ip, secret","Admin -> Panels -> New: type OpenWrt");
    extra="Uses ubus JSON-RPC. Polls every 5 seconds for live interface stats."},
  @{id="omada";label="Omada SDN";cat="Networking";status="Need Testing";poll="30 s";
    secret='username:password';secretHint='Omada controller login credentials. Requires Omada 5.0+ with Open API v2 enabled.';
    url="Required";urlEx="https://192.168.1.10:8043";
    desc="Device status across gateways, APs, and switches with online/offline counts. Total client counts, per-site breakdown, device list, recent alerts.";
    p1="Device and client counts";p2="Device type badges + wireless/wired split + site list";p4="All + scrollable device list + client list + alerts";
    steps=@("Omada 5.0+ required; enable Open API in the controller settings","Format secret as username:password","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Omada, URL = https://omada-controller:8043, secret");extra=""},
  @{id="unifi";label="UniFi";cat="Networking";status="Need Testing";poll="30 s (WebSocket events)";
    secret='Plain API key (v9.3.43+) or username:password (legacy)';
    secretHint='UniFi v9.3.43+: Settings -> Control Plane -> Integrations -> API Keys -> Create. Older: your UniFi Network Application login.';
    url="Required";urlEx="https://192.168.1.10";
    desc="Device inventory (APs, switches, gateways with online/offline), connected client list, WAN status, real-time event log. WebSocket connection for instant updates.";
    p1="WAN status + device count + client count";p2="Device type badges + WAN IP + speedtest + recent events";p4="Full device list with radio/port/WAN detail + client list + event log";
    steps=@("v9.3.43+: Settings -> Control Plane -> Integrations -> API Keys -> create key","Older: use username:password of an admin account","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type UniFi, URL = https://unifi-controller, secret");
    extra="Enable Skip TLS verify for the self-signed UniFi certificate."},
  # DNS & Proxy
  @{id="traefik";label="Traefik";cat="DNS & Proxy";status="Need Testing";poll="30 s";
    secret='Blank (open) or username:password (Basic Auth) or Bearer token';
    secretHint='Most home lab Traefik instances run the dashboard open (no auth). If you added Basic Auth or a Bearer token, use that format.';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="HTTP/TCP route inventory with enabled/warning/disabled status, backend service health (servers UP/DOWN), TLS indicators, entry point labels, and provider badges.";
    p1="Route count + backend health + active providers";p2="Section chips + degraded backends + service list";p4="Two-column: service list + route table";
    steps=@("No credential needed for open instances - leave secret blank","If Basic Auth: format as username:password; if Bearer token: paste bare token","Admin -> Integrations -> New: type Traefik, URL = http://traefik:8080, secret (or blank)","Admin -> Panels -> New: type Traefik");
    extra="Backend health requires Traefik health checks to be enabled for your services."},
  @{id="nginxpm";label="Nginx Proxy Manager";cat="DNS & Proxy";status="Need Testing";poll="60 s";
    secret='email:password';secretHint='Your NPM login. Format: admin@example.com:yourpassword';
    url="Required";urlEx="http://192.168.1.10:81";
    desc="Proxy host inventory with enabled/disabled status and SSL indicators, SSL certificate expiry countdown, redirect host list, and stream/access-list counts.";
    p1="Enabled/total hosts + SSL count + expiry alerts";p2="Donut (enabled vs total) + stat chips + certificate expiry list";p4="Donut + full proxy host list + certificate list + redirect list";
    steps=@("Format secret as email:password (your NPM login)","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Nginx Proxy Manager, URL = http://npm:81, secret","Admin -> Panels -> New: type Nginx Proxy Manager");
    extra="Certificate expiry colors: red = expired, orange = <7 days, amber = <30 days, green = healthy."},
  @{id="cloudflare";label="Cloudflare";cat="DNS & Proxy";status="Tested";poll="5 min";
    secret='Scoped API token or email:globalApiKey (legacy)';
    secretHint='Recommended: Cloudflare -> Profile -> API Tokens -> Create Token with Zone:Read + Analytics:Read + Tunnel:Read. Legacy: account email + global API key separated by colon.';
    url="None (Cloudflare cloud API)";urlEx="";
    desc="Zone list with 24h analytics (requests, threats blocked, bandwidth, unique visitors) and tunnel health. Each tunnel shows connection status, active PoP connections, and ingress rules.";
    p1="Requests + threats + tunnel health + zone count";p2="Aggregate chips + tunnel list + zone list";p4="Two-column: full tunnel detail (ingress rules) + full zone list";
    steps=@("Cloudflare -> Profile -> API Tokens -> Create Token -> Zone:Read + Analytics:Read + Tunnel:Read","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Cloudflare, no URL needed, secret = token","Admin -> Panels -> New: type Cloudflare");
    extra="No URL field - Stoa calls the Cloudflare API directly. Scoped tokens are strongly recommended over the Global API Key."},
  @{id="pihole";label="Pi-hole";cat="DNS & Proxy";status="Tested";poll="30 s";
    secret='API token (v5) or web password (v6)';
    secretHint='v5: Pi-hole -> Settings -> API / Web interface -> Show API token. v6: your Pi-hole web UI password (or an app password).';
    url="Required";urlEx="http://192.168.1.10";
    desc="DNS query statistics - total queries, blocked percentage, unique clients, gravity size. 24-hour query timeline, top blocked domains, top querying clients, query type breakdown, upstream resolver distribution.";
    p1="Query count + blocked % + client count + gravity size";p2="Arc gauge + stat chips + 24h sparkline";p4="All + top blocked domains + top clients + query type + upstream resolvers";
    steps=@("v5: Pi-hole -> Settings -> API / Web interface -> Show API token","v6: use your web UI password","Admin -> Secrets -> New: paste the token/password","Admin -> Integrations -> New: type Pi-hole, URL = http://pihole-ip, secret");
    extra="Stoa auto-detects the Pi-hole version at connection time."},
  @{id="adguard";label="AdGuard Home";cat="DNS & Proxy";status="Need Testing";poll="30 s";
    secret='username:password';secretHint='Your AdGuard Home WebUI login. Format: admin:yourpassword';
    url="Required";urlEx="http://192.168.1.10:3000";
    desc="DNS query statistics - total queries, blocked percentage, per-category breakdown. 24-hour timeline, top blocked domains, top clients, top queried domains, upstream resolver breakdown, active blocklist inventory.";
    p1="Query count + blocked % + avg latency + total rules";p2="Arc gauge + stat chips + 24h sparkline";p4="All + three-column: top blocked/queried + top clients/upstreams + blocklist table";
    steps=@("Format secret as username:password","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type AdGuard Home, URL = http://adguard:3000, secret","Admin -> Panels -> New: type AdGuard Home");
    extra="Safe Browsing, Safe Search, and Parental Control chips only appear when those features are enabled with non-zero counts."},
  @{id="nextdns";label="NextDNS";cat="DNS & Proxy";status="Need Testing";poll="30 s";
    secret='Plain API key';secretHint='NextDNS -> Account -> API Key';
    url="None (cloud API - Profile ID configured in integration settings)";urlEx="";
    desc="Cloud DNS analytics - total queries, blocked queries and percentage, encrypted %, IPv6 %. 24-hour hourly timeline, top blocked domains, top querying clients, block reason breakdown.";
    p1="Query count + blocked count + encrypted % + IPv6 %";p2="Arc gauge + stat chips + 24h sparkline";p4="All + three-column: top blocked + top clients + block reason breakdown";
    steps=@("NextDNS -> Account -> copy API Key","Note your Profile ID from the NextDNS dashboard URL","Admin -> Secrets -> New: paste the API key","Admin -> Integrations -> New: type NextDNS, no URL, secret = API key");extra=""},
  # VPN & Security
  @{id="gluetun";label="Gluetun";cat="VPN & Security";status="Need Testing";poll="60 s";
    secret='Blank or password if you configured Gluetun HTTP proxy auth';
    secretHint='Most Gluetun instances expose the control server without auth. Leave blank unless you added authentication.';
    url="Required";urlEx="http://192.168.1.10:8000";
    desc="VPN status, current public IP address and geo-location, WireGuard/OpenVPN mode indicator.";
    p1="VPN status + public IP + location";p2="Status + IP + location + VPN mode";p4="Full detail including port forwarding status";
    steps=@("Gluetun exposes a control server on port 8000 by default","Admin -> Integrations -> New: type Gluetun, URL = http://gluetun:8000, no secret (or password)","Admin -> Panels -> New: type Gluetun");extra=""},
  @{id="wgeasy";label="wg-easy";cat="VPN & Security";status="Need Testing";poll="30 s";
    secret='Bare password (no username)';secretHint='Your wg-easy web UI password. Leave blank for no-auth instances.';
    url="Required";urlEx="http://192.168.1.10:51821";
    desc="WireGuard VPN server status and client roster - connected/total client counts, per-client handshake recency, and transfer stats.";
    p1="Connected/total clients + aggregate TX/RX";p2="Stat chips + scrollable client list";p4="Connected/total donut + stat chips + full client table";
    steps=@("Your wg-easy password (bare, no username)","Admin -> Secrets -> New: paste the password (or leave blank if no auth)","Admin -> Integrations -> New: type wg-easy, URL = http://wgeasy:51821, secret","Admin -> Panels -> New: type wg-easy");
    extra="Client status: green = connected (handshake <3 min), grey = enabled/idle, dark = disabled."},
  @{id="tailscale";label="Tailscale";cat="VPN & Security";status="Need Testing";poll="60 s";
    secret='API token (tskey-api-...)';secretHint='Tailscale admin console -> Settings -> Keys -> Generate access token. The token starts with tskey-api-.';
    url="None (Tailscale cloud API)";urlEx="";
    desc="Mesh VPN device roster - online/offline status, Tailscale IP, OS, assigned user, and role (exit node, subnet router). Surfaces update availability, key expiry warnings, and unauthorized devices.";
    p1="Online/total + updates + exit nodes + offline count";p2="Online/total donut + stat chips + device list";p4="Donut + full stat chips + device table with OS/user/roles/expiry";
    steps=@("Tailscale admin console -> Settings -> Keys -> Generate access token","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Tailscale, no URL, secret = token","Admin -> Panels -> New: type Tailscale");
    extra="No URL field - Stoa calls the Tailscale API directly at api.tailscale.com."},
  @{id="netbird";label="Netbird";cat="VPN & Security";status="Need Testing";poll="60 s";
    secret='Personal Access Token (PAT)';secretHint='Netbird -> Settings -> Personal Access Tokens -> Create. For self-hosted use your management URL; for cloud use https://api.netbird.io.';
    url="Required (self-hosted) or cloud";urlEx="https://api.netbird.io";
    desc="WireGuard mesh VPN panel - peer roster with online/offline/expired status, last-seen time, OS, IP, SSH status, group membership, and policy list.";
    p1="Online/offline/expired + groups + policies";p2="Chips + peer list + group list";p4="Two-column: full peer detail / groups + policy list";
    steps=@("Netbird -> Settings -> Personal Access Tokens -> create a PAT","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Netbird, URL = https://api.netbird.io (or self-hosted URL), secret","Admin -> Panels -> New: type Netbird");extra=""},
  @{id="authentik";label="Authentik";cat="VPN & Security";status="Need Testing";poll="5 min";
    secret='API token';secretHint='Authentik -> Admin interface -> System -> API Tokens -> Create';
    url="Required";urlEx="https://auth.example.com";
    desc="Login counts, failed login attempts, recent failure details, active sessions.";
    p1="Login count + failed attempts";p2="Login stats + recent failures";p4="Full login history + session detail";
    steps=@("Authentik -> Admin -> System -> API Tokens -> create token","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Authentik, URL = https://your-authentik, secret","Admin -> Panels -> New: type Authentik");extra=""},
  # Monitoring
  @{id="kuma";label="Uptime Kuma";cat="Monitoring";status="Tested";poll="60 s";
    secret='Blank (no auth) or plain API key (Kuma 1.23+)';
    secretHint='Kuma 1.23+: Settings -> API Keys -> Add. Older versions run without auth - leave blank.';
    url="Required";urlEx="http://192.168.1.10:3001";
    desc="Monitor status (up/down/pending), response times, uptime percentages, incident history.";
    p1="Up/down count + overall status";p2="Monitor list with status dots + response times";p4="Full monitor list + uptime bars + incident history";
    steps=@("Kuma 1.23+: Settings -> API Keys -> create key (older: leave blank)","Admin -> Secrets -> New: paste key or leave blank","Admin -> Integrations -> New: type Uptime Kuma, URL = http://kuma:3001, secret","Admin -> Panels -> New: type Uptime Kuma");extra=""},
  @{id="prometheus";label="Prometheus";cat="Monitoring";status="Need Testing";poll="30 s";
    secret='Blank (open) or username:password or Bearer token';
    secretHint='Most home lab Prometheus instances run open (no auth). If you added auth via a reverse proxy, use the matching format.';
    url="Required";urlEx="http://192.168.1.10:9090";
    desc="Scrape target health by job, active alerting rule status (firing/pending with severity), Prometheus version, and optional custom PromQL metric cards with 60-minute sparklines.";
    p1="N/M targets up + firing alert count + custom metric values";p2="Health donut + chips + custom metric cards + firing alert list";p4="Donut + chips + custom metrics + three-column: jobs / alerts / target health";
    steps=@("If no auth: leave secret blank","If Basic Auth: format as username:password; if Bearer: paste bare token","Admin -> Secrets -> New: paste credential (or leave blank)","Admin -> Integrations -> New: type Prometheus, URL = http://prometheus:9090, secret","Admin -> Panels -> New: type Prometheus - add custom PromQL queries in panel config");
    extra="Custom PromQL metric cards: add up to 8 expressions in the panel config JSON. Each renders with current value, optional unit suffix, and 1-hour sparkline."},
  @{id="grafana";label="Grafana";cat="Monitoring";status="Need Testing";poll="60 s";
    secret='Service Account token (glsa_...)';secretHint='Grafana -> Administration -> Service Accounts -> Add service account -> Add token. Assign Viewer role (or Admin role for dashboard/user counts).';
    url="Required";urlEx="http://192.168.1.10:3000";
    desc="Datasource health for every configured Grafana datasource, active alerts from unified alerting, and instance metadata (version, database, org, dashboard/user counts).";
    p1="N/M datasources healthy + firing alerts + version";p2="Datasource health donut + chips + alert list + datasource list";p4="Donut + full chips + three-column: datasource roster / alert list / instance detail";
    steps=@("Grafana -> Administration -> Service Accounts -> Add -> create token","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Grafana, URL = http://grafana:3000, secret","Admin -> Panels -> New: type Grafana");
    extra="Dashboard count and user count require the Service Account to have Admin role."},
  # Downloads
  @{id="transmission";label="Transmission";cat="Downloads";status="Tested";poll="30 s";
    secret='username:password or blank (if auth disabled)';secretHint='Your Transmission Web UI credentials. Leave blank if you disabled authentication in Transmission settings.';
    url="Required";urlEx="http://192.168.1.10:9091";
    desc="Active downloads with progress and speed, seeding count, total upload/download stats.";
    p1="Speed + status counts";p2="Speed + active torrent list with progress bars";p4="Speed + tracker breakdown + full torrent list";
    steps=@("Format as username:password (or leave blank if no auth)","Admin -> Secrets -> New: paste credential","Admin -> Integrations -> New: type Transmission, URL = http://transmission:9091, secret","Admin -> Panels -> New: type Transmission");extra=""},
  @{id="qbittorrent";label="qBittorrent";cat="Downloads";status="Tested";poll="30 s";
    secret='username:password';secretHint='Your qBittorrent WebUI login. Default is admin:adminadmin (change it!).';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="Active downloads with progress and speed, seeding count, free disk space, tracker breakdown.";
    p1="Speed + status counts";p2="Speed + torrent list with progress bars";p4="Speed + tracker breakdown + full torrent list";
    steps=@("Format as username:password","Admin -> Secrets -> New: paste credential","Admin -> Integrations -> New: type qBittorrent, URL = http://qbittorrent:8080, secret","Admin -> Panels -> New: type qBittorrent");extra=""},
  @{id="deluge";label="Deluge";cat="Downloads";status="Need Testing";poll="30 s";
    secret='Bare password (no username)';secretHint='Just the password - no username. Deluge Web UI authenticates with a password only.';
    url="Required";urlEx="http://192.168.1.10:8112";
    desc="Active downloads with progress and speed, seeding count, free disk space, tracker breakdown.";
    p1="Speed + status counts";p2="Speed + torrent list with progress bars";p4="Speed + tracker breakdown + full torrent list";
    steps=@("Your Deluge Web UI password (no username needed)","Admin -> Secrets -> New: paste the password","Admin -> Integrations -> New: type Deluge, URL = http://deluge:8112, secret","Admin -> Panels -> New: type Deluge");extra=""},
  @{id="rutorrent";label="ruTorrent";cat="Downloads";status="Need Testing";poll="30 s";
    secret='username:password or blank';secretHint='Your ruTorrent HTTP Basic Auth credentials, or blank if no auth is configured.';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="Active downloads with progress and speed, seeding count, free disk space. Tracker breakdown when the httprpc plugin is available.";
    p1="Speed + status counts";p2="Speed + torrent list with progress bars";p4="Speed + tracker breakdown + full torrent list";
    steps=@("Format as username:password (or leave blank if no auth)","Admin -> Secrets -> New: paste credential","Admin -> Integrations -> New: type ruTorrent, URL = http://rutorrent:8080, secret","Admin -> Panels -> New: type ruTorrent");extra=""},
  @{id="sabnzbd";label="SABnzbd";cat="Downloads";status="Need Testing";poll="15 s";
    secret='Plain API key';secretHint='SABnzbd -> Config -> General -> API Key';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="Live download speed, queue with per-slot progress bars, and recent history.";
    p1="Speed + status chip + queue count";p2="Speed header + full queue list with progress bars";p4="Speed + stats + history + queue slots";
    steps=@("SABnzbd -> Config -> General -> copy API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type SABnzbd, URL = http://sabnzbd:8080, secret","Admin -> Panels -> New: type SABnzbd");extra=""},
  @{id="nzbget";label="NZBGet";cat="Downloads";status="Need Testing";poll="15 s";
    secret='username:password';secretHint='Your NZBGet control user credentials. Default is nzbget:tegbzn6789 (change it!).';
    url="Required";urlEx="http://192.168.1.10:6789";
    desc="Live download speed, queue with per-group progress bars, free disk space, and recent history.";
    p1="Speed + status chip + queue count";p2="Speed header + full queue list with progress bars";p4="Speed + stats + history + queue slots";
    steps=@("Format as username:password (NZBGet control user)","Admin -> Secrets -> New: paste credential","Admin -> Integrations -> New: type NZBGet, URL = http://nzbget:6789, secret","Admin -> Panels -> New: type NZBGet");extra=""},
  # Smart Home
  @{id="homeassistant";label="Home Assistant";cat="Smart Home";status="Tested";poll="60 s";
    secret='Long-lived access token';secretHint='Home Assistant -> Profile -> Long-Lived Access Tokens -> Create Token (at the very bottom of the Profile page).';
    url="Required";urlEx="http://192.168.1.10:8123";
    desc="Entity states for smart home devices. Filter by entity ID or domain (sensor, light, switch, etc.). Shows friendly name, state, unit, and last-changed time.";
    p1="Entity count + quick state summary";p2="Filtered entity list with states";p4="Full entity list with last-changed times";
    steps=@("Home Assistant -> Profile (bottom-left) -> Long-Lived Access Tokens -> Create Token","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Home Assistant, URL = http://homeassistant:8123, secret","Admin -> Panels -> New: type Home Assistant - configure domain/entity filters in panel config");
    extra="Entity filters: configure a comma-separated list of domains or entity IDs in the panel config to show only the entities you care about."},
  @{id="frigate";label="Frigate";cat="Smart Home";status="Need Testing";poll="15 s";
    secret='Blank (unauthenticated) or Bearer token';secretHint='Most home lab Frigate instances run without auth (port 5000). If you enabled built-in Frigate authentication, get a token from Frigate -> Settings -> Users.';
    url="Required";urlEx="http://192.168.1.10:5000";
    desc="NVR camera panel - camera roster with detection FPS, zone configuration with object filters, recent detection events by label and score, and detector inference speed.";
    p1="Camera count + zone count + detector speed + event count";p2="Stat chips + camera list with FPS + events feed";p4="Three-column: cameras + zones + events feed";
    steps=@("Leave blank for unauthenticated instances (common on port 5000)","If auth enabled: Frigate -> Settings -> Users -> generate Bearer token","Admin -> Integrations -> New: type Frigate, URL = http://frigate:5000, secret (or blank)","Admin -> Panels -> New: type Frigate");
    extra="Live streams: Use a Text/HTML panel with <img src=http://frigate:5000/api/camera_name/stream> to embed live MJPEG streams."},
  @{id="blueiris";label="Blue Iris";cat="Smart Home";status="Need Testing";poll="30 s";
    secret='username:password';secretHint='A Blue Iris user account with permission to access the JSON API. Create a dedicated API user in Blue Iris -> Users and Passwords.';
    url="Required";urlEx="http://192.168.1.10:81";
    desc="System signal light (green/yellow/red), camera roster with per-camera status, active profile, recent alert feed with AI memo, trigger and clip counts.";
    p1="Signal chip + cameras online/total + profile + version";p2="Signal + stat chips + camera list + recent alerts";p4="Three-column: system name/profiles / camera detail / alert feed";
    steps=@("Blue Iris -> Users and Passwords -> create an API user","Format as username:password","Admin -> Secrets -> New: paste credential","Admin -> Integrations -> New: type Blue Iris, URL = http://blueiris-ip:81, secret","Admin -> Panels -> New: type Blue Iris");
    extra="Live streams: Blue Iris MJPEG streams at http://host:81/mjpg/shortname?user=admin&pw=password. Embed in a Text/HTML panel."},
  @{id="lubelogger";label="LubeLogger";cat="Smart Home";status="Need Testing";poll="15 min";
    secret='username:password or Bearer token';secretHint='Your LubeLogger login, or an API token from LubeLogger -> Settings -> API.';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="Vehicle maintenance panel - urgency-color-coded reminder list per vehicle, odometer readings, and service history log.";
    p1="Fleet count + overdue/urgent chips";p2="Chips + per-vehicle reminder lists";p4="All vehicles with full reminder lists + combined service history";
    steps=@("Format as username:password or get API token from LubeLogger -> Settings","Admin -> Secrets -> New: paste credential","Admin -> Integrations -> New: type LubeLogger, URL = http://lubelogger:8080, secret","Admin -> Panels -> New: type LubeLogger");
    extra="Calendar: Add LubeLogger as a calendar source to see date-bound maintenance reminders on the calendar."},
  # Development
  @{id="github";label="GitHub";cat="Development";status="Tested";poll="2 min";
    secret='Personal Access Token (PAT)';secretHint='GitHub -> Settings -> Developer settings -> Personal access tokens -> Generate new token (classic). Required scopes: read:user and public_repo.';
    url="None (GitHub API)";urlEx="";
    desc="GitHub profile with avatar, bio, follower counts, and public repo count. Top repos by stars with language color dot. 30-day event activity bar chart. Recent event feed with type icon, repo, and detail.";
    p1="Avatar + name + repo/follower counts + last event";p2="Avatar + bio/location + stats + event feed";p4="Full profile + 30-day activity chart + top repos + event feed";
    steps=@("GitHub -> Settings -> Developer settings -> Personal access tokens -> Generate new token","Required scopes: read:user and public_repo","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type GitHub, no URL, secret = token","Admin -> Panels -> New: type GitHub");
    extra="Fine-grained PATs work too - grant read access to public repositories."},
  # Gaming
  @{id="steam";label="Steam";cat="Gaming";status="Need Testing";poll="5 min";
    secret='Steam Web API key';secretHint='Register a free key at https://steamcommunity.com/dev/apikey. Also need your Steam ID64 configured in integration settings.';
    url="None (Steam API)";urlEx="";
    desc="Player profile (online state, current game), owned game count and total hours, top games by playtime, recently played, recent achievement unlocks, Steam store sales and new releases.";
    p1="Online state + current game + game count";p2="Profile + top games + recently played";p4="Full profile + top games + achievements + store highlights";
    steps=@("Register Steam Web API key at steamcommunity.com/dev/apikey","Find your Steam ID64 (from your profile URL or steamid.io)","Admin -> Secrets -> New: paste the API key","Admin -> Integrations -> New: type Steam, no URL, secret = API key (Steam ID64 entered in integration config)");
    extra="Steam profile must be public for the API to return game data."},
  @{id="romm";label="RomM";cat="Gaming";status="Need Testing";poll="15 min";
    secret='username:password or Bearer token';secretHint='Your RomM login, or an API token if configured.';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="ROM library overview - total platforms, ROMs, and library size, with a per-platform list and a recently-added game cover grid.";
    p1="Total ROMs + platforms + size";p2="Platform list + cover grid";p4="Platform detail + full cover grid";
    steps=@("Format as username:password or get API token","Admin -> Secrets -> New: paste credential","Admin -> Integrations -> New: type RomM, URL = http://romm:8080, secret","Admin -> Panels -> New: type RomM");extra=""},
  @{id="pterodactyl";label="Pterodactyl";cat="Gaming";status="Need Testing";poll="60 s";
    secret='Client API key (Bearer)';secretHint='Pterodactyl -> Account -> API Credentials -> Create API Key (client key, not admin key).';
    url="Required";urlEx="http://192.168.1.10";
    desc="All servers accessible to your API key with state (running/starting/stopping/offline), CPU, memory, disk, and uptime.";
    p1="Running/total count";p2="Compact server list with state and CPU/RAM";p4="Full server cards with resource bars and uptime";
    steps=@("Pterodactyl -> Account (top right) -> API Credentials -> Create API Key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Pterodactyl, URL = http://pterodactyl, secret","Admin -> Panels -> New: type Pterodactyl");
    extra="Use the client API key (from Account), not the admin API key."},
  # Finance
  @{id="fireflyiii";label="Firefly III";cat="Finance";status="Need Testing";poll="60 min";
    secret='Personal Access Token (PAT)';secretHint='Firefly III -> Profile -> OAuth -> Personal Access Tokens -> Create new token';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="Monthly summary figures (earned, spent, net worth, bills paid/unpaid, left to spend, net savings) and asset account balances.";
    p1="Net worth + earned + spent + left to spend";p2="Summary chips + full monthly summary + account list";p4="Large net-worth header + monthly summary column + account balances column";
    steps=@("Firefly III -> Profile (top-right) -> OAuth -> Personal Access Tokens -> create token","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Firefly III, URL = http://firefly:8080, secret","Admin -> Panels -> New: type Firefly III");
    extra="Summary figures cover the current calendar month. Polls hourly - financial data changes infrequently."},
  @{id="actualbudget";label="Actual Budget";cat="Finance";status="Need Testing";poll="5 min";
    secret='API key';secretHint='Set the API_KEY environment variable on the actual-http-api sidecar container. Use that same value here.';
    url="Required";urlEx="http://192.168.1.10:5006";
    desc="Envelope budgeting panel - monthly income, spending, and available balance with per-category-group progress bars, account balances split into on-budget and off-budget, and a prominent net worth figure.";
    p1="Income + spent + balance + net worth";p2="Summary chips + category group spending bars + account balances";p4="Net worth header + three-column: accounts / budget bars / category breakdown";
    steps=@("Deploy the actual-http-api sidecar alongside Actual Budget","Set API_KEY env var on the sidecar","Admin -> Secrets -> New: paste the API key","Admin -> Integrations -> New: type Actual Budget, URL = http://actual-http-api:5006, secret","Admin -> Panels -> New: type Actual Budget");
    extra="Requires the unofficial actual-http-api sidecar. If you have multiple budgets, set budgetId in the panel config JSON."},
  @{id="ghostfolio";label="Ghostfolio";cat="Finance";status="Need Testing";poll="5 min";
    secret='Security token';secretHint='Ghostfolio -> User Account -> Security Token (the token shown on your account page, used for anonymous auth).';
    url="Required";urlEx="http://192.168.1.10:3333";
    desc="Current net worth, today/year/all-time performance with color-coded returns, a multi-segment holdings donut showing allocation by asset, and a full holdings list.";
    p1="Net worth + today change % + all-time return % + holding count";p2="Net worth + performance trio + allocation bar + top holdings list";p4="Large net worth + performance table + holdings donut + full holdings list";
    steps=@("Ghostfolio -> User Account -> copy Security Token","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Ghostfolio, URL = http://ghostfolio:3333, secret","Admin -> Panels -> New: type Ghostfolio");
    extra="Stoa exchanges the security token for a short-lived JWT on each refresh."},
  @{id="coinbase";label="Coinbase";cat="Finance";status="Need Testing";poll="5 min";
    secret='apiKey:apiSecret';secretHint='Coinbase -> Settings -> API -> New API Key (read-only). Store as apiKey:apiSecret (colon-separated).';
    url="None (Coinbase cloud API)";urlEx="";
    desc="Total portfolio value in USD, per-asset allocation donut, and full account list with crypto quantities and native USD values.";
    p1="Total USD value + asset count";p2="Total value + account list with USD values and quantities";p4="Total value + allocation donut + full account list with proportional bars";
    steps=@("Coinbase -> Settings -> API -> New API Key (read-only scopes)","Format as apiKey:apiSecret","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Coinbase, no URL, secret = apiKey:apiSecret","Admin -> Panels -> New: type Coinbase");
    extra="Stoa signs requests with HMAC-SHA256 using the secret. Zero-balance accounts are filtered out."},
  @{id="stocks";label="Stocks";cat="Finance";status="Tested";poll="5 min";
    secret='Blank - no API key needed';secretHint='Yahoo Finance is a public API. No credentials required.';
    url="None (standalone)";urlEx="";
    desc="US stock quotes with mini sparklines for recent price movement. Sourced from Yahoo Finance.";
    p1="Ticker symbols + current prices + change %";p2="Ticker list with sparklines";p4="Full grid with price, change, sparkline, and market cap";
    steps=@("Admin -> Integrations -> New: type Stocks, no URL, no secret","Admin -> Panels -> New: type Stocks - enter ticker symbols in panel config (e.g. AAPL, MSFT, NVDA)");extra=""},
  @{id="crypto";label="Crypto";cat="Finance";status="Tested";poll="5 min";
    secret='Blank or CoinGecko Demo API key (optional)';secretHint='Public CoinGecko API works without a key but has strict rate limits. Get a free Demo key at coingecko.com for reliable use.';
    url="None (standalone)";urlEx="";
    desc="Cryptocurrency prices with sparklines, sourced from CoinGecko.";
    p1="Coin symbols + current prices + change %";p2="Coin list with sparklines";p4="Full grid with price, change, sparkline, and market cap";
    steps=@("Optional: get a free Demo API key at coingecko.com","Admin -> Integrations -> New: type Crypto, no URL, secret = API key (or blank)","Admin -> Panels -> New: type Crypto - enter coin IDs in panel config");extra=""},
  # Documents
  @{id="paperless";label="Paperless-ngx";cat="Documents";status="Need Testing";poll="5 min";
    secret='API token';secretHint='Paperless-ngx -> Settings -> API -> Generate Token';
    url="Required";urlEx="http://192.168.1.10:8000";
    desc="Total document count, inbox count, document type breakdown (donut chart), tag proportional bars in each tag's own color, correspondent breakdown, and a recent document list with direct links.";
    p1="Total docs + inbox count + correspondent count + tag count";p2="Stat chips + recent document list";p4="Left: stats + doc type donut + tag bars + correspondent bars | Right: recent document list";
    steps=@("Paperless-ngx -> Settings -> API -> Generate Token","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Paperless-ngx, URL = http://paperless:8000, secret","Admin -> Panels -> New: type Paperless-ngx");
    extra="Recent document links open directly in the Paperless UI."},
  @{id="docspell";label="Docspell";cat="Documents";status="Need Testing";poll="15 min";
    secret='account:password';secretHint='For multi-collective setups: collective/user:password. For single-collective: user:password. Stoa exchanges these for a session token.';
    url="Required";urlEx="http://192.168.1.10:7880";
    desc="Document archive stats (item count, storage, tag count) and a recent document list with name, date, correspondent, folder, and tags.";
    p1="Items + storage + tags";p2="Chips + recent document list";p4="Two-column: stats + full recent list";
    steps=@("Format as collective/user:password (or user:password for single-collective)","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Docspell, URL = http://docspell:7880, secret","Admin -> Panels -> New: type Docspell");extra=""},
  # Personal
  @{id="monica";label="Monica";cat="Personal";status="Need Testing";poll="15 min";
    secret='Bearer token';secretHint='Monica -> Settings -> API -> Personal Access Tokens -> Create';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="Personal CRM panel - total contact count and upcoming reminders with contact name, date, and days until. Color-coded for reminders due today or within the week.";
    p1="Contact count + imminent reminders";p2="Reminder list";p4="Full reminder list with dates and contact detail";
    steps=@("Monica -> Settings -> API -> Personal Access Tokens -> create token","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Monica, URL = http://monica:8080, secret","Admin -> Panels -> New: type Monica");extra=""},
  @{id="homebox";label="Homebox";cat="Personal";status="Need Testing";poll="15 min";
    secret='email:password';secretHint='Your Homebox login. Format: user@example.com:yourpassword';
    url="Required";urlEx="http://192.168.1.10:7745";
    desc="Home inventory panel - total items, locations, labels, warranty count, and inventory value. Per-location item counts with proportional bars.";
    p1="Total items + locations + warranties";p2="Stat chips + location list";p4="Stat chips + location bars + value breakdown";
    steps=@("Format as email:password (your Homebox login)","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Homebox, URL = http://homebox:7745, secret","Admin -> Panels -> New: type Homebox");extra=""},
  # Health & Fitness
  @{id="wger";label="wger";cat="Health & Fitness";status="Need Testing";poll="15 min";
    secret='Plain API key';secretHint='wger -> Dashboard -> API -> Permanent API key';
    url="Required";urlEx="http://192.168.1.10:80";
    desc="Workout manager panel - total workout count, recent session log (date, impression, notes), and weight history entries.";
    p1="Total workouts + last session date";p2="Recent session list";p4="Session list + weight log chart";
    steps=@("wger -> Dashboard -> API -> copy Permanent API key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type wger, URL = http://wger:80, secret","Admin -> Panels -> New: type wger");extra=""},
  @{id="fittrackee";label="Fittrackee";cat="Health & Fitness";status="Need Testing";poll="15 min";
    secret='email:password';secretHint='Your Fittrackee login. Format: user@example.com:yourpassword';
    url="Required";urlEx="http://192.168.1.10:5000";
    desc="Activity tracker panel - total workouts, sports, distance, duration, and ascent. Recent workout list with sport type, title, distance, speed, and ascent per activity.";
    p1="Total workouts + distance + duration";p2="Stat chips + recent workout list";p4="Stat chips + full workout list with all metrics";
    steps=@("Format as email:password (your Fittrackee login)","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Fittrackee, URL = http://fittrackee:5000, secret","Admin -> Panels -> New: type Fittrackee");extra=""},
  @{id="strava";label="Strava";cat="Health & Fitness";status="Need Testing";poll="60 s";
    secret='clientId:clientSecret';secretHint='Strava API settings at strava.com/settings/api -> create an app -> copy Client ID and Client Secret. Format: clientId:clientSecret';
    url="None (OAuth - Strava cloud API)";urlEx="";
    desc="Running and cycling activity panel - recent activities with distance, pace/speed, elevation. 4-week totals per sport with colored bars. 8-week stacked bar chart at tall heights.";
    p1="Last activity emoji + name + distance + duration";p2="Athlete avatar + location + 4-week summaries + recent activities";p4="YTD stat chips + 4-week summaries + 8-week stacked chart + full activity list";
    steps=@("strava.com/settings/api -> create an app -> copy Client ID and Client Secret","Format as clientId:clientSecret","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Strava, no URL, secret = clientId:clientSecret","On the integration edit page, click Connect Strava to authorize your account via OAuth");
    extra="OAuth - must connect your Strava account after creating the integration. Distances shown in miles or km based on athlete preference."},
  @{id="duolingo";label="Duolingo";cat="Health & Fitness";status="Need Testing";poll="60 s";
    secret='username:password';secretHint='Your Duolingo account login. Stoa uses the unofficial Duolingo API - credentials are used to obtain a session JWT cached for 12 hours.';
    url="None (unofficial Duolingo API)";urlEx="";
    desc="Language learning panel - current streak with fire emoji, daily XP goal progress bar, league tier badge, and list of learning courses with language flag, level, total XP, and proportional XP bar.";
    p1="Streak + active language + today XP/goal";p2="Streak + goal bar + league badge + course list";p4="Streak + goal bar + 14-day XP chart + full course list";
    steps=@("Format as username:password (your Duolingo login)","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Duolingo, no URL, secret = username:password","Admin -> Panels -> New: type Duolingo");
    extra="Uses the unofficial Duolingo API. Profile must be public for some stats."},
  # Music
  @{id="spotify";label="Spotify";cat="Music";status="Tested";poll="30 s";
    secret='clientId:clientSecret';secretHint='Spotify Developer Dashboard (developer.spotify.com) -> Create App -> copy Client ID and Client Secret. Format: clientId:clientSecret';
    url="None (OAuth - Spotify cloud API)";urlEx="";
    desc="Now-playing panel - current or most recently played track with album art, progress bar, and playback controls (Premium). Recent play history at taller heights.";
    p1="Now-playing indicator + track + artist";p2="Album art + track info + progress bar + controls";p4="All of above + recent play history";
    steps=@("Spotify Developer Dashboard -> Create App -> set Redirect URI to http://your-stoa:8080/api/spotify/callback","Copy Client ID and Client Secret; format as clientId:clientSecret","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Spotify, no URL, secret = clientId:clientSecret","On the integration edit page, click Connect Spotify to authorize via OAuth");
    extra="Playback controls require Spotify Premium. Controls proxy through the Stoa backend - your access token never reaches the browser."},
  @{id="lastfm";label="Last.fm";cat="Music";status="Tested";poll="30 s";
    secret='username:apiKey';secretHint='Your Last.fm username + API key from last.fm/api (free, no OAuth required). Format: yourusername:yourapikey';
    url="None (Last.fm API)";urlEx="";
    desc="Music scrobbling panel - now playing indicator, current/recent track with artist/album, lifetime scrobble count, top artists bar chart, top tracks and albums (7-day window).";
    p1="Now-playing dot + track + artist + scrobble count";p2="Now-playing section + recent scrobble list";p4="Album art + full stats + top artists chart + top tracks/albums";
    steps=@("Get a free Last.fm API key at last.fm/api -> Create API Account","Format as yourusername:yourapikey","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Last.fm, no URL, secret = username:apiKey","Admin -> Panels -> New: type Last.fm");
    extra="No OAuth required. Profile must be public."},
  # Food & Home
  @{id="mealie";label="Mealie";cat="Food & Home";status="Need Testing";poll="15 min";
    secret='Bearer token';secretHint='Mealie -> User Settings -> API Tokens -> Create a long-lived token';
    url="Required";urlEx="http://192.168.1.10:9000";
    desc="Recipe manager and meal planner panel - weekly meal plan displayed day-by-day, shopping list with checked/unchecked items, recent recipe list with ratings and cook time, and a total recipe count.";
    p1="Total recipes + meal count + shopping items";p2="Stat chips + this week meal plan by day";p4="Left: stats + meal plan + shopping list | Right: recent recipes";
    steps=@("Mealie -> User Settings -> API Tokens -> create a long-lived token","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Mealie, URL = http://mealie:9000, secret","Admin -> Panels -> New: type Mealie");
    extra="Today is highlighted in indigo with a Today badge in the meal plan."},
  @{id="grocy";label="Grocy";cat="Food & Home";status="Need Testing";poll="5 min";
    secret='Plain API key';secretHint='Grocy -> Manage API Keys (or Settings -> User API Keys) -> create key';
    url="Required";urlEx="http://192.168.1.10:80";
    desc="Household management panel - food expiry tracker with urgency color coding, overdue chore list, pending tasks with due dates, and shopping list.";
    p1="Expired count + expiring count + overdue chores + tasks + shopping";p2="Stat chips + food expiry list + overdue chores list";p4="Left: stats + food expiry + all chores | Right: tasks + shopping list";
    steps=@("Grocy -> Manage API Keys -> create a new key","Admin -> Secrets -> New: paste the key","Admin -> Integrations -> New: type Grocy, URL = http://grocy:80, secret","Admin -> Panels -> New: type Grocy");
    extra="Expiry urgency: red = expired, orange = <2 days, amber = <5 days, yellow = <7 days."},
  @{id="tandoor";label="Tandoor";cat="Food & Home";status="Need Testing";poll="15 min";
    secret='Bearer token';secretHint='Tandoor -> Settings -> API Tokens -> create a token';
    url="Required";urlEx="http://192.168.1.10:8080";
    desc="Recipe manager panel - total recipe count, weekly meal plan calendar, unchecked shopping list, and recent recipes with ratings, cook times, and keyword tags.";
    p1="Recipe count + meal count + shopping items + today meals";p2="Stat chips + this week meal plan";p4="Left: stats + meal plan + shopping list | Right: recent recipes with keywords";
    steps=@("Tandoor -> Settings -> API Tokens -> create a token","Admin -> Secrets -> New: paste the token","Admin -> Integrations -> New: type Tandoor, URL = http://tandoor:8080, secret","Admin -> Panels -> New: type Tandoor");extra=""},
  # Content
  @{id="youtube";label="YouTube";cat="Content";status="Experimental";poll="60 min";
    secret='clientId:clientSecret';secretHint='Google Cloud Console -> APIs & Services -> Credentials -> Create OAuth 2.0 Client ID (Web application). Enable the YouTube Data API v3. Set Redirect URI to http://your-stoa:8080/api/youtube/callback. Format: clientId:clientSecret';
    url="None (OAuth - Google/YouTube API)";urlEx="";
    desc="YouTube subscription feed - recent videos from channels you follow with thumbnail grid (4x+), scrollable list (2-3x), or summary bar (1x). Click any video to watch it inline via embedded player. YouTubes built-in fullscreen button works from the embedded player.";
    p1="Latest video title + channel + age";p2="Profile header + scrollable video list";p4="Profile header + thumbnail grid (16:9 thumbnails, click to play inline)";
    steps=@("Google Cloud Console -> create a project -> enable YouTube Data API v3","APIs & Services -> Credentials -> Create OAuth 2.0 Client ID (Web app)","Set Authorized Redirect URI to http://your-stoa-host:8080/api/youtube/callback","Copy Client ID and Client Secret; format as clientId:clientSecret","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type YouTube, no URL, secret = clientId:clientSecret","On the integration edit page, click Connect YouTube to authorize via OAuth");
    extra="Quota: YouTube Data API v3 free tier is 10,000 units/day. Stoa uses ~27 units per refresh. At the default 60-minute poll interval, that is ~648 units/day - well within the free limit. Feed data is cached for 55 minutes server-side."},
  @{id="twitch";label="Twitch";cat="Content";status="Need Testing";poll="60 s";
    secret='clientId:clientSecret';secretHint='Twitch Developer Console (dev.twitch.tv/console) -> Register Your Application -> copy Client ID and Client Secret. Format: clientId:clientSecret';
    url="None (OAuth - Twitch Helix API)";urlEx="";
    desc="Live stream feed panel - followed channels currently live with channel name, stream category, viewer count, and uptime. 2-column thumbnail grid at 4x+.";
    p1="Live count badge + top channel name/game";p2="Profile header + compact stream list";p4="Profile header + 2-column thumbnail grid (440x248 previews)";
    steps=@("Twitch Developer Console -> Register Your Application -> set Redirect URI to http://your-stoa:8080/api/twitch/callback","Copy Client ID and Client Secret; format as clientId:clientSecret","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Twitch, no URL, secret = clientId:clientSecret","On the integration edit page, click Connect Twitch to authorize via OAuth (scope: user:read:follows)");
    extra="Empty state when no followed channels are live."},
  @{id="trakt";label="Trakt";cat="Content";status="Need Testing";poll="60 s";
    secret='clientId:username';secretHint='Client ID from your Trakt API application at trakt.tv/oauth/applications, plus your Trakt username. Format: clientId:username. Requires a public Trakt profile.';
    url="None (Trakt API)";urlEx="";
    desc="Movie and TV watch tracking panel - currently playing indicator with pulsing red dot when actively scrobbling, all-time movie and episode watch counts, recent watch history, and at 4x+ a 10-point rating distribution bar chart.";
    p1="Watching indicator (if active) or last watched + type emoji";p2="Watching badge + stats chips + watch history";p4="Watching badge + stats + rating distribution chart + full history";
    steps=@("Create a Trakt API application at trakt.tv/oauth/applications - copy the Client ID","Format as clientId:yourTraktUsername","Admin -> Secrets -> New: paste the credential","Admin -> Integrations -> New: type Trakt, no URL, secret = clientId:username","Admin -> Panels -> New: type Trakt");
    extra="No OAuth flow needed - Trakt exposes public watch history via API key + username. Profile must be public."},
  @{id="rss";label="RSS / Atom";cat="Content";status="Tested";poll="5 min";
    secret='Blank (public feeds) or Bearer token (authenticated feeds)';
    secretHint='Most RSS feeds are public - leave blank. For password-protected feeds, paste a Bearer token.';
    url="Feed URL (configured per panel, not per integration)";urlEx="https://example.com/feed.xml";
    desc="Items from any RSS or Atom feed - title, summary, and link. The feed URL is configured per panel, so a single RSS integration can back multiple panels pointing to different feeds.";
    p1="Latest item title + source + age";p2="Item list with summaries";p4="Full item list with content preview";
    steps=@("Admin -> Integrations -> New: type RSS, leave URL blank (or enter a default), no secret","Admin -> Panels -> New: type RSS - enter the specific feed URL in the panel config");
    extra="A single RSS integration can serve multiple panels each pointing to different feed URLs."},
  @{id="weather";label="Weather";cat="Content";status="Tested";poll="10 min";
    secret='Blank - no API key needed';secretHint='Open-Meteo is a public API with no authentication required.';
    url="None (Open-Meteo public API)";urlEx="";
    desc="Current conditions (temperature, feels-like, wind, humidity) and a multi-day forecast. Sourced from Open-Meteo.";
    p1="Current temp + conditions + feels-like";p2="Current conditions + 3-day forecast";p4="Full current detail + 7-day forecast + hourly chart";
    steps=@("Admin -> Integrations -> New: type Weather, no URL, no secret","Admin -> Panels -> New: type Weather - configure location (city name or lat/long) and temperature unit in panel config");
    extra="Configure location by city name (e.g. Denver, CO) or latitude/longitude in the panel config."},
  @{id="sports";label="Sports";cat="Content";status="Tested";poll="5 min";
    secret='Blank - no API key needed';secretHint='ESPN public API - no credentials required.';
    url="None (ESPN public API)";urlEx="";
    desc="Scores, standings, and schedules for NHL, NFL, NBA, and MLB from ESPN's public API.";
    p1="Live game scores + standing summary";p2="Scores + standings by division";p4="Full scores + standings + schedule";
    steps=@("Admin -> Integrations -> New: type Sports, no URL, no secret","Admin -> Panels -> New: type Sports - select the leagues to display in panel config");
    extra="Configure which leagues (NHL, NFL, NBA, MLB) to display in the panel config."}
)

# Standalone panels
$standalones = @(
  @{id="calendar";label="Calendar";cat="Productivity";
    desc="Multi-source calendar aggregating upcoming events from Sonarr, Radarr, Lidarr, Readarr, and Google Calendar. Each source has its own days-ahead window (7-90 days). Sources can be individually shown or hidden per panel.";
    p1="Today events count + next event";p2="Week view with events";p4="Full month calendar with event detail";
    extra="Add sources in Profile -> Calendar Sources. Google Calendar uses OAuth - see docs/oauth.md."},
  @{id="kanban";label="Kanban";cat="Productivity";
    desc="Task tracking panel - multiple named boards per panel. List view (flat table with status filter pills) and Board view (5 swim lanes: Not Started / In Progress / On Hold / Completed / Cancelled). Drag and drop on desktop; lane picker + Move button on mobile.";
    p1="Board list + card counts + overdue indicator";p2="Board list + status summary badges";p4="Board selector + full card grid preview";
    extra="Cards have: title (required), status, due date (optional), notes (optional). Add as a calendar source to show cards with due dates on the Calendar."},
  @{id="notes";label="Notes";cat="Productivity";
    desc="Shared markdown-capable note panel. Multi-user locking - only one user can edit at a time. Other users see the note as read-only while locked.";
    p1="Note title + first line preview";p2="Rendered markdown content";p4="Full rendered note with scroll";
    extra="Both system notes (shared with groups) and personal notes are supported."},
  @{id="checklist";label="Checklist";cat="Productivity";
    desc="Shared checklist panel. Items can be checked off, added, or removed. State is shared - when one user checks an item, it is checked for everyone who can see the panel.";
    p1="Checked/total count + completion bar";p2="Item list with checkboxes";p4="Full item list with add/remove controls";extra=""},
  @{id="bookmarks";label="Bookmarks";cat="Productivity";
    desc="Visual bookmark tree displayed as a panel. Bookmarks are organized into folders and sub-folders, each optionally with a custom icon. Clicking opens the URL.";
    p1="Folder list + quick-access links";p2="Expanded folder tree";p4="Full bookmark tree with icons";
    extra="System bookmarks (shared with groups) and personal bookmarks are both supported. Import/export via CLI."},
  @{id="search";label="Search";cat="Productivity";
    desc="A search bar panel that passes queries to a configured search engine. Supports any search engine with a URL pattern, including self-hosted options like SearXNG.";
    p1="Search input bar";p2="Search bar + recent searches";p4="Search bar + recent searches + quick links";
    extra="Configure the search engine URL pattern directly in the panel config. E.g. https://searxng.local/search?q={query}"},
  @{id="customapi";label="Custom API";cat="Productivity";
    desc="A generic panel that makes a GET request to any URL and displays the JSON response as formatted text. Useful for services not natively supported in Stoa, simple status endpoints, or custom scripts that expose JSON.";
    p1="Status indicator + key value";p2="Formatted JSON response";p4="Full JSON with syntax highlighting";
    extra="The integration URL is the endpoint to call. An optional Bearer token can be stored as a secret."},
  @{id="custom";label="Text / HTML";cat="Productivity";
    desc="A freeform panel that renders arbitrary HTML content. Write anything directly into the panel config - no integration or external service needed.";
    p1="HTML content (compact)";p2="HTML content";p4="HTML content (full)";
    extra="Use <img src='...' style='width:100%;height:100%;object-fit:cover;display:block;'> for full-panel images. Supports Frigate and Blue Iris MJPEG live streams."},
  @{id="iframe";label="Web Embed";cat="Productivity";
    desc="Renders any URL inside an iframe that fills the panel. Useful for embedding web pages, dashboards, or other live content.";
    p1="Embedded page (compact view)";p2="Embedded page";p4="Embedded page (full height)";
    extra="For image URLs, use a Text/HTML panel instead - the browser built-in image viewer does not resize to fit the panel dimensions."}
)

# Status emoji map
$statusEmoji = @{"Tested"="Tested"; "Need Testing"="Need Testing"; "Experimental"="Experimental"}

foreach ($ig in $igs) {
    $dir = Join-Path $base $ig.id
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $dir "screenshots") | Out-Null

    $stepsBlock = ($ig.steps | ForEach-Object -Begin {$i=0} -Process { $i++; "$i. $_" }) -join "`n"

    $urlLine = if ($ig.url -like "None*") { "**URL required:** $($ig.url)" } else {
        if ($ig.urlEx) { "**URL required:** $($ig.url)`n`n**Example URL:** ``$($ig.urlEx)``" }
        else { "**URL required:** $($ig.url)" }
    }

    $extraSection = if ($ig.extra) {
        "`n---`n`n## Notes`n`n$($ig.extra)"
    } else { "" }

    $statusBadge = switch ($ig.status) {
        "Tested" { "Tested" }
        "Need Testing" { "Need Testing" }
        "Experimental" { "Experimental" }
        default { $ig.status }
    }

    $content = "# $($ig.label)`n`n**Category:** $($ig.cat) | **Status:** $($statusBadge) | **Polling:** $($ig.poll)`n`n---`n`n## Integration`n`n**Secret format:** $($ig.secret)`n`n> $($ig.secretHint)`n`n$urlLine`n`n### Setup`n`n$stepsBlock`n`n---`n`n## Panel`n`n$($ig.desc)`n`n### Height behavior`n`n| Height | What you see |`n|---|---|`n| 1x | $($ig.p1) |`n| 2-3x | $($ig.p2) |`n| 4x+ | $($ig.p4) |`n`n### Screenshots`n`n| 1x | 2x | 4x |`n|---|---|---|`n| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |`n`n*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*$extraSection"

    [System.IO.File]::WriteAllText((Join-Path $dir "README.md"), $content, [System.Text.Encoding]::UTF8)
}

foreach ($s in $standalones) {
    $dir = Join-Path $base $s.id
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $dir "screenshots") | Out-Null

    $extraSection = if ($s.extra) {
        "`n---`n`n## Notes`n`n$($s.extra)"
    } else { "" }

    $content = "# $($s.label)`n`n**Category:** $($s.cat) | **Status:** Tested | **Requires integration:** No - data stored locally in Stoa`n`n---`n`n## Panel`n`n$($s.desc)`n`n### Height behavior`n`n| Height | What you see |`n|---|---|`n| 1x | $($s.p1) |`n| 2-3x | $($s.p2) |`n| 4x+ | $($s.p4) |`n`n### Screenshots`n`n| 1x | 2x | 4x |`n|---|---|---|`n| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |`n`n*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*$extraSection"

    [System.IO.File]::WriteAllText((Join-Path $dir "README.md"), $content, [System.Text.Encoding]::UTF8)
}

$readmeCount = (Get-ChildItem -Path $base -Recurse -Filter "README.md" | Where-Object { $_.FullName -ne (Join-Path $base "README.md") }).Count
Write-Host "Created $readmeCount integration/panel pages across $((Get-ChildItem -Path $base -Directory -Recurse).Count) directories"
