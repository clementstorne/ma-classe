import { html, useState } from '../../vendor/preact-htm.js';
import { useStore, mutate, classById, groupStudents, studentsOf, roomsFor, sessionKey, roomById, getPlan, planKey, occurrence } from '../store.js';
import { Modal, Avatar, Empty } from './common.js';
import { PlanCanvas } from './plan.js';
import { StudentSheet } from './student.js';
import { levelOf, chaptersFor, progressOf, sessionChapters } from './progressions.js';
import { fmtDateLong, uid, displayName, seatLabels } from '../util.js';

export function Appel({ classId, date, slotId }) {
  const d = useStore();
  const cls = classById(d, classId);
  const [view, setView] = useState('list');
  const [pop, setPop] = useState(null);   // élève dont on ouvre les actions (mode plan)
  const [fiche, setFiche] = useState(null);
  const slot = slotId !== 'x' ? occurrence(d, slotId, date) : null;
  const [roomId, setRoomId] = useState((slot && slot.roomId) || ((roomsFor(d, classById(d, classId))[0] || {}).id));
  if (!cls) return html`<${Empty} title="Classe introuvable" />`;
  const key = sessionKey(classId, date, slotId === 'x' ? null : slotId);
  const studs = groupStudents(d, classId, slot && slot.group);
  const se = d.sessions[key];
  const marks = se ? se.marks : {};
  const ev = type => d.events.filter(e => e.sessionKey === key && e.type === type);
  const has = (sid, type) => d.events.some(e => e.sessionKey === key && e.sid === sid && e.type === type);
  const statusOf = sid => marks[sid] || 'P';

  const ensure = dd => dd.sessions[key] ||= { key, classId, date, slotId: slotId === 'x' ? null : slotId, marks: {}, validated: false };
  function setMark(sid, st) {
    mutate(dd => { const s = ensure(dd); if (st === 'P') delete s.marks[sid]; else s.marks[sid] = st; s.validated = true; });
  }
  function toggle(sid, type) {
    mutate(dd => {
      const i = dd.events.findIndex(e => e.sessionKey === key && e.sid === sid && e.type === type);
      if (i >= 0) dd.events.splice(i, 1);
      else dd.events.push({ id: uid(), sid, classId, date, sessionKey: key, type });
      ensure(dd);
    });
  }
  const chapters = chaptersFor(d, levelOf(cls));
  const picked = se ? sessionChapters(se) : [];
  const prog = progressOf(d, classId, key, false, date);
  const curId = (chapters.find(c => prog[c.id] === 'doing') || {}).id;
  const nextId = (chapters.slice(curId ? chapters.findIndex(c => c.id === curId) + 1 : 0).find(c => !prog[c.id]) || {}).id;
  const shown = chapters.filter(c => c.id === curId || c.id === nextId || picked.includes(c.id));
  const toggleChapter = id => mutate(dd => {
    const s = ensure(dd), cur = sessionChapters(s);
    s.chapterIds = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    delete s.chapterId; if (!s.chapterIds.length) delete s.chapterIds;
  });
  const toggleKind = k => mutate(dd => { const s = ensure(dd), was = s[k]; delete s.ds; delete s.ap; if (!was) s[k] = true; });
  const validate = () => mutate(dd => { ensure(dd).validated = true; });
  const nA = studs.filter(s => statusOf(s.id) === 'A').length, nR = studs.filter(s => statusOf(s.id) === 'R').length;

  const controls = s => html`<div class="ctl">
    <button class=${'tg abs' + (statusOf(s.id) === 'A' ? ' on' : '')} title="Absent" aria-label="Absent" onClick=${() => setMark(s.id, statusOf(s.id) === 'A' ? 'P' : 'A')}>🚫</button>
    <button class=${'tg ret' + (statusOf(s.id) === 'R' ? ' on' : '')} title="En retard" aria-label="En retard" onClick=${() => setMark(s.id, statusOf(s.id) === 'R' ? 'P' : 'R')}>⏰</button>
    <button class=${'tg dev' + (has(s.id, 'devoir') ? ' on' : '')} title="Travail non fait" aria-label="Travail non fait" onClick=${() => toggle(s.id, 'devoir')}>📝</button>
    <button class=${'tg mat' + (has(s.id, 'materiel') ? ' on' : '')} title="Oubli de matériel" aria-label="Oubli de matériel" onClick=${() => toggle(s.id, 'materiel')}>🎒</button></div>`;

  const byId = Object.fromEntries(studs.map(s => [s.id, s]));
  const room = roomById(d, roomId);
  const gp = slot && slot.group && d.plans[planKey(classId, roomId, slot.group)];
  const plan = room ? (gp || getPlan(d, classId, roomId)) : { seatMap: {} };
  const placed = new Set(Object.values(plan.seatMap));
  const unplaced = studs.filter(s => !placed.has(s.id));

  return html`<div class="page">
    <div class="page-head"><h1>Appel · ${cls.name}${slot && slot.group ? ' · ' + slot.group : ''}</h1>
      <span class="sub">${fmtDateLong(date)}${slot ? ' · ' + slot.start + '–' + slot.end : ''}</span><span class="grow"></span>
      <div class="seg"><button class=${view === 'list' ? 'on P' : ''} onClick=${() => setView('list')}>Liste</button><button class=${view === 'plan' ? 'on P' : ''} onClick=${() => setView('plan')}>Plan</button></div></div>
    <div class="row" style="margin-bottom:12px"><div class="counters"><span class="counter p">${studs.length - nA - nR} présent${studs.length - nA - nR > 1 ? 's' : ''}</span><span class="counter a">${nA} absent${nA > 1 ? 's' : ''}</span><span class="counter r">${nR} retard${nR > 1 ? 's' : ''}</span>
      <span class="counter">📝 ${ev('devoir').length}</span><span class="counter">🎒 ${ev('materiel').length}</span></div><span class="grow"></span>
      <button class=${'btn' + (se && se.ds ? ' primary' : '')} title="Devoir surveillé : séance non comptée dans les heures de progression" onClick=${() => toggleKind('ds')}>DS</button>
      <button class=${'btn' + (se && se.ap ? ' primary' : '')} title="Accompagnement personnalisé : séance non comptée dans les heures de progression" onClick=${() => toggleKind('ap')}>AP</button>
      ${chapters.length ? html`<div class="chsel">${shown.map(c => html`<button key=${c.id} class=${'btn' + (picked.includes(c.id) ? ' primary' : '')} title=${c.id === curId ? 'Chapitre en cours' : c.id === nextId ? 'Prochain chapitre' : ''} onClick=${() => toggleChapter(c.id)}>${c.title}</button>`)}</div>` : null}
      ${se && se.validated ? html`<span class="chip" style="background:var(--ok-soft);color:var(--ok)">✓ Appel enregistré</span>` : html`<button class="btn primary" onClick=${validate}>✓ Tous présents / valider</button>`}</div>
    ${!studs.length ? html`<${Empty} title=${slot && slot.group ? 'Aucun élève dans le groupe ' + slot.group : 'Aucun élève dans cette classe'}><//>` : null}
    ${view === 'list' ? html`<div class="appel-grid">${studs.map(s => html`<div class=${'stu ' + statusOf(s.id)} key=${s.id}>
        <${Avatar} s=${s} size=${48} /><div class="who" onClick=${() => setFiche(s.id)}><b>${s.nom}</b><span>${s.prenom}${s.amenagement ? html` <span style="color:var(--warn)">★</span>` : ''}</span></div>${controls(s)}</div>`)}</div>`
      : html`<div class="row" style="margin-bottom:8px"><select class="inp" style="width:auto" value=${roomId} onChange=${e => setRoomId(e.target.value)}>${roomsFor(d, cls).map(r => html`<option value=${r.id}>${r.name}</option>`)}</select></div>
        ${room ? html`<${PlanCanvas} room=${room} seatMap=${plan.seatMap} byId=${byId} labels=${seatLabels(studentsOf(d, classId))} mode="view" onSeatTap=${it => { const sid = plan.seatMap[it.id]; if (sid) setPop(sid); }}
          seatClass=${s => statusOf(s.id) === 'P' ? '' : statusOf(s.id)}
          seatExtra=${s => html`<span class="badge">${has(s.id, 'devoir') ? '📝' : ''}${has(s.id, 'materiel') ? '🎒' : ''}</span>`} />` : null}
        ${unplaced.length ? html`<h3 style="margin:14px 0 8px">Élèves non placés sur ce plan</h3><div class="appel-grid">${unplaced.map(s => html`<div class=${'stu ' + statusOf(s.id)} key=${s.id}>
          <${Avatar} s=${s} size=${40} /><div class="who"><b>${s.nom}</b><span>${s.prenom}</span></div>${controls(s)}</div>`)}</div>` : null}`}
    ${pop && byId[pop] ? html`<${Modal} title=${displayName(byId[pop])} onClose=${() => setPop(null)}
        foot=${html`<button class="btn" onClick=${() => { setFiche(pop); setPop(null); }}>Fiche élève</button><button class="btn primary" onClick=${() => setPop(null)}>OK</button>`}>
      <div class="row" style="justify-content:center"><${Avatar} s=${byId[pop]} size=${72} /></div>
      ${byId[pop].amenagement ? html`<p class="chip amen" style="white-space:normal">★ ${byId[pop].amenagement}</p>` : null}
      <div style="display:flex;justify-content:center">${controls(byId[pop])}</div><//>` : null}
    ${fiche ? html`<${StudentSheet} sid=${fiche} onClose=${() => setFiche(null)} />` : null}
  </div>`;
}
