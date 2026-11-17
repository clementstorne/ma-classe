import { html, useState } from '../../vendor/preact-htm.js';
import { useStore, mutate, classById, studentsOf, etabOf, currentPeriod, getPlan, sessionKey, roomById } from '../store.js';
import { Modal, Field, Avatar, Empty, PeriodSelect, ColorPicker, toast } from './common.js';
import { StudentSheet } from './student.js';
import { RosterImport, PhotoBatch, EvalImport } from './importer.js';
import { uid, CLASS_COLORS, classColor, fmtDateLong, fmtDateShort, todayISO, displayName, download, fmtNum } from '../util.js';
import { suiviStats, evalAverage } from '../logic.js';
import { go } from '../router.js';

export function ClassList() {
  const d = useStore();
  const [form, setForm] = useState(null);
  function save() {
    if (!form.name.trim()) return;
    mutate(dd => {
      if (form.id) Object.assign(dd.classes.find(c => c.id === form.id), { name: form.name.trim(), etabId: form.etabId, color: form.color });
      else dd.classes.push({ id: uid(), name: form.name.trim(), etabId: form.etabId, color: form.color });
    });
    setForm(null);
  }
  return html`<div class="page">
    <div class="page-head"><h1>Classes</h1><span class="grow"></span>
      <button class="btn primary" onClick=${() => setForm({ name: '', etabId: d.etabs[0].id, color: CLASS_COLORS[d.classes.length % CLASS_COLORS.length] })}>＋ Nouvelle classe</button></div>
    ${!d.classes.length ? html`<${Empty} title="Aucune classe">
      <p>Crée une classe puis importe ses élèves (CSV / Excel / copier-coller).</p><//>` : null}
    ${d.etabs.map(e => {
      const cs = d.classes.filter(c => c.etabId === e.id);
      if (!cs.length) return null;
      return html`<h3 style="margin:16px 0 8px">${e.name}</h3><div class="cards">${cs.map(c => html`
        <a class="card class-card" href=${'#/class/' + c.id + '/eleves'} style=${{ '--c': classColor(c) }}>
          <b>${c.name}</b><span class="muted">${d.students.filter(s => s.classId === c.id).length} élèves</span></a>`)}</div>`;
    })}
    ${form ? html`<${Modal} title=${form.id ? 'Modifier la classe' : 'Nouvelle classe'} onClose=${() => setForm(null)}
      foot=${html`<button class="btn" onClick=${() => setForm(null)}>Annuler</button><button class="btn primary" onClick=${save}>Enregistrer</button>`}>
      <${Field} label="Nom de la classe"><input value=${form.name} placeholder="ex. 4C" onInput=${e => setForm({ ...form, name: e.target.value })} /><//>
      <${Field} label="Établissement"><select value=${form.etabId} onChange=${e => setForm({ ...form, etabId: e.target.value })}>
        ${d.etabs.map(e => html`<option value=${e.id}>${e.name} (${e.type}s)</option>`)}</select><//>
      <${Field} label="Couleur"><${ColorPicker} value=${form.color} onChange=${c => setForm({ ...form, color: c })} /><//><//>` : null}
  </div>`;
}

export function ClassFolder({ id, tab, q }) {
  const d = useStore();
  const cls = classById(d, id);
  const [sheet, setSheet] = useState(null);
  const [imp, setImp] = useState(false), [photos, setPhotos] = useState(false), [evImp, setEvImp] = useState(false);
  const [edit, setEdit] = useState(null);
  const [addStu, setAddStu] = useState(null);
  if (!cls) return html`<${Empty} title="Classe introuvable"><a class="btn" href="#/classes">Retour</a><//>`;
  const studs = studentsOf(d, id);
  const slot = q.slot && d.slots.find(s => s.id === q.slot);
  const T = (k, label) => html`<a class=${tab === k ? 'on' : ''} href=${'#/class/' + id + '/' + k + (q.date ? `?date=${q.date}&slot=${q.slot || ''}` : '')}>${label}</a>`;
  const room = slot && roomById(d, slot.roomId);
  const apLink = (date, slotId) => `/appel/${id}/${date}/${slotId || 'x'}`;
  const se = q.date && d.sessions[sessionKey(id, q.date, q.slot)];

  function saveClass() {
    if (edit.del) { if (!confirm(`Supprimer la classe ${cls.name} et toutes ses données (élèves, notes, appels) ?`)) return; mutate(dd => {
      const ids = new Set(dd.students.filter(s => s.classId === id).map(s => s.id));
      dd.classes = dd.classes.filter(c => c.id !== id); dd.students = dd.students.filter(s => s.classId !== id);
      dd.slots = dd.slots.filter(s => s.classId !== id); dd.events = dd.events.filter(e => e.classId !== id); dd.evals = dd.evals.filter(e => e.classId !== id);
      for (const k of Object.keys(dd.sessions)) if (dd.sessions[k].classId === id) delete dd.sessions[k];
      for (const k of Object.keys(dd.plans)) if (k.startsWith(id + '|')) delete dd.plans[k];
    }); setEdit(null); go('/classes'); return; }
    mutate(dd => Object.assign(dd.classes.find(c => c.id === id), { name: edit.name.trim() || cls.name, etabId: edit.etabId, color: edit.color }));
    setEdit(null);
  }
  function newStudent() {
    if (!addStu.nom.trim()) return;
    mutate(dd => dd.students.push({ id: uid(), classId: id, nom: addStu.nom.trim().toUpperCase(), prenom: addStu.prenom.trim(), amenagement: '', hasPhoto: false }));
    setAddStu(null);
  }

  return html`<div class="page">
    <div class="page-head"><a class="btn ghost" href="#/classes">‹ Classes</a><span class="dot" style=${{ background: classColor(cls) }}></span><h1>${cls.name}</h1>
      <span class="sub">${studs.length} élèves · ${etabOf(d, cls).name}</span><span class="grow"></span>
      <button class="btn small" onClick=${() => setEdit({ name: cls.name, etabId: cls.etabId, color: classColor(cls) })}>⚙ Classe</button></div>
    ${q.date ? html`<div class="banner"><div class="grow"><b>Séance du ${fmtDateLong(q.date)}</b>
        <div class="muted">${slot ? slot.start + '–' + slot.end : ''}${room ? ' · ' + room.name : ''}${se && se.validated ? ' · appel fait ✓' : ''}</div></div>
      <button class="btn primary" onClick=${() => go(apLink(q.date, q.slot))}>${se && se.validated ? 'Revoir l\'appel' : 'Faire l\'appel'}</button>
      ${room ? html`<a class="btn" href=${'#/plan/' + id + '/' + room.id}>Plan de classe</a>` : null}</div>`
      : html`<div class="row" style="margin-bottom:12px"><button class="btn" onClick=${() => go(apLink(todayISO(), null))}>Faire l'appel aujourd'hui (hors créneau)</button></div>`}
    <div class="tabs">${T('eleves', 'Élèves')}${T('suivi', 'Suivi')}${T('notes', 'Notes')}${T('plans', 'Plans de classe')}</div>
    ${tab === 'suivi' ? html`<${Suivi} cls=${cls} studs=${studs} onOpen=${setSheet} />`
      : tab === 'notes' ? html`<${NotesList} cls=${cls} studs=${studs} onImport=${() => setEvImp(true)} />`
      : tab === 'plans' ? html`<${PlansList} cls=${cls} />`
      : html`<div class="row" style="margin-bottom:12px"><button class="btn primary" onClick=${() => setImp(true)}>⬆ Importer une liste</button>
          <button class="btn" onClick=${() => setAddStu({ nom: '', prenom: '' })}>＋ Ajouter un élève</button>
          <button class="btn" onClick=${() => setPhotos(true)}>📷 Photos en lot</button></div>
        ${!studs.length ? html`<${Empty} title="Aucun élève"><p>Importe un fichier CSV/Excel ou colle une liste.</p><//>`
        : html`<div class="list roster">${studs.map(s => html`<div class="item" key=${s.id} onClick=${() => setSheet(s.id)}>
          <${Avatar} s=${s} size=${44} /><div class="nm"><b>${s.nom}</b> ${s.prenom}${s.amenagement ? html`<div class="small" style="color:var(--warn)">★ ${s.amenagement}</div>` : null}</div><span class="muted">›</span></div>`)}</div>`}`}
    ${sheet ? html`<${StudentSheet} sid=${sheet} onClose=${() => setSheet(null)} />` : null}
    ${imp ? html`<${RosterImport} classId=${id} onClose=${() => setImp(false)} />` : null}
    ${photos ? html`<${PhotoBatch} classId=${id} onClose=${() => setPhotos(false)} />` : null}
    ${evImp ? html`<${EvalImport} classId=${id} onClose=${() => setEvImp(false)} />` : null}
    ${addStu ? html`<${Modal} title="Nouvel élève" onClose=${() => setAddStu(null)} foot=${html`<button class="btn primary" onClick=${newStudent}>Ajouter</button>`}>
      <${Field} label="Nom"><input value=${addStu.nom} onInput=${e => setAddStu({ ...addStu, nom: e.target.value })} /><//>
      <${Field} label="Prénom"><input value=${addStu.prenom} onInput=${e => setAddStu({ ...addStu, prenom: e.target.value })} /><//><//>` : null}
    ${edit ? html`<${Modal} title="Paramètres de la classe" onClose=${() => setEdit(null)}
      foot=${html`<button class="btn danger" onClick=${() => { edit.del = true; saveClass(); }}>Supprimer la classe</button><span class="grow"></span><button class="btn primary" onClick=${saveClass}>Enregistrer</button>`}>
      <${Field} label="Nom"><input value=${edit.name} onInput=${e => setEdit({ ...edit, name: e.target.value })} /><//>
      <${Field} label="Établissement"><select value=${edit.etabId} onChange=${e => setEdit({ ...edit, etabId: e.target.value })}>${d.etabs.map(e => html`<option value=${e.id}>${e.name}</option>`)}</select><//>
      <${Field} label="Couleur de la classe"><${ColorPicker} value=${edit.color} onChange=${c => setEdit({ ...edit, color: c })} /><//><//>` : null}
  </div>`;
}

function Suivi({ cls, studs, onOpen }) {
  const d = useStore();
  const etab = etabOf(d, cls);
  const cur = currentPeriod(etab);
  const [per, setPer] = useState(cur ? cur.id : 'all');
  const [sort, setSort] = useState('nom');
  const range = per === 'all' ? null : (etab.periods.find(p => p.id === per) || null);
  const by = suiviStats(d, cls.id, studs.map(s => s.id), range);
  const th = d.settings.threshold;
  const rows = [...studs].sort((a, b) => sort === 'nom' ? 0 : (by[b.id][sort] - by[a.id][sort]));
  const tot = k => studs.reduce((n, s) => n + by[s.id][k], 0);
  const cell = v => html`<td class=${v >= th ? 'hot' : v === th - 1 && th > 1 ? 'warm' : ''}>${v || '·'}</td>`;
  function csv() {
    const L = [['Nom', 'Prénom', 'Travail non fait', 'Oublis matériel', 'Absences', 'Retards'].join(';')];
    for (const s of studs) L.push([s.nom, s.prenom, by[s.id].dev, by[s.id].mat, by[s.id].abs, by[s.id].ret].join(';'));
    download(new Blob(['﻿' + L.join('\n')], { type: 'text/csv' }), `suivi-${cls.name}.csv`);
  }
  return html`<div class="row" style="margin-bottom:10px"><${PeriodSelect} etab=${etab} value=${per} onChange=${setPer} />
      <span class="hint">Seuil d'alerte : ${th} (modifiable dans les réglages)</span><span class="grow"></span><button class="btn small" onClick=${csv}>⬇ CSV</button></div>
    <div class="table-wrap"><table class="t"><thead><tr><th onClick=${() => setSort('nom')}>Élève</th>
      <th onClick=${() => setSort('dev')}>📝 Travail non fait</th><th onClick=${() => setSort('mat')}>🎒 Oublis matériel</th>
      <th onClick=${() => setSort('abs')}>🚫 Absences</th><th onClick=${() => setSort('ret')}>⏰ Retards</th></tr></thead>
      <tbody>${rows.map(s => html`<tr class="clk" key=${s.id} onClick=${() => onOpen(s.id)}><td>${displayName(s)}</td>${cell(by[s.id].dev)}${cell(by[s.id].mat)}${cell(by[s.id].abs)}${cell(by[s.id].ret)}</tr>`)}
      <tr><td><b>Total</b></td><td><b>${tot('dev')}</b></td><td><b>${tot('mat')}</b></td><td><b>${tot('abs')}</b></td><td><b>${tot('ret')}</b></td></tr></tbody></table></div>
    <p class="hint">Touche un titre de colonne pour trier, une ligne pour ouvrir la fiche de l'élève.</p>`;
}

