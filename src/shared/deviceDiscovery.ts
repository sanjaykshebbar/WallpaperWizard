import type { Device, DeviceOs } from "../types";

export type ManagedDeviceOs = "windows" | "macos";

/**
 * Best-effort OS from the SSH banner ident. Windows announces itself
 * ("OpenSSH_for_Windows"); a plain OpenSSH ident could be macOS or Linux, so it
 * reads as "other" until a push signs in and confirms the real OS.
 */
export function bannerOs(banner: string): DeviceOs {
  const ident = banner.split(/[ \t]+/)[0] || "";
  return /^SSH-(?:2\.0|1\.99)-OpenSSH_for_Windows_/.test(ident) ? "windows" : "other";
}

/**
 * A device WallpaperWizard can act on: it has a pinned SSH host key. Trust comes
 * from that pinned key plus the admin's approval and the push's own ithelpdesk
 * admin check — not from a banner marker (stock OpenSSH does not advertise one).
 */
export function hasPinnedKey(device: Pick<Device, "sshFingerprint">): device is Device & { sshFingerprint: string } {
  return !!device.sshFingerprint;
}

export function isMacBook(model: string): boolean {
  return /^MacBook(?:\s|$)/.test(model.trim());
}
