import { html, useState, useRef } from '../../vendor/preact-htm.js';
import { useStore, mutate, setPhoto } from '../store.js';
import { Modal, Field, toast } from './common.js';
import { uid, norm, splitFullName, loadXLSX, resizeImage, byName } from '../util.js';

/* ---------- Lecture de tableaux ---------- */
function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}
function parseDelimited(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const cands = ['\t', ';', ',', '|'];
  const sep = cands.map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
export async function readTable(file) {
  const buf = await file.arrayBuffer();
  if (/\.(csv|txt|tsv)$/i.test(file.name)) return parseDelimited(decode(buf));
  const XLSX = await loadXLSX();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).filter(r => r.some(c => String(c).trim() !== ''));
}

/* ---------- Import de liste d'élèves ---------- */
export function RosterImport({ classId, onClose }) {
  const d = useStore();
  const [rows, setRows] = useState(null);
  const [text, setText] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [map, setMap] = useState({ nom: 0, prenom: -1, amen: -1 });
  const [err, setErr] = useState('');

  function load(r) {
    if (!r.length) return setErr('Fichier vide.');
    setErr('');
    const head = r[0].map(c => norm(String(c)));
    const find = re => head.findIndex(h => re.test(h));
    const looksHeader = head.some(h => /^(nom|prenom|eleve|nom prenom)/.test(h));
    const iNom = find(/^nom$|^nom de famille/), iPre = find(/^prenom/), iEl = find(/^eleve|^nom prenom|^identite/), iAm = find(/amenag|pap|ppre|besoin|pai|mdph/);
    setHasHeader(looksHeader);
    setMap({ nom: iNom >= 0 ? iNom : iEl >= 0 ? iEl : 0, prenom: iPre >= 0 ? iPre : -1, amen: iAm >= 0 ? iAm : -1 });
    setRows(r);
  }
  async function onFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    try { load(await readTable(f)); } catch (x) { setErr(String(x.message || x)); }
  }
  function onPaste() { load(parseDelimited(text)); }

  const body = rows ? (hasHeader ? rows.slice(1) : rows) : [];
  const ncols = rows ? Math.max(...rows.map(r => r.length)) : 0;
  const colName = i => (hasHeader && rows[0][i] ? String(rows[0][i]) : 'Colonne ' + (i + 1));
  const parsed = body.map(r => {
    let nom, prenom;
    if (map.prenom >= 0) { nom = String(r[map.nom] || '').trim(); prenom = String(r[map.prenom] || '').trim(); }
    else ({ nom, prenom } = splitFullName(String(r[map.nom] || '')));
    return { nom: nom.toUpperCase(), prenom, amenagement: map.amen >= 0 ? String(r[map.amen] || '').trim() : '' };
  }).filter(s => s.nom);

  function doImport() {
    let added = 0, updated = 0;
    mutate(dd => {
      const existing = dd.students.filter(s => s.classId === classId);
      for (const p of parsed) {
        const k = norm(p.nom + ' ' + p.prenom);
        const ex = existing.find(s => norm(s.nom + ' ' + s.prenom) === k);
        if (ex) { if (p.amenagement) ex.amenagement = p.amenagement; updated++; }
        else { dd.students.push({ id: uid(), classId, nom: p.nom, prenom: p.prenom, amenagement: p.amenagement, hasPhoto: false }); added++; }
      }
    });
    toast(`${added} élève(s) ajouté(s)${updated ? ', ' + updated + ' déjà présent(s)' : ''}`);
    onClose();
  }

  const colSel = (key, optional) => html`<${Field} label=${key === 'nom' ? 'Colonne « Nom » (ou « NOM Prénom »)' : key === 'prenom' ? 'Colonne « Prénom »' : 'Colonne « Aménagement » (facultatif)'}>
    <select value=${map[key]} onChange=${e => setMap({ ...map, [key]: Number(e.target.value) })}>
      ${optional ? html`<option value="-1">— aucune —</option>` : null}
      ${Array.from({ length: ncols }, (_, i) => html`<option value=${i}>${colName(i)}</option>`)}</select><//>`;

  return html`<${Modal} title="Importer des élèves" onClose=${onClose} wide
    foot=${rows ? html`<button class="btn" onClick=${() => setRows(null)}>Retour</button><span class="grow"></span>
      <button class="btn primary" disabled=${!parsed.length} onClick=${doImport}>Importer ${parsed.length} élève(s)</button>` : null}>
    ${!rows ? html`
      <p class="muted">Choisis un fichier CSV, XLS ou XLSX (export Pronote, tableur Google Drive…), ou colle directement des cellules copiées depuis un tableur.</p>
      <input type="file" accept=".csv,.xls,.xlsx,.txt,.tsv,.ods" onChange=${onFile} />
      <${Field} label="…ou colle ici (une ligne par élève)"><textarea class="inp" rows="6" value=${text} onInput=${e => setText(e.target.value)} placeholder="NOM Prénom"></textarea><//>
      <div><button class="btn" disabled=${!text.trim()} onClick=${onPaste}>Utiliser le texte collé</button></div>
      ${err ? html`<p style="color:var(--ko)">${err}</p>` : null}` : html`
      <label class="row"><input type="checkbox" checked=${hasHeader} onChange=${e => setHasHeader(e.target.checked)} /> La première ligne contient les titres de colonnes</label>
      <div class="row">${colSel('nom')}${colSel('prenom', true)}${colSel('amen', true)}</div>
      <p class="hint">Si tu ne choisis pas de colonne « Prénom », les mots en MAJUSCULES sont pris pour le nom et le reste pour le prénom.</p>
      <div class="table-wrap" style="max-height:260px"><table class="t"><thead><tr><th>Nom</th><th>Prénom</th><th>Aménagement</th></tr></thead>
        <tbody>${parsed.slice(0, 60).map(p => html`<tr><td>${p.nom}</td><td>${p.prenom}</td><td>${p.amenagement}</td></tr>`)}</tbody></table></div>`}
  <//>`;
}

