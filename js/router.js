import { useState, useEffect } from '../vendor/preact-htm.js';

export function parseHash() {
  const h = location.hash.slice(1) || '/';
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), q: Object.fromEntries(new URLSearchParams(qs || '')) };
}
export const go = p => { location.hash = p; };
export const back = () => history.back();
export function useRoute() {
  const [r, set] = useState(parseHash());
  useEffect(() => {
    const f = () => set(parseHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}
