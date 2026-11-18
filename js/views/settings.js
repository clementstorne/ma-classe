import { html, useState, useRef } from '../../vendor/preact-htm.js';
import { useStore, mutate, weekLetter, buildBackup, restoreBackup, setPhoto, removePhoto, photoOf, ROOM_W, ROOM_H, markBackedUp, resetAll, defaultPeriods, defaultRoomSeats, S } from '../store.js';
import { Modal, Field, toast } from './common.js';
import { uid, resizeImage, imageSize, shareOrDownload, todayISO, addDays, iso, mondayOf, fmtDateFull } from '../util.js';
import { go } from '../router.js';
import { Etabs } from './etabs.js';

const TABS = [['sauvegardes', 'Sauvegardes'], ['vacances', 'Vacances et jours fériés'], ['etablissements', 'Établissements et salles'], ['competences', 'Compétences'], ['donnees', 'Données']];

export function Settings({ tab: t }) {
  const tab = TABS.some(x => x[0] === t) ? t : 'sauvegardes';
  const d = useStore();
  const file = useRef();
  const [busy, setBusy] = useState(false);
  const bytes = Math.round(buildBackup().length / 1024);

  async function exportBackup() {
    setBusy(true);
    const name = `ma-classe-sauvegarde-${todayISO()}.json`;
    const r = await shareOrDownload(new Blob([buildBackup()], { type: 'application/json' }), name);
    if (r !== 'cancelled') { markBackedUp(); toast(r === 'downloaded' ? 'Sauvegarde téléchargée' : 'Sauvegarde partagée'); }
    setBusy(false);
  }
  async function onRestore(e) {
    const f = e.target.files[0]; if (!f) return;
    if (!confirm('Remplacer TOUTES les données actuelles par celles de ce fichier ?')) { e.target.value = ''; return; }
    try { await restoreBackup(await f.text()); toast('Sauvegarde restaurée'); } catch (x) { alert(x.message || x); }
    e.target.value = '';
  }
  const setEtab = (id, patch) => mutate(dd => Object.assign(dd.etabs.find(e => e.id === id), patch));
  const setPeriod = (eid, pid, patch) => mutate(dd => Object.assign(dd.etabs.find(e => e.id === eid).periods.find(p => p.id === pid), patch));
  const lastB = d.lastBackup ? fmtDateFull(new Date(d.lastBackup).toISOString().slice(0, 10)) : 'jamais';
  const stale = !d.lastBackup || Date.now() - d.lastBackup > 14 * 864e5;

  return html`<div class="page" style="max-width:860px">
    <div class="page-head"><h1>⚙ Réglages</h1></div>

    <div class="tabs">${TABS.map(([k, l]) => html`<a class=${tab === k ? 'on' : ''} href=${'#/settings/' + k}>${l}</a>`)}</div>
    ${tab === 'sauvegardes' && html`<div>

    <div class="card col">
      <p style="margin:0">Les données sont enregistrées <b>sur cet appareil</b> (iPad ou ordinateur). Pour les mettre à l'abri et les retrouver sur l'autre appareil, exporte un fichier de sauvegarde et range-le dans Google Drive.</p>
      <p style="margin:0" class=${stale ? '' : 'muted'}>${stale ? '⚠ ' : ''}Dernière sauvegarde : <b>${lastB}</b> · taille ≈ ${bytes} Ko</p>
      <div class="row"><button class="btn primary" disabled=${busy} onClick=${exportBackup}>⬆ Exporter une sauvegarde</button>
        <button class="btn" onClick=${() => file.current.click()}>⬇ Restaurer depuis un fichier</button><input ref=${file} type="file" accept=".json,application/json" hidden onChange=${onRestore} /></div>
      <p class="hint" style="margin:0"><b>iPad :</b> « Exporter » ouvre la feuille de partage → <i>Enregistrer dans Fichiers</i> → Google Drive. <b>Restaurer</b> ouvre le sélecteur de fichiers, où Drive apparaît aussi. <b>Mac :</b> le fichier part dans Téléchargements ; glisse-le dans Drive.</p>
    </div>

</div>`}
    ${tab === 'vacances' && html`<div>
<p class="hint" style="margin:0 0 8px">Ces dates sont communes à tous les établissements : les cours qui tombent ces jours-là n'apparaissent pas dans l'emploi du temps.</p>
    <${Holidays} />

</div>`}
    ${tab === 'etablissements' && html`<div>
      <${Etabs} embedded=${true} />
    <h3 style="margin:22px 0 8px">Salles</h3>
    <p class="hint" style="margin:0 0 8px">Rattache chaque salle à un établissement : seules les salles de l'établissement d'une classe sont proposées pour son emploi du temps et son plan. Tu peux aussi charger l'image du plan de la salle comme fond du plan de classe.</p>
    <div class="list">${d.rooms.map(r => html`<div class="item col" key=${r.id} style="cursor:default;align-items:stretch">
      <div class="row"><input class="inp" style="flex:1;min-width:140px" value=${r.name} onInput=${v => mutate(dd => { dd.rooms.find(x => x.id === r.id).name = v.target.value; })} />
        <select class="inp" style="width:auto" value=${r.etabId || ''} onChange=${e => mutate(dd => { dd.rooms.find(x => x.id === r.id).etabId = e.target.value; })}><option value="">Tous les établissements</option>${d.etabs.map(e => html`<option value=${e.id}>${e.name}</option>`)}</select></div>
      <div class="row"><span class="muted small">${r.items.filter(i => i.kind === 'seat').length} places</span><span class="grow"></span>
        <${RoomBg} room=${r} />
        <button class="btn small danger" onClick=${() => { if (confirm(`Supprimer la salle « ${r.name} » ?`)) { removePhoto('bg-' + r.id); mutate(dd => { dd.rooms = dd.rooms.filter(x => x.id !== r.id); dd.slots.forEach(s => { if (s.roomId === r.id) s.roomId = ''; }); for (const k of Object.keys(dd.plans)) if (k.endsWith('|' + r.id)) delete dd.plans[k]; }); } }}>Supprimer</button></div></div>`)}</div>
    <div style="margin-top:8px"><button class="btn small" onClick=${() => mutate(dd => dd.rooms.push({ id: uid(), name: 'Salle ' + (dd.rooms.length + 1), items: defaultRoomSeats() }))}>＋ Ajouter une salle</button></div>
    <p class="hint">Le modèle de chaque salle (tables, tableau, bureau) se règle depuis le plan d'une classe, onglet « Modèle de la salle ».</p>

</div>`}
    ${tab === 'competences' && html`<div>

    <div class="card col">
      <${Field} label="Seuil d'alerte (nombre d'oublis / travaux non faits sur la période)"><input type="number" min="1" value=${d.settings.threshold} onInput=${v => mutate(dd => { dd.settings.threshold = Math.max(1, Number(v.target.value) || 1); })} /><//>
      <${Field} label="Compétences (séparées par des virgules)"><input value=${d.settings.comps.join(', ')} onChange=${v => mutate(dd => { dd.settings.comps = v.target.value.split(',').map(x => x.trim()).filter(Boolean); })} /><//>
    </div>

</div>`}
    ${tab === 'donnees' && html`<div>

    <div class="card row">
      <button class="btn" onClick=${() => { if (confirm('Ajouter une classe d\'exemple (élèves fictifs) pour tester ?')) { loadDemo(); go('/classes'); } }}>Charger une classe d'exemple</button>
      <button class="btn danger" onClick=${async () => { if (confirm('Effacer TOUTES les données de cet appareil ?') && confirm('Vraiment tout effacer ? Pense à exporter une sauvegarde avant.')) { await resetAll(); toast('Données effacées'); } }}>Tout effacer</button>
    </div>
</div>`}
    <p class="hint" style="margin-top:14px">Ma classe · version 0.1 (prototype). Fonctionne hors connexion une fois installée.</p>
  </div>`;
}

