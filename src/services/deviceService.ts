/**
 * ==========================================
 * File: src/services/deviceService.ts
 * Project: AdBoard
 * Purpose:
 * Viewer device registry. Each public display screen registers a
 * device id and sends a heartbeat, so the admin can see how many
 * screens are showing content and approve/deny each one.
 *
 * Enforcement note (Beta): on Supabase/static hosting the display
 * board honors its own approval status client-side. The self-hosted
 * backend enforces it server-side. See SUPABASE.md.
 * ==========================================
 */

import { supabase, isSupabaseBackend } from '../supabase/config';
import { getLocalAuthHeaders } from './localSession';
import { ViewerDevice, ViewerStatus } from '../types';

const isLocalBackend = (import.meta as any).env?.VITE_LOCAL_BACKEND === 'true';
const DEVICE_ID_KEY = 'adboard_device_id';

/** Stable per-browser device id (created once, kept in localStorage). */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = (crypto?.randomUUID?.() ?? `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function detectIp(): Promise<string | null> {
  if (isLocalBackend) {
    try {
      const r = await fetch('/api/client-ip');
      if (r.ok) return (await r.json()).ip || null;
    } catch { /* ignore */ }
    return null;
  }
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    if (r.ok) return (await r.json()).ip || null;
  } catch { /* ignore */ }
  return null;
}

export const DeviceService = {

  supported(): boolean {
    return isSupabaseBackend || isLocalBackend;
  },

  /**
   * Registers/refreshes this display device and returns its approval status.
   * Called by the display board on load and on a periodic heartbeat.
   */
  async heartbeat(): Promise<ViewerStatus> {
    if (!this.supported()) return 'approved';
    const deviceId = getDeviceId();
    const ip = await detectIp();
    const userAgent = navigator.userAgent.slice(0, 300);

    if (isLocalBackend) {
      try {
        const r = await fetch('/api/viewers/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, userAgent })
        });
        if (r.ok) return (await r.json()).status || 'approved';
      } catch { /* offline */ }
      return 'approved';
    }

    // Supabase: register/refresh through a SECURITY DEFINER function so the
    // client can update its heartbeat but can NOT set its own approval status
    // (which would defeat deny). The function returns the current status.
    try {
      const { data, error } = await supabase!.rpc('viewer_heartbeat', {
        p_device_id: deviceId,
        p_user_agent: userAgent,
        p_ip: ip
      });
      if (error) throw error;
      return (data as ViewerStatus) || 'approved';
    } catch (err) {
      console.warn('Viewer heartbeat failed (treating as approved):', err);
      return 'approved';
    }
  },

  /** Lists all known viewer devices (admin). */
  async listDevices(): Promise<ViewerDevice[]> {
    if (isSupabaseBackend) {
      const { data, error } = await supabase!
        .from('adboard_viewers')
        .select('*')
        .order('last_seen', { ascending: false });
      if (error) throw new Error(`Could not load viewers (${error.message}).`);
      return (data || []).map((d: any) => ({
        deviceId: d.device_id,
        label: d.label,
        // Browsers cannot expose a machine hostname; only the self-hosted
        // backend can resolve one via reverse DNS on the LAN.
        hostname: d.hostname ?? null,
        ip: d.ip,
        userAgent: d.user_agent,
        status: d.status,
        firstSeen: d.first_seen,
        lastSeen: d.last_seen
      }));
    }
    if (isLocalBackend) {
      const r = await fetch('/api/viewers', { headers: getLocalAuthHeaders() });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load viewers.');
      return (await r.json()).viewers || [];
    }
    throw new Error('Viewer management requires the Supabase or self-hosted backend.');
  },

  /** Approves or blocks a viewer device (superadmin). */
  async setStatus(deviceId: string, status: ViewerStatus): Promise<void> {
    if (isSupabaseBackend) {
      const { error } = await supabase!
        .from('adboard_viewers')
        .update({ status })
        .eq('device_id', deviceId);
      if (error) throw new Error(`Could not update the viewer (${error.message}).`);
      return;
    }
    if (isLocalBackend) {
      const r = await fetch(`/api/viewers/${encodeURIComponent(deviceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getLocalAuthHeaders() },
        body: JSON.stringify({ status })
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not update the viewer.');
      return;
    }
    throw new Error('Viewer management requires the Supabase or self-hosted backend.');
  },

  /** Gives a screen a friendly name, e.g. "Lobby TV" (superadmin). */
  async renameDevice(deviceId: string, label: string): Promise<void> {
    const clean = label.trim().slice(0, 80);
    if (isSupabaseBackend) {
      const { error } = await supabase!
        .from('adboard_viewers')
        .update({ label: clean || null })
        .eq('device_id', deviceId);
      if (error) throw new Error(`Could not rename the viewer (${error.message}).`);
      return;
    }
    if (isLocalBackend) {
      const r = await fetch(`/api/viewers/${encodeURIComponent(deviceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getLocalAuthHeaders() },
        body: JSON.stringify({ label: clean })
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not rename the viewer.');
      return;
    }
    throw new Error('Viewer management requires the Supabase or self-hosted backend.');
  },

  /**
   * Flushes accumulated per-slide display seconds from this screen.
   * Best-effort: a failed flush is dropped (the buffer was already cleared)
   * rather than blocking the display loop.
   */
  async logPlaytime(entries: { mediaId: string; seconds: number }[]): Promise<void> {
    const valid = entries.filter(e => e.seconds >= 1);
    if (valid.length === 0 || !this.supported()) return;
    try {
      if (isLocalBackend) {
        await fetch('/api/playtime', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: getDeviceId(), entries: valid })
        });
        return;
      }
      // Supabase: SECURITY DEFINER RPC (anon can log, never read/alter rows)
      const { error } = await supabase!.rpc('log_playtime', {
        p_device_id: getDeviceId(),
        p_entries: valid.map(e => ({ media_id: e.mediaId, seconds: Math.round(e.seconds) }))
      });
      if (error) throw error;
    } catch (err) {
      console.warn('Playtime flush failed (dropped):', err);
    }
  },

  /** Aggregated playtime per media item: total seconds + distinct screens. */
  async getPlaytimeStats(): Promise<Record<string, { totalSeconds: number; screenCount: number }>> {
    if (isSupabaseBackend) {
      const { data, error } = await supabase!
        .from('adboard_playtime')
        .select('media_id, device_id, seconds');
      if (error) {
        console.warn('Could not load playtime stats:', error.message);
        return {};
      }
      const stats: Record<string, { totalSeconds: number; screenCount: number }> = {};
      const screens: Record<string, Set<string>> = {};
      for (const row of data || []) {
        const id = row.media_id;
        stats[id] = stats[id] || { totalSeconds: 0, screenCount: 0 };
        stats[id].totalSeconds += Number(row.seconds) || 0;
        (screens[id] = screens[id] || new Set()).add(row.device_id);
      }
      for (const id of Object.keys(stats)) {
        stats[id].screenCount = screens[id].size;
        stats[id].totalSeconds = Math.round(stats[id].totalSeconds);
      }
      return stats;
    }
    if (isLocalBackend) {
      try {
        const r = await fetch('/api/playtime', { headers: getLocalAuthHeaders() });
        if (r.ok) return (await r.json()).stats || {};
      } catch { /* offline */ }
      return {};
    }
    return {};
  }
};