/* ---------- Photos en lot ---------- */
export function PhotoBatch({ classId, onClose }) {
  const d = useStore();
  const [res, setRes] = useState(null);
  async function onFiles(e) {
    const files = [...e.target.files];
    const studs = d.students.filter(s => s.classId === classId);
    const ok = [], ko = [];
    for (const f of files) {
      const base = norm(f.name.replace(/\.[^.]+$/, ''));
      const toks = new Set(base.split(' '));
      // le nom de fichier doit contenir le nom ET le prénom de l'élève
      const cand = studs.filter(s => {
        const n = norm(s.nom).split(' '), p = norm(s.prenom).split(' ');
        return n.every(t => toks.has(t)) && p.every(t => toks.has(t));
      });
      if (cand.length === 1) {
        try { await setPhoto(cand[0].id, await resizeImage(f)); ok.push(`${cand[0].nom} ${cand[0].prenom}`); } catch { ko.push(f.name); }
      } else ko.push(f.name);
    }
    setRes({ ok, ko });
  }
  return html`<${Modal} title="Photos en lot" onClose=${onClose} foot=${html`<button class="btn primary" onClick=${onClose}>Fermer</button>`}>
    <p class="muted">Sélectionne plusieurs photos nommées d'après les élèves (ex. <code>DUPONT Marie.jpg</code>, <code>dupont_marie.png</code>). Elles sont réduites et stockées dans l'application.</p>
    <input type="file" accept="image/*" multiple onChange=${onFiles} />
    ${res ? html`<p><b>${res.ok.length}</b> photo(s) associée(s).</p>
      ${res.ko.length ? html`<p style="color:var(--ko)">Non reconnue(s) : ${res.ko.join(', ')}</p><p class="hint">Tu peux ajouter ces photos une par une depuis la fiche de l'élève.</p>` : null}` : null}
  <//>`;
}

