import { html, useState, useRef, useEffect } from '../../vendor/preact-htm.js';
import { useStore, mutate, sortedClasses, holidayOn, weekLetter } from '../store.js';
import { Modal, Field, Empty, toast } from './common.js';
import { uid, iso, fromISO, addDays, mondayOf, fmtDateShort, classColor, textOn } from '../util.js';
import { Ico } from '../icons.js';

export const LEVELS = ['6e', '5e', '4e', '3e', '2de', '1re', 'Tle'];
/** Niveau d'une classe : celui choisi dans ses paramètres, sinon déduit du nom (ex. « 4C » → 4e). */
export const levelOf = c => {
  if (c.level) return c.level;
  const m = /(^|\D)([3-6])(?!\d)/.exec(c.name || '');
  return m ? m[2] + 'e' : '';
};
const levelRank = l => { const i = LEVELS.indexOf(l); return i < 0 ? 99 : i; };
const WEEK_OPTS = Array.from({ length: 24 }, (_, i) => (i + 1) / 2);
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

/** Chapitres réellement travaillés d'un niveau, d'après la classe la plus avancée : { id → {first, last} } (dates des séances). */
function taughtOf(d, lv) {
  const chs = chaptersOf(d, lv), order = Object.fromEntries(chs.map((c, i) => [c.id, i]));
  let best = null;
  for (const c of d.classes.filter(c => levelOf(c) === lv)) {
    const per = {};
    for (const x of Object.values(d.sessions)) if (x.classId === c.id) for (const id of chIds(x)) if (id in order) {
      const e = per[id] ||= { first: x.date, last: x.date };
      if (x.date < e.first) e.first = x.date; if (x.date > e.last) e.last = x.date;
    }
    const top = Math.max(-1, ...Object.keys(per).map(id => order[id]));
    const n = Object.keys(per).length;
    if (n && (!best || top > best.top || (top === best.top && n > best.n))) best = { per, top, n };
  }
  return best;
}

/** Place les chapitres de chaque niveau : ceux déjà travaillés sur leurs vraies semaines, les autres à la suite (demi-semaines, hors vacances). */
function layout(d, levels) {
  const weeks = calWeeks(d);
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
      const spans = done.map(x => ({ ...x, w0: weekOf(t.per[x.ch.id].first), w1: weekOf(t.per[x.ch.id].last) }));
      spans.forEach((x, i) => {
        const prev = spans[i - 1], next = spans[i + 1];
        let r0 = 2 * x.w0 + (prev && prev.w1 === x.w0 ? 1 : 0), r1 = 2 * x.w1 + (next && next.w0 === x.w1 ? 0 : 1);
        if (r1 < r0) r1 = r0;
        // semaines sans aucun cours saisi (toutes classes) à l'intérieur du chapitre : zone blanche, le bloc est découpé
        const gap = w => w > x.w0 && w < x.w1 && !weeks[w].vac && !active.has(w);
        const runs = []; let a = null;
        for (let w = x.w0; w <= x.w1; w++) { if (gap(w)) { if (a !== null) runs.push([a, w - 1]); a = null; } else if (a === null) a = w; }
        if (a !== null) runs.push([a, x.w1]);
        runs.forEach(([ra, rb], j) => blocks[lv].push({ ch: x.ch, n: x.n, row0: ra === x.w0 ? r0 : 2 * ra, row1: rb === x.w1 ? r1 : 2 * rb + 1,
          endWeek: x.w1, cut: false, actual: true, cont: j > 0, last: j === runs.length - 1 }));
      });
      const lastEnd = Math.max(...spans.map(x => x.w1));
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
      blocks[lv].push({ ch, n, row0: 2 * w0 + (k0 % 2), row1: w1 === undefined ? 2 * last + 1 : 2 * w1 + (k1 % 2), endWeek: last, cut: w1 === undefined, actual: false, planned: !!t });
    }
  }
  return { weeks, blocks, over, nowWeek };
}

