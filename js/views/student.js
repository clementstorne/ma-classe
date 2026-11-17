import { html, useState, useRef } from '../../vendor/preact-htm.js';
import { useStore, mutate, classById, etabOf, currentPeriod, setPhoto, removePhoto, photoOf } from '../store.js';
import { Modal, Field, Avatar, toast } from './common.js';
import { resizeImage, uid, fmtDateShort, todayISO, displayName } from '../util.js';

/** Fiche élève : identité, photo, aménagements, historique d'événements. */
export function StudentSheet({ sid, onClose }) {
  const d = useStore();
  const s = d.students.find(x => x.id === sid);
  const file = useRef();
  const [adding, setAdding] = useState(false);
  if (!s) return null;
  const cls = classById(d, s.classId);
  const etab = etabOf(d, cls);
  const set = patch => mutate(dd => Object.assign(dd.students.find(x => x.id === sid), patch));

  async function onFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    try { await setPhoto(sid, await resizeImage(f)); } catch { toast('Image illisible'); }
    e.target.value = '';
  }
  const events = d.events.filter(e => e.sid === sid).sort((a, b) => b.date.localeCompare(a.date));
  const sess = Object.values(d.sessions).filter(se => se.marks && se.marks[sid]).sort((a, b) => b.date.localeCompare(a.date));
  const hist = [
    ...events.map(e => ({ id: e.id, date: e.date, label: e.type === 'devoir' ? '📝 Travail non fait' : '🎒 Oubli de matériel', ev: true })),
    ...sess.map(se => ({ id: se.key, date: se.date, label: se.marks[sid] === 'A' ? '🚫 Absent' : '⏰ En retard' })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  function addEvent(type) {
    mutate(dd => dd.events.push({ id: uid(), sid, classId: s.classId, date: todayISO(), sessionKey: null, type }));
  }
  function delEvent(id) { mutate(dd => { dd.events = dd.events.filter(e => e.id !== id); }); }
  function delStudent() {
    if (!confirm(`Supprimer ${displayName(s)} de la classe ? Ses notes et son suivi seront perdus.`)) return;
    mutate(dd => {
      dd.students = dd.students.filter(x => x.id !== sid);
      dd.events = dd.events.filter(e => e.sid !== sid);
      for (const se of Object.values(dd.sessions)) delete se.marks[sid];
      for (const ev of dd.evals) delete ev.scores[sid];
      for (const p of Object.values(dd.plans)) for (const k of Object.keys(p.seatMap)) if (p.seatMap[k] === sid) delete p.seatMap[k];
    });
    onClose();
  }

  return html`<${Modal} title=${displayName(s)} onClose=${onClose}
    foot=${html`<button class="btn danger" onClick=${delStudent}>Supprimer l'élève</button><span class="grow"></span><button class="btn primary" onClick=${onClose}>Fermer</button>`}>
    <div class="sheet-photo">
      <${Avatar} s=${s} size=${84} />
      <div class="col" style="gap:6px">
        <input ref=${file} type="file" accept="image/*" hidden onChange=${onFile} />
        <button class="btn small" onClick=${() => file.current.click()}>📷 ${photoOf(sid) ? 'Changer la photo' : 'Ajouter une photo'}</button>
        ${photoOf(sid) ? html`<button class="btn small ghost" onClick=${() => removePhoto(sid)}>Retirer la photo</button>` : null}
      </div>
    </div>
    <div class="row"><${Field} label="Nom"><input value=${s.nom} onInput=${e => set({ nom: e.target.value })} /><//>
      <${Field} label="Prénom"><input value=${s.prenom} onInput=${e => set({ prenom: e.target.value })} /><//></div>
    <${Field} label="Aménagement / à retenir (quelques mots)">
      <textarea placeholder="ex. PAP dys : agrandir les énoncés, tiers-temps" value=${s.amenagement || ''} onInput=${e => set({ amenagement: e.target.value })}></textarea><//>
    <div class="row"><b>Historique</b><span class="grow"></span>
      <button class="btn small" onClick=${() => addEvent('devoir')}>＋ 📝 Travail non fait</button>
      <button class="btn small" onClick=${() => addEvent('materiel')}>＋ 🎒 Oubli matériel</button></div>
    ${hist.length ? html`<div class="list ev-list">${hist.slice(0, 40).map(h => html`<div class="item" key=${h.id}>
      <span>${h.label}</span><span class="grow muted">${fmtDateShort(h.date)}</span>
      ${h.ev ? html`<button class="btn small ghost" onClick=${() => delEvent(h.id)} aria-label="Supprimer">🗑</button>` : null}</div>`)}</div>`
      : html`<p class="muted">Aucun événement enregistré.</p>`}
  <//>`;
}
