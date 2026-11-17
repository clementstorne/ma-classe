import { useState, useEffect } from '../vendor/preact-htm.js';
import * as db from './db.js';
import { uid, byName } from './util.js';

export const ROOM_W = 1200, ROOM_H = 760;
export const S = { data: null, photos: {}, ready: false };
const subs = new Set();
export const subscribe = fn => { subs.add(fn); return () => subs.delete(fn); };
const notify = () => subs.forEach(f => f());

/** Hook: re-rend le composant à chaque modification des données. */
export function useStore() {
  const [, set] = useState(0);
  useEffect(() => subscribe(() => set(n => n + 1)), []);
  return S.data;
}

let timer;
export function flush() { clearTimeout(timer); timer = null; return db.kvSet('data', S.data); }
function persist() { clearTimeout(timer); timer = setTimeout(flush, 300); }

/** Modifie les données (fn reçoit l'objet de données), sauvegarde et rafraîchit l'affichage. */
export function mutate(fn) {
  const r = fn(S.data);
  S.data.updatedAt = Date.now();
  persist();
  notify();
  return r;
}

export function defaultRoomSeats(cols = 6, rows = 5, group = 2) {
  const items = [{ id: uid(), kind: 'label', x: 430, y: 24, w: 340, h: 44, text: 'Tableau' }];
  const sw = 140, sh = 76, gap = 8, gGap = 40, x0 = 60, y0 = 130;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const g = Math.floor(c / group);
      items.push({ id: uid(), kind: 'seat', x: x0 + c * (sw + gap) + g * gGap, y: y0 + r * (sh + 22), w: sw, h: sh });
    }
  }
  return items;
}

function schoolYear() {
  const n = new Date();
  return n.getMonth() >= 7 ? n.getFullYear() : n.getFullYear() - 1;
}
export function defaultPeriods(type, sy = schoolYear()) {
  if (type === 'semestre') return [
    { id: uid(), name: 'Semestre 1', start: `${sy}-09-01`, end: `${sy + 1}-01-23` },
    { id: uid(), name: 'Semestre 2', start: `${sy + 1}-01-24`, end: `${sy + 1}-07-10` }];
  return [
    { id: uid(), name: 'Trimestre 1', start: `${sy}-09-01`, end: `${sy}-12-05` },
    { id: uid(), name: 'Trimestre 2', start: `${sy}-12-06`, end: `${sy + 1}-03-13` },
    { id: uid(), name: 'Trimestre 3', start: `${sy + 1}-03-14`, end: `${sy + 1}-07-10` }];
}

export function defaultData() {
  return {
    v: 1, createdAt: Date.now(), updatedAt: Date.now(), lastBackup: 0,
    settings: { threshold: 3, comps: ['Chercher', 'Modéliser', 'Représenter', 'Raisonner', 'Calculer', 'Communiquer'], advance: 'student' },
    etabs: [
      { id: 'e1', name: 'Collège Victor Schoelcher', type: 'semestre', periods: defaultPeriods('semestre') },
      { id: 'e2', name: 'Collège Le Segrais', type: 'trimestre', periods: defaultPeriods('trimestre') }],
    classes: [], students: [],
    rooms: [{ id: 'r1', name: 'Salle 1', items: defaultRoomSeats() }, { id: 'r2', name: 'Salle 2', items: defaultRoomSeats() }],
    plans: {}, slots: [], overrides: {}, sessions: {}, events: [], evals: [],
  };
}

function migrate(d) {
  const base = defaultData();
  for (const k of Object.keys(base)) if (d[k] === undefined) d[k] = base[k];
  d.settings = { ...base.settings, ...d.settings };
  return d;
}

export async function init() {
  const d = await db.kvGet('data');
  S.data = d ? migrate(d) : defaultData();
  S.photos = await db.photoAll();
  S.ready = true;
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* ignore */ }
  const f = () => { if (timer) flush(); };
  addEventListener('pagehide', f);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') f(); });
  notify();
}

