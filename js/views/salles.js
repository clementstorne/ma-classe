import { html, useState, useRef } from '../../vendor/preact-htm.js';
import { useStore, mutate, roomById, roomH, photoOf, setPhoto, removePhoto, defaultRoomSeats, planKey, parsePlanKey, ROOM_W, ROOM_H, SEAT_W, SEAT_H } from '../store.js';
import { Modal, Field, Empty, toast } from './common.js';
import { PlanCanvas } from './plan.js';
import { uid, resizeImage, imageSize } from '../util.js';
import { go } from '../router.js';
import { Ico } from '../icons.js';

/** Miniature d'une salle (fond, tables, repères). seatMap facultatif : colore les places occupées. */
export function PlanThumb({ room, seatMap = {} }) {
  const H = roomH(room), bg = photoOf('bg-' + room.id);
  const pc = (v, t) => (v / t * 100) + '%';
  return html`<div class="plan-thumb" style=${{ aspectRatio: ROOM_W + ' / ' + H, ...(bg ? { backgroundImage: `url(${bg})`, backgroundSize: '100% 100%' } : {}) }}>
    ${room.items.map(it => html`<div key=${it.id} class=${'pt ' + (it.kind === 'label' ? 'lb' : seatMap[it.id] ? 'on' : 'off')}
      style=${{ left: pc(it.x, ROOM_W), top: pc(it.y, H), width: pc(it.w, ROOM_W), height: pc(it.h, H) }}>${it.kind === 'label' ? it.text : ''}</div>`)}</div>`;
}

function removeRoom(r) {
  if (!confirm(`Supprimer la salle « ${r.name} » ? Les plans de classe qui l'utilisent seront supprimés.`)) return false;
  removePhoto('bg-' + r.id);
  mutate(dd => { dd.rooms = dd.rooms.filter(x => x.id !== r.id); dd.slots.forEach(s => { if (s.roomId === r.id) s.roomId = ''; }); for (const k of Object.keys(dd.plans)) if (parsePlanKey(k).roomId === r.id) delete dd.plans[k]; });
  return true;
}