/* ---------- Classe d'exemple (noms fictifs) ---------- */
export function loadDemo() {
  const noms = ['MARTIN', 'BERNARD', 'DUBOIS', 'THOMAS', 'ROBERT', 'PETIT', 'DURAND', 'LEROY', 'MOREAU', 'SIMON', 'LAURENT', 'LEFEBVRE', 'MICHEL', 'GARCIA', 'DAVID', 'BERTRAND', 'ROUX', 'VINCENT', 'FOURNIER', 'MOREL', 'GIRARD', 'ANDRE', 'MERCIER', 'DUPONT'];
  const pre = ['Léa', 'Hugo', 'Emma', 'Lucas', 'Chloé', 'Louis', 'Jade', 'Nathan', 'Inès', 'Gabriel', 'Lina', 'Tom', 'Zoé', 'Adam', 'Manon', 'Noah', 'Camille', 'Ethan', 'Sarah', 'Léo', 'Alice', 'Maël', 'Eva', 'Jules'];
  mutate(d => {
    const cid = uid();
    d.classes.push({ id: cid, name: 'Exemple 4A', etabId: d.etabs[0].id, color: '#d9822b' });
    const sts = noms.map((n, i) => ({ id: uid(), classId: cid, nom: n, prenom: pre[i], amenagement: i === 3 ? 'Dys : énoncés agrandis, tiers-temps' : i === 9 ? 'Place devant, rappel des consignes' : '', hasPhoto: false }));
    d.students.push(...sts);
    const mon = mondayOf(new Date());
    const room = d.rooms[0];
    [[0, '10:00', '10:55'], [2, '08:00', '08:55'], [3, '14:00', '14:55']].forEach(([day, s, e]) => d.slots.push({ id: uid(), day, start: s, end: e, classId: cid, roomId: room.id }));
    // plan de classe : placement alphabétique
    const seats = room.items.filter(i => i.kind === 'seat');
    const seatMap = {};
    sts.forEach((s, i) => { if (seats[i]) seatMap[seats[i].id] = s.id; });
    d.plans[`${cid}|${room.id}`] = { seatMap };
    // une évaluation avec compétences
    const ex = [
      { id: uid(), title: 'Exercice 1', questions: [{ id: uid(), label: '1', max: 1, comps: ['Calculer'] }, { id: uid(), label: '2', max: 1, comps: ['Calculer'] }, { id: uid(), label: '3', max: 2, comps: ['Raisonner'] }] },
      { id: uid(), title: 'Exercice 2', questions: [{ id: uid(), label: '1a', max: 1, comps: ['Modéliser'] }, { id: uid(), label: '1b', max: 1, comps: ['Calculer'] }, { id: uid(), label: '2', max: 2, comps: ['Raisonner', 'Communiquer'] }] }];
    const scores = {};
    sts.forEach((s, i) => { const sc = {}; ex.forEach(e => e.questions.forEach((q, k) => { const r = ((i * 7 + k * 3) % 5) / 4; if (!(i === 5 && k === 2)) sc[q.id] = Math.round(r * q.max * 4) / 4; })); scores[s.id] = sc; });
    d.evals.push({ id: uid(), classId: cid, name: 'DS exemple', date: iso(addDays(mon, -3)), exercises: ex, scores });
    // quelques événements
    const today = todayISO();
    [[1, 'devoir'], [1, 'materiel'], [4, 'materiel'], [6, 'devoir'], [6, 'devoir']].forEach(([i, t], k) => d.events.push({ id: uid(), sid: sts[i].id, classId: cid, date: iso(addDays(new Date(), -k - 1)), sessionKey: null, type: t }));
  });
}

