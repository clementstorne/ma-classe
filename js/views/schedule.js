import { html, useState } from '../../vendor/preact-htm.js';
import { useStore, mutate, classById, roomById, sessionKey, etabOf, weekLetter, occurrence, groupsOf } from '../store.js';
import { mondayOf, addDays, iso, fromISO, toMin, fromMin, DAYS, uid, classColor, textOn, todayISO, fmtDateLong } from '../util.js';
import { Modal, Field, Empty, toast } from './common.js';
import { go } from '../router.js';

const PPM = 1.05; // pixels par minute
const dayIdx = date => (fromISO(date).getDay() + 6) % 7;

export function Schedule() {
  const d = useStore();
  const [ws, setWs] = useState(mondayOf(new Date()));
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(null);

  const abEtabs = d.etabs.filter(e => e.ab && e.abRef);
  const letterOfClass = cid => weekLetter(etabOf(d, classById(d, cid)), ws);

  /* séances (occurrences) de chaque jour de la semaine affichée */
  const occOn = date => {
    const out = [];
    for (const s of d.slots) {
      if (s.date) { if (s.date === date) out.push(occurrence(d, s.id, date)); continue; }
      if (s.day !== dayIdx(date)) continue;
      const L = letterOfClass(s.classId);
      if (s.week && L && s.week !== L) continue;
      out.push(occurrence(d, s.id, date));
    }
    return out.sort((a, b) => toMin(a.start) - toMin(b.start));
  };
  const dates6 = Array.from({ length: 6 }, (_, i) => iso(addDays(ws, i)));
  const hasSat = occOn(dates6[5]).length > 0;
  const nd = hasSat ? 6 : 5;
  const dates = dates6.slice(0, nd);
  const byDate = Object.fromEntries(dates.map(dt => [dt, occOn(dt)]));
  const mins = dates.flatMap(dt => byDate[dt].flatMap(o => [toMin(o.start), toMin(o.end)]));
  const gStart = Math.floor(Math.min(8 * 60, ...mins) / 60) * 60;
  const gEnd = Math.ceil(Math.max(17 * 60, ...mins) / 60) * 60;
  const height = (gEnd - gStart) * PPM;
  const today = todayISO();
  const hours = [];
  for (let m = gStart; m <= gEnd; m += 60) hours.push(m);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const colorOf = cid => { const c = classById(d, cid); return c ? classColor(c) : '#888'; };

  /* ---------- formulaires ---------- */
  const firstClass = d.classes[0] ? d.classes[0].id : '';
  const firstRoom = d.rooms[0] ? d.rooms[0].id : '';
  function newForm(date, start, kind) {
    const s = start || '08:00';
    setForm({ mode: 'new', kind: kind || 'recurring', date, day: dayIdx(date), start: s, end: fromMin(toMin(s) + 55), classId: firstClass, roomId: firstRoom, week: '', group: '' });
  }
  function clickColumn(e, date) {
    if (!edit || e.target.closest('.slot')) return;
    const r = e.currentTarget.getBoundingClientRect();
    newForm(date, fromMin(gStart + Math.round((e.clientY - r.top) / PPM / 5) * 5));
  }
  function openOcc(o) {
    if (edit) {
      if (o.oneOff) setForm({ mode: 'edit', kind: 'oneoff', id: o.id, date: o.date, start: o.start, end: o.end, classId: o.classId, roomId: o.roomId || '', week: '', group: o.group || '' });
      else {
        const base = d.slots.find(s => s.id === o.id);
        setForm({ mode: 'edit', kind: 'recurring', scope: 'once', id: o.id, date: o.date, cancelled: o.cancelled, base,
          day: base.day, week: base.week || '', start: o.start, end: o.end, classId: o.classId, roomId: o.roomId || '', group: o.group || '' });
      }
      return;
    }
    if (o.cancelled) return toast('Cette séance est annulée');
    go(`/class/${o.classId}/eleves?date=${o.date}&slot=${o.id}`);
  }
  const setScope = scope => {
    const b = form.base, o = occurrence(d, form.id, form.date);
    setForm(scope === 'all'
      ? { ...form, scope, start: b.start, end: b.end, classId: b.classId, roomId: b.roomId || '', group: b.group || '' }
      : { ...form, scope, start: o.start, end: o.end, classId: o.classId, roomId: o.roomId || '', group: o.group || '' });
  };

  function save() {
    const f = form;
    if (!f.classId) return toast('Choisis une classe');
    if (toMin(f.start) >= toMin(f.end)) return toast('L\'heure de fin doit suivre le début');
    mutate(dd => {
      if (f.mode === 'new') {
        if (f.kind === 'oneoff') dd.slots.push({ id: uid(), date: f.date, start: f.start, end: f.end, classId: f.classId, roomId: f.roomId, group: f.group });
        else dd.slots.push({ id: uid(), day: f.day, start: f.start, end: f.end, classId: f.classId, roomId: f.roomId, week: f.week, group: f.group });
      } else if (f.kind === 'oneoff') {
        Object.assign(dd.slots.find(s => s.id === f.id), { date: f.date, start: f.start, end: f.end, classId: f.classId, roomId: f.roomId, group: f.group });
      } else if (f.scope === 'all') {
        Object.assign(dd.slots.find(s => s.id === f.id), { day: f.day, start: f.start, end: f.end, classId: f.classId, roomId: f.roomId, week: f.week, group: f.group });
      } else {
        const base = dd.slots.find(s => s.id === f.id), key = `${f.id}|${f.date}`;
        const o = { ...(dd.overrides[key] || {}) };
        for (const k of ['start', 'end', 'classId', 'roomId', 'group']) { if ((f[k] || '') !== (base[k] || '')) o[k] = f[k]; else delete o[k]; }
        if (Object.keys(o).length) dd.overrides[key] = o; else delete dd.overrides[key];
      }
    });
    setForm(null);
  }
  function cancelOcc(cancel) {
    const key = `${form.id}|${form.date}`;
    mutate(dd => {
      const o = { ...(dd.overrides[key] || {}) };
      if (cancel) o.cancelled = true; else delete o.cancelled;
      if (Object.keys(o).length) dd.overrides[key] = o; else delete dd.overrides[key];
    });
    setForm(null);
  }
  function delSlot() {
    const msg = form.kind === 'oneoff' ? 'Supprimer cette séance ponctuelle ?' : 'Supprimer ce créneau pour TOUTES les semaines ? (Pour une seule séance, utilise « Annuler cette séance ».)';
    if (!confirm(msg)) return;
    mutate(dd => {
      dd.slots = dd.slots.filter(s => s.id !== form.id);
      for (const k of Object.keys(dd.overrides)) if (k.startsWith(form.id + '|')) delete dd.overrides[k];
    });
    setForm(null);
  }
  function addOneOffButton() {
    const inWeek = dates.includes(today) ? today : dates[0];
    setEdit(true);
    newForm(inWeek, '08:00', 'oneoff');
  }

  const wEnd = addDays(ws, nd - 1);
  const label = `${ws.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} – ${wEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;

  if (!d.classes.length) return html`<div class="page"><${Empty} title="Bienvenue dans Ma classe">
    <p>Commence par créer ou importer tes classes, puis place tes créneaux dans l'emploi du temps.</p>
    <div class="row" style="justify-content:center"><a class="btn primary" href="#/classes">Aller aux classes</a>
    <a class="btn" href="#/settings">Réglages (sauvegarde, exemple)</a></div><//></div>`;

  const f = form;
  const recurringEdit = f && f.kind === 'recurring' && f.mode === 'edit';
  const showWeekDay = f && f.kind === 'recurring' && (f.mode === 'new' || f.scope === 'all');

  return html`<div class="page">
    <div class="page-head">
      <h1>Emploi du temps</h1><span class="sub">${label}</span>
      ${abEtabs.map(e => html`<span class="chip" title=${e.name}>${e.name} : semaine ${weekLetter(e, ws)}</span>`)}<span class="grow"></span>
      <button class="btn" onClick=${() => setWs(addDays(ws, -7))} aria-label="Semaine précédente">‹</button>
      <button class="btn" onClick=${() => setWs(mondayOf(new Date()))}>Aujourd'hui</button>
      <button class="btn" onClick=${() => setWs(addDays(ws, 7))} aria-label="Semaine suivante">›</button>
      <button class="btn" onClick=${addOneOffButton}>＋ Séance ponctuelle</button>
      <button class=${'btn' + (edit ? ' primary' : '')} onClick=${() => setEdit(!edit)}>${edit ? '✓ Terminer' : '✎ Modifier'}</button>
    </div>
    ${edit ? html`<p class="hint">Mode édition : touche une zone vide pour ajouter un créneau, ou une séance pour la modifier, l'annuler ou la déplacer <b>uniquement cette semaine</b> (ou pour toutes les semaines).</p>` : null}
    ${!d.slots.length && !edit ? html`<p class="banner">Ton emploi du temps est vide. Touche <b>✎ Modifier</b> puis une zone de la grille pour ajouter un créneau (classe, salle, horaires).</p>` : null}
    <div class=${'week' + (edit ? ' edit' : '')} style=${{ '--nd': nd }}>
      <div class="dh"></div>
      ${dates.map((date, i) => html`<div class=${'dh' + (date === today ? ' today' : '')}>${DAYS[i]}<small>${fromISO(date).getDate()}/${fromISO(date).getMonth() + 1}</small></div>`)}
      <div class="gut" style=${{ height: height + 'px' }}>${hours.map(m => html`<span style=${{ top: (m - gStart) * PPM + 'px' }}>${m / 60}h</span>`)}</div>
      ${dates.map(date => html`<div class=${'dc' + (date === today ? ' today' : '')} style=${{ height: height + 'px' }} onClick=${e => clickColumn(e, date)}>
        ${hours.map(m => html`<div class="hl" style=${{ top: (m - gStart) * PPM + 'px' }}></div>`)}
        ${date === today && nowMin >= gStart && nowMin <= gEnd ? html`<div class="now" style=${{ top: (nowMin - gStart) * PPM + 'px' }}></div>` : null}
        ${byDate[date].map(o => {
          const se = d.sessions[sessionKey(o.classId, date, o.id)];
          const c = classById(d, o.classId), room = roomById(d, o.roomId);
          const nAbs = se ? Object.values(se.marks).filter(m => m === 'A').length : 0;
          const bg = colorOf(o.classId);
          const note = o.cancelled ? 'annulée' : o.oneOff ? 'ponctuelle' : o.modified ? 'modifiée' : '';
          return html`<button class=${'slot' + (o.cancelled ? ' cancelled' : '')} key=${o.id} style=${{ background: bg, color: textOn(bg), top: (toMin(o.start) - gStart) * PPM + 'px', height: (toMin(o.end) - toMin(o.start)) * PPM - 2 + 'px' }}
            onClick=${e => { e.stopPropagation(); openOcc(o); }}>
            <b>${c ? c.name : '?'}${o.group ? html` <small>· ${o.group}</small>` : ''}${o.week && !o.oneOff ? html` <small style="opacity:.85">· sem. ${o.week}</small>` : ''}${note ? html` <small class="note">· ${note}</small>` : ''}</b>
            <span>${o.start}–${o.end}${room ? ' · ' + room.name : ''}</span>
            ${se && se.validated && !o.cancelled ? html`<span class="tag">✓ appel${nAbs ? ' · ' + nAbs + ' abs.' : ''}</span>` : null}
          </button>`;
        })}
      </div>`)}
    </div>
    ${f ? html`<${Modal} title=${f.mode === 'new' ? (f.kind === 'oneoff' ? 'Nouvelle séance ponctuelle' : 'Nouveau créneau') : f.kind === 'oneoff' ? 'Séance ponctuelle' : 'Modifier la séance'} onClose=${() => setForm(null)}
      foot=${html`${f.mode === 'edit' ? html`<button class="btn danger" onClick=${delSlot}>${f.kind === 'oneoff' ? 'Supprimer' : 'Supprimer le créneau'}</button>` : null}<span class="grow"></span>
        <button class="btn" onClick=${() => setForm(null)}>Fermer</button><button class="btn primary" onClick=${save}>Enregistrer</button>`}>
      ${f.mode === 'new' ? html`<div class="seg"><button class=${f.kind === 'recurring' ? 'on P' : ''} onClick=${() => setForm({ ...f, kind: 'recurring' })}>Chaque semaine</button>
        <button class=${f.kind === 'oneoff' ? 'on P' : ''} onClick=${() => setForm({ ...f, kind: 'oneoff' })}>Une seule fois</button></div>` : null}
      ${recurringEdit ? html`<p style="margin:0"><b>${fmtDateLong(f.date)}</b>${f.cancelled ? html` <span class="chip" style="background:var(--ko-soft);color:var(--ko)">annulée</span>` : ''}</p>
        <div class="seg"><button class=${f.scope === 'once' ? 'on P' : ''} onClick=${() => setScope('once')}>Cette séance seulement</button>
        <button class=${f.scope === 'all' ? 'on P' : ''} onClick=${() => setScope('all')}>Toutes les semaines</button></div>` : null}
      <${Field} label="Classe"><select value=${f.classId} onChange=${e => setForm({ ...f, classId: e.target.value, group: groupsOf(classById(d, e.target.value)).includes(f.group) ? f.group : '' })}>${d.classes.map(c => html`<option value=${c.id}>${c.name}</option>`)}</select><//>
      ${groupsOf(classById(d, f.classId)).length ? html`<${Field} label="Cours en groupe ?"><select value=${f.group || ''} onChange=${e => setForm({ ...f, group: e.target.value })}>
        <option value="">Non — classe entière</option>${groupsOf(classById(d, f.classId)).map(g => html`<option value=${g}>Groupe ${g}</option>`)}</select><//>` : null}
      ${f.kind === 'oneoff' ? html`<${Field} label="Date"><input type="date" value=${f.date} onInput=${e => e.target.value && setForm({ ...f, date: e.target.value })} /><//>`
        : f.mode === 'new' ? html`<${Field} label="Jour"><select value=${f.day} onChange=${e => setForm({ ...f, day: Number(e.target.value) })}>${DAYS.map((n, i) => html`<option value=${i}>${n}</option>`)}</select><//>`
        : showWeekDay ? html`<${Field} label="Jour"><select value=${f.day} onChange=${e => setForm({ ...f, day: Number(e.target.value) })}>${DAYS.map((n, i) => html`<option value=${i}>${n}</option>`)}</select><//>` : null}
      <div class="row"><${Field} label="Début"><input type="time" value=${f.start} onInput=${e => setForm({ ...f, start: e.target.value })} /><//>
        <${Field} label="Fin"><input type="time" value=${f.end} onInput=${e => setForm({ ...f, end: e.target.value })} /><//></div>
      <${Field} label="Salle"><select value=${f.roomId} onChange=${e => setForm({ ...f, roomId: e.target.value })}><option value="">—</option>${d.rooms.map(r => html`<option value=${r.id}>${r.name}</option>`)}</select><//>
      ${abEtabs.length && f.kind === 'recurring' && showWeekDay ? html`<${Field} label="Semaine"><select value=${f.week || ''} onChange=${e => setForm({ ...f, week: e.target.value })}>
        <option value="">Toutes les semaines</option><option value="A">Semaines A seulement</option><option value="B">Semaines B seulement</option></select><//>` : null}
      ${recurringEdit ? html`<div class="row"><button class=${'btn' + (f.cancelled ? '' : ' danger')} onClick=${() => cancelOcc(!f.cancelled)}>${f.cancelled ? '↺ Rétablir cette séance' : '✕ Annuler cette séance (pas de cours ce jour-là)'}</button></div>` : null}
    <//>` : null}
  </div>`;
}
