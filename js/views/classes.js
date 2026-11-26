import { html, useState } from '../../vendor/preact-htm.js';
import { useStore, mutate, sortedClasses, roomsFor, classById, studentsOf, groupsOf, etabOf, currentPeriod, getPlan, sessionKey, roomById, occurrence, KINDS, PROJET_COLOR, kindsOf } from '../store.js';
import { planKey, parsePlanKey, groupStudents } from '../store.js';
import { PlanThumb } from './salles.js';
import { LEVELS, levelOf } from './progressions.js';
import { Modal, Field, Avatar, Empty, PeriodSelect, ColorPicker, toast } from './common.js';
import { StudentSheet } from './student.js';
import { NotesTab } from './notes.js';
import { RosterImport, PhotoBatch } from './importer.js';
import { uid, CLASS_COLORS, classColor, fmtDateLong, fmtDateShort, todayISO, displayName, download, fmtNum, seatLabels } from '../util.js';
import { suiviStats, evalSummary } from '../logic.js';
import { go } from '../router.js';
import { Ico } from '../icons.js';

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
    <div class="page-head"><span class="grow"></span>
      <button class="btn primary" onClick=${() => setForm({ name: '', etabId: d.etabs[0].id, color: CLASS_COLORS[d.classes.length % CLASS_COLORS.length] })}>${Ico('plus')} Nouvelle classe</button></div>
    ${!d.classes.length ? html`<${Empty} title="Aucune classe">
      <//>` : null}
    <div class="etab-cols">${d.etabs.map(e => {
      const cs = sortedClasses(d).filter(c => c.etabId === e.id);
      if (!cs.length) return null;
      return html`<section class="etab-col" key=${e.id}><h3>${e.name}</h3>${cs.map(c => html`
        <a class="card class-card" href=${'#/class/' + c.id + '/eleves'} style=${{ '--c': classColor(c) }}>
          <b>${c.name}</b><span class="muted">${d.students.filter(s => s.classId === c.id).length} élèves</span></a>`)}</section>`;
    })}</div>
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
  const [imp, setImp] = useState(false), [photos, setPhotos] = useState(false);
  const [edit, setEdit] = useState(null);
  const [addStu, setAddStu] = useState(null);
  if (!cls) return html`<${Empty} title="Classe introuvable"><a class="btn" href="#/classes">Retour</a><//>`;
  const studs = studentsOf(d, id);
  const slot = q.slot && q.date ? occurrence(d, q.slot, q.date) : null;
  const T = (k, ic, label) => html`<a class=${tab === k ? 'on' : ''} href=${'#/class/' + id + '/' + k + (q.date ? `?date=${q.date}&slot=${q.slot || ''}` : '')}>${Ico(ic)} ${label}</a>`;
  const room = slot && roomById(d, slot.roomId);
  const apLink = (date, slotId) => `/appel/${id}/${date}/${slotId || 'x'}`;
  const se = q.date && d.sessions[sessionKey(id, q.date, q.slot)];

  function saveClass() {
    if (edit.del) { if (!confirm(`Supprimer la classe ${cls.name} et toutes ses données (élèves, notes, appels) ?`)) return; mutate(dd => {
      const ids = new Set(dd.students.filter(s => s.classId === id).map(s => s.id));
      for (const k of Object.keys(dd.progress || {})) if (k.startsWith(id + '|')) delete dd.progress[k];
      dd.classes = dd.classes.filter(c => c.id !== id); dd.students = dd.students.filter(s => s.classId !== id);
      dd.slots = dd.slots.filter(s => s.classId !== id); dd.events = dd.events.filter(e => e.classId !== id); dd.evals = dd.evals.filter(e => e.classId !== id); dd.notes = (dd.notes || []).filter(n => n.classId !== id);
      for (const k of Object.keys(dd.sessions)) if (dd.sessions[k].classId === id) delete dd.sessions[k];
      for (const k of Object.keys(dd.plans)) if (k.startsWith(id + '|')) delete dd.plans[k];
    }); setEdit(null); go('/classes'); return; }
    mutate(dd => Object.assign(dd.classes.find(c => c.id === id), { name: edit.name.trim() || cls.name, etabId: edit.etabId, color: edit.color, level: edit.level || '', kinds: edit.kinds, defKind: edit.defKind && edit.kinds.includes(edit.defKind) ? edit.defKind : '', projetColor: edit.projetColor }));
    setEdit(null);
  }
  function newStudent() {
    if (!addStu.nom.trim()) return;
    mutate(dd => dd.students.push({ id: uid(), classId: id, nom: addStu.nom.trim().toUpperCase(), prenom: addStu.prenom.trim(), amenagement: '', hasPhoto: false }));
    setAddStu(null);
  }

  return html`<div class=${'page' + (tab === 'suivi' || tab === 'notes' ? ' fitcol' : '')}>
    <div class="page-head"><span class="dot" style=${{ background: classColor(cls) }}></span><h1>${cls.name}</h1>
      <span class="sub">${studs.length} élèves · ${etabOf(d, cls).name}</span><span class="grow"></span>
      <button class="btn small" onClick=${() => setEdit({ name: cls.name, etabId: cls.etabId, color: classColor(cls), level: cls.level || '', kinds: kindsOf(cls), defKind: cls.defKind || '', projetColor: cls.projetColor || PROJET_COLOR })}>${Ico('gear')} Paramètres</button></div>
    ${q.date ? html`<div class="banner"><div class="grow"><b>Séance du ${fmtDateLong(q.date)}</b>
        <div class="muted">${slot ? slot.start + '–' + slot.end : ''}${slot && slot.group ? ' · groupe ' + slot.group : ''}${room ? ' · ' + room.name : ''}${se && se.validated ? ' · appel fait ✓' : ''}</div></div>
      <button class="btn primary" onClick=${() => go(apLink(q.date, q.slot))}>${se && se.validated ? 'Revoir l\'appel' : 'Faire l\'appel' + (slot && slot.group ? ' · ' + slot.group : '')}</button>
      ${room ? html`<a class="btn" href=${'#/plan/' + id + '/' + room.id + (slot && slot.group && d.plans[planKey(id, room.id, slot.group)] ? '?g=' + encodeURIComponent(slot.group) : '')}>Plan de classe</a>` : null}</div>`
      : null}
    <div class="tabs eq">${T('eleves', 'users', 'Élèves')}${T('suivi', 'chart', 'Suivi')}${T('notes', 'pen', 'Notes')}${T('evaluations', 'clip', 'Évaluations')}${T('plans', 'layout', 'Plans de classe')}</div>
    ${tab === 'suivi' ? html`<${Suivi} key=${slot && slot.group || ''} initial=${slot && slot.group || ''} cls=${cls} studs=${studs} onOpen=${setSheet} />`
      : tab === 'notes' ? html`<${NotesTab} cls=${cls} />`
      : tab === 'evaluations' ? html`<${NotesList} cls=${cls} studs=${studs} />`
      : tab === 'plans' ? html`<${PlansList} cls=${cls} />`
      : html`<${Roster} key=${slot && slot.group || ''} initial=${slot && slot.group || ''} cls=${cls} studs=${studs} onSheet=${setSheet} onImport=${() => setImp(true)} onAdd=${() => setAddStu({ nom: '', prenom: '' })} onPhotos=${() => setPhotos(true)} />`}
    ${sheet ? html`<${StudentSheet} sid=${sheet} onClose=${() => setSheet(null)} />` : null}
    ${imp ? html`<${RosterImport} classId=${id} onClose=${() => setImp(false)} />` : null}
    ${photos ? html`<${PhotoBatch} classId=${id} onClose=${() => setPhotos(false)} />` : null}
    ${addStu ? html`<${Modal} title="Nouvel élève" onClose=${() => setAddStu(null)} foot=${html`<button class="btn primary" onClick=${newStudent}>Ajouter</button>`}>
      <${Field} label="Nom"><input value=${addStu.nom} onInput=${e => setAddStu({ ...addStu, nom: e.target.value })} /><//>
      <${Field} label="Prénom"><input value=${addStu.prenom} onInput=${e => setAddStu({ ...addStu, prenom: e.target.value })} /><//><//>` : null}
    ${edit ? html`<${Modal} title="Paramètres de la classe" onClose=${() => setEdit(null)}
      foot=${html`<button class="btn danger" onClick=${() => { edit.del = true; saveClass(); }}>Supprimer la classe</button><span class="grow"></span><button class="btn primary" onClick=${saveClass}>Enregistrer</button>`}>
      <${Field} label="Nom"><input value=${edit.name} onInput=${e => setEdit({ ...edit, name: e.target.value })} /><//>
      <${Field} label="Établissement"><select value=${edit.etabId} onChange=${e => setEdit({ ...edit, etabId: e.target.value })}>${d.etabs.map(e => html`<option value=${e.id}>${e.name}</option>`)}</select><//>
      <${Field} label="Niveau"><select value=${edit.level || ''} onChange=${e => setEdit({ ...edit, level: e.target.value })}><option value="">Automatique (d'après le nom)</option>${LEVELS.map(l => html`<option value=${l}>${l}</option>`)}</select><//>
      <${Field} label="Couleur de la classe"><${ColorPicker} value=${edit.color} onChange=${c => setEdit({ ...edit, color: c })} /><//>
      <${Field} label="Types de séance"><div class="row" style="gap:8px">${Object.keys(KINDS).map(k => html`<button key=${k} class=${'btn' + (edit.kinds.includes(k) ? ' primary' : '')} onClick=${() => setEdit({ ...edit, kinds: edit.kinds.includes(k) ? edit.kinds.filter(x => x !== k) : Object.keys(KINDS).filter(x => x === k || edit.kinds.includes(x)) })}>${KINDS[k]}</button>`)}</div><//>
      ${edit.kinds.length ? html`<${Field} label="Type par défaut des séances"><select value=${edit.kinds.includes(edit.defKind) ? edit.defKind : ''} onChange=${e => setEdit({ ...edit, defKind: e.target.value })}><option value="">Aucun (cours ordinaire)</option>${edit.kinds.map(k => html`<option value=${k}>${KINDS[k]}</option>`)}</select><//>` : null}
      ${edit.kinds.includes('projet') ? html`<${Field} label="Couleur des séances Projet"><${ColorPicker} value=${edit.projetColor} onChange=${c => setEdit({ ...edit, projetColor: c })} /><//>` : null}<//>` : null}
  </div>`;
}

function Suivi({ cls, studs, onOpen, initial }) {
  const d = useStore();
  const etab = etabOf(d, cls);
  const cur = currentPeriod(etab);
  const [per, setPer] = useState(cur ? cur.id : 'all');
  const [sort, setSort] = useState('nom');
  const lab = seatLabels(studs);
  const range = per === 'all' ? null : (etab.periods.find(p => p.id === per) || null);
  const by = suiviStats(d, cls.id, studs.map(s => s.id), range);
  const th = d.settings.threshold;
  const rows = [...studs].sort((a, b) => sort === 'nom' ? 0 : (by[b.id][sort] - by[a.id][sort]));
  const tot = k => studs.reduce((n, s) => n + by[s.id][k], 0);
  const cell = (v, alert) => html`<td class=${alert && v >= th ? 'hot' : alert && v === th - 1 && th > 1 ? 'warm' : ''}>${v || '·'}</td>`;
  function csv() {
    const L = [['Nom', 'Prénom', 'Travail non fait', 'Oublis matériel', 'Absences', 'Retards'].join(';')];
    for (const s of studs) L.push([s.nom, s.prenom, by[s.id].dev, by[s.id].mat, by[s.id].abs, by[s.id].ret].join(';'));
    download(new Blob(['﻿' + L.join('\n')], { type: 'text/csv' }), `suivi-${cls.name}.csv`);
  }
  return html`<div class="row" style="margin-bottom:10px"><${PeriodSelect} etab=${etab} value=${per} onChange=${setPer} />
      <span class="grow"></span><button class="btn" onClick=${csv}>${Ico('upload')} Exporter en CSV</button></div>
    <div class="gridwrap"><table class="g suivi" style="width:100%"><colgroup><col style="width:190px" /><col /><col /><col /><col /></colgroup>
      <thead><tr><th class="stk" style="height:44px;cursor:pointer" onClick=${() => setSort('nom')}>Élève</th>
      <th style="cursor:pointer" onClick=${() => setSort('dev')}>📝 Travail non fait</th><th style="cursor:pointer" onClick=${() => setSort('mat')}>🎒 Oublis matériel</th>
      <th style="cursor:pointer" onClick=${() => setSort('abs')}>🚫 Absences</th><th style="cursor:pointer" onClick=${() => setSort('ret')}>⏰ Retards</th></tr></thead>
      <tbody>${rows.map(s => html`<tr class="clk" key=${s.id} onClick=${() => onOpen(s.id)}><th class="stk">${lab[s.id]}</th>${cell(by[s.id].dev, true)}${cell(by[s.id].mat, true)}${cell(by[s.id].abs)}${cell(by[s.id].ret)}</tr>`)}</tbody>
      <tfoot><tr><th class="stk" style="text-align:left">Total</th><td>${tot('dev')}</td><td>${tot('mat')}</td><td>${tot('abs')}</td><td>${tot('ret')}</td></tr></tfoot></table></div>`;
}

function NotesList({ cls, studs }) {
  const d = useStore();
  const evs = d.evals.filter(e => e.classId === cls.id).sort((a, b) => b.date.localeCompare(a.date));
  const etab = etabOf(d, cls);
  const [draft, setDraft] = useState(null);
  const lvl = levelOf(cls);
  const sources = !lvl ? [] : d.evals.filter(e => e.classId !== cls.id).filter(e => { const c = classById(d, e.classId); return c && levelOf(c) === lvl; })
    .sort((a, b) => b.date.localeCompare(a.date));
  function create() {
    const src = draft.from ? d.evals.find(e => e.id === draft.from) : null;
    const ev = { id: uid(), classId: cls.id, name: draft.name.trim(), date: draft.date, scores: {},
      exercises: src ? src.exercises.map(x => ({ ...x, id: uid(), questions: x.questions.map(q => ({ ...q, id: uid(), comps: [...(q.comps || [])] })) }))
        : [{ id: uid(), title: 'Exercice 1', questions: [{ id: uid(), label: '1', max: 1, comps: [] }] }] };
    mutate(dd => dd.evals.push(ev));
    go(`/eval/${ev.id}?edit=1`);
  }
  const byId = Object.fromEntries(studs.map(s => [s.id, s]));
  const ids = studs.map(s => s.id), comps = d.settings.comps;
  const card = ev => {
        const sm = evalSummary(ev, ids, comps, byId);
        const used = comps.filter(c => ev.exercises.some(x => x.questions.some(q => (q.comps || []).includes(c))));
        return html`<div class="card eval-card" key=${ev.id} onClick=${() => go('/eval/' + ev.id)}>
          <div class="eval-head"><b>${ev.name}</b><span class="muted small">${fmtDateShort(ev.date)}</span></div>
          ${sm.n ? html`<div class="eval-stats">
            <div class="es main"><span>Moyenne</span><b>${fmtNum(sm.avg)}</b><i>/ ${fmtNum(sm.barème)}</i></div>
            <div class="es"><span>Min</span><b>${fmtNum(sm.min)}</b></div>
            <div class="es"><span>Médiane</span><b>${fmtNum(sm.med)}</b></div>
            <div class="es"><span>Max</span><b>${fmtNum(sm.max)}</b></div></div>` : html`<p class="muted small" style="margin:10px 0">Pas encore de note</p>`}
          ${sm.n && used.length ? html`<div class="eval-comps">${used.map(c => { const a = sm.dist[c] || [0, 0, 0, 0], t = a.reduce((x, y) => x + y, 0) || 1;
            return html`<div class="ec" key=${c}><span>${c}</span><div class="ecbar" title=${a.map((n, i) => 'niveau ' + (i + 1) + ' : ' + n).join(' · ')}>${a.map((n, i) => n ? html`<i class=${'lv-' + (i + 1)} style=${{ width: n / t * 100 + '%' }}></i>` : null)}</div></div>`; })}</div>` : null}
        </div>`;
  };
  // regroupement par semestre / trimestre d'après la date (le plus récent en premier)
  const pers = [...(etab.periods || [])].sort((x, y) => y.start.localeCompare(x.start));
  const groups = [];
  for (const p of pers) { const list = evs.filter(e => e.date >= p.start && e.date <= p.end); if (list.length) groups.push({ id: p.id, name: p.name, list }); }
  const other = evs.filter(e => !pers.some(p => e.date >= p.start && e.date <= p.end));
  if (other.length) groups.push({ id: 'autre', name: pers.length ? 'Hors période' : '', list: other });
  return html`<div class="row" style="margin-bottom:12px"><button class="btn primary" onClick=${() => setDraft({ name: '', date: todayISO() })}>${Ico('plus')} Créer une évaluation</button></div>
    ${draft ? html`<${Modal} title="Créer une évaluation" onClose=${() => setDraft(null)} foot=${html`<button class="btn" onClick=${() => setDraft(null)}>Annuler</button><button class="btn primary" disabled=${!draft.name.trim() || !draft.date} onClick=${create}>Créer</button>`}>
      <${Field} label="Nom"><input autofocus value=${draft.name} placeholder="Ex. : DS n°2" onInput=${e => setDraft({ ...draft, name: e.target.value })} /><//>
      <${Field} label="Date"><input type="date" value=${draft.date} onInput=${e => setDraft({ ...draft, date: e.target.value })} /><//>
      ${sources.length ? html`<${Field} label="Copier depuis une autre classe"><select value=${draft.from || ''} onChange=${e => { const ev = sources.find(x => x.id === e.target.value); setDraft({ ...draft, from: e.target.value, name: ev && !draft.name.trim() ? ev.name : draft.name }); }}>
        <option value="">Évaluation vierge</option>${sources.map(e => html`<option key=${e.id} value=${e.id}>${classById(d, e.classId).name} · ${e.name}</option>`)}</select><//>` : null}<//>` : null}
    ${!evs.length ? html`<${Empty} title="Aucune évaluation"><//>`
    : html`${groups.map(g => html`<section key=${g.id} style="margin-bottom:18px">${g.name ? html`<h3 class="pgrp">${g.name}<small>${g.list.length} évaluation${g.list.length > 1 ? 's' : ''}</small></h3>` : null}
      <div class="eval-cards">${g.list.map(card)}</div></section>`)}`}`;
}

function PlansList({ cls }) {
  const d = useStore();
  const [add, setAdd] = useState(null);   // { roomId, group }
  const rooms = roomsFor(d, cls);
  const groups = groupsOf(cls);
  const made = Object.keys(d.plans).map(k => ({ k, ...parsePlanKey(k) })).filter(x => x.classId === cls.id && d.rooms.some(r => r.id === x.roomId))
    .sort((a, b) => roomById(d, a.roomId).name.localeCompare(roomById(d, b.roomId).name, 'fr') || a.group.localeCompare(b.group, 'fr'));
  const exists = add && !!d.plans[planKey(cls.id, add.roomId, add.group)];
  function create() {
    if (!add || !add.roomId || exists) return;
    mutate(dd => { dd.plans[planKey(cls.id, add.roomId, add.group)] ||= { seatMap: {} }; });
    const a = add; setAdd(null); go(`/plan/${cls.id}/${a.roomId}` + (a.group ? '?g=' + encodeURIComponent(a.group) : ''));
  }
  function remove(x) {
    const r = roomById(d, x.roomId);
    if (!confirm(`Supprimer le plan de classe de ${cls.name}${x.group ? ' (' + x.group + ')' : ''} en ${r.name} ?`)) return;
    mutate(dd => { delete dd.plans[x.k]; });
  }
  return html`<div class="row" style="margin-bottom:12px"><button class="btn primary" onClick=${() => setAdd({ roomId: rooms[0] ? rooms[0].id : '', group: '' })}>${Ico('plus')} Ajouter un plan de classe</button></div>
    ${!made.length ? html`<${Empty} title="Aucun plan de classe"><//>`
    : html`<div class="plan-cards">${made.map(x => {
        const r = roomById(d, x.roomId), p = d.plans[x.k];
        return html`<div class="card plan-card" key=${x.k} onClick=${() => go(`/plan/${cls.id}/${r.id}` + (x.group ? '?g=' + encodeURIComponent(x.group) : ''))}>
          <${PlanThumb} room=${r} seatMap=${p.seatMap} />
          <div class="row" style="margin-top:10px"><div class="grow"><b>${r.name}${x.group ? ' · ' + x.group : ''}</b>
            <div class="muted small">${r.items.filter(i => i.kind === 'seat').length} places</div></div>
            <button class="btn small danger" onClick=${e => { e.stopPropagation(); remove(x); }}>Supprimer</button></div></div>`;
      })}</div>`}
    ${add ? html`<${Modal} title="Ajouter un plan de classe" onClose=${() => setAdd(null)}
      foot=${html`<button class="btn" onClick=${() => setAdd(null)}>Annuler</button><button class="btn primary" disabled=${!add.roomId || exists} onClick=${create}>Créer le plan</button>`}>
      ${rooms.length ? html`<${Field} label=${'Salle de ' + etabOf(d, cls).name}><select value=${add.roomId} onChange=${e => setAdd({ ...add, roomId: e.target.value })}>${rooms.map(r => html`<option value=${r.id}>${r.name}</option>`)}</select><//>
        ${groups.length ? html`<${Field} label="Pour"><select value=${add.group} onChange=${e => setAdd({ ...add, group: e.target.value })}><option value="">La classe entière</option>${groups.map(g => html`<option value=${g}>Le groupe ${g}</option>`)}</select><//>` : null}
        ${exists ? html`<p class="muted">Ce plan existe déjà.</p>` : null}`
        : html`<p class="muted">Aucune salle n'est rattachée à cet établissement.</p>`}<//>` : null}`;
}

/* ---------- Liste des élèves avec groupes ---------- */
function Roster({ cls, studs, onSheet, onImport, onAdd, onPhotos, initial }) {
  const [flt, setFlt] = useState(initial || '');
  const [gm, setGm] = useState(false);
  const groups = groupsOf(cls);
  const list = flt === '' ? studs : flt === '-' ? studs.filter(s => !s.group) : studs.filter(s => s.group === flt);
  const cycle = s => {
    const order = ['', ...groups];
    const next = order[(order.indexOf(s.group || '') + 1) % order.length];
    mutate(dd => { dd.students.find(x => x.id === s.id).group = next; });
  };
  return html`<div class="row" style="margin-bottom:12px"><button class="btn primary" onClick=${onImport}>${Ico('download')} Importer une liste</button>
      <button class="btn" onClick=${onAdd}>${Ico('plus')} Ajouter un élève</button><button class="btn" onClick=${onPhotos}>${Ico('camera')} Importer les photos</button>
      <button class="btn" onClick=${() => setGm(true)}>${Ico('users')} Gestion des groupes</button></div>
    ${groups.length ? html`<div class="row" style="margin-bottom:10px"><div class="seg">
      <button class=${flt === '' ? 'on P' : ''} onClick=${() => setFlt('')}>Tous (${studs.length})</button>
      ${groups.map(g => html`<button class=${flt === g ? 'on P' : ''} onClick=${() => setFlt(g)}>${g} (${studs.filter(s => s.group === g).length})</button>`)}
      <button class=${flt === '-' ? 'on P' : ''} onClick=${() => setFlt('-')}>Sans groupe (${studs.filter(s => !s.group).length})</button></div></div>` : null}
    ${!studs.length ? html`<${Empty} title="Aucun élève"><//>`
    : html`<div class="appel-grid roster">${list.map(s => html`<div class="stu" key=${s.id} onClick=${() => onSheet(s.id)}>
      <${Avatar} s=${s} size=${44} /><div class="nm"><b>${s.nom}</b> ${s.prenom}${s.amenagement ? html`<div class="small" style="color:var(--warn)">★ ${s.amenagement}</div>` : null}</div>
      ${groups.length ? html`<button class=${'btn small' + (s.group ? ' on' : '')} style="min-width:56px" onClick=${e => { e.stopPropagation(); cycle(s); }} aria-label="Changer de groupe">${s.group || '—'}</button>` : null}
      <span class="muted">›</span></div>`)}</div>`}
    ${gm ? html`<${GroupsModal} cls=${cls} studs=${studs} onClose=${() => setGm(false)} />` : null}`;
}

function GroupsModal({ cls, studs, onClose }) {
  const d = useStore();
  const c = classById(d, cls.id);
  const groups = groupsOf(c);
  const setGroups = fn => mutate(dd => { const k = dd.classes.find(x => x.id === cls.id); k.groups = fn([...(k.groups || [])]); });
  function rename(i, name) {
    name = name.trim();
    const old = groups[i];
    if (!name || name === old || groups.includes(name)) return;
    mutate(dd => {
      const k = dd.classes.find(x => x.id === cls.id);
      k.groups = (k.groups || []).map((g, j) => j === i ? name : g);
      dd.students.forEach(s => { if (s.classId === cls.id && s.group === old) s.group = name; });
      dd.slots.forEach(s => { if (s.classId === cls.id && s.group === old) s.group = name; });
      Object.values(dd.overrides).forEach(o => { if (o.classId === cls.id && o.group === old) o.group = name; });
    });
  }
  function remove(i) {
    const g = groups[i];
    const nSlots = d.slots.filter(s => s.classId === cls.id && s.group === g).length;
    if (!confirm(`Supprimer le groupe « ${g} » ?${nSlots ? ` ${nSlots} créneau(x) de l'emploi du temps passeront en « classe entière ».` : ''} Les élèves seront sans groupe.`)) return;
    mutate(dd => {
      const k = dd.classes.find(x => x.id === cls.id);
      k.groups = (k.groups || []).filter(x => x !== g);
      dd.students.forEach(s => { if (s.classId === cls.id && s.group === g) s.group = ''; });
      dd.slots.forEach(s => { if (s.classId === cls.id && s.group === g) s.group = ''; });
    });
  }
  function add() {
    let n = groups.length + 1, name = 'P' + n;
    while (groups.includes(name)) name = 'P' + (++n);
    setGroups(g => [...g, name]);
  }
  function split() {
    if (groups.length < 2) return alert('Crée au moins deux groupes.');
    if (!confirm('Répartir tous les élèves dans les groupes, par ordre alphabétique (moitié / moitié) ? Les affectations actuelles seront remplacées.')) return;
    const n = groups.length, per = Math.ceil(studs.length / n);
    mutate(dd => studs.forEach((s, i) => { dd.students.find(x => x.id === s.id).group = groups[Math.min(n - 1, Math.floor(i / per))]; }));
  }
  function clearAll() { mutate(dd => studs.forEach(s => { dd.students.find(x => x.id === s.id).group = ''; })); }
  return html`<${Modal} title=${'Groupes de la classe ' + cls.name} onClose=${onClose} foot=${html`<button class="btn primary" onClick=${onClose}>OK</button>`}>
    ${groups.map((g, i) => html`<div class="row" key=${g}><input class="inp" style="width:140px" defaultValue=${g} onBlur=${e => rename(i, e.target.value)} aria-label="Nom du groupe" />
      <span class="muted">${studs.filter(s => s.group === g).length} élève(s)</span><span class="grow"></span><button class="btn small danger" onClick=${() => remove(i)}>Supprimer</button></div>`)}
    <div class="row"><button class="btn" onClick=${add}>${Ico('plus')} Ajouter un groupe</button>
      <button class="btn" onClick=${split} disabled=${groups.length < 2}>⚖ Répartir par ordre alphabétique</button>
      <button class="btn ghost" onClick=${clearAll} disabled=${!groups.length}>Retirer tout le monde des groupes</button></div><//>`;
}
