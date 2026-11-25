# WallpaperWizard

Self-hosted, **agentless** desktop wallpaper management for an organization's Windows and macOS devices.

The server scans the network ranges you give it, lists every device that answers on SSH, and once you approve a
device it signs in with your shared local admin account (`ithelpdesk` by default), copies the wallpaper over and
applies it for whoever is signed in. Nothing is installed on the devices.

- **Targeting:** everyone, a group (e.g. `Sales`, `Lobby`), or a single device, with optional start/end schedule.
  The most specific match wins: device > group > everyone; ties go to the most recently edited wallpaper.
- **Automatic:** changes roll out immediately, and a rescan + re-push runs every N minutes (default 15) so new
  devices, devices that were offline, and schedule changes are picked up.
- **Safe credentials:** the device password is encrypted at rest, never sent back to the browser, and only ever sent
  to approved devices whose SSH host key matches the one seen at discovery.
- **Dashboard:** roles (superadmin / editor), 2FA, IP allowlist for the dashboard, and a full audit log.

## Run it (Docker)

```bash
docker compose up -d --build
```

Open `http://<server>:8080`, create the superadmin account, then:

1. **Push Settings** → enter the device admin username and password, and the ranges to scan
   (one per line: `192.168.1.0/24`, `10.20.0.15`; max `/20` per range).
2. **Devices** → **Scan now**, then **Approve** (or **Approve all**) the devices you manage.
3. **Wallpapers** → upload a JPG/PNG and choose who gets it.

All state lives in the `wallpaperwizard-data` volume (`/app/data`: `db.json`, `uploads/`, `secret.key`).
Set `WW_SECRET_KEY` (any long random string) in `docker-compose.yml` to keep the password encryption key out of
that volume; set it before saving the device password, as changing it later makes the saved password unreadable
(just re-enter it).

The container needs outbound TCP 22 to the device ranges. On a Linux host the default bridge network works; if your
network blocks NAT'd traffic, use `network_mode: host`.

## Device prerequisites (one-time)

Each device needs SSH turned on once. The dashboard (Push Settings) shows a one-line command per OS that
fetches a secret-free script from this server and enables SSH with no further clicks — run it as administrator:

```powershell
irm http://<server>:8080/setup/windows.ps1 | iex      # Windows, elevated PowerShell
```
```bash
curl -fsSL http://<server>:8080/setup/macos.sh | sudo bash   # macOS, Terminal
```

With no domain or MDM, that one admin-run command per device is the minimum: nothing can enable SSH remotely
before SSH exists. The scripts live in `public/setup/` and carry no credentials; keep the server on your LAN.


| OS | Enable | Notes |
|----|--------|-------|
| Windows 10/11 | OpenSSH Server: `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0`, `Set-Service sshd -StartupType Automatic`, `Start-Service sshd` (or deploy via GPO/Intune) | The wallpaper is applied through a scheduled task `WallpaperWizard` that runs as the signed-in user, now and at every logon. Files live in `C:\ProgramData\WallpaperWizard`. |
| macOS | System Settings → General → Sharing → **Remote Login**, allowing the admin account | Applied with `osascript` as the console user. The first push may show a one-time "allow System Events" prompt on the Mac. If nobody is signed in, it retries next cycle. Files live in `/Users/Shared/WallpaperWizard`. |

The admin account must be able to `sudo` on macOS and be a local Administrator on Windows.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000 (Express API + Vite)
npm test         # wallpaper resolution, range expansion, SSH host-key pinning
npm run lint     # type-check
```

Key files: `server.ts` (API, JSON store, scan/push cycle), `devicePush.ts` (SSH discovery and the Windows/macOS
apply scripts), `src/shared/resolveWallpaper.ts` (which wallpaper a device gets), `src/pages/Admin.tsx` (dashboard).

## License

MIT. Built on AdBoard (© 2026 Sanjay KS, MIT). See [LICENSE](LICENSE) and [PRIVACY.md](PRIVACY.md).
