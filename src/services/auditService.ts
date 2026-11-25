/**
 * ==========================================
 * File: src/services/auditService.ts
 * Project: AdBoard
 * Purpose:
 * Immutable audit trail of administrative actions (media, users,
 * settings, security policy, sign-ins). Logging is best-effort:
 * a failed audit write never blocks the underlying action.
 * The self-hosted backend records its own entries server-side.
 * ==========================================
 */

import { supabase, isSupabaseBackend } from '../supabase/config';
import { getLocalAuthHeaders } from './localSession';
import { AuditEntry } from '../types';

const isLocalBackend = (import.meta as any).env?.VITE_LOCAL_BACKEND === 'true';

export const AuditService = {

  /** True when the active backend records an audit trail. */
  isSupported(): boolean {
    return isSupabaseBackend || isLocalBackend;
  },

  /**
   * Records one action. Actor identity comes from the active session.
   * Never throws — auditing must not break the audited operation.
   */
  async log(action: string, targetType: string, targetId: string | null, details?: string): Promise<void> {
    try {
      if (isSupabaseBackend) {
        const { data: { user } } = await supabase!.auth.getUser();
        await supabase!.from('adboard_audit_logs').insert({
          actor_id: user?.id || null,
          actor_email: user?.email || null,
          action,
          target_type: targetType,
          target_id: targetId,
          details: details || null
        });
        return;
      }
      // The self-hosted server writes its own audit entries on each endpoint,
      // so nothing to do for the local backend; other modes are unsupported.
    } catch (err) {
      console.warn(`Audit log write failed for ${action}:`, err);
    }
  },

  /** Fetches the most recent audit entries (superadmin only). */
  async getLogs(limit = 200): Promise<AuditEntry[]> {
    if (isSupabaseBackend) {
      const { data, error } = await supabase!
        .from('adboard_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`Could not load audit logs (${error.message}). Only the superadmin may view them.`);
      }
      return (data || []).map((row: any) => ({
        id: row.id,
        actorId: row.actor_id,
        actorEmail: row.actor_email,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        details: row.details,
        createdAt: row.created_at
      }));
    }

    if (isLocalBackend) {
      const res = await fetch(`/api/audit?limit=${limit}`, { headers: getLocalAuthHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not load audit logs.");
      }
      const data = await res.json();
      return data.entries || [];
    }

    throw new Error("Audit logs require the Supabase or self-hosted backend.");
  }
};
