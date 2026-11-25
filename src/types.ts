/**
 * Shared data contracts for WallpaperWizard (browser and server).
 */

export type AdminRole = 'superadmin' | 'editor';

export interface UserProfile {
  userId: string;
  email: string;
  role: AdminRole;
  createdAt: string;
  tutorialSeen?: boolean;
}

export interface ManagedUser {
  userId: string;
  email: string;
  role: AdminRole;
  createdAt: string;
  createdBy?: string | null;
}

export interface SecurityConfig {
  ipRestrictionEnabled: boolean;
  allowedIps: string[]; // exact IPv4/IPv6 addresses or IPv4 CIDR ranges
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface AuditEntry {
  id: string | number;
  actorId: string | null;
  actorEmail: string | null;
  action: string;       // e.g. wallpaper.create, device.push, push.settings
  targetType: string;   // wallpaper | device | push | user | security | auth
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

/** Who a wallpaper is for: everyone, one group, or one device. */
export type WallpaperScope = 'org' | 'group' | 'device';

export interface Wallpaper {
  id: string;
  title: string;
  url: string;          // /uploads/<file>
  mimeType: string;
  fileName: string;
  fileSize: number;
  isActive: boolean;
  scope: WallpaperScope;
  target: string | null; // group name or device id; null for org
  scheduledStart: string | null; // ISO datetime
  scheduledEnd: string | null;   // ISO datetime
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export type DeviceOs = 'windows' | 'macos' | 'other';
export type DeviceStatus = 'pending' | 'approved' | 'ignored';

export interface Device {
  id: string;              // SSH host-key fingerprint: stable across IP changes
  ip: string;
  hostname: string | null;
  label: string | null;    // admin-assigned name
  os: DeviceOs | null;     // null until confirmed over SSH (or guessed from the banner)
  group: string | null;
  status: DeviceStatus;
  firstSeen: string;
  lastSeen: string;
  lastPush: { at: string; ok: boolean; message: string; wallpaperId: string | null } | null;
  applied: { wallpaperId: string; version: string } | null; // version = wallpaper.updatedAt
}

/** Network scan + push settings. The device password never leaves the server. */
export interface PushSettings {
  username: string;
  hasPassword: boolean;
  scanRanges: string[];
  intervalMinutes: number;
  autoApprove: boolean;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface WorkerStatus {
  running: boolean;
  lastRun: { startedAt: string; finishedAt: string | null; found: number; pushed: number; failed: number; note: string | null } | null;
}

export interface TwoFactorFactor {
  id: string;
  label: string;
  createdAt?: string;
}

export interface TwoFactorEnrollment {
  factorId: string;
  secret?: string;      // base32 secret for manual entry
  otpauthUrl?: string;  // otpauth:// URL to render as a QR code
}
