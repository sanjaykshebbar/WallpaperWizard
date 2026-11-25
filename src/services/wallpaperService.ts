/**
 * Wallpaper library: validate, upload, save, delete.
 */

import { api } from './api';
import { Wallpaper } from '../types';

const MAX_BYTES = 20 * 1024 * 1024;

export const WallpaperService = {
  /** JPG/PNG only: the formats both Windows and macOS accept as wallpaper. */
  validateFile(file: File): void {
    const okType = ['image/jpeg', 'image/png'].includes(file.type) && /\.(jpe?g|png)$/i.test(file.name);
    if (!okType) throw new Error('Wallpapers must be JPG or PNG images.');
    if (file.size > MAX_BYTES) throw new Error(`Image is ${(file.size / 1048576).toFixed(1)} MB; the limit is 20 MB.`);
  },

  async upload(file: File): Promise<string> {
    this.validateFile(file);
    const form = new FormData();
    form.append('file', file);
    return (await api('/api/upload', { method: 'POST', body: form })).url;
  },

  list(): Promise<Wallpaper[]> {
    return api('/api/wallpapers');
  },

  async save(wallpaper: Partial<Wallpaper> & { id: string }): Promise<void> {
    await api('/api/wallpapers', { json: wallpaper });
  },

  async remove(id: string): Promise<void> {
    await api(`/api/wallpapers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
};