function NotesList({ cls, studs, onImport }) {
  const d = useStore();
  const evs = d.evals.filter(e => e.classId === cls.id).sort((a, b) => b.date.localeCompare(a.date));
  const etab = etabOf(d, cls);
  function create() {
    const ev = { id: uid(), classId: cls.id, name: 'Nouvelle évaluation', date: todayISO(), scores: {},
      exercises: [{ id: uid(), title: 'Exercice 1', questions: [{ id: uid(), label: '1', max: 1, comps: [] }] }] };
    mutate(dd => dd.evals.push(ev));
    go(`/eval/${ev.id}?edit=1`);
  }
  return html`<div class="row" style="margin-bottom:12px"><button class="btn primary" onClick=${create}>＋ Nouvelle évaluation</button>
    <button class="btn" onClick=${onImport}>⬆ Importer depuis Excel</button></div>
    ${!evs.length ? html`<${Empty} title="Aucune évaluation"><p>Crée une évaluation et saisis le détail des points question par question.</p><//>`
    : html`<div class="list">${evs.map(ev => {
        const avg = evalAverage(ev, studs.map(s => s.id), d.settings.comps);
        const per = (etab.periods || []).find(p => ev.date >= p.start && ev.date <= p.end);
        return html`<div class="item" key=${ev.id} onClick=${() => go('/eval/' + ev.id)}><div class="grow"><b>${ev.name}</b>
          <div class="muted small">${fmtDateShort(ev.date)}${per ? ' · ' + per.name : ''} · ${ev.exercises.reduce((n, x) => n + x.questions.length, 0)} questions</div></div>
          <span class="chip">${avg == null ? 'pas de note' : 'moy. ' + fmtNum(avg) + '/20'}</span><span class="muted">›</span></div>`;
      })}</div>`}`;
}

function PlansList({ cls }) {
  const d = useStore();
  return html`<div class="list">${d.rooms.map(r => {
    const p = getPlan(d, cls.id, r.id);
    const n = Object.values(p.seatMap).filter(sid => d.students.some(s => s.id === sid)).length;
    return html`<div class="item" key=${r.id} onClick=${() => go(`/plan/${cls.id}/${r.id}`)}><div class="grow"><b>${r.name}</b>
      <div class="muted small">${r.items.filter(i => i.kind === 'seat').length} places · ${n} élève(s) placé(s)</div></div><span class="muted">›</span></div>`;
  })}</div><p class="hint">Les salles se gèrent dans les réglages.</p>`;
}
