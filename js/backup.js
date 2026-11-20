/* Sauvegardes automatiques : copies locales (une par jour) et envoi vers Google Drive (dossier « Ma classe »). */
import { useState, useEffect } from '../vendor/preact-htm.js';
import { S, buildBackup } from './store.js';
import * as db from './db.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const EVERY = 20 * 60e3, KEEP_LOCAL = 10;
const FOLDER = 'Ma classe';

/* ---- état (hors des données de l'application, pour ne pas figurer dans les sauvegardes) ---- */
const LS = 'ma-classe-backup';
const cfg = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
const subs = new Set();
const live = { busy: false, error: '' };
export function setCfg(p) { try { localStorage.setItem(LS, JSON.stringify({ ...cfg(), ...p })); } catch { /* */ } subs.forEach(f => f()); }
export function useBackup() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set(n => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  return { ...cfg(), ...live };
}
const setLive = p => { Object.assign(live, p); subs.forEach(f => f()); };

/* ---- copies locales ---- */
export async function listSnaps() { return (await db.kvGet('snaps')) || []; }
export async function takeSnap() {
  const snaps = await listSnaps(), day = new Date().toISOString().slice(0, 10);
  const snap = { t: Date.now(), day, data: JSON.parse(JSON.stringify(S.data)) };
  const i = snaps.findIndex(s => s.day === day);
  if (i >= 0) snaps[i] = snap; else snaps.unshift(snap);
  snaps.sort((a, b) => b.t - a.t);
  await db.kvSet('snaps', snaps.slice(0, KEEP_LOCAL));
  setCfg({ lastSnap: snap.t, snapFor: S.data.updatedAt });
}

/* ---- Google Drive ---- */
let token = null, tokenExp = 0, gsi = null;
function loadGsi() {
  return gsi ||= new Promise((res, rej) => {
    if (window.google && window.google.accounts) return res();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => { gsi = null; rej(new Error('Google injoignable')); }; document.head.appendChild(s);
  });
}
function getToken(interactive) {
  if (token && Date.now() < tokenExp - 60e3) return Promise.resolve(token);
  const c = cfg();
  if (!c.clientId) return Promise.reject(new Error('Identifiant client manquant'));
  const run = () => new Promise((res, rej) => {
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: c.clientId, scope: SCOPE, callback: r => {
        if (r.error) return rej(new Error(r.error));
        token = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1e3; res(token);
      },
      error_callback: e => rej(new Error(e && e.type || 'popup')),
    });
    tc.requestAccessToken({ prompt: interactive ? (c.connected ? '' : 'consent') : '', hint: c.account || undefined });
  });
  // synchrone si le script Google est déjà chargé (nécessaire pour que le navigateur autorise la fenêtre de connexion)
  return window.google && window.google.accounts && window.google.accounts.oauth2 ? run() : loadGsi().then(run);
}
export const preloadGoogle = () => loadGsi().catch(() => {});
async function api(url, opt = {}, tk) {
  const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + tk } });
  if (r.status === 401) { token = null; throw new Error('auth'); }
  if (!r.ok) throw new Error('Drive ' + r.status);
  return r.status === 204 ? null : r.json();
}
async function folderId(tk) {
  let id = cfg().folderId;
  if (id) { try { const f = await api(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,trashed`, {}, tk); if (!f.trashed) return id; } catch (e) { if (e.message === 'auth') throw e; } }
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const l = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {}, tk);
  id = l.files[0] ? l.files[0].id : (await api('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) }, tk)).id;
  setCfg({ folderId: id });
  return id;
}
export async function driveUpload(interactive = false) {
  setLive({ busy: true, error: '' });
  try {
    const tk = await getToken(interactive), parent = await folderId(tk);
    const name = 'ma-classe-sauvegarde.json', forVersion = S.data.updatedAt;
    const q = encodeURIComponent(`name='${name}' and '${parent}' in parents and trashed=false`);
    const found = (await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {}, tk)).files[0];
    const body = new FormData();
    body.append('metadata', new Blob([JSON.stringify(found ? { name } : { name, parents: [parent], mimeType: 'application/json' })], { type: 'application/json' }));
    body.append('file', new Blob([buildBackup()], { type: 'application/json' }));
    await api(found ? `https://www.googleapis.com/upload/drive/v3/files/${found.id}?uploadType=multipart&fields=id` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: found ? 'PATCH' : 'POST', body }, tk);
    setCfg({ connected: true, lastDrive: Date.now(), driveFor: forVersion, needLogin: false });
    setLive({ busy: false });
    return true;
  } catch (e) {
    const need = e.message === 'auth' || /popup|interaction|access_denied|immediate|login/i.test(e.message);
    if (need) setCfg({ needLogin: true });
    setLive({ busy: false, error: need ? 'Reconnexion nécessaire' : (e.message || 'Échec') });
    return false;
  }
}
export function driveDisconnect() {
  try { token && window.google && google.accounts.oauth2.revoke(token); } catch { /* */ }
  token = null; setCfg({ connected: false, needLogin: false, folderId: '', lastDrive: 0, driveFor: 0 }); setLive({ error: '' });
}

/* ---- planificateur ---- */
let started = false;
export function startBackups() {
  if (started) return; started = true;
  let last = 0;
  const tick = async () => {
    if (!S.ready || !S.data) return;
    const c = cfg(), v = S.data.updatedAt;
    if (v && v !== c.snapFor && Date.now() - (c.lastSnap || 0) >= EVERY) await takeSnap();
    if (c.clientId && c.connected && !c.needLogin && navigator.onLine && !live.busy && v !== c.driveFor && Date.now() - last >= EVERY && Date.now() - (c.lastDrive || 0) >= EVERY) {
      last = Date.now(); await driveUpload(false);
    }
  };
  if (cfg().clientId) preloadGoogle();
  setTimeout(tick, 5000);
  setInterval(tick, 60e3);
}
