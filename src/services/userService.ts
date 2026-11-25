/**
 * ==========================================
 * File: src/services/userService.ts
 * Project: AdBoard
 * Purpose:
 * Multi-user administration. The superadmin (created by the setup
 * wizard) can invite editors who manage media but cannot create
 * users or change the IP access policy.
 * ==========================================
 */

import { createClient } from '@supabase/supabase-js';
import { supabase, isSupabaseBackend } from '../supabase/config';
import { getLocalAuthHeaders } from './localSession';
import { AuditService } from './auditService';
import { ManagedUser, AdminRole } from '../types';

const isLocalBackend = (import.meta as any).env?.VITE_LOCAL_BACKEND === 'true';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

export const UserService = {

  /** True when the active backend supports multiple dashboard users. */
  isSupported(): boolean {
    return isSupabaseBackend || isLocalBackend;
  },

  /** Lists dashboard users (any signed-in admin may view). */
  async listUsers(): Promise<ManagedUser[]> {
    if (isSupabaseBackend) {
      const { data, error } = await supabase!
        .from('adboard_users')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Could not load users (${error.message}).`);
      return (data || []).map((row: any) => ({
        userId: row.user_id,
        email: row.email,
        role: row.role,
        createdAt: row.created_at,
        createdBy: row.created_by
      }));
    }

    if (isLocalBackend) {
      const res = await fetch('/api/users', { headers: getLocalAuthHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not load users.");
      }
      const data = await res.json();
      return data.users || [];
    }

    throw new Error("User management requires the Supabase or self-hosted backend.");
  },

  /**
   * Creates a new editor account (superadmin only).
   * Editors can add/update/remove media but cannot manage users
   * or the IP access policy.
   */
  async createUser(email: string, password: string, role: AdminRole = 'editor'): Promise<void> {
    if (password.length < 8) {
      throw new Error("Password must contain at least 8 characters.");
    }

    if (isSupabaseBackend) {
      // A throwaway client keeps the superadmin's session untouched:
      // signUp on the main client would replace the active session.
      const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({ email, password });
      if (signUpError) throw new Error(signUpError.message);

      const newUserId = signUpData.user?.id;
      if (!newUserId) {
        throw new Error("Supabase did not return the new account's ID. If email confirmation is on, the user may need to confirm before appearing here.");
      }

      const { data: { user: actor } } = await supabase!.auth.getUser();
      const { error: insertError } = await supabase!
        .from('adboard_users')
        .insert({
          user_id: newUserId,
          email,
          role,
          created_by: actor?.id || null
        });
      if (insertError) {
        throw new Error(`The account was created but could not be registered as a dashboard user (${insertError.message}). Only the superadmin may add users.`);
      }

      await AuditService.log('user.create', 'user', newUserId, `Created ${role} account for ${email}`);
      return;
    }

    if (isLocalBackend) {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getLocalAuthHeaders() },
        body: JSON.stringify({ email, password, role })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not create the user.");
      }
      return;
    }

    throw new Error("User management requires the Supabase or self-hosted backend.");
  },

  /** Removes a dashboard user (superadmin only; not yourself). */
  async deleteUser(user: ManagedUser): Promise<void> {
    if (isSupabaseBackend) {
      const { error } = await supabase!
        .from('adboard_users')
        .delete()
        .eq('user_id', user.userId);
      if (error) {
        throw new Error(`Could not remove the user (${error.message}).`);
      }
      await AuditService.log('user.delete', 'user', user.userId, `Removed dashboard access for ${user.email}. Note: the Supabase Auth account still exists; delete it from the Supabase dashboard to revoke sign-in entirely.`);
      return;
    }

    if (isLocalBackend) {
      const res = await fetch(`/api/users/${encodeURIComponent(user.userId)}`, {
        method: 'DELETE',
        headers: getLocalAuthHeaders()
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not remove the user.");
      }
      return;
    }

    throw new Error("User management requires the Supabase or self-hosted backend.");
  },

  /** Persists that the signed-in user has seen the onboarding tutorial. */
  async markTutorialSeen(userId: string): Promise<void> {
    try {
      if (isSupabaseBackend) {
        await supabase!
          .from('adboard_users')
          .update({ tutorial_seen: true })
          .eq('user_id', userId);
        return;
      }
      if (isLocalBackend) {
        await fetch('/api/users/tutorial-seen', {
          method: 'POST',
          headers: getLocalAuthHeaders()
        });
      }
    } catch (err) {
      console.warn("Could not persist tutorial state:", err);
    }
  }
};
