# WallpaperWizard - enable OpenSSH Server so the dashboard can set this PC's wallpaper.
# Run once, in an elevated (Administrator) PowerShell. No password is stored in this script.
$ErrorActionPreference = 'Stop'

# Install whichever OpenSSH.Server version this build offers (idempotent)
Get-WindowsCapability -Online -Name 'OpenSSH.Server*' |
  Where-Object State -ne 'Installed' |
  Add-WindowsCapability -Online | Out-Null

Set-Service -Name sshd -StartupType Automatic
Start-Service sshd

# Allow inbound 22 on ALL profiles. The installer's rule is often scoped to
# Private/Domain, so a PC on a "Public" network stays unreachable; force it open.
$rule = Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue
if ($rule) {
  $rule | Set-NetFirewallRule -Enabled True -Profile Any
} else {
  New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' `
    -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -Profile Any | Out-Null
}

Write-Output 'WallpaperWizard: OpenSSH Server is enabled and running.'
