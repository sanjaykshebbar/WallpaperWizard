/**
 * ==========================================
 * File: src/services/securityService.ts
 * Project: AdBoard
 * Purpose:
 * IP-based dashboard access restriction: reads/writes the security
 * configuration and evaluates whether the current device is allowed.
 *
 * Enforcement note: on the self-hosted Express backend the check is
 * enforced server-side on every API call. On static hosting
 * (Supabase/Firebase) the gate runs in the browser — it deters casual
 * access, while real data protection remains with login + RLS/rules.
 * ==========================================
 */

import { supabase, isSupabaseBackend } from '../supabase/config';
import { getLocalAuthHeaders } from './localSession';
import { ipIsAllowed } from '../shared/ipMatch';
import { SecurityConfig } from '../types';

const isLocalBackend = (import.meta as any).env?.VITE_LOCAL_BACKEND === 'true';

const DEFAULT_CONFIG: SecurityConfig = {
  ipRestrictionEnabled: false,
  allowedIps: [],
  viewerApprovalRequired: false
};

export interface AccessCheckResult {
  enabled: boolean;
  allowed: boolean;
  clientIp: string | null;
  reason?: string;
}

export const SecurityService = {

  /** True when the active backend supports IP restriction management. */
  isSupported(): boolean {
    return isSupabaseBackend || isLocalBackend;
  },

  /** Detects this device's public/peer IP address. */
  async getClientIp(): Promise<string | null> {
    if (isLocalBackend) {
      try {
        const res = await fetch('/api/client-ip');
        if (res.ok) {
          const data = await res.json();
          return data.ip || null;
        }
      } catch { /* fall through */ }
      return null;
    }
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      if (res.ok) {
        const data = await res.json();
        return data.ip || null;
      }
    } catch { /* offline or blocked */ }
    return null;
  },

  /** Reads the current security configuration. */
  async getConfig(): Promise<SecurityConfig> {
    if (isSupabaseBackend) {
      try {
        const { data, error } = await supabase!
          .from('adboard_security')
          .select('*')
          .eq('id', 1)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          return {
            ipRestrictionEnabled: !!data.ip_restriction_enabled,
            allowedIps: Array.isArray(data.allowed_ips) ? data.allowed_ips : [],
            viewerApprovalRequired: !!data.viewer_approval_required,
            updatedBy: data.updated_by,
            updatedAt: data.updated_at
          };
        }
      } catch (err) {
        console.warn("Could not read Supabase security config (table missing?). Restriction treated as disabled:", err);
      }
      return DEFAULT_CONFIG;
    }

    if (isLocalBackend) {
      try {
        const res = await fetch('/api/security', { headers: getLocalAuthHeaders() });
        if (res.ok) return await res.json();
      } catch { /* fall through */ }
      return DEFAULT_CONFIG;
    }

    return DEFAULT_CONFIG;
  },

  /** Saves the security configuration (superadmin only). */
  async updateConfig(config: SecurityConfig, userId: string): Promise<void> {
    if (isSupabaseBackend) {
      const { error } = await supabase!
        .from('adboard_security')
        .upsert({
          id: 1,
          ip_restriction_enabled: config.ipRestrictionEnabled,
          allowed_ips: config.allowedIps,
          viewer_approval_required: config.viewerApprovalRequired,
          updated_by: userId,
          updated_at: new Date().toISOString()
        });
      if (error) {
        throw new Error(`Could not save the access policy (${error.message}). Only the superadmin may change it.`);
      }
      return;
    }

    if (isLocalBackend) {
      const res = await fetch('/api/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getLocalAuthHeaders() },
        body: JSON.stringify(config)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not save the access policy.");
      }
      return;
    }

    throw new Error("IP restriction requires the Supabase or self-hosted backend.");
  },

  /**
   * Evaluates whether this device may open the dashboard.
   * Fails OPEN when the policy cannot be read (a broken lookup must not
   * brick the dashboard — login still protects it), and fails CLOSED
   * when the policy is enabled but this device's IP cannot be determined.
   */
  async checkAccess(): Promise<AccessCheckResult> {
    if (isLocalBackend) {
      // The server evaluates its own view of the requester address
      try {
        const res = await fetch('/api/security/status');
        if (res.ok) return await res.json();
      } catch { /* fall through */ }
      return { enabled: false, allowed: true, clientIp: null };
    }

    if (!isSupabaseBackend) {
      return { enabled: false, allowed: true, clientIp: null };
    }

    const config = await this.getConfig();
    if (!config.ipRestrictionEnabled) {
      return { enabled: false, allowed: true, clientIp: null };
    }

    const clientIp = await this.getClientIp();
    if (!clientIp) {
      return {
        enabled: true,
        allowed: false,
        clientIp: null,
        reason: "This device's IP address could not be determined, and the access policy requires it."
      };
    }

    return {
      enabled: true,
      allowed: ipIsAllowed(clientIp, config.allowedIps),
      clientIp
    };
  }
};
