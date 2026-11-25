/**
 * ==========================================
 * File: src/hooks/usePageTitle.ts
 * Project: WallpaperWizard
 * Purpose:
 * Sets the browser tab title for the current page and restores the
 * previous title on unmount.
 * ==========================================
 */

import { useEffect } from 'react';

export function usePageTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · WallpaperWizard`;
    return () => { document.title = previous; };
  }, [title]);
}
