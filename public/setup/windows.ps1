# WallpaperWizard - enable OpenSSH Server so the dashboard can set this PC's wallpaper.
# Run once, in an elevated (Administrator) PowerShell. No password is stored in this script.
$ErrorActionPreference = 'Stop'

# Install whichever OpenSSH.Server version this build offers (idempotent)
Get-WindowsCapability -Online -Name 'OpenSSH.Server*' |
  Where-Object State -ne 'Installed' |
  Add-WindowsCapability -Online | Out-Null

Set-Service -Name sshd -StartupType Automatic
Start-Service sshd

# The capability installer normally adds this inbound rule; ensure it either way
if (-not (Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' `
    -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
}

Write-Output 'WallpaperWizard: OpenSSH Server is enabled and running.'
