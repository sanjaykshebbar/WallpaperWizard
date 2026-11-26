/**
 * Discovered devices, push settings, and the scan/push worker.
 */

import { api } from './api';
import { Device, DeviceStatus, PushSettings, WorkerStatus } from '../types';

export const DeviceService = {
  list(): Promise<Device[]> {
    return api('/api/devices');
  },

  async update(id: string, changes: { status?: DeviceStatus; group?: string | null; label?: string | null }): Promise<void> {
    await api(`/api/devices/${encodeURIComponent(id)}`, { json: changes });
  },

  async remove(id: string): Promise<void> {
    await api(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  getSettings(): Promise<PushSettings> {
    return api('/api/push-settings');
  },

  /** `password` is write-only: leave it empty to keep the saved one. */
  async saveSettings(settings: Omit<PushSettings, 'username' | 'hasPassword' | 'setupScripts' | 'updatedBy' | 'updatedAt'> & { password?: string }): Promise<void> {
    await api('/api/push-settings', { json: settings });
  },

  workerStatus(): Promise<WorkerStatus> {
    return api('/api/worker');
  },

  async scanNow(): Promise<void> {
    await api('/api/scan', { method: 'POST' });
  },

  /** Force-push to the given devices (or every approved device). */
  async pushNow(deviceIds?: string[]): Promise<void> {
    await api('/api/push', { json: deviceIds ? { deviceIds } : {} });
  }
};