/* ---------- Import d'évaluations depuis un classeur Excel (format « une feuille = un devoir ») ---------- */
function refsToRows(f) {
  const rows = new Set();
  const re = /\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/g;
  let m;
  while ((m = re.exec(f))) {
    const a = Number(m[2]), b = m[4] ? Number(m[4]) : a;
    for (let r = Math.min(a, b); r <= Math.max(a, b); r++) rows.add(r);
  }
  return [...rows];
}
export async function parseEvalWorkbook(file, comps) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: true });
  const out = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws['!ref']) continue;
    const R = XLSX.utils.decode_range(ws['!ref']);
    const cell = (r, c) => ws[XLSX.utils.encode_cell({ r: r - 1, c })];
    const val = (r, c) => { const x = cell(r, c); return x ? x.v : undefined; };
    // élèves : ligne 1, colonnes C.. (index 2..)
    const studs = [];
    for (let c = 2; c <= R.e.c; c++) {
      const h = val(1, c);
      if (typeof h === 'string' && h.trim()) {
        const parts = h.split(/\n/).map(x => x.trim()).filter(Boolean);
        studs.push({ col: c, nom: (parts[0] || '').toUpperCase(), prenom: parts.slice(1).join(' ') });
      }
    }
    const exercises = []; let cur = null; const rowToQ = {}; const totalRowToEx = {};
    let stop = false, noteRow = null;
    for (let r = 2; r <= R.e.r + 1 && !stop; r++) {
      const a = val(r, 0), b = val(r, 1);
      const A = typeof a === 'string' ? a.trim() : a;
      if (typeof A === 'string' && /^exercice\s*\d*/i.test(A) && b === undefined) { cur = { id: uid(), title: A.replace(/^exercice/i, 'Exercice'), questions: [] }; exercises.push(cur); continue; }
      if (typeof A === 'string' && /^total$/i.test(A)) { if (cur) totalRowToEx[r] = cur; cur = null; continue; }
      if (typeof A === 'string' && /^note$/i.test(A)) { noteRow = r; stop = true; break; }
      if (cur && typeof b === 'number' && A !== undefined && A !== '') {
        const q = { id: uid(), label: String(A), max: b, comps: [] };
        cur.questions.push(q); rowToQ[r] = q;
      }
    }
    if (!exercises.some(e => e.questions.length)) continue;
    // compétences : lignes dont A = nom de compétence, avec formule en B
    for (let r = 2; r <= R.e.r + 1; r++) {
      const a = val(r, 0), b = cell(r, 1);
      if (typeof a !== 'string' || !b || !b.f) continue;
      const comp = comps.find(c => norm(c) === norm(a));
      if (!comp) continue;
      for (const rr of refsToRows(b.f)) {
        // une référence à une ligne « TOTAL » d'exercice = toutes les questions de l'exercice
        const qs = rowToQ[rr] ? [rowToQ[rr]] : totalRowToEx[rr] ? totalRowToEx[rr].questions : [];
        for (const q of qs) if (!q.comps.includes(comp)) q.comps.push(comp);
      }
    }
    const scores = {}, adjust = {};
    for (const s of studs) {
      const sc = {};
      for (const [r, q] of Object.entries(rowToQ)) {
        let v = val(Number(r), s.col);
        if (typeof v === 'string') { v = v.trim().toLowerCase(); if (v === 'x') sc[q.id] = 'x'; else if (v === '-' || v === '–') sc[q.id] = '-'; else if (v !== '' && Number.isFinite(Number(v.replace(',', '.')))) sc[q.id] = Number(v.replace(',', '.')); }
        else if (typeof v === 'number') sc[q.id] = v;
      }
      scores[s.col] = sc;
      // écart entre la note finale du classeur et la somme des questions = ajustement manuel (malus, arrondi…)
      const cached = noteRow ? val(noteRow, s.col) : undefined;
      const sum = Object.values(sc).reduce((n, v) => n + (typeof v === 'number' ? v : 0), 0);
      if (typeof cached === 'number' && Math.abs(cached - sum) > 1e-9) { adjust[s.col] = Math.round((cached - sum) * 100) / 100; }
    }
    out.push({ name, exercises: exercises.filter(e => e.questions.length), studs, scores, adjust, nq: Object.keys(rowToQ).length });
  }
  return out;
}

