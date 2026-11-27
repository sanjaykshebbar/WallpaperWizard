import type { Device, DeviceOs } from "../types";

export const DISCOVERY_MARKERS = {
  windows: "WW_WINDOWS_SHA256_7bd18925be67c4757a7dd7c9d4143179a406acd51120ae404b03a8c5d7daa69a",
  macos: "WW_MACOS_SHA256_987ead801447509838f013e86c3cefee3ea3a8f02593f3dcf342937ca9071bb1"
} as const;

export type ManagedDeviceOs = keyof typeof DISCOVERY_MARKERS;

export function discoveredOs(banner: string): ManagedDeviceOs | null {
  const [ident, ...addendum] = banner.split(/[ \t]+/);
  if (!/^SSH-(?:2\.0|1\.99)-OpenSSH_\S+$/.test(ident)) return null;
  const windows = addendum.includes(DISCOVERY_MARKERS.windows);
  const macos = addendum.includes(DISCOVERY_MARKERS.macos);
  if (windows === macos) return null;
  const windowsSsh = /-OpenSSH_for_Windows_/.test(ident);
  return windows && windowsSsh ? "windows" : macos && !windowsSsh ? "macos" : null;
}

/**
 * Best-effort OS for an SSH host that has NOT run the setup script (no marker).
 * Windows announces itself in the ident; a plain OpenSSH ident could be macOS or
 * Linux, so it stays "other" until enrollment plants the marker.
 */
export function bannerOs(banner: string): DeviceOs {
  const ident = banner.split(/[ \t]+/)[0] || "";
  return /^SSH-(?:2\.0|1\.99)-OpenSSH_for_Windows_/.test(ident) ? "windows" : "other";
}

export function isManagedDevice(
  device: Pick<Device, "os" | "sshFingerprint" | "discoveryMarker">
): device is { os: ManagedDeviceOs; sshFingerprint: string } {
  return !!device.sshFingerprint &&
    (device.os === "windows" || device.os === "macos") &&
    device.discoveryMarker === DISCOVERY_MARKERS[device.os];
}

export function isMacBook(model: string): boolean {
  return /^MacBook(?:\s|$)/.test(model.trim());
}
