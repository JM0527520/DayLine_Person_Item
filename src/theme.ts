import { useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
const storageKey = 'dayline-theme';
const systemQuery = '(prefers-color-scheme: dark)';
const parsePreference = (value: string | null): ThemePreference => value === 'light' || value === 'dark' ? value : 'system';

function readPreference(): ThemePreference {
  try { return parsePreference(localStorage.getItem(storageKey)); }
  catch { return 'system'; }
}

function applyTheme(preference: ThemePreference, systemIsDark = matchMedia(systemQuery).matches) {
  const theme = preference === 'system' ? (systemIsDark ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#212225' : '#f5f5f7');
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    const media = matchMedia(systemQuery);
    const update = () => applyTheme(preference, media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [preference]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setPreference(readPreference());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function changeTheme(next: ThemePreference) {
    setPreference(next);
    applyTheme(next);
    try { localStorage.setItem(storageKey, next); return true; }
    catch { return false; }
  }

  return { preference, changeTheme };
}
