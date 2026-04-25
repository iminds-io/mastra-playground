// ABOUTME: Theme preference hook with 3-state cycle and system preference detection
// ABOUTME: Persists to localStorage and sets the resolved data-theme attribute on <html>

import { useCallback, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'mindspace-theme';
const CYCLE_ORDER: ThemePreference[] = ['light', 'dark', 'system'];

function readStoredPreference(): ThemePreference {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }

  return 'system';
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyResolvedTheme(theme: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  const resolvedTheme = useMemo<ResolvedTheme>(
    () => (preference === 'system' ? systemTheme : preference),
    [preference, systemTheme],
  );

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (event: { matches: boolean }) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const cycle = useCallback(() => {
    setPreference((current) => {
      const currentIndex = CYCLE_ORDER.indexOf(current);
      const next = CYCLE_ORDER[(currentIndex + 1) % CYCLE_ORDER.length] ?? 'system';

      window.localStorage.setItem(STORAGE_KEY, next);

      return next;
    });
  }, []);

  return { preference, resolvedTheme, cycle } as const;
}
