/**
 * Signed-in admin's own password and two-factor (TOTP) authenticators.
 */

import { api } from './api';
import { TwoFactorFactor, TwoFactorEnrollment } from '../types';

export const AccountService = {
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new Error('New password must contain at least 8 characters.');
    await api('/api/change-password', { json: { currentPassword, newPassword } });
  },

  async listTwoFactorFactors(): Promise<TwoFactorFactor[]> {
    return (await api('/api/2fa/factors')).factors || [];
  },

  async startTwoFactorEnrollment(label: string): Promise<TwoFactorEnrollment> {
    return api('/api/2fa/enroll', { json: { label } });
  },

  async confirmTwoFactorEnrollment(factorId: string, code: string): Promise<void> {
    await api('/api/2fa/confirm', { json: { factorId, code: code.replace(/\s+/g, '') } });
  },

  async removeTwoFactorFactor(factorId: string): Promise<void> {
    await api(`/api/2fa/${encodeURIComponent(factorId)}`, { method: 'DELETE' });
  }
};