/* ---------- Liste des salles ---------- */
export function Salles() {
  const d = useStore();
  const add = () => { const id = uid(); mutate(dd => dd.rooms.push({ id, name: 'Salle ' + (dd.rooms.length + 1), etabId: (dd.etabs[0] || {}).id || '', items: defaultRoomSeats() })); };
  return html`<div class="page">
    <div class="page-head"><span class="grow"></span><button class="btn primary" onClick=${add}>${Ico('plus')} Ajouter une salle</button></div>
    ${!d.rooms.length ? html`<${Empty} title="Aucune salle"><p>Ajoute une salle, rattache-la à un établissement et dessine son modèle (tables, tableau, bureau).</p><//>`
    : d.etabs.concat(d.rooms.some(r => !r.etabId) ? [{ id: '', name: 'Tous les établissements' }] : []).map(e => {
        const rs = d.rooms.filter(r => (r.etabId || '') === e.id);
        if (!rs.length) return null;
        return html`<h3 style="margin:16px 0 8px" key=${e.id}>${e.name}</h3><div class="plan-cards">${rs.map(r => html`<div class="card plan-card" key=${r.id} onClick=${() => go('/salle/' + r.id)}>
          <${PlanThumb} room=${r} />
          <div class="row" style="margin-top:10px"><div class="grow"><b>${r.name}</b><div class="muted small">${r.items.filter(i => i.kind === 'seat').length} places</div></div>
            <button class="btn small danger" onClick=${ev => { ev.stopPropagation(); removeRoom(r); }}>Supprimer</button></div></div>`)}</div>`;
      })}
  </div>`;
}

/* ---------- Édition d'une salle : nom, établissement, fond, modèle ---------- */
export function RoomEditor({ id }) {
  const d = useStore();
  const room = roomById(d, id);
  const [selSeat, setSelSeat] = useState(null);
  const [gen, setGen] = useState(false);
  if (!room) return html`<${Empty} title="Salle introuvable"><a class="btn" href="#/salles">Retour</a><//>`;
  const edit = fn => mutate(dd => fn(dd.rooms.find(r => r.id === id), dd));
  const itemChange = (iid, patch) => edit(r => Object.assign(r.items.find(i => i.id === iid), patch));
  const addSeat = () => edit(r => { r.items.push({ id: uid(), kind: 'seat', x: 500, y: 300, w: SEAT_W, h: SEAT_H }); });
  const addLabel = () => { const t = prompt('Texte du repère (ex. Tableau, Bureau, Porte, Fenêtre)', 'Bureau'); if (t) edit(r => r.items.push({ id: uid(), kind: 'label', x: 500, y: 20, w: 240, h: 44, text: t })); };
  const delSel = () => { if (!selSeat) return; edit((r, dd) => { r.items = r.items.filter(i => i.id !== selSeat); for (const p of Object.values(dd.plans)) delete p.seatMap[selSeat]; }); setSelSeat(null); };
  const dupSel = () => { if (!selSeat) return; edit(r => { const i = r.items.find(x => x.id === selSeat); if (i) r.items.push({ ...i, id: uid(), x: Math.min(ROOM_W - i.w, i.x + 20), y: Math.min(roomH(r) - i.h, i.y + 20) }); }); };
  const editLabel = () => { const it = room.items.find(i => i.id === selSeat); if (!it || it.kind !== 'label') return; const t = prompt('Texte du repère', it.text); if (t) itemChange(it.id, { text: t }); };
  const clearRoom = () => { if (confirm('Supprimer tous les éléments de cette salle ? Les plans de classe qui l\'utilisent seront vidés.')) { edit((r, dd) => { r.items = []; for (const k of Object.keys(dd.plans)) if (parsePlanKey(k).roomId === id) dd.plans[k].seatMap = {}; }); setSelSeat(null); } };
  const selItem = room.items.find(i => i.id === selSeat);
  return html`<div class="page" style="max-width:1400px">
    <div class="page-head">
      <a class="btn" href="#/salles">‹ Salles</a>
      <input class="inp" style="width:220px;font-weight:700" value=${room.name} onInput=${e => edit(r => { r.name = e.target.value; })} />
      <select class="inp" style="width:auto" value=${room.etabId || ''} onChange=${e => edit(r => { r.etabId = e.target.value; })}><option value="">Tous les établissements</option>${d.etabs.map(e => html`<option value=${e.id}>${e.name}</option>`)}</select>
      <span class="grow"></span><${RoomBg} room=${room} />
      <button class="btn danger" onClick=${() => { if (removeRoom(room)) go('/salles'); }}>Supprimer la salle</button>
    </div>
    <div class="row" style="margin-bottom:10px">
      <button class="btn small" onClick=${addSeat}>${Ico('plus')} Table</button><button class="btn small" onClick=${() => setGen(true)}>${Ico('layout')} Générer une grille</button>
      <button class="btn small" onClick=${addLabel}>${Ico('plus')} Repère (tableau, bureau…)</button><span class="grow"></span>
      ${selItem ? html`${selItem.kind === 'label' ? html`<button class="btn small" onClick=${editLabel}>Renommer</button>` : null}
        <button class="btn small" onClick=${dupSel}>Dupliquer</button><button class="btn small danger" onClick=${delSel}>Supprimer</button>` : html`<span class="hint">Glisse les éléments pour les placer ; touche-en un pour le sélectionner.</span>`}
      <button class="btn small danger" onClick=${clearRoom}>Tout effacer</button></div>
    <${PlanCanvas} room=${room} seatMap=${{}} byId=${{}} mode="template" selected=${selSeat} onSeatTap=${it => setSelSeat(it.id === selSeat ? null : it.id)} onItemChange=${itemChange} />
    ${gen ? html`<${GridGen} onClose=${() => setGen(false)} onGen=${items => { edit(r => { r.items.push(...items); }); setGen(false); }} />` : null}
  </div>`;
}

function GridGen({ onClose, onGen }) {
  const [rows, setRows] = useState(5), [cols, setCols] = useState(6), [group, setGroup] = useState(2);
  function gen() {
    const sw = SEAT_W, sh = SEAT_H, gap = 10, gGap = 40, y0 = 110;
    const groups = Math.ceil(cols / group);
    const totalW = cols * sw + (cols - 1) * gap + (groups - 1) * gGap;
    const x0 = Math.max(10, Math.round((ROOM_W - totalW) / 2 / 10) * 10);
    const rowH = Math.min(sh + 8, Math.floor((ROOM_H - y0 - 10) / rows));
    const items = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      items.push({ id: uid(), kind: 'seat', x: x0 + c * (sw + gap) + Math.floor(c / group) * gGap, y: y0 + r * rowH, w: sw, h: Math.min(sh, rowH - 6) });
    onGen(items);
  }
  const num = (v, set, max) => html`<input type="number" min="1" max=${max} value=${v} onInput=${e => set(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />`;
  return html`<${Modal} title="Générer une grille de tables" onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Annuler</button><button class="btn primary" onClick=${gen}>Ajouter ${rows * cols} tables</button>`}>
    <div class="row"><${Field} label="Rangées">${num(rows, setRows, 8)}<//><${Field} label="Colonnes">${num(cols, setCols, 10)}<//>
    <${Field} label="Tables par îlot (écart entre les îlots)">${num(group, setGroup, 10)}<//></div>
    <p class="hint">Les tables sont ajoutées au modèle actuel ; utilise « Tout effacer » avant pour repartir de zéro.</p><//>`;
}

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
    <button class="btn" onClick=${() => f.current.click()}>${Ico('camera')} ${has ? 'Changer le fond' : 'Image de fond'}</button>
    ${has ? html`<button class="btn" onClick=${del}>Retirer le fond</button>` : null}`;
}
