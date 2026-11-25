# WallpaperWizard — Data & Privacy

WallpaperWizard is self-hosted. It collects **no telemetry** and sends nothing to its authors.

## What it stores (in the container's `/app/data` volume only)

| Data | Purpose |
|------|---------|
| Dashboard accounts (email, scrypt password hash, role, TOTP secrets) | Sign-in, permissions, optional 2FA |
| Device admin username and password (password AES-256-GCM encrypted) | Signing in to devices over SSH to set the wallpaper |
| Devices (IP, hostname, OS, SSH host-key fingerprint, group, name, last push result) | Device list, targeting, and host-key pinning |
| Wallpapers (images and their targeting/schedule) | What gets pushed |
| Audit log (who did what, when) | Accountability |
| IP allowlist | Optional dashboard access control |

## Network connections it makes

- **Your devices:** TCP 22 to the ranges you configure (scan, then SSH sign-in to approved devices only).
- **Reverse DNS** for device IPs, via the container's resolver.
- **Google Fonts**, loaded by the dashboard in your browser for its typefaces.

Nothing else. The device password is never sent to the browser and never to an unapproved device or one whose SSH
host key has changed since discovery.

## License

Provided as-is under the MIT License, without warranty. See [LICENSE](LICENSE).
