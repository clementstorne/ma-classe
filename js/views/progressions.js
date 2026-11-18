import { html, useState, useRef, useEffect } from '../../vendor/preact-htm.js';
import { useStore, mutate, sortedClasses, holidayOn, weekLetter, occurrence } from '../store.js';
import { Modal, Field, Empty } from './common.js';
import { toMin, uid, iso, fromISO, addDays, mondayOf, fmtDateShort, classColor, textOn } from '../util.js';
import { Ico } from '../icons.js';

export const LEVELS = ['6e', '5e', '4e', '3e', '2de', '1re', 'Tle'];
/** Niveau d'une classe : celui choisi dans ses paramètres, sinon déduit du nom (ex. « 4C » → 4e). */
export const levelOf = c => {
  if (c.level) return c.level;
  const m = /(^|\D)([3-6])(?!\d)/.exec(c.name || '');
  return m ? m[2] + 'e' : '';
};
const levelRank = l => { const i = LEVELS.indexOf(l); return i < 0 ? 99 : i; };
const WEEK_OPTS = [0.5, 1, 1.5, 2, 2.5, 3];
const fmtL = x => fromISO(x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
const fmtN = x => fromISO(x).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const fmtW = w => String(w).replace('.', ',');

function levelsOf(d) {
  const set = new Set([...d.classes.map(levelOf), ...d.chapters.map(c => c.level)].filter(Boolean));
  return [...set].sort((a, b) => levelRank(a) - levelRank(b) || a.localeCompare(b));
}
const chaptersOf = (d, level) => d.chapters.filter(c => c.level === level);
export const chaptersFor = chaptersOf;

/** Semaines de l'année (du lundi de la première période au lundi de la dernière), avec les semaines entièrement en vacances. */
function calWeeks(d) {
  const ps = d.etabs.flatMap(e => e.periods || []).filter(p => p.start && p.end);
  if (!ps.length) return [];
  const s = ps.map(p => p.start).sort()[0], e = ps.map(p => p.end).sort().pop();
  const out = [];
  for (let m = mondayOf(fromISO(s)), i = 0; iso(m) <= e; m = addDays(m, 7), i++) {
    const days = [0, 1, 2, 3, 4].map(k => iso(addDays(m, k)));
    const hs = days.map(x => holidayOn(d, x));
    out.push({ i, monday: m, start: iso(m), end: iso(addDays(m, 6)), vac: hs.every(Boolean) ? hs[0].name : null });
  }
  return out;
}

const chIds = x => x.chapterIds || (x.chapterId ? [x.chapterId] : []);
export const sessionChapters = chIds;

/** Durée d'une séance en « heures de cours » : arrondie à la demi-heure (un créneau de 55 min compte 1 h). */
const courseH = o => Math.max(0.5, Math.round((toMin(o.end) - toMin(o.start)) / 60 * 2) / 2);
const R = 20;   // subdivisions verticales d'une semaine : un chapitre occupe la part de la semaine proportionnelle à ses heures de cours

/** Chapitres réellement travaillés d'un niveau, d'après la classe la plus avancée : séances (date, chapitres, heures) et premier/dernier jour par chapitre. */
function taughtOf(d, lv) {
  const chs = chaptersOf(d, lv), order = Object.fromEntries(chs.map((c, i) => [c.id, i]));
  let best = null;
  for (const c of d.classes.filter(c => levelOf(c) === lv)) {
    const per = {}, sessions = [];
    for (const x of Object.values(d.sessions)) if (x.classId === c.id) {
      const ids = chIds(x).filter(id => id in order); if (!ids.length || x.ds || x.ap) continue;
      const o = x.slotId ? occurrence(d, x.slotId, x.date) : null;
      if (o && o.cancelled) continue;
      sessions.push({ date: x.date, ids, h: o ? courseH(o) : 1 });
      for (const id of ids) { const e = per[id] ||= { first: x.date, last: x.date }; if (x.date < e.first) e.first = x.date; if (x.date > e.last) e.last = x.date; }
    }
    const top = Math.max(-1, ...Object.keys(per).map(id => order[id]));
    const n = Object.keys(per).length;
    if (n && (!best || top > best.top || (top === best.top && n > best.n))) best = { per, top, n, sessions, order };
  }
  return best;
}

/** Place les chapitres de chaque niveau : ceux déjà travaillés sur leurs vraies semaines (hauteur proportionnelle aux heures), les autres à la suite (demi-semaines, hors vacances). */
function layout(d, levels) {
  const weeks = calWeeks(d), H = R / 2;
  const usable = weeks.filter(w => !w.vac).map(w => w.i);
  const blocks = {}, over = {};
  const nowIso = iso(new Date());
  const nowWeek = (weeks.find(w => w.start <= nowIso && nowIso <= w.end) || {}).i;
  const weekOf = date => { const w = weeks.find(w => w.start <= date && date <= w.end); return w ? w.i : (date < (weeks[0] || {}).start ? 0 : weeks.length - 1); };
  const active = new Set(Object.values(d.sessions).map(x => weekOf(x.date)));
  for (const lv of levels) {
    blocks[lv] = []; over[lv] = 0;
    const chs = chaptersOf(d, lv), t = taughtOf(d, lv);
    const done = [], rest = [];
    chs.forEach((ch, n) => (t && t.per[ch.id] ? done : rest).push({ ch, n: n + 1 }));
    let cur = 0;
    if (t) {
      // poids (heures) de chaque chapitre dans chaque semaine
      const wk = {};
      for (const x of t.sessions) { const w = weekOf(x.date), m = wk[w] ||= {}; for (const id of x.ids) m[id] = (m[id] || 0) + x.h / x.ids.length; }
      const segs = {};
      for (const [w, m] of Object.entries(wk)) {
        const ids = Object.keys(m).sort((a, b) => t.order[a] - t.order[b]), T = ids.reduce((a, id) => a + m[id], 0);
        let acc = 0, prev = 0;
        ids.forEach((id, i) => { acc += m[id]; const u1 = i === ids.length - 1 ? R : Math.max(prev + 1, Math.round(R * acc / T)); (segs[id] ||= []).push({ w: Number(w), u0: prev, u1 }); prev = u1; });
      }
      let lastEnd = 0;
      for (const { ch, n } of done) {
        const sg = (segs[ch.id] || []).sort((a, b) => a.w - b.w), runs = [];
        for (const g of sg) {
          const r = runs[runs.length - 1];
          let gap = false;
          if (r) for (let w = r[r.length - 1].w + 1; w < g.w; w++) if (!weeks[w].vac && !active.has(w)) gap = true;
          if (r && !gap) r.push(g); else runs.push([g]);
        }
        runs.forEach((r, j) => {
          const f = r[0], l = r[r.length - 1]; lastEnd = Math.max(lastEnd, l.w);
          blocks[lv].push({ ch, n, row0: f.w * R + f.u0, row1: l.w * R + l.u1 - 1, endWeek: l.w, cut: false, actual: true, cont: j > 0, last: j === runs.length - 1 });
        });
      }
      const from = Math.max(lastEnd + 1, nowWeek === undefined ? 0 : nowWeek);
      const k = usable.findIndex(w => w >= from);
      cur = 2 * (k < 0 ? usable.length : k);
    }
    for (const { ch, n } of rest) {
      const h = Math.max(1, Math.round((ch.weeks || 1) * 2));
      const k0 = cur, k1 = cur + h - 1; cur += h;
      const w0 = usable[Math.floor(k0 / 2)], w1 = usable[Math.floor(k1 / 2)];
      if (w0 === undefined) { over[lv]++; continue; }
      const last = w1 === undefined ? usable[usable.length - 1] : w1;
      if (w1 === undefined) over[lv]++;
      const r0 = 2 * w0 + (k0 % 2), r1 = w1 === undefined ? 2 * last + 1 : 2 * w1 + (k1 % 2);
      blocks[lv].push({ ch, n, row0: r0 * H, row1: (r1 + 1) * H - 1, endWeek: last, cut: w1 === undefined, actual: false, planned: !!t });
    }
  }
  return { weeks, blocks, over, nowWeek };
}

/** Avancement d'une classe, déduit des séances : le chapitre le plus avancé de la dernière séance est « en cours », tous les autres chapitres travaillés sont « terminés ». */
export function progressOf(d, classId, excludeKey, raw, before) {
  const order = Object.fromEntries(d.chapters.map((c, i) => [c.id, i]));
  // `before` : avancement tel qu'il était à cette date (séances antérieures) ; les corrections manuelles ne s'appliquent que s'il n'y a pas de séance plus récente
  const later = before && Object.values(d.sessions).some(x => x.classId === classId && x.key !== excludeKey && x.date > before && chIds(x).some(id => id in order));
  const ses = Object.values(d.sessions).filter(x => x.classId === classId && x.key !== excludeKey && (!before || x.date < before) && chIds(x).some(id => id in order)).sort((a, b) => a.date.localeCompare(b.date));
  const out = {};
  for (const x of ses) for (const id of chIds(x)) if (id in order) out[id] = 'done';
  if (ses.length) {
    const ids = chIds(ses[ses.length - 1]).filter(id => id in order).sort((a, b) => order[a] - order[b]);
    out[ids[ids.length - 1]] = 'doing';
  }
  if (!raw && !later) for (const id of Object.keys(order)) {
    const m = (d.progress || {})[classId + '|' + id];
    if (m === 'todo') delete out[id]; else if (m) out[id] = m;
  }
  return out;
}
/** Statut suivant au clic : à venir → en cours → terminé → à venir. Une correction manuelle n'est gardée que si elle diffère du statut déduit des séances. */
const cycle = (d, cid, chid) => {
  const cur = progressOf(d, cid)[chid], nx = !cur ? 'doing' : cur === 'doing' ? 'done' : null;
  const auto = progressOf(d, cid, null, true)[chid] || null;
  mutate(dd => { const k = cid + '|' + chid; if (nx === auto) delete dd.progress[k]; else dd.progress[k] = nx || 'todo'; });
};
/** Heures de cours réellement faites par chapitre pour une classe (durée des créneaux des séances ; réparties à parts égales si plusieurs chapitres). */
export function hoursOf(d, classId) {
  const out = {};
  for (const x of Object.values(d.sessions)) {
    const ids = chIds(x); if (x.classId !== classId || !ids.length || !x.slotId || x.ds || x.ap) continue;
    const o = occurrence(d, x.slotId, x.date); if (!o || o.cancelled) continue;
    const h = courseH(o);
    for (const id of ids) out[id] = (out[id] || 0) + h / ids.length;
  }
  return out;
}
const fmtH = h => (Math.round(h * 2) / 2).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' h';
const STATUS_GLYPH = { doing: '◐', done: '✓' };

function Chips({ d, level, ch, late, hours }) {
  const cls = sortedClasses(d).filter(c => levelOf(c) === level);
  return html`${cls.map(c => {
    const st = progressOf(d, c.id)[ch.id], h = hours ? hoursOf(d, c.id)[ch.id] : 0;
    return html`<button key=${c.id} class=${'cp' + (st ? ' ' + st : '') + (late && st !== 'done' ? ' late' : '')} style=${{ '--cc': classColor(c) }}
      title=${{ doing: 'En cours', done: 'Terminé' }[st] || 'À venir'} onClick=${e => { e.stopPropagation(); cycle(d, c.id, ch.id); }}>${c.name}${st ? ' ' + STATUS_GLYPH[st] : ''}${h ? ' · ' + fmtH(h) : ''}</button>`;
  })}`;
}

/* ---------- Calendrier ---------- */
function Calendar({ d, levels, from = 0, to = Infinity, print = false }) {
  const { weeks: allWeeks, blocks, over, nowWeek } = layout(d, levels);
  const last = Math.min(to, allWeeks.length - 1), weeks = allWeeks.filter(w => w.i >= from && w.i <= last);
  const wrap = useRef();
  const parts = d.settings.parts || [];
  const partOf = id => parts.find(p => p.id === id);
  useEffect(() => {
    if (print) return;
    const el = wrap.current && wrap.current.querySelector('.cal-now');
    if (el) wrap.current.scrollTop = Math.max(0, el.offsetTop - 140);
  }, [levels.join(',')]);
  const ab = d.etabs.find(e => e.ab && e.abRef);
  const gcol = i => i + 4;
  const nw = Math.max(30, 14 + 9 * String(allWeeks.length).length), dw = print ? 84 : 140;
  const vacSpan = w => { let n = 1; while (allWeeks[w.i + n]?.vac === w.vac && w.i + n <= last) n++; return n; };
  const base = from * R, top = (last + 1) * R - 1;
  return html`<div class="calwrap" ref=${wrap}><div class="cal" style=${{ gridTemplateColumns: `${nw}px ${dw}px ${ab ? 34 : 0}px repeat(${levels.length}, minmax(${print ? 120 : 170}px, 1fr))`, minWidth: print ? 0 : nw + dw + (ab ? 34 : 0) + 170 * levels.length + "px" }}>
    <div class="ch ch-w" style="grid-row:1;grid-column:1/4">Semaine</div>
    ${levels.map((lv, i) => html`<div class="ch" key=${lv} style=${{ gridRow: 1, gridColumn: gcol(i) }}>${lv}${over[lv] && !print ? html` <span class="chip" title="Chapitres au-delà de la fin de l'année">+${over[lv]}</span>` : ''}</div>`)}
    ${weeks.map(w => {
      const r = R * (w.i - from) + 2, now = !print && w.i === nowWeek, L = ab ? weekLetter(ab, w.monday) : null;
      return html`<div key=${'n' + w.i} class=${'cn' + (now ? ' cal-now' : '')} style=${{ gridRow: `${r} / span ${R}`, gridColumn: 1 }}>${w.i + 1}</div>
        <div key=${'w' + w.i} class=${'cw' + (now ? ' cal-now' : '') + (w.vac ? ' vac' : '')} style=${{ gridRow: `${r} / span ${R}`, gridColumn: 2, left: nw + 'px' }}>${print ? html`<span>${fmtN(w.start)} – ${fmtN(w.end)}</span>` : html`<span>du ${fmtL(w.start)}<br />au ${fmtL(w.end)}</span>`}</div>
        <div class=${'cab' + (now ? ' cal-now2' : '')} style=${{ gridRow: `${r} / span ${R}`, gridColumn: 3, left: nw + dw + 'px' }}>${w.vac ? '' : L || ''}</div>
        <div class=${'cbg' + (now ? ' now' : '')} style=${{ gridRow: `${r} / span ${R}`, gridColumn: `4 / ${levels.length + 4}` }}></div>
        ${w.vac && (allWeeks[w.i - 1]?.vac !== w.vac || w.i === from) ? html`<div class="cvac" style=${{ gridRow: `${r} / span ${R * vacSpan(w)}`, gridColumn: `4 / ${levels.length + 4}` }}>${w.vac}</div>` : null}`;
    })}
    ${levels.map((lv, i) => blocks[lv].map(b => {
      const b0 = Math.max(b.row0, base), b1 = Math.min(b.row1, top);
      if (b0 > b1) return null;
      const cutTop = b.row0 < base, cutBot = b.row1 > top;
      const p = partOf(b.ch.part), bg = p ? p.color : '#8a94a8';
      const late = nowWeek !== undefined && b.endWeek < nowWeek;
      const n = b1 - b0 + 1, label = !b.cont || cutTop, chips = b.last !== false && !cutBot;
      return html`<div class=${'cblock' + (b.planned ? ' planned' : '') + (n < R ? ' short' : '') + (n < R / 2 ? ' tiny' : '') + ((b.cont && !cutTop) || cutTop ? ' ct' : '') + (b.cont && !cutTop ? ' cont' : '') + (b.last === false || cutBot ? ' cb' : '')} key=${b.ch.id + "-" + b.row0} style=${{ gridRow: `${b0 - base + 2} / ${b1 - base + 3}`, gridColumn: gcol(i), background: bg, color: textOn(bg) }}>
        ${label ? (print ? html`<b>${b.n}. ${b.ch.title}</b>` : html`<small>Chapitre ${b.n}</small><b>${b.ch.title}</b>`) : null}
        ${chips ? html`<div class="cps"><${Chips} d=${d} level=${lv} ch=${b.ch} late=${late} /></div>` : null}</div>`;
    }))}
  </div></div>`;
}

/** Version imprimable : le calendrier découpé en une page de (A4 portrait, une seule page). */
function PrintCalendars({ d, levels }) {
  const n = calWeeks(d).length, per = n, pages = [];
  for (let f = 0; f < n; f += per) pages.push(f);
  return html`<div class="print-area">${pages.map(f => html`<section class="print-page" key=${f} style=${{ '--rowpx': Math.min(1.4, 975 / (n * R)) + 'px' }}>
    <h2>Progressions</h2><${Calendar} d=${d} levels=${levels} from=${f} to=${f + per - 1} print=${true} /></section>`)}</div>`;
}

/* ---------- Liste des chapitres d'un niveau ---------- */
function ChapterList({ d, level }) {
  const list = chaptersOf(d, level);
  const parts = d.settings.parts || [];
  const set = (id, patch) => mutate(dd => Object.assign(dd.chapters.find(c => c.id === id), patch));
  const move = (id, dir) => mutate(dd => {
    const idxs = dd.chapters.map((c, i) => c.level === level ? i : -1).filter(i => i >= 0);
    const p = idxs.findIndex(i => dd.chapters[i].id === id), q = p + dir;
    if (q < 0 || q >= idxs.length) return;
    const a = idxs[p], b = idxs[q]; [dd.chapters[a], dd.chapters[b]] = [dd.chapters[b], dd.chapters[a]];
  });
  const del = ch => { if (!confirm(`Supprimer le chapitre « ${ch.title} » ?`)) return; mutate(dd => { dd.chapters = dd.chapters.filter(c => c.id !== ch.id); for (const k of Object.keys(dd.progress || {})) if (k.endsWith('|' + ch.id)) delete dd.progress[k]; for (const x of Object.values(dd.sessions)) { if (x.chapterId === ch.id) delete x.chapterId; if (x.chapterIds) { x.chapterIds = x.chapterIds.filter(i => i !== ch.id); if (!x.chapterIds.length) delete x.chapterIds; } } }); };
  const total = list.reduce((n, c) => n + (c.weeks || 1), 0);
  if (!list.length) return html`<${Empty} title=${'Aucun chapitre en ' + level} />`;
  return html`<div class="list chscroll" style=${{ "--chw": Math.round(sortedClasses(d).filter(c => levelOf(c) === level).reduce((a, c) => a + c.name.length * 7.5 + 82, 0)) + "px" }}>${list.map((ch, i) => {
    const p = parts.find(x => x.id === ch.part);
    return html`<div class="item chrow" key=${ch.id} style=${{ cursor: 'default', borderLeft: '6px solid ' + (p ? p.color : 'var(--line)') }}>
      <span class="muted chn">${i + 1}</span>
      <input class="inp grow" value=${ch.title} onInput=${e => set(ch.id, { title: e.target.value })} aria-label="Titre du chapitre" />
      <select class="inp" value=${ch.part || ''} onChange=${e => set(ch.id, { part: e.target.value })}><option value="">Sans partie</option>${parts.map(x => html`<option value=${x.id}>${x.name}</option>`)}</select>
      <select class="inp" value=${ch.weeks || 1} onChange=${e => set(ch.id, { weeks: Number(e.target.value) })}>${(WEEK_OPTS.includes(ch.weeks) ? WEEK_OPTS : [...WEEK_OPTS, ch.weeks]).map(w => html`<option value=${w}>${fmtW(w)} sem.</option>`)}</select>
      <span class="cps"><${Chips} d=${d} level=${level} ch=${ch} late=${false} hours=${true} /></span>
      <button class="btn small" disabled=${i === 0} onClick=${() => move(ch.id, -1)} aria-label="Monter">↑</button>
      <button class="btn small" disabled=${i === list.length - 1} onClick=${() => move(ch.id, 1)} aria-label="Descendre">↓</button>
      <button class="btn small danger" onClick=${() => del(ch)}>Supprimer</button></div>`;
  })}</div><p class="muted" style="margin:10px 2px">${list.length} chapitres · ${fmtW(total)} semaines</p>`;
}

/* ---------- Parties du programme ---------- */
function PartsModal({ onClose }) {
  const d = useStore();
  const parts = d.settings.parts || [];
  const set = (id, patch) => mutate(dd => Object.assign(dd.settings.parts.find(p => p.id === id), patch));
  const add = () => mutate(dd => { dd.settings.parts.push({ id: uid(), name: 'Nouvelle partie', color: '#6f8cff' }); });
  const del = p => { if (!confirm(`Supprimer la partie « ${p.name} » ? Les chapitres concernés n'auront plus de partie.`)) return; mutate(dd => { dd.settings.parts = dd.settings.parts.filter(x => x.id !== p.id); dd.chapters.forEach(c => { if (c.part === p.id) c.part = ''; }); }); };
  return html`<${Modal} title="Parties du programme" onClose=${onClose} foot=${html`<button class="btn" onClick=${add}>${Ico('plus')} Ajouter une partie</button><span class="grow"></span><button class="btn primary" onClick=${onClose}>OK</button>`}>
    ${parts.map(p => html`<div class="row" key=${p.id} style="margin-bottom:8px"><input type="color" value=${p.color} onInput=${e => set(p.id, { color: e.target.value })} style="width:44px;height:40px;padding:2px" aria-label="Couleur" />
      <input class="inp grow" value=${p.name} onInput=${e => set(p.id, { name: e.target.value })} /><button class="btn small danger" onClick=${() => del(p)}>Supprimer</button></div>`)}<//>`;
}

/* ---------- Page ---------- */
export function Progressions() {
  const d = useStore();
  const levels = levelsOf(d);
  const [view, setView] = useState('cal');
  const [lvl, setLvl] = useState('');
  const [parts, setParts] = useState(false);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 200);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [printing]);
  const level = levels.includes(lvl) ? lvl : levels[0];
  function addChapter() {
    if (!level) return;
    mutate(dd => dd.chapters.push({ id: uid(), level, title: 'Nouveau chapitre', weeks: 1, part: '' }));
  }
  return html`<div class="page fitcol">
    <div class="page-head">
      <div class="seg eq"><button class=${view === 'cal' ? 'on P' : ''} onClick=${() => setView('cal')}>Calendrier</button><button class=${view === 'list' ? 'on P' : ''} onClick=${() => setView('list')}>Liste</button></div>
      <span class="grow"></span>
      ${view === 'cal' && d.chapters.length ? html`<button class="btn" onClick=${() => setPrinting(true)}>${Ico('upload')} Exporter en PDF</button>` : null}
      <button class="btn" onClick=${() => setParts(true)}>${Ico('layout')} Parties du programme</button>
      ${view === 'list' ? html`<button class="btn primary" disabled=${!level} onClick=${addChapter}>${Ico('plus')} Ajouter un chapitre</button>` : null}</div>
    ${view === 'list' && levels.length ? html`<div class="tabs">${levels.map(l => html`<a key=${l} class=${l === level ? 'on' : ''} href="javascript:void 0" onClick=${e => { e.preventDefault(); setLvl(l); }}>${l} <span class="muted">(${chaptersOf(d, l).length})</span></a>`)}</div>` : null}
    ${!levels.length ? html`<${Empty} title="Aucune classe" />`
      : view === 'cal' ? (d.chapters.length ? html`<${Calendar} d=${d} levels=${levels.filter(l => chaptersOf(d, l).length)} />` : html`<${Empty} title="Aucun chapitre" />`)
      : html`<${ChapterList} d=${d} level=${level} />`}
    ${printing ? html`<${PrintCalendars} d=${d} levels=${levelsOf(d).filter(l => chaptersOf(d, l).length)} />` : null}
    ${parts ? html`<${PartsModal} onClose=${() => setParts(false)} />` : null}
  </div>`;
}
