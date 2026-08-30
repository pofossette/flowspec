import * as React from 'react';
import type { ThemeMode } from '../store/theme-store.js';
import { useEffectiveTheme, useThemeStore } from '../store/theme-store.js';

export function useThemeSync(): {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  effectiveTheme: 'light' | 'dark';
} {
  const { mode, setMode } = useThemeStore();
  const effectiveTheme = useEffectiveTheme(mode);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);
    if (effectiveTheme === 'dark') root.classList.add('dark');
    root.style.colorScheme = effectiveTheme;
  }, [effectiveTheme]);

  React.useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const eff: 'light' | 'dark' = mq.matches ? 'dark' : 'light';
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(eff);
      root.style.colorScheme = eff;
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  return { mode, setMode, effectiveTheme };
}