/** Avancement d'une classe, déduit des séances : le chapitre le plus avancé de la dernière séance est « en cours », tous les autres chapitres travaillés sont « terminés ». */
export function progressOf(d, classId, excludeKey, raw) {
  const order = Object.fromEntries(d.chapters.map((c, i) => [c.id, i]));
  const ses = Object.values(d.sessions).filter(x => x.classId === classId && x.key !== excludeKey && chIds(x).some(id => id in order)).sort((a, b) => a.date.localeCompare(b.date));
  const out = {};
  for (const x of ses) for (const id of chIds(x)) if (id in order) out[id] = 'done';
  if (ses.length) {
    const ids = chIds(ses[ses.length - 1]).filter(id => id in order).sort((a, b) => order[a] - order[b]);
    out[ids[ids.length - 1]] = 'doing';
  }
  if (!raw) for (const id of Object.keys(order)) {
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
const STATUS_GLYPH = { doing: '◐', done: '✓' };

function Chips({ d, level, ch, late }) {
  const cls = sortedClasses(d).filter(c => levelOf(c) === level);
  return html`${cls.map(c => {
    const st = progressOf(d, c.id)[ch.id];
    return html`<button key=${c.id} class=${'cp' + (st ? ' ' + st : '') + (late && st !== 'done' ? ' late' : '')} style=${{ '--cc': classColor(c) }}
      title=${{ doing: 'En cours', done: 'Terminé' }[st] || 'À venir'} onClick=${e => { e.stopPropagation(); cycle(d, c.id, ch.id); }}>${c.name}${st ? ' ' + STATUS_GLYPH[st] : ''}</button>`;
  })}`;
}

/* ---------- Calendrier ---------- */
function Calendar({ d, levels }) {
  const { weeks, blocks, over, nowWeek } = layout(d, levels);
  const wrap = useRef();
  const parts = d.settings.parts || [];
  const partOf = id => parts.find(p => p.id === id);
  useEffect(() => {
    const el = wrap.current && wrap.current.querySelector('.cal-now');
    if (el) wrap.current.scrollTop = Math.max(0, el.offsetTop - 140);
  }, [levels.join(',')]);
  const ab = d.etabs.find(e => e.ab && e.abRef);
  const gcol = i => i + 3;
  const vacSpan = w => { let n = 1; while (weeks[w.i + n]?.vac === w.vac) n++; return n; };
  return html`<div class="calwrap" ref=${wrap}><div class="cal" style=${{ gridTemplateColumns: `128px 34px repeat(${levels.length}, minmax(170px, 1fr))` }}>
    <div class="ch ch-w" style="grid-row:1;grid-column:1/3">Semaine</div>
    ${levels.map((lv, i) => html`<div class="ch" key=${lv} style=${{ gridRow: 1, gridColumn: gcol(i) }}>${lv}${over[lv] ? html` <span class="chip" title="Chapitres au-delà de la fin de l'année">+${over[lv]}</span>` : ''}</div>`)}
    ${weeks.map(w => {
      const r = 2 * w.i + 2, now = w.i === nowWeek, L = ab ? weekLetter(ab, w.monday) : null;
      return html`<div key=${'w' + w.i} class=${'cw' + (now ? ' cal-now' : '') + (w.vac ? ' vac' : '')} style=${{ gridRow: `${r} / span 2`, gridColumn: 1 }}>${fmtDateShort(w.start)} – ${fmtDateShort(w.end)}</div>
        <div class=${'cab' + (now ? ' cal-now2' : '')} style=${{ gridRow: `${r} / span 2`, gridColumn: 2 }}>${w.vac ? '' : L || ''}</div>
        <div class=${'cbg' + (now ? ' now' : '')} style=${{ gridRow: `${r} / span 2`, gridColumn: `3 / ${levels.length + 3}` }}></div>
        ${w.vac && weeks[w.i - 1]?.vac !== w.vac ? html`<div class="cvac" style=${{ gridRow: `${r} / span ${2 * vacSpan(w)}`, gridColumn: `3 / ${levels.length + 3}` }}>${w.vac}</div>` : null}`;
    })}
    ${levels.map((lv, i) => blocks[lv].map(b => {
      const p = partOf(b.ch.part), bg = p ? p.color : '#8a94a8';
      const late = nowWeek !== undefined && b.endWeek < nowWeek;
      return html`<div class=${'cblock' + (b.planned ? ' planned' : '') + (b.row1 - b.row0 < 2 ? ' short' : '') + (b.cont ? ' ct' : '') + (b.last === false ? ' cb' : '')} key=${b.ch.id + "-" + b.row0} style=${{ gridRow: `${b.row0 + 2} / ${b.row1 + 3}`, gridColumn: gcol(i), background: bg, color: textOn(bg) }}>
        <small>Chapitre ${b.n}${b.cont ? ' (suite)' : ''}</small><b>${b.ch.title}</b>
        ${b.last === false ? null : html`<div class="cps"><${Chips} d=${d} level=${lv} ch=${b.ch} late=${late} /></div>`}</div>`;
    }))}
  </div></div>`;
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
  return html`<div class="list chscroll">${list.map((ch, i) => {
    const p = parts.find(x => x.id === ch.part);
    return html`<div class="item chrow" key=${ch.id} style=${{ cursor: 'default', borderLeft: '6px solid ' + (p ? p.color : 'var(--line)') }}>
      <span class="muted chn">${i + 1}</span>
      <input class="inp grow" value=${ch.title} onInput=${e => set(ch.id, { title: e.target.value })} aria-label="Titre du chapitre" />
      <select class="inp" style="width:auto;max-width:210px" value=${ch.part || ''} onChange=${e => set(ch.id, { part: e.target.value })}><option value="">Sans partie</option>${parts.map(x => html`<option value=${x.id}>${x.name}</option>`)}</select>
      <select class="inp" style="width:auto" value=${ch.weeks || 1} onChange=${e => set(ch.id, { weeks: Number(e.target.value) })}>${WEEK_OPTS.map(w => html`<option value=${w}>${fmtW(w)} sem.</option>`)}</select>
      <span class="cps"><${Chips} d=${d} level=${level} ch=${ch} late=${false} /></span>
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
  const file = useRef();
  const level = levels.includes(lvl) ? lvl : levels[0];
  function addChapter() {
    if (!level) return;
    mutate(dd => dd.chapters.push({ id: uid(), level, title: 'Nouveau chapitre', weeks: 1, part: '' }));
  }
  async function onImport(e) {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (!o || !Array.isArray(o.chapters)) throw new Error('Fichier de chapitres non reconnu.');
      let n = 0;
      mutate(dd => {
        for (const c of o.chapters) {
          if (!c.level || !c.title || dd.chapters.some(x => x.level === c.level && x.title === c.title)) continue;
          const p = dd.settings.parts.find(x => x.name === c.part);
          dd.chapters.push({ id: uid(), level: c.level, title: c.title, weeks: Number(c.weeks) || 1, part: p ? p.id : '' }); n++;
        }
      });
      toast(n ? `${n} chapitres importés.` : 'Aucun nouveau chapitre.');
    } catch (err) { alert(err.message || err); }
  }
  return html`<div class="page fitcol">
    <div class="page-head">
      <div class="seg"><button class=${view === 'cal' ? 'on P' : ''} onClick=${() => setView('cal')}>Calendrier</button><button class=${view === 'list' ? 'on P' : ''} onClick=${() => setView('list')}>Chapitres</button></div>
      <span class="grow"></span>
      <button class="btn" onClick=${() => setParts(true)}>${Ico('layout')} Parties du programme</button>
      <button class="btn" onClick=${() => file.current.click()}>${Ico('download')} Importer des chapitres</button><input ref=${file} type="file" accept=".json,application/json" hidden onChange=${onImport} />
      ${view === 'list' ? html`<button class="btn primary" disabled=${!level} onClick=${addChapter}>${Ico('plus')} Ajouter un chapitre</button>` : null}</div>
    ${view === 'list' && levels.length ? html`<div class="tabs">${levels.map(l => html`<a key=${l} class=${l === level ? 'on' : ''} href="javascript:void 0" onClick=${e => { e.preventDefault(); setLvl(l); }}>${l} <span class="muted">(${chaptersOf(d, l).length})</span></a>`)}</div>` : null}
    ${!levels.length ? html`<${Empty} title="Aucune classe" />`
      : view === 'cal' ? (d.chapters.length ? html`<${Calendar} d=${d} levels=${levels.filter(l => chaptersOf(d, l).length)} />` : html`<${Empty} title="Aucun chapitre" />`)
      : html`<${ChapterList} d=${d} level=${level} />`}
    ${parts ? html`<${PartsModal} onClose=${() => setParts(false)} />` : null}
  </div>`;
}
