#!/bin/bash
# WallpaperWizard - enable Remote Login (SSH) so the dashboard can set this Mac's wallpaper.
# Run once in Terminal:  curl -fsSL http://<server>/setup/macos.sh | sudo bash
# No password is stored in this script.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo:  curl -fsSL <url>/setup/macos.sh | sudo bash" >&2
  exit 1
fi

systemsetup -setremotelogin on
echo "WallpaperWizard: Remote Login (SSH) is enabled."
