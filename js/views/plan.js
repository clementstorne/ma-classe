import { html, useState, useRef, useEffect } from '../../vendor/preact-htm.js';
import { useStore, mutate, classById, roomById, studentsOf, getPlan, planKey, ROOM_W, ROOM_H } from '../store.js';
import { Modal, Field, Avatar, Empty, toast } from './common.js';
import { uid, displayName } from '../util.js';
import { go } from '../router.js';

/* ---------- Moteur de glisser-déposer (souris + tactile) ---------- */
export function startDrag(e, { label, onTap, onDrop }) {
  if (e.button !== undefined && e.button !== 0) return;
  const sx = e.clientX, sy = e.clientY;
  let dragging = false, ghost = null, hot = null;
  const setHot = el => { if (hot !== el) { hot && hot.classList.remove('drop-hot'); hot = el; hot && hot.classList.add('drop-hot'); } };
  const target = ev => { const el = document.elementFromPoint(ev.clientX, ev.clientY); return el && el.closest('[data-drop]'); };
  const move = ev => {
    if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 7) {
      dragging = true;
      ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.textContent = label;
      document.body.appendChild(ghost);
    }
    if (dragging) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; setHot(target(ev)); }
  };
  const end = (ev, cancelled) => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel);
    setHot(null); ghost && ghost.remove();
    if (cancelled) return;
    if (dragging) { const t = target(ev); onDrop && onDrop(t ? t.dataset.drop : null); }
    else onTap && onTap();
  };
  const up = ev => end(ev, false), cancel = ev => end(ev, true);
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cancel);
}

/* place un élève sur un siège ; échange si le siège est occupé */
export function moveStudent(plan, sid, toSeat) {
  const m = plan.seatMap;
  const from = Object.keys(m).find(k => m[k] === sid);
  const other = m[toSeat];
  if (other === sid) return;
  if (from) { if (other) m[from] = other; else delete m[from]; }
  m[toSeat] = sid;
}
export function unplace(plan, sid) { for (const k of Object.keys(plan.seatMap)) if (plan.seatMap[k] === sid) delete plan.seatMap[k]; }

