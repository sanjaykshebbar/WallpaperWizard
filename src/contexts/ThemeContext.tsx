/**
 * ==========================================
 * File: src/contexts/ThemeContext.tsx
 * Project: AdBoard
 * Purpose:
 * Application-wide theme switching (Light, Dark, Paper).
 * The active theme is stored in localStorage and applied as a
 * data-theme attribute on <html>, which the palettes in index.css
 * respond to.
 * ==========================================
 */

import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeName = 'light' | 'dark' | 'paper';

const THEME_STORAGE_KEY = 'adboard_theme';

export function getStoredTheme(): ThemeName {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'dark' || stored === 'paper' ? stored : 'light';
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-theme', theme);
}

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeName>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (next: ThemeName) => {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setThemeState(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be invoked inside a ThemeProvider wrapper block.');
  }
  return context;
};
