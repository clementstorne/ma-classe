export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const pad2 = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const mondayOf = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const todayISO = () => iso(new Date());
export const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
export const fromMin = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const fmtDateLong = s => fromISO(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtDateShort = s => fromISO(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
export const fmtDateFull = s => fromISO(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "ARBOUCHE Aliya" -> {nom:"ARBOUCHE", prenom:"Aliya"} (NOM = mots tout en majuscules en tête) */
export function splitFullName(full) {
  const t = String(full || '').trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < t.length && t[i] === t[i].toUpperCase() && /[A-ZÀ-Ý]/.test(t[i])) i++;
  if (i === 0 || i === t.length) return { nom: t[0] || '', prenom: t.slice(1).join(' ') };
  return { nom: t.slice(0, i).join(' '), prenom: t.slice(i).join(' ') };
}

export const fmtNum = n => (n == null || n === '' ? '' : String(Math.round(n * 100) / 100).replace('.', ','));
/** number | 'x' | '-' | null (vide) | undefined (invalide) */
export function parseScore(s) {
  s = String(s ?? '').trim().toLowerCase();
  if (s === '') return null;
  if (s === 'x') return 'x';
  if (s === '-' || s === '–' || s === '—') return '-';
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export const CLASS_COLORS = ['#3558e6', '#0f9d8a', '#d9822b', '#b4469b', '#4f8f2f', '#c8465a', '#6b5bd6', '#0e7fb8', '#e0b000', '#8e5b3a', '#e0679a', '#4a5568'];
/** Couleur d'une classe : indice de palette (anciennes données) ou code #rrggbb choisi par l'utilisateur. */
export const classColor = c => (c && typeof c.color === 'string' && c.color[0] === '#') ? c.color : CLASS_COLORS[((c && c.color) || 0) % CLASS_COLORS.length];
/** Couleur de texte lisible (noir ou blanc) sur un fond donné. */
export function textOn(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? '#1b2433' : '#ffffff';
}

export const byName = (a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr') || (a.prenom || '').localeCompare(b.prenom || '', 'fr');
export const initials = s => ((s.prenom || '')[0] || '') + ((s.nom || '')[0] || '');
/** Étiquettes pour le plan : prénom seul, + initiale du nom si deux élèves de la liste ont le même prénom. */
export function seatLabels(studs) {
  const cnt = {};
  for (const s of studs) { const k = norm(s.prenom); cnt[k] = (cnt[k] || 0) + 1; }
  return Object.fromEntries(studs.map(s => {
    const pr = (s.prenom || '').trim() || (s.nom || '').trim();
    const ini = (s.nom || '').trim().charAt(0).toUpperCase();
    return [s.id, cnt[norm(s.prenom)] > 1 && ini ? `${pr} ${ini}.` : pr];
  }));
}
export const displayName = s => `${s.nom} ${s.prenom}`.trim();

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/** Partage (feuille de partage iPad -> Fichiers / Drive) avec repli sur un téléchargement. */
export async function shareOrDownload(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  download(blob, name);
  return 'downloaded';
}

export function readAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

/** Redimensionne une image (côté max 320 px) et renvoie un dataURL JPEG. */
export async function resizeImage(file, max = 320) {
  const url = await readAsDataURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.82);
}

let xlsxPromise;
export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return xlsxPromise ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/xlsx.mini.min.js', import.meta.url).href;
    s.onload = () => res(window.XLSX);
    s.onerror = () => rej(new Error('Impossible de charger le lecteur Excel'));
    document.head.appendChild(s);
  });
}
