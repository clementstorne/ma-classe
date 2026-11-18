import { html } from '../../vendor/preact-htm.js';
import { useStore, mutate, defaultPeriods, weekLetter } from '../store.js';
import { Field, toast } from './common.js';
import { uid, iso, fromISO, addDays, mondayOf, fmtDateShort } from '../util.js';

/** Page de paramétrage des établissements : nom, découpage, dates des périodes, alternance A/B. */
export function Etabs({ embedded } = {}) {
  const d = useStore();
  const setEtab = (id, patch) => mutate(dd => Object.assign(dd.etabs.find(e => e.id === id), patch));
  const setPeriod = (eid, pid, patch) => mutate(dd => Object.assign(dd.etabs.find(e => e.id === eid).periods.find(p => p.id === pid), patch));

  function addPeriod(e) {
    const last = e.periods[e.periods.length - 1];
    const start = last ? iso(addDays(fromISO(last.end), 1)) : iso(new Date());
    mutate(dd => dd.etabs.find(x => x.id === e.id).periods.push({ id: uid(), name: `${e.type === 'semestre' ? 'Semestre' : 'Trimestre'} ${e.periods.length + 1}`, start, end: iso(addDays(fromISO(start), 90)) }));
  }
  function delPeriod(e, p) {
    if (e.periods.length <= 1) return toast('Il faut au moins une période');
    if (!confirm(`Supprimer « ${p.name} » ? Les appels et le suivi enregistrés ne sont pas effacés, mais ne seront plus rattachés à cette période.`)) return;
    mutate(dd => { const et = dd.etabs.find(x => x.id === e.id); et.periods = et.periods.filter(x => x.id !== p.id); });
  }
  function changeType(e, type) {
    if (type === e.type) return;
    if (confirm(`Passer « ${e.name} » en ${type}s ? Les périodes seront remplacées par des dates par défaut, à ajuster ensuite.`)) setEtab(e.id, { type, periods: defaultPeriods(type) });
  }
  function addEtab() {
    mutate(dd => dd.etabs.push({ id: uid(), name: 'Nouvel établissement', type: 'trimestre', periods: defaultPeriods('trimestre'), ab: false, abRef: '' }));
  }
  function delEtab(e) {
    const n = d.classes.filter(c => c.etabId === e.id).length;
    if (n) return alert(`Impossible : ${n} classe(s) sont rattachées à cet établissement. Change d'abord leur établissement (Classes → ⚙).`);
    if (d.etabs.length <= 1) return alert('Il faut conserver au moins un établissement.');
    if (confirm(`Supprimer l'établissement « ${e.name} » ?`)) mutate(dd => { dd.etabs = dd.etabs.filter(x => x.id !== e.id); });
  }
  /** Avertit des incohérences : fin avant début, chevauchement, trou entre deux périodes. */
  function issues(e) {
    const ps = [...e.periods].sort((a, b) => a.start.localeCompare(b.start)), out = [];
    ps.forEach((p, i) => {
      if (p.end < p.start) out.push(`« ${p.name} » : la fin précède le début.`);
      const nx = ps[i + 1];
      if (nx) {
        if (nx.start <= p.end) out.push(`« ${p.name} » et « ${nx.name} » se chevauchent.`);
        else if (fromISO(nx.start) - fromISO(p.end) > 864e5 * 31) out.push(`Plus d'un mois sans période entre « ${p.name} » et « ${nx.name} ».`);
      }
    });
    return out;
  }
  const thisMonday = mondayOf(new Date());

  return html`<div class=${embedded ? '' : 'page'} style=${embedded ? '' : 'max-width:860px'}>
    ${embedded ? html`<div class="row" style="margin-bottom:8px"><span class="grow"></span><button class="btn" onClick=${addEtab}>＋ Ajouter un établissement</button></div>` : html`<div class="page-head"><h1>Établissements</h1><span class="grow"></span><button class="btn" onClick=${addEtab}>＋ Ajouter un établissement</button></div>`}
    <p class="hint">Chaque classe est rattachée à un établissement : le suivi (oublis, travaux non faits, absences), les notes et les semaines A/B s'appuient sur ces paramètres.</p>
    ${d.etabs.map(e => {
      const warn = issues(e), nCl = d.classes.filter(c => c.etabId === e.id).length;
      return html`<div class="card col" style="margin-bottom:14px" key=${e.id}>
        <div class="row"><${Field} label="Nom de l'établissement"><input value=${e.name} onInput=${v => setEtab(e.id, { name: v.target.value })} /><//>
          <${Field} label="Découpage de l'année"><select value=${e.type} onChange=${v => changeType(e, v.target.value)}><option value="semestre">Semestres</option><option value="trimestre">Trimestres</option></select><//></div>
        <div class="muted small">${nCl} classe(s) rattachée(s)</div>
        <hr class="sep" />
        <b>Périodes</b>
        ${e.periods.map(p => html`<div class="row" key=${p.id}>
          <input class="inp" style="width:170px" value=${p.name} aria-label="Nom de la période" onInput=${v => setPeriod(e.id, p.id, { name: v.target.value })} />
          <span class="muted">du</span><input class="inp" style="width:auto" type="date" value=${p.start} onInput=${v => v.target.value && setPeriod(e.id, p.id, { start: v.target.value })} />
          <span class="muted">au</span><input class="inp" style="width:auto" type="date" value=${p.end} onInput=${v => v.target.value && setPeriod(e.id, p.id, { end: v.target.value })} />
          <button class="btn small ghost" aria-label="Supprimer la période" onClick=${() => delPeriod(e, p)}>🗑</button></div>`)}
        ${warn.map(w => html`<div class="small" style="color:var(--warn)">⚠ ${w}</div>`)}
        <div class="row"><button class="btn small" onClick=${() => addPeriod(e)}>＋ Ajouter une période</button>
          <button class="btn small ghost" onClick=${() => { if (confirm('Remplacer les périodes par les dates par défaut ?')) setEtab(e.id, { periods: defaultPeriods(e.type) }); }}>Dates par défaut</button></div>
        <hr class="sep" />
        <div class="row"><label class="row"><input type="checkbox" checked=${!!e.ab} onChange=${v => setEtab(e.id, { ab: v.target.checked, abRef: v.target.checked && !e.abRef ? iso(thisMonday) : e.abRef })} /> <b>Alternance de semaines A / B</b></label>
          ${e.ab ? html`<span>La semaine en cours est une semaine</span><select class="inp" style="width:auto" value=${weekLetter(e, thisMonday) || 'A'}
            onChange=${v => setEtab(e.id, { abRef: iso(v.target.value === 'A' ? thisMonday : addDays(thisMonday, -7)) })}><option value="A">A</option><option value="B">B</option></select>` : null}</div>
        <div class="row" style="justify-content:flex-end"><button class="btn small danger" onClick=${() => delEtab(e)}>Supprimer cet établissement</button></div>
      </div>`;
    })}
    <p class="hint">Les dates affichées par défaut sont des repères : remplace-les par celles du calendrier de chaque établissement.</p>
  </div>`;
}
