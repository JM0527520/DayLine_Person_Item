import { useEffect, useState } from 'react';

type Density = 'standard' | 'comfortable';
const key = 'dayline-density';
function readDensity(): Density {
  try { return localStorage.getItem(key) === 'standard' ? 'standard' : 'comfortable'; }
  catch { return 'comfortable'; }
}

export function useDensity() {
  const [density, setDensity] = useState<Density>(readDensity);
  useEffect(() => { document.documentElement.dataset.density = density; }, [density]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) setDensity(readDensity()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function changeDensity(next: Density) {
    setDensity(next);
    document.documentElement.dataset.density = next;
    try { localStorage.setItem(key, next); return true; }
    catch { return false; }
  }
  return { density, changeDensity };
}
