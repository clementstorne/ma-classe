import { html, useState } from '../../vendor/preact-htm.js';
import { useStore, mutate, classById, roomById, sessionKey, etabOf, weekLetter } from '../store.js';
import { mondayOf, addDays, iso, toMin, fromMin, DAYS, uid, CLASS_COLORS, todayISO } from '../util.js';
import { Modal, Field, Empty, toast } from './common.js';
import { go } from '../router.js';

const PPM = 1.05; // pixels par minute

export function Schedule() {
  const d = useStore();
  const [ws, setWs] = useState(mondayOf(new Date()));
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(null);

  const letterOfSlot = s => weekLetter(etabOf(d, classById(d, s.classId)), ws);
  const visible = s => !s.week || !letterOfSlot(s) || s.week === letterOfSlot(s);
  const abEtabs = d.etabs.filter(e => e.ab && e.abRef);
  const hasSat = d.slots.some(s => s.day === 5);
  const nd = hasSat ? 6 : 5;
  const mins = d.slots.filter(visible).flatMap(s => [toMin(s.start), toMin(s.end)]);
  const gStart = Math.floor(Math.min(8 * 60, ...mins) / 60) * 60;
  const gEnd = Math.ceil(Math.max(17 * 60, ...mins) / 60) * 60;
  const height = (gEnd - gStart) * PPM;
  const today = todayISO();
  const hours = [];
  for (let m = gStart; m <= gEnd; m += 60) hours.push(m);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const colorOf = cid => {
    const c = classById(d, cid);
    return c ? CLASS_COLORS[(c.color || 0) % CLASS_COLORS.length] : '#888';
  };

  function clickColumn(e, day) {
    if (!edit) return;
    if (e.target.closest('.slot')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const m = gStart + Math.round((e.clientY - r.top) / PPM / 5) * 5;
    setForm({ day, start: fromMin(m), end: fromMin(m + 55), classId: d.classes[0] ? d.classes[0].id : '', roomId: d.rooms[0] ? d.rooms[0].id : '', week: '' });
  }

  function saveForm() {
    const f = form;
    if (!f.classId) return toast('Choisis une classe');
    if (toMin(f.start) >= toMin(f.end)) return toast('L\'heure de fin doit suivre le début');
    mutate(dd => {
      if (f.id) Object.assign(dd.slots.find(s => s.id === f.id), f);
      else dd.slots.push({ ...f, id: uid() });
    });
    setForm(null);
  }
  function delSlot() {
    if (!confirm('Supprimer ce créneau ?')) return;
    mutate(dd => { dd.slots = dd.slots.filter(s => s.id !== form.id); });
    setForm(null);
  }

  function openSlot(s, date) {
    if (edit) { setForm({ ...s }); return; }
    go(`/class/${s.classId}/eleves?date=${date}&slot=${s.id}`);
  }

  const wEnd = addDays(ws, nd - 1);
  const label = `${ws.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} – ${wEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;

  if (!d.classes.length) return html`<div class="page"><${Empty} title="Bienvenue dans Ma classe">
    <p>Commence par créer ou importer tes classes, puis place tes créneaux dans l'emploi du temps.</p>
    <div class="row" style="justify-content:center"><a class="btn primary" href="#/classes">Aller aux classes</a>
    <a class="btn" href="#/settings">Réglages (périodes, sauvegarde, exemple)</a></div><//></div>`;

  return html`<div class="page">
    <div class="page-head">
      <h1>Emploi du temps</h1><span class="sub">${label}</span>
      ${abEtabs.map(e => html`<span class="chip" title=${e.name}>${e.name} : semaine ${weekLetter(e, ws)}</span>`)}<span class="grow"></span>
      <button class="btn" onClick=${() => setWs(addDays(ws, -7))} aria-label="Semaine précédente">‹</button>
      <button class="btn" onClick=${() => setWs(mondayOf(new Date()))}>Aujourd'hui</button>
      <button class="btn" onClick=${() => setWs(addDays(ws, 7))} aria-label="Semaine suivante">›</button>
      <button class=${'btn' + (edit ? ' primary' : '')} onClick=${() => setEdit(!edit)}>${edit ? '✓ Terminer' : '✎ Modifier'}</button>
    </div>
    ${edit ? html`<p class="hint">Mode édition : touche une zone vide pour ajouter un créneau, ou un créneau existant pour le modifier.</p>` : null}
    ${!d.slots.length && !edit ? html`<p class="banner">Ton emploi du temps est vide. Touche <b>✎ Modifier</b> puis une zone de la grille pour ajouter un créneau (classe, salle, horaires).</p>` : null}
    <div class=${'week' + (edit ? ' edit' : '')} style=${{ '--nd': nd }}>
      <div class="dh"></div>
      ${Array.from({ length: nd }, (_, i) => {
        const date = iso(addDays(ws, i));
        return html`<div class=${'dh' + (date === today ? ' today' : '')}>${DAYS[i]}<small>${addDays(ws, i).getDate()}/${addDays(ws, i).getMonth() + 1}</small></div>`;
      })}
      <div class="gut" style=${{ height: height + 'px' }}>${hours.map(m => html`<span style=${{ top: (m - gStart) * PPM + 'px' }}>${m / 60}h</span>`)}</div>
      ${Array.from({ length: nd }, (_, i) => {
        const date = iso(addDays(ws, i));
        const slots = d.slots.filter(s => s.day === i && visible(s)).sort((a, b) => toMin(a.start) - toMin(b.start));
        return html`<div class=${'dc' + (date === today ? ' today' : '')} style=${{ height: height + 'px' }} onClick=${e => clickColumn(e, i)}>
          ${hours.map(m => html`<div class="hl" style=${{ top: (m - gStart) * PPM + 'px' }}></div>`)}
          ${date === today && nowMin >= gStart && nowMin <= gEnd ? html`<div class="now" style=${{ top: (nowMin - gStart) * PPM + 'px' }}></div>` : null}
          ${slots.map(s => {
            const se = d.sessions[sessionKey(s.classId, date, s.id)];
            const c = classById(d, s.classId);
            const room = roomById(d, s.roomId);
            const nAbs = se ? Object.values(se.marks).filter(m => m === 'A').length : 0;
            return html`<button class="slot" key=${s.id} style=${{ background: colorOf(s.classId), top: (toMin(s.start) - gStart) * PPM + 'px', height: (toMin(s.end) - toMin(s.start)) * PPM - 2 + 'px' }}
              onClick=${e => { e.stopPropagation(); openSlot(s, date); }}>
              <b>${c ? c.name : '?'}${s.week ? html` <small style="opacity:.85">· sem. ${s.week}</small>` : ''}</b><span>${s.start}–${s.end}${room ? ' · ' + room.name : ''}</span>
              ${se && se.validated ? html`<span class="tag">✓ appel${nAbs ? ' · ' + nAbs + ' abs.' : ''}</span>` : null}
            </button>`;
          })}
        </div>`;
      })}
    </div>
    ${form ? html`<${Modal} title=${form.id ? 'Modifier le créneau' : 'Nouveau créneau'} onClose=${() => setForm(null)}
      foot=${html`${form.id ? html`<button class="btn danger" onClick=${delSlot}>Supprimer</button>` : null}<span class="grow"></span>
        <button class="btn" onClick=${() => setForm(null)}>Annuler</button><button class="btn primary" onClick=${saveForm}>Enregistrer</button>`}>
      <${Field} label="Classe"><select value=${form.classId} onChange=${e => setForm({ ...form, classId: e.target.value })}>
        ${d.classes.map(c => html`<option value=${c.id}>${c.name}</option>`)}</select><//>
      <${Field} label="Jour"><select value=${form.day} onChange=${e => setForm({ ...form, day: Number(e.target.value) })}>
        ${DAYS.map((n, i) => html`<option value=${i}>${n}</option>`)}</select><//>
      <div class="row"><${Field} label="Début"><input type="time" value=${form.start} onInput=${e => setForm({ ...form, start: e.target.value })} /><//>
        <${Field} label="Fin"><input type="time" value=${form.end} onInput=${e => setForm({ ...form, end: e.target.value })} /><//></div>
      ${abEtabs.length ? html`<${Field} label="Semaine"><select value=${form.week || ''} onChange=${e => setForm({ ...form, week: e.target.value })}>
        <option value="">Toutes les semaines</option><option value="A">Semaines A seulement</option><option value="B">Semaines B seulement</option></select><//>` : null}
      <${Field} label="Salle"><select value=${form.roomId} onChange=${e => setForm({ ...form, roomId: e.target.value })}>
        <option value="">—</option>${d.rooms.map(r => html`<option value=${r.id}>${r.name}</option>`)}</select><//>
    <//>` : null}
  </div>`;
}
