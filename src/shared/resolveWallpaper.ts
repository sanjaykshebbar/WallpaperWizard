/**
 * Picks the wallpaper a device should show right now.
 * Shared by the server (what to push) and the dashboard (what each device gets).
 *
 * Most specific wins: device > group > org. Among equals, the most recently
 * updated wallpaper wins. Inactive or out-of-schedule wallpapers never count.
 */

import type { Wallpaper } from '../types';

type Candidate = Pick<Wallpaper, 'id' | 'isActive' | 'scope' | 'target' | 'scheduledStart' | 'scheduledEnd' | 'updatedAt'>;

export function isLive(w: Candidate, now: Date): boolean {
  if (!w.isActive) return false;
  if (w.scheduledStart && now < new Date(w.scheduledStart)) return false;
  if (w.scheduledEnd && now > new Date(w.scheduledEnd)) return false;
  return true;
}

export function resolveWallpaper<W extends Candidate>(
  wallpapers: W[],
  device: { id: string; group: string | null },
  now: Date = new Date()
): W | null {
  const live = wallpapers.filter(w => isLive(w, now));
  const newest = (list: W[]) => list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
  return (
    newest(live.filter(w => w.scope === 'device' && w.target === device.id)) ||
    (device.group ? newest(live.filter(w => w.scope === 'group' && w.target === device.group)) : null) ||
    newest(live.filter(w => w.scope === 'org'))
  );
}
