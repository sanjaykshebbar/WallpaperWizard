/**
 * ==========================================
 * File: src/types.ts
 * Project: AdBoard V3
 * Purpose:
 * Central directory for application-wide typed
 * models, enumerations, databases, and structural
 * configuration contracts.
 * ==========================================
 */

export interface InitConfig {
  setupCompleted: boolean;
  setupCompletedAt: string;
}

export type AdminRole = 'superadmin' | 'editor';

export interface UserProfile {
  userId: string;
  email: string;
  role: AdminRole | 'admin';
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
  viewerApprovalRequired: boolean; // new display screens must be approved before showing content
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export type ViewerStatus = 'pending' | 'approved' | 'denied';

export interface ViewerDevice {
  deviceId: string;
  label: string | null;      // admin-assigned name for the screen
  hostname: string | null;   // reverse-DNS name (self-hosted backend only)
  ip: string | null;
  userAgent: string | null;
  status: ViewerStatus;
  firstSeen: string;
  lastSeen: string;
}

/** Accumulated on-screen time for one media item across all displays. */
export interface PlaytimeStat {
  mediaId: string;
  totalSeconds: number;
  screenCount: number;
}

export interface AuditEntry {
  id: string | number;
  actorId: string | null;
  actorEmail: string | null;
  action: string;       // e.g. media.create, user.delete, security.update
  targetType: string;   // media | settings | user | security | auth
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

export interface AdMedia {
  id: string;
  title: string;
  url: string;
  type: 'image' | 'video';
  mimeType: string;
  fileName: string;
  fileSize: number;
  duration: number; // default display time in seconds
  isActive: boolean;
  sortOrder: number;
  scheduledStart: string | null; // ISO datetime
  scheduledEnd: string | null;   // ISO datetime
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DisplaySettings {
  kioskMode: boolean;
  autoplaySeconds: number; // fallback slide display time
  transitionEffect: 'fade' | 'slide' | 'zoom';
  updatedBy: string;
  updatedAt: string;
  fallbackUrl?: string | null;  // default slide shown when no media is active
  fallbackType?: 'image' | 'video' | null;
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
  qrCode?: string;      // ready-made QR image (data URI), when the backend provides one
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
