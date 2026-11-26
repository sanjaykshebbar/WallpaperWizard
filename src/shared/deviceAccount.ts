export const MAC_DEVICE_ADMIN = "ithelpdesk";
export const WINDOWS_DEVICE_ADMIN = ".\\ithelpdesk";

export function isDeviceAdminUsername(value: unknown): boolean {
  return value === MAC_DEVICE_ADMIN ||
    (typeof value === "string" && value.toLowerCase() === WINDOWS_DEVICE_ADMIN);
}
