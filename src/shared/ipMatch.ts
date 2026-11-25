/**
 * ==========================================
 * File: src/shared/ipMatch.ts
 * Project: AdBoard
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