/* ---------- Vacances & jours fériés ---------- */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, da);
}
function frenchHolidays(y) {
  const E = easter(y), at = (n) => iso(addDays(E, n)), f = (m, dd) => `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return [[f(1, 1), 'Jour de l\'An'], [at(1), 'Lundi de Pâques'], [f(5, 1), 'Fête du Travail'], [f(5, 8), 'Victoire 1945'], [at(39), 'Ascension'], [at(50), 'Lundi de Pentecôte'],
    [f(7, 14), 'Fête nationale'], [f(8, 15), 'Assomption'], [f(11, 1), 'Toussaint'], [f(11, 11), 'Armistice 1918'], [f(12, 25), 'Noël']].map(([s, n]) => ({ start: s, name: n }));
}
function Holidays() {
  const d = useStore();
  const [f, setF] = useState({ name: '', start: '', end: '', etabId: '' });
  const list = [...(d.holidays || [])].sort((a, b) => a.start.localeCompare(b.start));
  const fmt = s => fromISOs(s);
  function add() {
    if (!f.name.trim() || !f.start) return toast('Indique un nom et une date de début.');
    const end = f.end && f.end >= f.start ? f.end : f.start;
    mutate(dd => { dd.holidays.push({ id: uid(), name: f.name.trim(), start: f.start, end, etabId: f.etabId }); });
    setF({ name: '', start: '', end: '', etabId: f.etabId });
  }
  function fr() {
    const y = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1; // année scolaire en cours
    const all = [...frenchHolidays(y).filter(h => h.start >= `${y}-08-01`), ...frenchHolidays(y + 1).filter(h => h.start < `${y + 1}-08-01`)];
    let n = 0;
    mutate(dd => all.forEach(h => { if (!dd.holidays.some(x => x.start === h.start && x.name === h.name)) { dd.holidays.push({ id: uid(), name: h.name, start: h.start, end: h.start, etabId: '' }); n++; } }));
    toast(n ? `${n} jours fériés ajoutés (${y}-${y + 1}).` : 'Déjà ajoutés.');
  }
  return html`<div class="card col">
    <p class="hint" style="margin:0">Les cours récurrents n'apparaissent pas dans l'emploi du temps pendant ces dates (les séances ponctuelles restent affichées).</p>
    <div class="row" style="align-items:flex-end">
      <${Field} label="Nom"><input value=${f.name} placeholder="ex. Vacances de Noël" onInput=${e => setF({ ...f, name: e.target.value })} /><//>
      <${Field} label="Du"><input type="date" value=${f.start} onInput=${e => setF({ ...f, start: e.target.value })} /><//>
      <${Field} label="Au (inclus, facultatif)"><input type="date" value=${f.end} onInput=${e => setF({ ...f, end: e.target.value })} /><//>
      <button class="btn primary" onClick=${add}>＋ Ajouter</button></div>
    <div class="row"><button class="btn" onClick=${fr}>Ajouter les jours fériés français de l'année scolaire</button></div>
    ${list.length ? html`<div class="list">${list.map(h => html`<div class="item" key=${h.id} style="cursor:default"><div class="nm"><b>${h.name}</b>
      <div class="small muted">${h.end && h.end !== h.start ? 'du ' + fmt(h.start) + ' au ' + fmt(h.end) : fmt(h.start)}${h.etabId ? ' · ' + ((d.etabs.find(e => e.id === h.etabId) || {}).name || '') : ''}</div></div>
      <button class="btn small danger" onClick=${() => mutate(dd => { dd.holidays = dd.holidays.filter(x => x.id !== h.id); })}>Supprimer</button></div>`)}</div>` : html`<p class="muted" style="margin:0">Aucune date saisie.</p>`}</div>`;
}
const fromISOs = s => fmtDateFull(s);

function RoomBg({ room }) {
  const f = useRef();
  const has = !!photoOf('bg-' + room.id);
  async function pick(e) {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const url = await resizeImage(file, 1400, 'image/png');
      const { w, h } = await imageSize(url);
      await setPhoto('bg-' + room.id, url);
      mutate(dd => { dd.rooms.find(x => x.id === room.id).h = Math.round(ROOM_W * h / w); });
      toast('Image de fond enregistrée.');
    } catch (err) { toast('Image illisible.'); }
  }
  async function del() {
    await removePhoto('bg-' + room.id);
    mutate(dd => { const r = dd.rooms.find(x => x.id === room.id); delete r.h; r.items.forEach(i => { i.y = Math.min(i.y, ROOM_H - i.h); }); });
  }
  return html`<input type="file" accept="image/*" hidden ref=${f} onChange=${pick} />
    <button class="btn small" onClick=${() => f.current.click()}>${has ? '🖼 Changer le fond' : '🖼 Image de fond'}</button>
    ${has ? html`<button class="btn small" onClick=${del}>Retirer le fond</button>` : null}`;
}
