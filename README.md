# WallpaperWizard

Self-hosted, **agentless** desktop wallpaper management for an organization's Windows PCs and MacBooks.

The server scans your configured network ranges and lists Windows OpenSSH hosts and MacBooks enrolled by SSH
host fingerprint. After approval it signs in with the device admin account (`ithelpdesk` by default), copies the
wallpaper, and applies it for the signed-in user.

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
2. Run the device setup commands shown in Push Settings. Use **Generate MacBook setup command** for each
   MacBook to send its fingerprint to the server automatically.
3. **Devices** → **Scan now**, then **Approve** the devices you manage.
4. **Wallpapers** → upload a JPG/PNG and choose who gets it.

Open **Documentation** for the full setup guide or **Change Log** for version history. Both are next to **About**.
After upgrading to 1.1.0, rescan Windows PCs and enroll existing MacBooks. Matching host keys preserve saved
device names, groups, and approvals.

All state lives in the `wallpaperwizard-data` volume (`/app/data`: `db.json`, `uploads/`, `secret.key`).
Set `WW_SECRET_KEY` (any long random string) in `docker-compose.yml` to keep the password encryption key out of
that volume; set it before saving the device password, as changing it later makes the saved password unreadable
(just re-enter it).

The container needs outbound TCP 22 to the device ranges. On a Linux host the default bridge network works; if your
network blocks NAT'd traffic, use `network_mode: host`.

## Device prerequisites (one-time)

Each device needs SSH turned on once. Push Settings and Documentation show the setup commands. Run the
Windows command in an elevated PowerShell and the MacBook command with sudo in Terminal. The commands
fetch a commit-pinned copy of the scripts from GitHub over HTTPS.

For automatic MacBook enrollment, generate a one-use command in Push Settings using a server URL the
MacBook can reach. Run it within 30 minutes, then scan for and approve the MacBook in Devices. The MacBook
can download the setup script over HTTPS and submit its fingerprint to the server on your LAN. You can also
paste the printed fingerprint into **MacBook fingerprints** for manual enrollment.

Follow the terminal guidance if macOS requests Full Disk Access. You can enable Remote Login in Sharing
settings and rerun the script with your existing Terminal permissions.

To show a branded hostname in the commands, set `WW_SETUP_BASE_URL` to its HTTPS origin and route only
`/setup/windows.ps1` and `/setup/macos.sh` on that hostname to WallpaperWizard. Those paths redirect to
the pinned script downloads. Client devices need access to GitHub to follow the redirects.


| OS | Enable | Notes |
|----|--------|-------|
| Windows 10/11 | OpenSSH Server: `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0`, `Set-Service sshd -StartupType Automatic`, `Start-Service sshd` (or deploy via GPO/Intune) | The wallpaper is applied through a scheduled task `WallpaperWizard` that runs as the signed-in user, now and at every logon. Files live in `C:\ProgramData\WallpaperWizard`. |
| MacBook | System Settings → General → Sharing → **Remote Login**, allowing the admin account | Applied with `osascript` as the console user. The first push may show a one-time "allow System Events" prompt. If nobody is signed in, it retries next cycle. Files live in `/Users/Shared/WallpaperWizard`. |

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
