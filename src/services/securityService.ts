/**
 * IP allowlist for the dashboard. The server enforces it; this only reads and edits it.
 */

import { api } from './api';
import { SecurityConfig } from '../types';

export interface AccessCheckResult {
  enabled: boolean;
  allowed: boolean;
  clientIp: string | null;
  reason?: string;
}

export const SecurityService = {
  async getClientIp(): Promise<string | null> {
    return (await api('/api/client-ip').catch(() => ({ ip: null }))).ip || null;
  },

  async getConfig(): Promise<SecurityConfig> {
    return api('/api/security');
  },

  async updateConfig(config: SecurityConfig): Promise<void> {
    await api('/api/security', { json: config });
  },

  async checkAccess(): Promise<AccessCheckResult> {
    return api('/api/security/status');
  }
};
