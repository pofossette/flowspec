import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeStore = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
    }),
    { name: 'flow-preview-theme' }
  )
);

export function useEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
