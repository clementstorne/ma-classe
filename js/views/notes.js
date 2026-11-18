import { html, useState } from '../../vendor/preact-htm.js';
import { useStore, mutate, studentsOf, groupsOf, etabOf, currentPeriod } from '../store.js';
import { studentStats } from '../logic.js';
import { Modal, Field, Empty, PeriodSelect, toast } from './common.js';
import { go } from '../router.js';
import { uid, todayISO, fmtNum, fmtDateShort, seatLabels, norm, splitFullName, classColor } from '../util.js';
import { readTable } from './importer.js';

const FIRST_W = 160, COL_W = 88;
const f1 = v => fmtNum(Math.round(v * 100) / 100);

/** Onglet « Notes » : toutes les notes de la période. Les notes issues d'une évaluation détaillée sont reprises
 *  automatiquement (lecture seule) ; les autres se saisissent à la main, colonne par colonne. */
export function NotesTab({ cls }) {
  const d = useStore();
  const etab = etabOf(d, cls);
  const cur = currentPeriod(etab);
  const [per, setPer] = useState(cur ? cur.id : 'all');
  const [grp, setGrp] = useState('');
  const [form, setForm] = useState(null);
  const [imp, setImp] = useState(false);
  const groups = groupsOf(cls);
  const classStuds = studentsOf(d, cls.id);
  const lab = seatLabels(classStuds);
  const studs = classStuds.filter(s => !grp || s.group === grp);
  const range = per === 'all' ? null : (etab.periods || []).find(p => p.id === per) || null;
  const inR = date => !range || (date >= range.start && date <= range.end);

  const cols = [
    ...d.evals.filter(e => e.classId === cls.id && inR(e.date)).map(ev => ({ kind: 'eval', id: ev.id, ev, date: ev.date, name: ev.name, max: ev.exercises.reduce((n, x) => n + x.questions.reduce((m, q) => m + q.max, 0), 0) })),
    ...(d.notes || []).filter(n => n.classId === cls.id && inR(n.date)).map(n => ({ kind: 'note', id: n.id, n, date: n.date, name: n.name, max: n.max })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'fr'));

  const coefOf = c => { const k = c.kind === 'eval' ? c.ev.coef : c.n.coef; return k === undefined ? 1 : k; };
  const value = (c, s) => {
    if (c.kind === 'eval') { const st = studentStats(c.ev, s.id, d.settings.comps, s); return st.absent ? 'abs' : st.note == null ? null : st.note; }
    const v = c.n.scores[s.id];
    return v === undefined ? null : v;
  };
  const avg = c => {
    const v = studs.map(s => value(c, s)).filter(x => typeof x === 'number');
    return v.length ? f1(v.reduce((a, b) => a + b, 0) / v.length) : '';
  };

  // Même règle que Pronote : (Σ note × coef) / (Σ barème × coef) × 20, sur les notes présentes (absents et cases vides ignorés).
  const moyenne = s => {
    let num = 0, den = 0;
    for (const c of cols) {
      const v = value(c, s), k = coefOf(c);
      if (typeof v !== 'number' || !(k > 0)) continue;
      const mx = c.kind === 'eval' ? studentStats(c.ev, s.id, d.settings.comps, s).noteMax : c.max;
      if (mx > 0) { num += v * k; den += mx * k; }
    }
    return den ? num / den * 20 : null;
  };
  const moys = studs.map(moyenne).filter(x => x != null);
  // Arrondi Pronote : au centième puis au dixième supérieur (vérifié sur un export réel, 30 élèves sur 30).
  const f10 = v => fmtNum(Math.ceil(Math.round(Math.round(v * 100) / 100 * 10 * 1000) / 1000) / 10);
  const moyClasse = moys.length ? f10(moys.reduce((a, b) => a + b, 0) / moys.length) : '';
  function setCoef(c, raw) {
    const x = raw.trim() === '' ? 1 : Number(raw.replace(',', '.'));
    if (!Number.isFinite(x) || x < 0) return false;
    mutate(dd => { const t = c.kind === 'eval' ? dd.evals.find(e => e.id === c.id) : dd.notes.find(n => n.id === c.id); t.coef = x; });
    return true;
  }
  function setScore(n, sid, raw) {
    raw = String(raw).trim().toLowerCase();
    let v;
    if (raw === '') v = null;
    else if (raw === 'abs' || raw === 'a') v = 'abs';
    else { const x = Number(raw.replace(',', '.')); if (!Number.isFinite(x) || x < 0) return false; v = x; }
    mutate(dd => { const t = dd.notes.find(x => x.id === n.id); if (v === null) delete t.scores[sid]; else t.scores[sid] = v; });
    return true;
  }
  function save() {
    const f = form, max = Number(String(f.max).replace(',', '.'));
    if (!f.name.trim() || !(max > 0)) return;
    mutate(dd => {
      if (f.id) Object.assign(dd.notes.find(x => x.id === f.id), { name: f.name.trim(), date: f.date, max });
      else dd.notes.push({ id: uid(), classId: cls.id, name: f.name.trim(), date: f.date, max, scores: {} });
    });
    setForm(null);
  }
  function del() {
    if (!confirm(`Supprimer la note « ${form.name} » et toutes les valeurs saisies ?`)) return;
    mutate(dd => { dd.notes = dd.notes.filter(x => x.id !== form.id); });
    setForm(null);
  }

  return html`<div class="row" style="margin-bottom:12px"><${PeriodSelect} etab=${etab} value=${per} onChange=${setPer} />
      ${groups.length ? html`<select class="inp" style="width:auto" value=${grp} onChange=${e => setGrp(e.target.value)}><option value="">Toute la classe</option>${groups.map(g => html`<option value=${g}>Groupe ${g}</option>`)}</select>` : null}
      <button class="btn primary" onClick=${() => setForm({ name: '', date: todayISO(), max: '20' })}>＋ Note</button>
      <button class="btn" onClick=${() => setImp(true)}>⬆ Importer (Pronote)</button></div>
    <p class="hint">Les notes des évaluations détaillées (onglet Évaluations) apparaissent ici automatiquement, avec leur note en points (ramenée sur 20 seulement pour les élèves avec aménagement). Les autres notes se saisissent directement dans la colonne (« A » pour un absent). La ligne « Coef. » règle le coefficient de chaque note ; la moyenne (sur 20) se calcule et s'arrondit comme dans Pronote (total des points pondérés rapporté au total des barèmes pondérés, arrondi au dixième supérieur) ; les absents sont ignorés.</p>
    ${!studs.length ? html`<${Empty} title="Aucun élève" />`
    : !cols.length ? html`<${Empty} title="Aucune note sur cette période"><p>Ajoute une note avec « ＋ Note », ou crée une évaluation détaillée.</p><//>`
    : html`<div class="gridwrap"><table class="g notes" style=${{ width: (FIRST_W + (cols.length + 1) * COL_W) + 'px', '--cc': classColor(cls) }}>
      <colgroup><col style=${{ width: FIRST_W + 'px' }} /><col style=${{ width: COL_W + 'px' }} />${cols.map(() => html`<col style=${{ width: COL_W + 'px' }} />`)}</colgroup>
      <thead><tr><th class="stk">Élève</th><th class="moy" style="height:58px">Moyenne<br /><small>/20</small></th>${cols.map(c => html`<th key=${c.id} style="height:58px;cursor:pointer;line-height:1.25"
          onClick=${() => c.kind === 'eval' ? go('/eval/' + c.id) : setForm({ id: c.id, name: c.name, date: c.date, max: String(c.max) })}
          title=${c.kind === 'eval' ? 'Ouvrir l\'évaluation' : 'Modifier la note'}>
          <div style="overflow:hidden;text-overflow:ellipsis">${c.kind === 'eval' ? '📋 ' : ''}${c.name}</div>
          <small class="muted">${fmtDateShort(c.date)} · /${fmtNum(c.max)}</small></th>`)}</tr>
        <tr><th class="stk" style="height:36px">Coef.</th><th class="moy" style="height:36px"></th>${cols.map(c => html`<th key=${c.id + coefOf(c)} style="height:36px;padding:0"><input class="cellin" style="min-height:34px" inputmode="decimal" defaultValue=${fmtNum(coefOf(c))} aria-label=${'Coefficient ' + c.name}
          onFocus=${e => e.target.select()} onBlur=${e => { if (!setCoef(c, e.target.value)) e.target.classList.add('bad'); }} onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); }} /></th>`)}</tr></thead>
      <tbody>${studs.map(s => html`<tr key=${s.id}><th class="stk">${lab[s.id]}</th><td class="moy">${(m => m == null ? '' : f10(m))(moyenne(s))}</td>${cols.map(c => {
        const v = value(c, s), mx = c.kind === 'eval' ? studentStats(c.ev, s.id, d.settings.comps, s).noteMax : c.max;
        const sfx = typeof v === 'number' ? html`<span class="mxa">/${fmtNum(mx)}</span>` : null;
        if (c.kind === 'eval') return html`<td class="cw ev" style="cursor:pointer" onClick=${() => go('/eval/' + c.id)}>${v === 'abs' ? 'Abs' : v == null ? '' : f1(v)}${sfx}</td>`;
        return html`<td class="cw" key=${c.id + s.id + v}><input class="cellin" inputmode="decimal" defaultValue=${v === 'abs' ? 'Abs' : v == null ? '' : fmtNum(v)} aria-label=${c.name + ' ' + lab[s.id]}
          onFocus=${e => e.target.select()}
          onBlur=${e => { if (!setScore(c.n, s.id, e.target.value)) e.target.classList.add('bad'); }}
          onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); const t = e.target.closest('tr').nextElementSibling; const i = e.target.closest('td').cellIndex; const nx = t && t.cells[i] && t.cells[i].querySelector('input'); e.target.blur(); if (nx) nx.focus(); } }} />${sfx}</td>`;
      })}</tr>`)}</tbody>
      <tfoot><tr><th class="stk">Moyenne</th><td class="moy">${moyClasse}</td>${cols.map(c => html`<td>${avg(c)}</td>`)}</tr></tfoot></table></div>`}
    ${imp ? html`<${PronoteImport} cls=${cls} onClose=${() => setImp(false)} onDone=${() => setPer('all')} />` : null}
    ${form ? html`<${Modal} title=${form.id ? 'Modifier la note' : 'Nouvelle note'} onClose=${() => setForm(null)}
      foot=${html`${form.id ? html`<button class="btn danger" onClick=${del}>Supprimer</button>` : null}<span class="grow"></span><button class="btn" onClick=${() => setForm(null)}>Annuler</button><button class="btn primary" onClick=${save}>Enregistrer</button>`}>
      <${Field} label="Nom (ex. Interro, Leçon, Oral…)"><input value=${form.name} autofocus onInput=${e => setForm({ ...form, name: e.target.value })} /><//>
      <div class="row"><${Field} label="Date"><input type="date" value=${form.date} onInput=${e => setForm({ ...form, date: e.target.value })} /><//>
        <${Field} label="Sur"><input inputmode="decimal" style="width:90px" value=${form.max} onInput=${e => setForm({ ...form, max: e.target.value })} /><//></div><//>` : null}`;
}

/* ---------- Import d'un export de notes Pronote (CSV / Excel) ---------- */
const num = s => { const x = Number(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
function schoolDate(txt) {
  const m = String(txt).trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  const day = +m[1], mon = +m[2];
  let y = m[3] ? +m[3] : null;
  if (y != null && y < 100) y += 2000;
  if (y == null) { const n = new Date(), start = n.getMonth() >= 7 ? n.getFullYear() : n.getFullYear() - 1; y = mon >= 8 ? start : start + 1; }
  return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function parsePronote(rows) {
  const head = rows[0] || [];
  const dcols = head.map((h, j) => (j >= 1 && schoolDate(h)) ? j : -1).filter(j => j >= 0);
  if (!dcols.length) throw new Error('Aucune colonne de date trouvée (ligne 1 : 10/09, 17/09…). Est-ce bien un export de notes Pronote ?');
  const meta = rows.slice(1).find(r => !String(r[0] || '').trim() && dcols.some(j => /\d/.test(String(r[j] || ''))));
  const devoirs = dcols.map(j => {
    const m = String((meta && meta[j]) || '').trim().match(/^(\d+(?:[.,]\d+)?)?\s*(?:-?\s*\/\s*(\d+(?:[.,]\d+)?))?$/);
    return { j, date: schoolDate(head[j]), coef: m && m[1] ? num(m[1]) : 1, max: m && m[2] ? num(m[2]) : 20, scores: {}, n: 0 };
  });
  const studs = [];
  for (const r of rows.slice(1)) {
    const name = String(r[0] || '').trim();
    if (!name || r === meta || /élèves?\s*$/i.test(name) || /^moyenne/i.test(name)) continue;
    const st = { raw: name, ...splitFullName(name), vals: {} };
    for (const dv of devoirs) {
      const v = String(r[dv.j] ?? '').trim();
      if (!v) continue;
      if (/^abs/i.test(v)) st.vals[dv.j] = 'abs';
      else { const x = num(v); if (x != null) st.vals[dv.j] = x; }
    }
    studs.push(st);
  }
  for (const dv of devoirs) dv.n = studs.filter(s => s.vals[dv.j] !== undefined).length;
  return { devoirs, studs };
}
function PronoteImport({ cls, onClose, onDone }) {
  const d = useStore();
  const [data, setData] = useState(null);
  const [sel, setSel] = useState({});
  const [addMissing, setAddMissing] = useState(false);
  const [err, setErr] = useState('');
  const classStuds = studentsOf(d, cls.id);
  const find = (list, h) => list.find(s => norm(s.nom + ' ' + s.prenom) === norm(h.nom + ' ' + h.prenom));
  const hasScores = o => Object.keys(o.scores || {}).length > 0;
  const conflict = dv => d.evals.some(e => e.classId === cls.id && e.date === dv.date && hasScores(e)) || d.notes.some(n => n.classId === cls.id && n.date === dv.date && hasScores(n));
  const missing = data ? data.studs.filter(h => !find(classStuds, h)) : [];

  async function onFile(e) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const r = parsePronote(await readTable(f));
      setErr(''); setData(r); setSel(Object.fromEntries(r.devoirs.map(x => [x.j, x.n > 0 && !conflict(x)])));
      setAddMissing(!classStuds.length);
    } catch (x) { setErr(String(x.message || x)); }
  }
  function doImport() {
    let created = 0, updated = 0, skipped = 0;
    mutate(dd => {
      const cs = dd.students.filter(s => s.classId === cls.id);
      const ids = {};
      for (const h of data.studs) {
        let st = find(cs, h);
        if (!st && addMissing) { st = { id: uid(), classId: cls.id, nom: h.nom, prenom: h.prenom, amenagement: '', hasPhoto: false }; dd.students.push(st); cs.push(st); }
        if (st) ids[h.raw] = st.id;
      }
      for (const dv of data.devoirs) {
        if (!sel[dv.j]) continue;
        const name = 'Note du ' + dv.date.slice(8) + '/' + dv.date.slice(5, 7);
        // un devoir déjà noté à cette date n'est jamais écrasé
        if (dd.evals.some(e => e.classId === cls.id && e.date === dv.date && hasScores(e)) || dd.notes.some(x => x.classId === cls.id && x.date === dv.date && hasScores(x))) { skipped++; continue; }
        let n = dd.notes.find(x => x.classId === cls.id && x.date === dv.date);
        if (n) updated++; else { n = { id: uid(), classId: cls.id, name, date: dv.date, max: dv.max, coef: dv.coef, scores: {} }; dd.notes.push(n); created++; }
        n.max = dv.max; n.coef = dv.coef;
        for (const h of data.studs) if (ids[h.raw] && h.vals[dv.j] !== undefined) n.scores[ids[h.raw]] = h.vals[dv.j];
      }
    });
    toast(`${created} note(s) créée(s)` + (updated ? `, ${updated} colonne(s) vide(s) complétée(s)` : '') + (skipped ? `, ${skipped} ignorée(s) (déjà des notes à cette date)` : '') + '.');
    onDone && onDone();
    onClose();
  }
  return html`<${Modal} title="Importer des notes depuis Pronote" onClose=${onClose} wide
    foot=${data ? html`<span class="grow"></span><button class="btn primary" onClick=${doImport} disabled=${!Object.values(sel).some(Boolean)}>Importer</button>` : null}>
    <p class="hint" style="margin:0">Dans Pronote, exporte les notes de la classe (CSV ou Excel), puis charge le fichier. La date, le barème (total des points) et le coefficient de chaque devoir sont repris, ainsi que les notes de chaque élève.</p>
    <input type="file" accept=".csv,.txt,.tsv,.xls,.xlsx" onChange=${onFile} />
    ${err ? html`<p class="chip bad" style="white-space:normal">${err}</p>` : null}
    ${data ? html`
      <div class="gridwrap"><table class="g" style="width:100%;table-layout:auto"><thead><tr><th></th><th>Date</th><th>Barème</th><th>Coef.</th><th>Notes</th></tr></thead>
        <tbody>${data.devoirs.map(x => html`<tr key=${x.j}><td><input type="checkbox" disabled=${conflict(x)} checked=${!!sel[x.j]} onChange=${e => setSel({ ...sel, [x.j]: e.target.checked })} aria-label="Importer" /></td>
          <td>${fmtDateShort(x.date)}</td><td>/${fmtNum(x.max)}</td><td>${fmtNum(x.coef)}</td><td>${conflict(x) ? html`<span class="chip">déjà des notes à cette date</span>` : x.n ? x.n + ' / ' + data.studs.length : html`<span class="muted">aucune</span>`}</td></tr>`)}</tbody></table></div>
      <p style="margin:0"><b>${data.studs.length - missing.length}</b> élève(s) sur ${data.studs.length} reconnu(s) dans la classe ${cls.name}.</p>
      ${missing.length ? html`<label class="row" style="gap:8px"><input type="checkbox" checked=${addMissing} onChange=${e => setAddMissing(e.target.checked)} />
        Ajouter les ${missing.length} élève(s) manquant(s) à la classe</label>
        <p class="hint" style="margin:0">Non reconnus : ${missing.slice(0, 8).map(h => h.raw).join(', ')}${missing.length > 8 ? '…' : ''}</p>` : null}
      <p class="hint" style="margin:0">Les colonnes sans aucune note sont décochées. Un devoir déjà noté à la même date (note ou évaluation) n'est jamais écrasé : il est ignoré.</p>` : null}<//>`;
}