export function EvalImport({ classId, onClose, onDone }) {
  const d = useStore();
  const [sheets, setSheets] = useState(null);
  const [sel, setSel] = useState({});
  const [addMissing, setAddMissing] = useState(true);
  const [err, setErr] = useState('');
  const studs = d.students.filter(s => s.classId === classId);
  const match = h => studs.find(s => norm(s.nom + ' ' + s.prenom) === norm(h.nom + ' ' + h.prenom));

  async function onFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const sh = await parseEvalWorkbook(f, d.settings.comps);
      if (!sh.length) return setErr('Aucune feuille au format attendu (ligne 1 = élèves, « EXERCICE n », barème en colonne B).');
      setErr(''); setSheets(sh); setSel(Object.fromEntries(sh.map(s => [s.name, true])));
      if (studs.length) setAddMissing(false);
    } catch (x) { setErr(String(x.message || x)); }
  }
  function doImport() {
    const created = [];
    mutate(dd => {
      const nameToId = {};
      const cs = dd.students.filter(s => s.classId === classId);
      const find = h => cs.find(s => norm(s.nom + ' ' + s.prenom) === norm(h.nom + ' ' + h.prenom));
      for (const sh of sheets) {
        if (!sel[sh.name]) continue;
        const scores = {}, adjust = {};
        for (const h of sh.studs) {
          let st = find(h);
          if (!st && addMissing) { st = { id: uid(), classId, nom: h.nom, prenom: h.prenom, amenagement: '', hasPhoto: false }; dd.students.push(st); cs.push(st); }
          if (st) { scores[st.id] = sh.scores[h.col]; if (sh.adjust[h.col]) adjust[st.id] = sh.adjust[h.col]; }
        }
        const ev = { id: uid(), classId, name: sh.name, date: new Date().toISOString().slice(0, 10), exercises: sh.exercises, scores, adjust };
        dd.evals.push(ev); created.push(ev.id);
      }
    });
    toast(`${created.length} évaluation(s) importée(s) — pense à régler leur date`);
    onDone && onDone(created);
    onClose();
  }
  return html`<${Modal} title="Importer des évaluations depuis Excel" onClose=${onClose} wide
    foot=${sheets ? html`<span class="grow"></span><button class="btn primary" onClick=${doImport} disabled=${!Object.values(sel).some(Boolean)}>Importer</button>` : null}>
    ${!sheets ? html`<p class="muted">Ouvre un classeur au même format que le tien : une feuille par devoir, élèves en colonnes (« NOM⏎Prénom » en ligne 1), blocs « EXERCICE n », barème en colonne B, <code>x</code> pour une question non évaluée. Les compétences sont déduites des formules de la colonne B quand c'est possible.</p>
      <input type="file" accept=".xlsx,.xls" onChange=${onFile} />${err ? html`<p style="color:var(--ko)">${err}</p>` : null}`
    : html`${sheets.map(sh => {
        const nm = sh.studs.filter(h => match(h)).length;
        return html`<label class="card row"><input type="checkbox" checked=${!!sel[sh.name]} onChange=${e => setSel({ ...sel, [sh.name]: e.target.checked })} />
          <b>${sh.name}</b><span class="muted">${sh.exercises.length} exercice(s), ${sh.nq} questions, ${sh.studs.length} élèves (${nm} reconnus dans la classe)${Object.keys(sh.adjust).length ? ', ' + Object.keys(sh.adjust).length + ' ajustement(s) de points repris' : ''}</span></label>`;
      })}
      <label class="row"><input type="checkbox" checked=${addMissing} onChange=${e => setAddMissing(e.target.checked)} /> Créer dans la classe les élèves qui n'y sont pas encore</label>`}
  <//>`;
}
