import { html, useState, useRef, useEffect } from '../../vendor/preact-htm.js';
import { useStore, mutate, classById, roomById, studentsOf, groupStudents, photoOf, roomH, getPlan, planKey, ROOM_W } from '../store.js';
import { Modal, Field, Avatar, Empty, toast } from './common.js';
import { uid, displayName, initials, seatLabels, shareOrDownload } from '../util.js';
import { Ico } from '../icons.js';

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
export function PlanCanvas({ room, seatMap, byId, mode, selected, onSeatTap, onSeatDrop, onItemChange, seatClass, seatExtra, labels }) {
  const RH = roomH(room), bg = photoOf('bg-' + room.id);
  const lab = labels || seatLabels(Object.values(byId));
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
    const p = photoOf(s.id);
    return html`<div class="ph">${p ? html`<img src=${p} alt="" draggable="false" />` : html`<span>${initials(s)}</span>`}</div><div class="fn" style=${{ fontSize: nameSize(lab[s.id], it.w) + 'px' }}>${lab[s.id].replace(/-/g, '-\u200b')}</div>
      ${seatExtra ? seatExtra(s) : null}`;
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
        const ny = Math.max(0, Math.min(RH - it.h, Math.round((oy + dy) / 10) * 10));
        onItemChange(it.id, { x: nx, y: ny });
      };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (!moved) onSeatTap && onSeatTap(it); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
      return;
    }
    if (it.kind === 'label') return;
    const sid = seatMap[it.id];
    if (!sid) { onSeatTap && onSeatTap(it); return; }
    startDrag(e, { label: lab[sid] || displayName(byId[sid]), onTap: () => onSeatTap && onSeatTap(it), onDrop: t => onSeatDrop && onSeatDrop(sid, t) });
  }

  return html`<div class="plan-wrap" ref=${wrap} style=${{ height: RH * scale + 'px' }}>
    <div class=${'plan-room' + (bg ? ' hasbg' : '')} style=${{ width: ROOM_W + 'px', height: RH + 'px', transform: `scale(${scale})`, ...(bg ? { backgroundImage: `url(${bg})`, backgroundSize: '100% 100%' } : {}) }}>
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

/* ---------- Page du plan de classe (classe entière ou groupe) ---------- */
export function PlanPage({ classId, roomId, group }) {
  const d = useStore();
  const cls = classById(d, classId);
  const room = roomById(d, roomId);
  const [selSeat, setSelSeat] = useState(null);   // siège sélectionné
  const [selStu, setSelStu] = useState(null);     // élève du banc sélectionné
  if (!cls || !room) return html`<${Empty} title="Plan introuvable"><a class="btn" href="#/classes">Retour</a><//>`;
  const studs = group ? groupStudents(d, classId, group) : studentsOf(d, classId);
  const byId = Object.fromEntries(studs.map(s => [s.id, s]));
  const plan = getPlan(d, classId, roomId, group);
  const placed = new Set(Object.values(plan.seatMap));
  const bench = studs.filter(s => !placed.has(s.id));
  const key = planKey(classId, roomId, group);
  const edit = fn => mutate(dd => { const p = dd.plans[key] ||= { seatMap: {} }; fn(p); });
  const seats = room.items.filter(i => i.kind === 'seat');
  const title = `${cls.name}${group ? ' · ' + group : ''} · ${room.name}`;

  function seatTap(it) {
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
  async function exportImage() {
    try {
      const blob = await renderPlanImage(room, plan.seatMap, byId, seatLabels(studs), title);
      const r = await shareOrDownload(blob, `plan-${title}.png`.replace(/[\\/:*?"<>|\s]+/g, '_'));
      if (r === 'downloaded') toast('Image enregistrée (dossier Téléchargements).');
    } catch (e) { toast('Export impossible.'); }
  }
  const reset = () => { if (!placed.size || confirm('Retirer tous les élèves du plan ?')) { edit(p => { p.seatMap = {}; }); setSelSeat(null); setSelStu(null); } };
  function randomize() {
    if (!seats.length || !studs.length) return;
    if (placed.size && !confirm('Remplacer le placement actuel par un placement aléatoire ?')) return;
    const order = studs.map(s => s.id);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    edit(p => { p.seatMap = {}; order.forEach((sid, i) => { if (seats[i]) p.seatMap[seats[i].id] = sid; }); });
    setSelSeat(null); setSelStu(null);
  }
  const hint = selStu ? 'Touche maintenant un siège pour y placer l\'élève.' : selSeat ? 'Touche un autre siège pour intervertir les deux élèves.' : '';

  return html`<div class="page" style="max-width:1400px">
    <div class="page-head">
      <a class="btn" href=${'#/class/' + classId + '/plans'}>‹ ${cls.name}</a>
      <h1>${group ? group + ' · ' : ''}${room.name}</h1>
      <span class="grow"></span>
      <button class="btn" onClick=${randomize}>${Ico('shuffle')} Placement aléatoire</button>
      <button class="btn" onClick=${reset}>${Ico('reset')} Réinitialiser</button>
      <button class="btn" onClick=${exportImage}>${Ico('upload')} Exporter</button>
    </div>
    ${hint ? html`<div class="row" style="margin-bottom:8px"><span class="hint">${hint}</span>${selSeat && plan.seatMap[selSeat] ? html`<button class="btn small" onClick=${() => { edit(p => unplace(p, plan.seatMap[selSeat])); setSelSeat(null); }}>Retirer du plan</button>` : null}</div>` : null}
    <div class="plan-layout">
      ${bench.length ? html`<div class="bench" data-drop="bench"><h3>À placer (${bench.length})</h3>
        ${bench.map(s => html`<div class=${'chipst' + (selStu === s.id ? ' sel' : '')} key=${s.id} onPointerDown=${e => benchDown(e, s)}><${Avatar} s=${s} size=${34} /><span><b>${s.nom}</b> ${s.prenom}</span></div>`)}
        </div>` : null}
      <${PlanCanvas} room=${room} seatMap=${plan.seatMap} byId=${byId} mode="place" selected=${selSeat} onSeatTap=${seatTap} onSeatDrop=${seatDrop} />
    </div>
  </div>`;
}

/* ---------- Export en image (PNG) : les places vides ne sont pas dessinées ---------- */
const loadImg = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fit(ctx, text, maxW) { let s = text; while (s.length > 1 && ctx.measureText(s).width > maxW) s = s.slice(0, -1); return s === text ? s : s + '…'; }
/** Taille de police d'un prénom : tient sur une ligne, ou sur deux (coupure après un tiret ou une espace) sans jamais être tronqué. */
export function nameSize(text, w) {
  const avail = w - 12, longest = Math.max(...text.split(/(?<=[- ])/).map(x => x.trim().length));
  const one = Math.floor(avail / (text.length * 0.6));
  if (one >= 15) return 15;
  return Math.max(9, Math.min(15, Math.max(one, Math.floor(avail / (longest * 0.6)))));
}
/** Réduit la police pour que le texte tienne en entier dans maxW. */
function shrink(ctx, text, maxW, size, weight = 700) { let z = size; do { ctx.font = `${weight} ${z}px system-ui, sans-serif`; z--; } while (z >= 8 && ctx.measureText(text).width > maxW); }
export async function renderPlanImage(room, seatMap, byId, lab, title) {
  const K = 2, RH = roomH(room), pad = 0;
  const c = document.createElement('canvas'); c.width = ROOM_W * K; c.height = RH * K;
  const ctx = c.getContext('2d'); ctx.scale(K, K);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ROOM_W, RH);
  const bg = photoOf('bg-' + room.id);
  if (bg) ctx.drawImage(await loadImg(bg), 0, 0, ROOM_W, RH);
  for (const it of room.items) {
    if (it.kind === 'label') {
      rr(ctx, it.x, it.y, it.w, it.h, 10); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#7a8499'; ctx.stroke();
      ctx.fillStyle = '#5b6578'; ctx.font = '700 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(fit(ctx, it.text.toUpperCase(), it.w - 12), it.x + it.w / 2, it.y + it.h / 2);
      continue;
    }
    const s = byId[seatMap[it.id]];
    if (!s) continue; // place vide : rien
    rr(ctx, it.x, it.y, it.w, it.h, 12); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#cfd5e1'; ctx.stroke();
    const px = it.x + 4, py = it.y + 4, pw = it.w - 8, ph = it.h - 8 - 22;
    ctx.save(); rr(ctx, px, py, pw, ph, 8); ctx.clip();
    const url = photoOf(s.id);
    if (url) {
      const im = await loadImg(url), k = Math.max(pw / im.width, ph / im.height), dw = im.width * k, dh = im.height * k;
      ctx.drawImage(im, px + (pw - dw) / 2, py + Math.min(0, (ph - dh) * 0.2), dw, dh);
    } else {
      ctx.fillStyle = '#e8edff'; ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = '#3b5bdb'; ctx.font = '800 26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(initials(s).toUpperCase(), px + pw / 2, py + ph / 2);
    }
    ctx.restore();
    ctx.fillStyle = '#1b2333'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const nm = lab[s.id] || s.prenom, fs = nameSize(nm, it.w);
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    let lines = [nm];
    if (ctx.measureText(nm).width > it.w - 8) {
      lines = []; let cur = '';
      for (const seg of nm.split(/(?<=[- ])/)) { if (cur && ctx.measureText((cur + seg).trim()).width > it.w - 8) { lines.push(cur.trim()); cur = seg; } else cur += seg; }
      lines.push(cur.trim());
    }
    lines.forEach((ln, i) => ctx.fillText(ln, it.x + it.w / 2, it.y + it.h - 15 - (lines.length - 1 - i) * (fs + 1) + (lines.length > 1 ? -(fs + 1) / 2 + 0 : 0)));
  }
  return new Promise(res => c.toBlob(res, 'image/png'));
}
