/**
 * ==========================================
 * File: src/shared/ipMatch.ts
 * Project: WallpaperWizard
 * Purpose:
 * IP allowlist matching shared by the browser gate and the
 * self-hosted Express server. Supports exact IPv4/IPv6 addresses
 * and IPv4 CIDR ranges (e.g. 192.168.1.0/24).
 * ==========================================
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

/** Normalizes IPv6-mapped IPv4 addresses like ::ffff:1.2.3.4 */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim().toLowerCase();
  const mapped = trimmed.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? mapped[1] : trimmed;
}

/** True when `entry` is a syntactically valid allowlist item. */
export function isValidAllowlistEntry(entry: string): boolean {
  const value = entry.trim();
  if (!value) return false;
  const cidr = value.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
  if (cidr) {
    return ipv4ToInt(cidr[1]) !== null && Number(cidr[2]) <= 32;
  }
  if (ipv4ToInt(value) !== null) return true;
  // Loose IPv6 shape check (exact-match only, no CIDR)
  return /^[0-9a-f:]+$/i.test(value) && value.includes(':');
}

/** True when `clientIp` matches one allowlist entry (exact or IPv4 CIDR). */
export function ipMatchesEntry(clientIp: string, entry: string): boolean {
  const ip = normalizeIp(clientIp);
  const rule = normalizeIp(entry);

  const cidr = rule.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
  if (cidr) {
    const ipInt = ipv4ToInt(ip);
    const baseInt = ipv4ToInt(cidr[1]);
    const bits = Number(cidr[2]);
    if (ipInt === null || baseInt === null || bits > 32) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  }

  return ip === rule;
}

/** True when `clientIp` is covered by the allowlist. */
export function ipIsAllowed(clientIp: string, allowlist: string[]): boolean {
  if (!clientIp) return false;
  return allowlist.some(entry => ipMatchesEntry(clientIp, entry));
}

/** Max hosts one scan range may expand to (a /20). Keeps an accidental /8 from flooding the network. */
export const MAX_SCAN_HOSTS = 4096;

/**
 * Expands a scan range (single IPv4 or IPv4 CIDR) to host addresses,
 * skipping network/broadcast for prefixes below /31. Returns null when the
 * entry is invalid or larger than MAX_SCAN_HOSTS.
 */
export function expandScanRange(entry: string): string[] | null {
  const value = entry.trim();
  const single = ipv4ToInt(value);
  if (single !== null) return [value];
  const cidr = value.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
  if (!cidr) return null;
  const base = ipv4ToInt(cidr[1]);
  const bits = Number(cidr[2]);
  if (base === null || bits > 32) return null;
  const size = 2 ** (32 - bits);
  if (size > MAX_SCAN_HOSTS) return null;
  const network = bits === 0 ? 0 : (base & ((~0 << (32 - bits)) >>> 0)) >>> 0;
  const [first, last] = bits >= 31 ? [network, network + size - 1] : [network + 1, network + size - 2];
  const out: string[] = [];
  for (let n = first; n <= last; n++) {
    out.push([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
  }
  return out;
}
