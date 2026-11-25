# AdBoard — Usage & Privacy Policy

_Last updated: 5 July 2026_

AdBoard is a **self-hosted, open-source hobby project**. There is no company
behind it, no paid tier, and no interest in your data. This document explains —
plainly — what the software does and does not do with data, and on what terms
you may use it.

---

## 1. The short version

- **No telemetry.** AdBoard collects no analytics, usage statistics, crash
  reports, or tracking of any kind. There is no "phone home" of any sort.
- **Your data stays on your infrastructure.** Everything AdBoard stores lives
  in the backend *you* choose and control (your Supabase project, your
  Firebase project, or your own server's disk).
- **Hobby software, provided as-is.** Built for fun and shared under the MIT
  License. Host it as you need, modify it as you need, improve it as you need.
  There is no warranty and no guaranteed support.

---

## 2. What data AdBoard stores (in *your* backend)

AdBoard only stores what it needs to function, and only in the database and
storage you configured:

| Data | Purpose | Where |
|------|---------|-------|
| Admin accounts (email, password hash or your auth provider's record, role) | Sign-in and permissions | Your backend |
| Two-factor secrets (TOTP) | Optional 2FA | Your backend (never displayed after enrollment) |
| Uploaded media (images/videos) and their settings | The content your screens display | Your storage bucket / server disk |
| Display settings (timing, theme of slides, default slide) | Kiosk behavior | Your backend |
| Viewer device records (random device ID, IP address, browser user-agent, last-seen time) | The "Display Viewers" screen list and per-device approval | Your backend |
| Audit log (who did what, when) | Accountability for admin actions | Your backend |
| IP allowlist (if you enable IP restriction) | Optional dashboard access control | Your backend |

Some preferences (theme choice, "tutorial seen", session hints) are kept in the
browser's `localStorage` on the device itself.

**The operator of an AdBoard deployment — not the software's author — is the
data controller** for anything stored by their instance. If you deploy AdBoard
for others (e.g., in a workplace), local privacy laws about IP addresses and
audit records are your responsibility.

## 3. External network connections (complete list)

AdBoard is designed to run without contacting anyone but your own backend.
The complete list of third-party endpoints the app may contact:

1. **Your chosen backend** (your Supabase project / your Firebase project /
   your own server) — all application data. Governed by your agreement with
   that provider; fully offline if you use the self-hosted Docker backend.
2. **Google Fonts** (`fonts.googleapis.com` / `fonts.gstatic.com`) — the UI
   loads its typefaces from Google's CDN on page load. If you need a
   zero-external deployment, self-host the fonts and edit `src/index.css`.
3. **ipify** (`api.ipify.org`) — contacted **only** on cloud hosting and
   **only** when a feature needs this device's public IP (the IP-restriction
   gate or viewer registration). The self-hosted backend determines IPs itself
   and never calls ipify.
4. **GitHub** (`api.github.com` / `github.com`) — contacted **only** when a
   user explicitly submits the in-app feedback form (Beta), to create an issue
   on the project repository. The feedback content is exactly what the user
   typed, plus the page URL and browser user-agent for debugging context.

That's the whole list. No analytics providers, no ad networks, no telemetry
endpoints, no update checks.

## 4. Cookies & local storage

AdBoard sets no tracking cookies. Authentication state is handled by your
chosen auth provider (e.g., Supabase session tokens) and by `localStorage`
entries scoped to your deployment's domain (session hints, theme, tutorial
state, device ID for the viewer registry). Clearing site data removes them.

## 5. Usage terms

AdBoard is licensed under the **MIT License** (see [LICENSE](LICENSE)):

- ✅ Use it commercially or privately, at any scale
- ✅ Host it wherever and however you need
- ✅ Modify, extend, and improve it as you see fit
- ✅ Redistribute it, including in proprietary products
- 📋 Keep the copyright + license notice with copies
- ⚠️ **No warranty** — the software is provided "as is"; the author is not
  liable for damages arising from its use

Third-party components and their licenses are listed in
[THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt), with a full assessment in
[Documents/FOSS-REVIEW.md](Documents/FOSS-REVIEW.md).

## 6. Security disclosures

If you find a security issue, please report it via the in-app feedback form or
a GitHub issue on the repository. It's a hobby project — fixes are made on a
best-effort basis, but security reports are taken seriously.

## 7. Changes to this policy

This policy describes the software's behavior, not a service. It changes only
when the software's actual behavior changes, and the history is visible in the
repository's version control.
