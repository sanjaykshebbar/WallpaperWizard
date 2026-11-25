/**
 * ==========================================
 * File: src/services/accountService.ts
 * Project: AdBoard
 * Purpose:
 * Administrator profile management: password changes and
 * two-factor authentication (TOTP authenticator apps) across
 * the Firebase, Supabase, and self-hosted backends.
 * ==========================================
 */

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  multiFactor,
  TotpMultiFactorGenerator
} from 'firebase/auth';
import { auth, isPlaceholder } from '../firebase/config';
import { supabase, isSupabaseBackend } from '../supabase/config';
import { getLocalAuthHeaders, matchesSandboxPassword, storeSandboxPassword } from './localSession';
import { TwoFactorFactor, TwoFactorEnrollment } from '../types';

const isLocalBackend = (import.meta as any).env?.VITE_LOCAL_BACKEND === 'true';

// Firebase TOTP enrollment spans two calls; the secret object lives here in between
const pendingFirebaseSecrets = new Map<string, any>();

async function localApi(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getLocalAuthHeaders(),
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    throw new Error("Session expired. Please sign in again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Request failed on the local backend.");
  }
  return data;
}

export const AccountService = {

  /**
   * True when the active backend can enforce two-factor authentication.
   * Sandbox mode has no server, so 2FA there would be decorative.
   */
  supportsTwoFactor(): boolean {
    return isSupabaseBackend || isLocalBackend || !isPlaceholder;
  },

  /**
   * Changes the administrator password after verifying the current one.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new Error("New password must contain at least 8 characters.");
    }

    if (isSupabaseBackend) {
      const { error } = await supabase!.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      return;
    }

    if (isLocalBackend) {
      await localApi('/api/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      return;
    }

    if (isPlaceholder) {
      if (!(await matchesSandboxPassword(currentPassword))) {
        throw new Error("Current password is incorrect.");
      }
      await storeSandboxPassword(newPassword);
      return;
    }

    // Firebase: recent authentication is required before a password change
    const user = auth.currentUser;
    if (!user || !user.email) {
      throw new Error("No authenticated Firebase user session found. Please sign in again.");
    }
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  },

  /**
   * Lists registered authenticator-app (TOTP) factors.
   */
  async listTwoFactorFactors(): Promise<TwoFactorFactor[]> {
    if (isSupabaseBackend) {
      const { data, error } = await supabase!.auth.mfa.listFactors();
      if (error) throw new Error(error.message);
      return (data?.totp || []).map(f => ({
        id: f.id,
        label: f.friendly_name || 'Authenticator',
        createdAt: f.created_at
      }));
    }

    if (isLocalBackend) {
      const data = await localApi('/api/2fa/factors');
      return data.factors || [];
    }

    if (isPlaceholder) {
      return [];
    }

    const user = auth.currentUser;
    if (!user) return [];
    return multiFactor(user).enrolledFactors
      .filter(f => f.factorId === TotpMultiFactorGenerator.FACTOR_ID)
      .map(f => ({
        id: f.uid,
        label: f.displayName || 'Authenticator',
        createdAt: f.enrollmentTime || undefined
      }));
  },

  /**
   * Begins enrolling a new authenticator app. Returns the QR payload
   * (otpauth URL and/or ready-made QR image) plus the manual-entry secret.
   */
  async startTwoFactorEnrollment(label: string): Promise<TwoFactorEnrollment> {
    if (isSupabaseBackend) {
      const { data, error } = await supabase!.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: label || 'Authenticator'
      });
      if (error) throw new Error(error.message);
      return {
        factorId: data.id,
        secret: data.totp?.secret,
        otpauthUrl: data.totp?.uri,
        qrCode: data.totp?.qr_code
      };
    }

    if (isLocalBackend) {
      const data = await localApi('/api/2fa/enroll', {
        method: 'POST',
        body: JSON.stringify({ label })
      });
      return { factorId: data.factorId, secret: data.secret, otpauthUrl: data.otpauthUrl };
    }

    if (isPlaceholder) {
      throw new Error("Two-factor authentication requires a hosted backend (Firebase, Supabase, or the self-hosted server). Sandbox mode cannot enforce it.");
    }

    // Firebase TOTP MFA (requires Identity Platform to be enabled)
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No authenticated Firebase user session found. Please sign in again.");
    }
    const session = await multiFactor(user).getSession();
    const secret = await TotpMultiFactorGenerator.generateSecret(session);
    const factorId = `fb_${Date.now()}`;
    pendingFirebaseSecrets.set(factorId, { secret, label });
    return {
      factorId,
      secret: secret.secretKey,
      otpauthUrl: secret.generateQrCodeUrl(user.email || 'admin', 'AdBoard')
    };
  },

  /**
   * Confirms enrollment by validating a live code from the authenticator.
   */
  async confirmTwoFactorEnrollment(factorId: string, code: string): Promise<void> {
    const cleanCode = code.replace(/\s+/g, '');

    if (isSupabaseBackend) {
      const { data: challenge, error: challengeError } = await supabase!.auth.mfa.challenge({ factorId });
      if (challengeError) throw new Error(challengeError.message);
      const { error } = await supabase!.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: cleanCode
      });
      if (error) throw new Error("Invalid authenticator code. Please try again.");
      return;
    }

    if (isLocalBackend) {
      await localApi('/api/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ factorId, code: cleanCode })
      });
      return;
    }

    // Firebase
    const pending = pendingFirebaseSecrets.get(factorId);
    if (!pending) {
      throw new Error("Enrollment expired. Please start again.");
    }
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No authenticated Firebase user session found. Please sign in again.");
    }
    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(pending.secret, cleanCode);
    await multiFactor(user).enroll(assertion, pending.label || 'Authenticator');
    pendingFirebaseSecrets.delete(factorId);
  },

  /**
   * Removes a registered authenticator factor.
   */
  async removeTwoFactorFactor(factorId: string): Promise<void> {
    if (isSupabaseBackend) {
      const { error } = await supabase!.auth.mfa.unenroll({ factorId });
      if (error) throw new Error(error.message);
      return;
    }

    if (isLocalBackend) {
      await localApi(`/api/2fa/${factorId}`, { method: 'DELETE' });
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      throw new Error("No authenticated Firebase user session found. Please sign in again.");
    }
    await multiFactor(user).unenroll(factorId);
  }
};