/* ---------- Canevas ---------- */
/** mode: 'place' | 'view' | 'template' */
export function PlanCanvas({ room, seatMap, byId, mode, selected, onSeatTap, onSeatDrop, onItemChange, seatClass, seatExtra }) {
  const wrap = useRef();
  const [scale, setScale] = useState(0.8);
  useEffect(() => {
    const f = () => { if (wrap.current) setScale(Math.min(1.4, Math.max(0.3, wrap.current.clientWidth / ROOM_W))); };
    f();
    const ro = new ResizeObserver(f); ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  function seatContent(it) {
    const s = byId[seatMap[it.id]];
    if (!s) return html`<span>${mode === 'template' ? '' : 'libre'}</span>`;
    return html`<${Avatar} s=${s} size=${38} /><div class="nm"><b>${s.nom}</b><span>${s.prenom}</span></div>
      ${s.amenagement ? html`<span class="amen" title=${s.amenagement}>★</span>` : null}${seatExtra ? seatExtra(s) : null}`;
  }

  function onDown(e, it) {
    if (mode === 'template') {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y; let moved = false;
      const mv = ev => {
        const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        const nx = Math.max(0, Math.min(ROOM_W - it.w, Math.round((ox + dx) / 10) * 10));
        const ny = Math.max(0, Math.min(ROOM_H - it.h, Math.round((oy + dy) / 10) * 10));
        onItemChange(it.id, { x: nx, y: ny });
      };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (!moved) onSeatTap && onSeatTap(it); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
      return;
    }
    if (it.kind === 'label') return;
    const sid = seatMap[it.id];
    if (!sid) { onSeatTap && onSeatTap(it); return; }
    startDrag(e, { label: displayName(byId[sid]), onTap: () => onSeatTap && onSeatTap(it), onDrop: t => onSeatDrop && onSeatDrop(sid, t) });
  }

  return html`<div class="plan-wrap" ref=${wrap} style=${{ height: ROOM_H * scale + 'px' }}>
    <div class="plan-room" style=${{ width: ROOM_W + 'px', height: ROOM_H + 'px', transform: `scale(${scale})` }}>
      ${room.items.map(it => {
        const s = it.kind === 'seat' ? byId[seatMap[it.id]] : null;
        const cls = ['seat', it.kind === 'label' ? 'label' : '', it.kind === 'seat' && !s && mode !== 'template' ? 'empty' : '', mode === 'template' ? 'tpl' : '',
          selected === it.id ? 'sel' : '', s && seatClass ? seatClass(s) : ''].join(' ');
        return html`<div key=${it.id} class=${cls} data-drop=${it.kind === 'seat' ? it.id : null}
          style=${{ left: it.x + 'px', top: it.y + 'px', width: it.w + 'px', height: it.h + 'px' }} onPointerDown=${e => onDown(e, it)}>
          ${it.kind === 'label' ? it.text : mode === 'template' ? html`<span class="muted">▭</span>` : seatContent(it)}</div>`;
      })}
    </div></div>`;
}

/* ---------- Page du plan de classe ---------- */
export function PlanPage({ classId, roomId }) {
  const d = useStore();
  const cls = classById(d, classId);
  const room = roomById(d, roomId);
  const [mode, setMode] = useState('place');
  const [selSeat, setSelSeat] = useState(null);   // siège sélectionné
  const [selStu, setSelStu] = useState(null);     // élève du banc sélectionné
  const [gen, setGen] = useState(false);
  if (!cls || !room) return html`<${Empty} title="Plan introuvable"><a class="btn" href="#/classes">Retour</a><//>`;
  const studs = studentsOf(d, classId);
  const byId = Object.fromEntries(studs.map(s => [s.id, s]));
  const plan = getPlan(d, classId, roomId);
  const placed = new Set(Object.values(plan.seatMap));
  const bench = studs.filter(s => !placed.has(s.id));
  const key = planKey(classId, roomId);
  const edit = fn => mutate(dd => { const p = dd.plans[key] ||= { seatMap: {} }; fn(p, dd.rooms.find(r => r.id === roomId)); });

  function seatTap(it) {
    if (mode === 'template') { setSelSeat(it.id === selSeat ? null : it.id); return; }
    if (selStu) { edit(p => moveStudent(p, selStu, it.id)); setSelStu(null); setSelSeat(null); return; }
    const occ = plan.seatMap[it.id];
    if (selSeat && selSeat !== it.id) {
      const a = plan.seatMap[selSeat];
      if (a) edit(p => moveStudent(p, a, it.id));
      else if (occ) edit(p => moveStudent(p, occ, selSeat));
      setSelSeat(null); return;
    }
    setSelSeat(selSeat === it.id ? null : (occ || selSeat === null ? it.id : null));
  }
  function seatDrop(sid, target) {
    setSelSeat(null); setSelStu(null);
    if (target === 'bench') edit(p => unplace(p, sid));
    else if (target) edit(p => moveStudent(p, sid, target));
  }
  function benchTap(s) { setSelSeat(null); setSelStu(selStu === s.id ? null : s.id); }
  function benchDown(e, s) {
    startDrag(e, { label: displayName(s), onTap: () => benchTap(s), onDrop: t => { if (t && t !== 'bench') { edit(p => moveStudent(p, s.id, t)); setSelStu(null); } } });
  }

  /* ---- modèle de salle ---- */
  const itemChange = (id, patch) => edit((p, r) => Object.assign(r.items.find(i => i.id === id), patch));
  const addSeat = () => edit((p, r) => { r.items.push({ id: uid(), kind: 'seat', x: 500, y: 300, w: 140, h: 76 }); });
  const addLabel = () => { const t = prompt('Texte du repère (ex. Tableau, Bureau, Porte, Fenêtre)', 'Bureau'); if (t) edit((p, r) => r.items.push({ id: uid(), kind: 'label', x: 500, y: 20, w: 240, h: 44, text: t })); };
  const delSel = () => { if (!selSeat) return; edit((p, r) => { r.items = r.items.filter(i => i.id !== selSeat); delete p.seatMap[selSeat]; }); setSelSeat(null); };
  const dupSel = () => { if (!selSeat) return; edit((p, r) => { const i = r.items.find(x => x.id === selSeat); if (i) r.items.push({ ...i, id: uid(), x: Math.min(ROOM_W - i.w, i.x + 20), y: Math.min(ROOM_H - i.h, i.y + 20) }); }); };
  const editLabel = () => { const it = room.items.find(i => i.id === selSeat); if (!it || it.kind !== 'label') return; const t = prompt('Texte du repère', it.text); if (t) itemChange(it.id, { text: t }); };
  const clearRoom = () => { if (confirm('Supprimer tous les éléments de cette salle ? Les plans de toutes les classes seront vidés.')) { mutate(dd => { dd.rooms.find(r => r.id === roomId).items = []; for (const k of Object.keys(dd.plans)) if (k.endsWith('|' + roomId)) dd.plans[k].seatMap = {}; }); setSelSeat(null); } };
  const clearPlan = () => { if (confirm('Retirer tous les élèves du plan ?')) edit(p => { p.seatMap = {}; }); };
  const selItem = room.items.find(i => i.id === selSeat);

  return html`<div class="page" style="max-width:1400px">
    <div class="page-head">
      <a class="btn" href=${'#/class/' + classId + '/plans'}>‹ ${cls.name}</a>
      <h1>Plan de classe</h1>
      <select class="inp" style="width:auto" value=${roomId} onChange=${e => go(`/plan/${classId}/${e.target.value}`)}>${d.rooms.map(r => html`<option value=${r.id}>${r.name}</option>`)}</select>
      <span class="grow"></span>
      <div class="seg"><button class=${mode === 'place' ? 'on P' : ''} onClick=${() => { setMode('place'); setSelSeat(null); }}>Placement</button>
        <button class=${mode === 'template' ? 'on P' : ''} onClick=${() => { setMode('template'); setSelSeat(null); setSelStu(null); }}>Modèle de la salle</button></div>
    </div>
    ${mode === 'template' ? html`<div class="row" style="margin-bottom:10px">
        <button class="btn small" onClick=${addSeat}>＋ Table</button><button class="btn small" onClick=${() => setGen(true)}>▦ Générer une grille</button>
        <button class="btn small" onClick=${addLabel}>＋ Repère (tableau, bureau…)</button><span class="grow"></span>
        ${selItem ? html`${selItem.kind === 'label' ? html`<button class="btn small" onClick=${editLabel}>Renommer</button>` : null}
          <button class="btn small" onClick=${dupSel}>Dupliquer</button><button class="btn small danger" onClick=${delSel}>Supprimer</button>` : html`<span class="hint">Glisse les éléments pour les placer ; touche-en un pour le sélectionner.</span>`}
        <button class="btn small danger" onClick=${clearRoom}>Tout effacer</button></div>
      <p class="hint">Le modèle est propre à la salle « ${room.name} » : il sert à toutes tes classes. Le placement des élèves, lui, est propre à chaque classe.</p>`
      : html`<p class="hint">${selStu ? 'Touche maintenant un siège pour y placer l\'élève.' : selSeat ? 'Touche un autre siège pour intervertir les deux élèves.' : 'Glisse un élève sur un siège (ou touche l\'élève puis le siège). Glisser un élève sur un siège occupé intervertit les deux.'}</p>`}
    <div class="plan-layout">
      ${mode === 'place' ? html`<div class="bench" data-drop="bench"><h3>À placer (${bench.length})</h3>
        ${bench.map(s => html`<div class=${'chipst' + (selStu === s.id ? ' sel' : '')} key=${s.id} onPointerDown=${e => benchDown(e, s)}><${Avatar} s=${s} size=${34} /><span><b>${s.nom}</b> ${s.prenom}</span></div>`)}
        ${!bench.length ? html`<p class="hint" style="padding:6px">Tous les élèves sont placés.</p>` : null}
        <hr class="sep" /><button class="btn small" style="width:100%" onClick=${clearPlan}>Vider le plan</button>
        ${selSeat && plan.seatMap[selSeat] ? html`<button class="btn small" style="width:100%;margin-top:6px" onClick=${() => { edit(p => unplace(p, plan.seatMap[selSeat])); setSelSeat(null); }}>Retirer du plan</button>` : null}</div>` : null}
      <${PlanCanvas} room=${room} seatMap=${plan.seatMap} byId=${byId} mode=${mode} selected=${selSeat} onSeatTap=${seatTap} onSeatDrop=${seatDrop} onItemChange=${itemChange} />
    </div>
    ${gen ? html`<${GridGen} onClose=${() => setGen(false)} onGen=${items => { edit((p, r) => { r.items.push(...items); }); setGen(false); }} />` : null}
  </div>`;
}

function GridGen({ onClose, onGen }) {
  const [rows, setRows] = useState(5), [cols, setCols] = useState(6), [group, setGroup] = useState(2);
  function gen() {
    const sw = 140, sh = 76, gap = 8, gGap = 40, y0 = 130;
    const groups = Math.ceil(cols / group);
    const totalW = cols * sw + (cols - 1) * gap + (groups - 1) * gGap;
    const x0 = Math.max(10, Math.round((ROOM_W - totalW) / 2 / 10) * 10);
    const rowH = Math.min(sh + 22, Math.floor((ROOM_H - y0 - 10) / rows));
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
