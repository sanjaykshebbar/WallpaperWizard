/**
 * Dashboard user accounts (superadmin manages editors).
 */

import { api } from './api';
import { ManagedUser, AdminRole } from '../types';

export const UserService = {
  async listUsers(): Promise<ManagedUser[]> {
    return (await api('/api/users')).users || [];
  },

  async createUser(email: string, password: string, role: AdminRole = 'editor'): Promise<void> {
    if (password.length < 8) throw new Error('Password must contain at least 8 characters.');
    await api('/api/users', { json: { email, password, role } });
  },

  async deleteUser(user: ManagedUser): Promise<void> {
    await api(`/api/users/${encodeURIComponent(user.userId)}`, { method: 'DELETE' });
  },

  async markTutorialSeen(): Promise<void> {
    await api('/api/users/tutorial-seen', { method: 'POST' }).catch(err => console.warn('Could not persist tutorial state:', err));
  }
};
