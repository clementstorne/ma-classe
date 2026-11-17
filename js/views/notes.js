import { html, useState } from '../../vendor/preact-htm.js';
import { useStore, mutate, studentsOf, groupsOf, etabOf, currentPeriod } from '../store.js';
import { studentStats } from '../logic.js';
import { Modal, Field, Empty, PeriodSelect } from './common.js';
import { go } from '../router.js';
import { uid, todayISO, fmtNum, fmtDateShort, seatLabels } from '../util.js';

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
  const groups = groupsOf(cls);
  const classStuds = studentsOf(d, cls.id);
  const lab = seatLabels(classStuds);
  const studs = classStuds.filter(s => !grp || s.group === grp);
  const range = per === 'all' ? null : (etab.periods || []).find(p => p.id === per) || null;
  const inR = date => !range || (date >= range.start && date <= range.end);

  const cols = [
    ...d.evals.filter(e => e.classId === cls.id && inR(e.date)).map(ev => ({ kind: 'eval', id: ev.id, ev, date: ev.date, name: ev.name, max: 20 })),
    ...(d.notes || []).filter(n => n.classId === cls.id && inR(n.date)).map(n => ({ kind: 'note', id: n.id, n, date: n.date, name: n.name, max: n.max })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'fr'));

  const coefOf = c => { const k = c.kind === 'eval' ? c.ev.coef : c.n.coef; return k === undefined ? 1 : k; };
  const value = (c, s) => {
    if (c.kind === 'eval') { const st = studentStats(c.ev, s.id, d.settings.comps, s); return st.absent ? 'abs' : st.note20 == null ? null : st.note20; }
    const v = c.n.scores[s.id];
    return v === undefined ? null : v;
  };
  const avg = c => {
    const v = studs.map(s => value(c, s)).filter(x => typeof x === 'number');
    return v.length ? f1(v.reduce((a, b) => a + b, 0) / v.length) : '';
  };

  const on20 = (c, v) => typeof v === 'number' ? v / c.max * 20 : null;
  const moyenne = s => {
    let num = 0, den = 0;
    for (const c of cols) { const v = on20(c, value(c, s)), k = coefOf(c); if (v != null && k > 0) { num += v * k; den += k; } }
    return den ? num / den : null;
  };
  const moys = studs.map(moyenne).filter(x => x != null);
  const moyClasse = moys.length ? f1(moys.reduce((a, b) => a + b, 0) / moys.length) : '';
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
      <button class="btn primary" onClick=${() => setForm({ name: '', date: todayISO(), max: '20' })}>＋ Note</button></div>
    <p class="hint">Les notes des évaluations détaillées (onglet Évaluations) apparaissent ici automatiquement, sur 20. Les autres notes se saisissent directement dans la colonne (« A » pour un absent). La ligne « Coef. » règle le coefficient de chaque note ; la moyenne est pondérée et les absents sont ignorés.</p>
    ${!studs.length ? html`<${Empty} title="Aucun élève" />`
    : !cols.length ? html`<${Empty} title="Aucune note sur cette période"><p>Ajoute une note avec « ＋ Note », ou crée une évaluation détaillée.</p><//>`
    : html`<div class="gridwrap"><table class="g" style=${{ width: (FIRST_W + (cols.length + 1) * COL_W) + 'px' }}>
      <colgroup><col style=${{ width: FIRST_W + 'px' }} />${cols.map(() => html`<col style=${{ width: COL_W + 'px' }} />`)}<col style=${{ width: COL_W + 'px' }} /></colgroup>
      <thead><tr><th class="stk">Élève</th>${cols.map(c => html`<th key=${c.id} style="height:58px;cursor:pointer;line-height:1.25"
          onClick=${() => c.kind === 'eval' ? go('/eval/' + c.id) : setForm({ id: c.id, name: c.name, date: c.date, max: String(c.max) })}
          title=${c.kind === 'eval' ? 'Ouvrir l\'évaluation' : 'Modifier la note'}>
          <div style="overflow:hidden;text-overflow:ellipsis">${c.kind === 'eval' ? '📋 ' : ''}${c.name}</div>
          <small class="muted">${fmtDateShort(c.date)} · /${fmtNum(c.max)}</small></th>`)}<th class="tot" style="height:58px">Moy.<br /><small class="muted">/20</small></th></tr>
        <tr><th class="stk" style="height:36px">Coef.</th>${cols.map(c => html`<th key=${c.id + coefOf(c)} style="height:36px;padding:0"><input class="cellin" style="min-height:34px" inputmode="decimal" defaultValue=${fmtNum(coefOf(c))} aria-label=${'Coefficient ' + c.name}
          onFocus=${e => e.target.select()} onBlur=${e => { if (!setCoef(c, e.target.value)) e.target.classList.add('bad'); }} onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); }} /></th>`)}<th class="tot" style="height:36px"></th></tr></thead>
      <tbody>${studs.map(s => html`<tr key=${s.id}><th class="stk">${lab[s.id]}</th>${cols.map(c => {
        const v = value(c, s);
        if (c.kind === 'eval') return html`<td class="tot" style="cursor:pointer" onClick=${() => go('/eval/' + c.id)}>${v === 'abs' ? 'Abs' : v == null ? '' : f1(v)}</td>`;
        return html`<td key=${c.id + s.id + v}><input class="cellin" inputmode="decimal" defaultValue=${v === 'abs' ? 'Abs' : v == null ? '' : fmtNum(v)} aria-label=${c.name + ' ' + lab[s.id]}
          onFocus=${e => e.target.select()}
          onBlur=${e => { if (!setScore(c.n, s.id, e.target.value)) e.target.classList.add('bad'); }}
          onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); const t = e.target.closest('tr').nextElementSibling; const i = e.target.closest('td').cellIndex; const nx = t && t.cells[i] && t.cells[i].querySelector('input'); e.target.blur(); if (nx) nx.focus(); } }} /></td>`;
      })}<td class="tot">${(m => m == null ? '' : f1(m))(moyenne(s))}</td></tr>`)}</tbody>
      <tfoot><tr><th class="stk">Moyenne</th>${cols.map(c => html`<td>${avg(c)}</td>`)}<td class="tot">${moyClasse}</td></tr></tfoot></table></div>`}
    ${form ? html`<${Modal} title=${form.id ? 'Modifier la note' : 'Nouvelle note'} onClose=${() => setForm(null)}
      foot=${html`${form.id ? html`<button class="btn danger" onClick=${del}>Supprimer</button>` : null}<span class="grow"></span><button class="btn" onClick=${() => setForm(null)}>Annuler</button><button class="btn primary" onClick=${save}>Enregistrer</button>`}>
      <${Field} label="Nom (ex. Interro, Leçon, Oral…)"><input value=${form.name} autofocus onInput=${e => setForm({ ...form, name: e.target.value })} /><//>
      <div class="row"><${Field} label="Date"><input type="date" value=${form.date} onInput=${e => setForm({ ...form, date: e.target.value })} /><//>
        <${Field} label="Sur"><input inputmode="decimal" style="width:90px" value=${form.max} onInput=${e => setForm({ ...form, max: e.target.value })} /><//></div><//>` : null}`;
}
