import { html, useState, useRef } from '../../vendor/preact-htm.js';
import { useStore, mutate, weekLetter, buildBackup, restoreBackup, markBackedUp, resetAll, defaultPeriods, defaultRoomSeats, S } from '../store.js';
import { Modal, Field, toast } from './common.js';
import { uid, shareOrDownload, todayISO, addDays, iso, mondayOf, fmtDateFull } from '../util.js';
import { go } from '../router.js';

export function Settings() {
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
    <div class="page-head"><h1>Réglages</h1></div>

    <h3 style="margin:8px 0">Sauvegarde</h3>
    <div class="card col">
      <p style="margin:0">Les données sont enregistrées <b>sur cet appareil</b> (iPad ou ordinateur). Pour les mettre à l'abri et les retrouver sur l'autre appareil, exporte un fichier de sauvegarde et range-le dans Google Drive.</p>
      <p style="margin:0" class=${stale ? '' : 'muted'}>${stale ? '⚠ ' : ''}Dernière sauvegarde : <b>${lastB}</b> · taille ≈ ${bytes} Ko</p>
      <div class="row"><button class="btn primary" disabled=${busy} onClick=${exportBackup}>⬆ Exporter une sauvegarde</button>
        <button class="btn" onClick=${() => file.current.click()}>⬇ Restaurer depuis un fichier</button><input ref=${file} type="file" accept=".json,application/json" hidden onChange=${onRestore} /></div>
      <p class="hint" style="margin:0"><b>iPad :</b> « Exporter » ouvre la feuille de partage → <i>Enregistrer dans Fichiers</i> → Google Drive. <b>Restaurer</b> ouvre le sélecteur de fichiers, où Drive apparaît aussi. <b>Mac :</b> le fichier part dans Téléchargements ; glisse-le dans Drive.</p>
    </div>

    <h3 style="margin:18px 0 8px">Établissements et périodes</h3>
    ${d.etabs.map(e => html`<div class="card col" style="margin-bottom:10px" key=${e.id}>
      <div class="row"><${Field} label="Nom"><input value=${e.name} onInput=${v => setEtab(e.id, { name: v.target.value })} /><//>
        <${Field} label="Découpage"><select value=${e.type} onChange=${v => { if (confirm('Remplacer les périodes par celles du nouveau découpage ?')) setEtab(e.id, { type: v.target.value, periods: defaultPeriods(v.target.value) }); }}>
          <option value="trimestre">Trimestres</option><option value="semestre">Semestres</option></select><//></div>
      <div class="row"><label class="row"><input type="checkbox" checked=${!!e.ab} onChange=${v => setEtab(e.id, { ab: v.target.checked, abRef: v.target.checked && !e.abRef ? iso(mondayOf(new Date())) : e.abRef })} /> Alternance de semaines A / B</label>
        ${e.ab ? html`<span>La semaine en cours est une semaine</span><select class="inp" style="width:auto" value=${weekLetter(e, mondayOf(new Date())) || 'A'}
          onChange=${v => { const m = mondayOf(new Date()); setEtab(e.id, { abRef: iso(v.target.value === 'A' ? m : addDays(m, -7)) }); }}><option value="A">A</option><option value="B">B</option></select>` : null}</div>
      ${e.periods.map(p => html`<div class="row" key=${p.id}><input class="inp" style="width:150px" value=${p.name} onInput=${v => setPeriod(e.id, p.id, { name: v.target.value })} />
        <input class="inp" style="width:auto" type="date" value=${p.start} onInput=${v => v.target.value && setPeriod(e.id, p.id, { start: v.target.value })} /> →
        <input class="inp" style="width:auto" type="date" value=${p.end} onInput=${v => v.target.value && setPeriod(e.id, p.id, { end: v.target.value })} /></div>`)}
    </div>`)}
    <p class="hint">Les dates par défaut sont des repères : ajuste-les au calendrier de chaque établissement. Le suivi (oublis, devoirs, absences) se calcule sur ces périodes.</p>

    <h3 style="margin:18px 0 8px">Salles</h3>
    <div class="list">${d.rooms.map(r => html`<div class="item" key=${r.id} style="cursor:default"><input class="inp" style="flex:1" value=${r.name} onInput=${v => mutate(dd => { dd.rooms.find(x => x.id === r.id).name = v.target.value; })} />
      <span class="muted small">${r.items.filter(i => i.kind === 'seat').length} places</span>
      <button class="btn small danger" onClick=${() => { if (confirm(`Supprimer la salle « ${r.name} » ?`)) mutate(dd => { dd.rooms = dd.rooms.filter(x => x.id !== r.id); dd.slots.forEach(s => { if (s.roomId === r.id) s.roomId = ''; }); for (const k of Object.keys(dd.plans)) if (k.endsWith('|' + r.id)) delete dd.plans[k]; }); }}>Supprimer</button></div>`)}</div>
    <div style="margin-top:8px"><button class="btn small" onClick=${() => mutate(dd => dd.rooms.push({ id: uid(), name: 'Salle ' + (dd.rooms.length + 1), items: defaultRoomSeats() }))}>＋ Ajouter une salle</button></div>
    <p class="hint">Le modèle de chaque salle (tables, tableau, bureau) se règle depuis le plan d'une classe, onglet « Modèle de la salle ».</p>

    <h3 style="margin:18px 0 8px">Suivi et compétences</h3>
    <div class="card col">
      <${Field} label="Seuil d'alerte (nombre d'oublis / travaux non faits sur la période)"><input type="number" min="1" value=${d.settings.threshold} onInput=${v => mutate(dd => { dd.settings.threshold = Math.max(1, Number(v.target.value) || 1); })} /><//>
      <${Field} label="Compétences (séparées par des virgules)"><input value=${d.settings.comps.join(', ')} onChange=${v => mutate(dd => { dd.settings.comps = v.target.value.split(',').map(x => x.trim()).filter(Boolean); })} /><//>
    </div>

    <h3 style="margin:18px 0 8px">Données</h3>
    <div class="card row">
      <button class="btn" onClick=${() => { if (confirm('Ajouter une classe d\'exemple (élèves fictifs) pour tester ?')) { loadDemo(); go('/classes'); } }}>Charger une classe d'exemple</button>
      <button class="btn danger" onClick=${async () => { if (confirm('Effacer TOUTES les données de cet appareil ?') && confirm('Vraiment tout effacer ? Pense à exporter une sauvegarde avant.')) { await resetAll(); toast('Données effacées'); } }}>Tout effacer</button>
    </div>
    <p class="hint" style="margin-top:14px">Ma classe · version 0.1 (prototype). Fonctionne hors connexion une fois installée.</p>
  </div>`;
}

/* ---------- Classe d'exemple (noms fictifs) ---------- */
export function loadDemo() {
  const noms = ['MARTIN', 'BERNARD', 'DUBOIS', 'THOMAS', 'ROBERT', 'PETIT', 'DURAND', 'LEROY', 'MOREAU', 'SIMON', 'LAURENT', 'LEFEBVRE', 'MICHEL', 'GARCIA', 'DAVID', 'BERTRAND', 'ROUX', 'VINCENT', 'FOURNIER', 'MOREL', 'GIRARD', 'ANDRE', 'MERCIER', 'DUPONT'];
  const pre = ['Léa', 'Hugo', 'Emma', 'Lucas', 'Chloé', 'Louis', 'Jade', 'Nathan', 'Inès', 'Gabriel', 'Lina', 'Tom', 'Zoé', 'Adam', 'Manon', 'Noah', 'Camille', 'Ethan', 'Sarah', 'Léo', 'Alice', 'Maël', 'Eva', 'Jules'];
  mutate(d => {
    const cid = uid();
    d.classes.push({ id: cid, name: 'Exemple 4A', etabId: d.etabs[0].id, color: d.classes.length % 8 });
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