/* ---- Photos ---- */
export function photoOf(sid) { return S.photos[sid] || null; }
export async function setPhoto(sid, dataUrl) {
  S.photos[sid] = dataUrl;
  await db.photoSet(sid, dataUrl);
  mutate(d => { const s = d.students.find(x => x.id === sid); if (s) s.hasPhoto = true; });
}
export async function removePhoto(sid) {
  delete S.photos[sid];
  await db.photoDel(sid);
  mutate(d => { const s = d.students.find(x => x.id === sid); if (s) s.hasPhoto = false; });
}

/* ---- Sauvegarde ---- */
export function buildBackup() {
  return JSON.stringify({ app: 'ma-classe', version: 1, exportedAt: new Date().toISOString(), data: S.data, photos: S.photos });
}
export async function restoreBackup(text) {
  const o = JSON.parse(text);
  if (!o || o.app !== 'ma-classe' || !o.data) throw new Error('Ce fichier n\'est pas une sauvegarde de « Ma classe ».');
  S.data = migrate(o.data);
  S.photos = o.photos || {};
  await db.photoClear();
  for (const [id, url] of Object.entries(S.photos)) await db.photoSet(id, url);
  await flush();
  notify();
}
export function markBackedUp() { mutate(d => { d.lastBackup = Date.now(); }); }
export async function resetAll() {
  S.data = defaultData(); S.photos = {};
  await db.photoClear(); await flush(); notify();
}

/* ---- Accès ---- */
export const classById = (d, id) => d.classes.find(c => c.id === id);
export const studentsOf = (d, classId) => d.students.filter(s => s.classId === classId).sort(byName);
export const groupsOf = cls => (cls && cls.groups) || [];
/** Élèves concernés par une séance : toute la classe, ou un groupe. */
export const groupStudents = (d, classId, group) => studentsOf(d, classId).filter(s => !group || s.group === group);
export const etabOf = (d, cls) => d.etabs.find(e => e.id === (cls && cls.etabId)) || d.etabs[0];
export const roomById = (d, id) => d.rooms.find(r => r.id === id);
export const planKey = (classId, roomId) => `${classId}|${roomId}`;
export function getPlan(d, classId, roomId) { return d.plans[planKey(classId, roomId)] || { seatMap: {} }; }
export function periodFor(etab, dateISO) {
  return (etab.periods || []).find(p => dateISO >= p.start && dateISO <= p.end) || null;
}
export function currentPeriod(etab, dateISO) {
  const t = dateISO || new Date().toISOString().slice(0, 10);
  const ps = etab.periods || [];
  return periodFor(etab, t) || (t < (ps[0] && ps[0].start) ? ps[0] : ps[ps.length - 1]) || null;
}
/** Lettre (A/B) de la semaine commençant le lundi `monday` pour un établissement, ou null si pas d'alternance. */
export function weekLetter(etab, monday) {
  if (!etab || !etab.ab || !etab.abRef) return null;
  const [y, m, d] = etab.abRef.split('-').map(Number);
  const ref = new Date(y, m - 1, d);
  const diff = Math.round((monday - ref) / 604800000);
  return ((diff % 2) + 2) % 2 === 0 ? 'A' : 'B';
}
/** Séance réelle d'un créneau à une date : créneau de base + éventuelle modification ponctuelle. */
export function occurrence(d, slotId, date) {
  const s = d.slots.find(x => x.id === slotId);
  if (!s) return null;
  const o = (d.overrides || {})[`${slotId}|${date}`] || {};
  return { ...s, ...o, slotId, date, cancelled: !!o.cancelled, oneOff: !!s.date,
    modified: ['start', 'end', 'classId', 'roomId', 'group'].some(k => o[k] !== undefined && o[k] !== s[k]) };
}
export const sessionKey = (classId, date, slotId) => `${classId}|${date}|${slotId || 'x'}`;
