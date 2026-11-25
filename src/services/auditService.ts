/**
 * Read-only audit trail. The server writes entries itself on every action.
 */

import { api } from './api';
import { AuditEntry } from '../types';

export const AuditService = {
  async getLogs(limit = 200): Promise<AuditEntry[]> {
    return (await api(`/api/audit?limit=${limit}`)).entries || [];
  }
};
