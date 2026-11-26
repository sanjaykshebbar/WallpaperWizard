import type { Device } from "../types";

export type ManagedDeviceOs = "windows" | "macos";

export function isSshFingerprint(value: unknown): value is string {
  return typeof value === "string" && value.length === 50 &&
    /^SHA256:[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]$/.test(value);
}

export function deviceIdFromDigest(digest: Buffer): string {
  return digest.subarray(0, 16).toString("hex");
}

export function discoveredOs(banner: string, fingerprint: string, macBookKeys: ReadonlySet<string>): ManagedDeviceOs | null {
  if (macBookKeys.has(fingerprint)) return "macos";
  if (/^SSH-(?:2\.0|1\.99)-OpenSSH_for_Windows_\S+(?:\s|$)/.test(banner)) return "windows";
  return null;
}

export function isManagedDevice(
  device: Pick<Device, "os" | "sshFingerprint" | "enrolledBySetup">,
  macBookKeys: ReadonlySet<string>
): device is { os: ManagedDeviceOs; sshFingerprint: string } {
  return !!device.sshFingerprint &&
    (device.os === "windows" ||
      (device.os === "macos" && (device.enrolledBySetup === true || macBookKeys.has(device.sshFingerprint))));
}

export function isMacBook(model: string): boolean {
  return /^MacBook(?:\s|$)/.test(model.trim());
}
