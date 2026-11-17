import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { useStore, mutate, classById, studentsOf, groupsOf, etabOf } from '../store.js';
import { Modal, Field, Empty, toast } from './common.js';
import { studentStats, questionAverage, evalAverage } from '../logic.js';
import { fmtNum, parseScore, uid, displayName } from '../util.js';
import { go } from '../router.js';

const f1 = n => (n == null ? '' : (Math.round(n * 10) / 10).toString().replace('.', ','));

export function Eval({ id, q }) {
  const d = useStore();
  const ev = d.evals.find(e => e.id === id);
  const [sel, setSel] = useState(null);        // { sid, qid }
  const [struct, setStruct] = useState(q.edit === '1');
  const [meta, setMeta] = useState(false);
  const [bad, setBad] = useState(false);
  const [grp, setGrp] = useState('');
  const [transposed, setTransposed] = useState(() => { try { return localStorage.getItem('transposed') === '1'; } catch { return false; } });
  const inp = useRef();
  const cls = ev && classById(d, ev.classId);

  useEffect(() => { if (sel) { setBad(false); const el = document.querySelector('td.q.sel'); el && el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); if (inp.current) { inp.current.value = ''; if (matchMedia('(pointer:fine)').matches) inp.current.focus(); } } }, [sel && sel.sid, sel && sel.qid]);

  if (!ev || !cls) return html`<${Empty} title="Évaluation introuvable"><a class="btn" href="#/classes">Retour</a><//>`;
  const groups = groupsOf(cls);
  const studs = studentsOf(d, ev.classId).filter(s => !grp || s.group === grp);
  const comps = d.settings.comps;
  const usedComps = comps.filter(c => ev.exercises.some(x => x.questions.some(qq => (qq.comps || []).includes(c))));
  const stats = Object.fromEntries(studs.map(s => [s.id, studentStats(ev, s.id, comps)]));
  const ids = studs.map(s => s.id);
  const allQ = ev.exercises.flatMap(x => x.questions);
  const maxTotal = ev.exercises.reduce((n, x) => n + x.questions.reduce((m, qq) => m + qq.max, 0), 0);

  /* colonnes / lignes logiques */
  const items = [];
  for (const ex of ev.exercises) { for (const qq of ex.questions) items.push({ kind: 'q', ex, q: qq }); items.push({ kind: 'tot', ex }); }
  items.push({ kind: 'adj' }, { kind: 'note' }, { kind: 'n20' });
  usedComps.forEach(c => items.push({ kind: 'comp', c }));

  const setScore = (sid, qid, v) => mutate(dd => {
    const e = dd.evals.find(x => x.id === id); const sc = e.scores[sid] ||= {};
    if (v === null) delete sc[qid]; else sc[qid] = v;
  });
  const sIndex = sid => ids.indexOf(sid), qIndex = qid => allQ.findIndex(x => x.id === qid);
  function move(dir) {            // dir: 'next' | 'down' | 'up' | 'left' | 'right'
    if (!sel) return;
    let si = sIndex(sel.sid), qi = qIndex(sel.qid);
    const adv = d.settings.advance;
    if (dir === 'next') {
      if (adv === 'question') { qi++; if (qi >= allQ.length) { qi = 0; si++; } } else { si++; if (si >= ids.length) { si = 0; qi++; } }
      if (si >= ids.length || qi >= allQ.length) { setSel(null); return; }
    } else {
      // flèches : "vertical" = élèves en lignes → élève ; en colonnes → question
      const vert = dir === 'down' || dir === 'up', sign = (dir === 'down' || dir === 'right') ? 1 : -1;
      if (vert === !transposed) si += sign; else qi += sign;
      si = Math.max(0, Math.min(ids.length - 1, si)); qi = Math.max(0, Math.min(allQ.length - 1, qi));
    }
    setSel({ sid: ids[si], qid: allQ[qi].id });
  }
  function commit(v, advance = true) {
    if (!sel) return;
    const qq = allQ.find(x => x.id === sel.qid);
    if (typeof v === 'number' && v > qq.max + 1e-9) { setBad(true); toast(`Maximum ${fmtNum(qq.max)} pour cette question`); return; }
    setScore(sel.sid, sel.qid, v);
    if (advance) move('next');
  }
  function onKey(e) {
    if (e.key === 'Enter') { const v = parseScore(e.target.value); if (v === undefined) { setBad(true); return; } commit(v === null ? null : v); e.target.value = ''; }
    else if (e.key === 'Escape') setSel(null);
    else if (e.target.value === '' && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); move({ ArrowDown: 'down', ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]); }
    else if (e.target.value === '' && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); commit('x'); }
    else if (e.target.value === '' && e.key === '-') { e.preventDefault(); commit('-'); }
    else if (e.key === 'Delete' || (e.key === 'Backspace' && e.target.value === '')) { e.preventDefault(); commit(null, false); }
    else setBad(false);
  }

  function askAdjust(s) {
    const cur = (ev.adjust && ev.adjust[s.id]) || 0;
    const r = prompt(`Bonus / malus de points pour ${displayName(s)} (ex. -1 ou 0,5 ; vide = aucun)`, cur ? fmtNum(cur) : '');
    if (r === null) return;
    const v = r.trim() === '' ? 0 : Number(r.replace(',', '.'));
    if (!Number.isFinite(v)) return toast('Valeur invalide');
    mutate(dd => { const e = dd.evals.find(x => x.id === id); e.adjust ||= {}; if (v) e.adjust[s.id] = v; else delete e.adjust[s.id]; });
  }
  const qcell = (s, item) => {
    const v = (ev.scores[s.id] || {})[item.q.id];
    const on = sel && sel.sid === s.id && sel.qid === item.q.id;
    let c = 'q';
    if (v === 'x') c += ' x'; else if (v === '-') c += ' dash'; else if (v === undefined) c += ' blank';
    else if (v === item.q.max && v > 0) c += ' full'; else if (v === 0) c += ' zero';
    if (on) c += ' sel';
    return html`<td key=${item.q.id} class=${c} onClick=${() => setSel({ sid: s.id, qid: item.q.id })}>${v === undefined ? '' : v === 'x' ? 'x' : v === '-' ? '–' : fmtNum(v)}</td>`;
  };
  const cell = (s, item) => {
    const st = stats[s.id];
    if (item.kind === 'q') return qcell(s, item);
    if (item.kind === 'tot') { const t = st.perEx[item.ex.id]; return html`<td class="tot">${st.entered ? fmtNum(t.total) : ''}</td>`; }
    if (item.kind === 'adj') return html`<td class="q" title="Bonus / malus" onClick=${() => askAdjust(s)}>${st.adj ? (st.adj > 0 ? '+' : '') + fmtNum(st.adj) : ''}</td>`;
    if (item.kind === 'note') return html`<td class="tot">${st.entered ? fmtNum(st.final) + '/' + fmtNum(st.max) : ''}</td>`;
    if (item.kind === 'n20') return html`<td class="tot">${st.note20 == null ? '' : f1(st.note20)}</td>`;
    const lv = st.levels[item.c];
    return html`<td class=${'lvl ' + (lv ? 'lv' + lv : '')}>${lv || ''}</td>`;
  };
  const head = item => item.kind === 'q' ? html`${item.q.label}<br /><small class="muted">/${fmtNum(item.q.max)}</small>`
    : item.kind === 'tot' ? 'Total' : item.kind === 'adj' ? '±' : item.kind === 'note' ? 'Points' : item.kind === 'n20' ? '/20' : item.c.slice(0, 4) + '.';
  const foot = item => {
    if (item.kind === 'q') { const a = questionAverage(ev, item.q, ids); return a ? Math.round(a.pct) + '%' : ''; }
    if (item.kind === 'tot') { const v = studs.map(s => stats[s.id]).filter(x => x.entered).map(x => x.perEx[item.ex.id].total); return v.length ? fmtNum(v.reduce((a, b) => a + b, 0) / v.length) : ''; }
    if (item.kind === 'adj') return '';
    if (item.kind === 'n20') { const a = evalAverage(ev, ids, comps); return a == null ? '' : f1(a); }
    if (item.kind === 'note') { const v = studs.map(s => stats[s.id]).filter(x => x.entered).map(x => x.final); return v.length ? fmtNum(v.reduce((a, b) => a + b, 0) / v.length) : ''; }
    const lv = studs.map(s => stats[s.id].levels[item.c]).filter(Boolean);
    return lv.length ? f1(lv.reduce((a, b) => a + b, 0) / lv.length) : '';
  };

  const avg = evalAverage(ev, ids, comps);
  const nGraded = studs.filter(s => stats[s.id].note20 != null).length;
  const exSpan = ex => ex.questions.length + 1;
  const selS = sel && d.students.find(s => s.id === sel.sid), selQ = sel && allQ.find(x => x.id === sel.qid);
  const quick = [];
  if (selQ) { const step = selQ.max <= 1 ? 0.25 : 0.5; for (let v = 0; v <= selQ.max + 1e-9; v += step) quick.push(Math.round(v * 1000) / 1000); if (Math.abs(quick[quick.length - 1] - selQ.max) > 1e-9) quick.push(selQ.max); }

  return html`<div class="page" style="max-width:none">
    <div class="page-head"><a class="btn ghost" href=${'#/class/' + ev.classId + '/notes'}>‹ ${cls.name}</a><h1>${ev.name}</h1>
      <span class="sub">${avg == null ? 'aucune note saisie' : `moyenne ${f1(avg)}/20 · ${nGraded}/${studs.length} élèves notés · barème ${fmtNum(maxTotal)}`}</span><span class="grow"></span>
      ${groups.length ? html`<select class="inp" style="width:auto;min-height:34px;padding:4px 10px" value=${grp} onChange=${e => { setGrp(e.target.value); setSel(null); }}><option value="">Toute la classe</option>${groups.map(g => html`<option value=${g}>Groupe ${g}</option>`)}</select>` : null}
      <button class="btn small" onClick=${() => { const v = !transposed; setTransposed(v); try { localStorage.setItem('transposed', v ? '1' : '0'); } catch { /* */ } }}>⇄ ${transposed ? 'Élèves en lignes' : 'Élèves en colonnes'}</button>
      <button class="btn small" onClick=${() => setStruct(true)}>✎ Barème et compétences</button>
      <button class="btn small" onClick=${() => setMeta(true)}>⚙</button></div>
    <p class="hint">Touche une case, puis une valeur rapide ou saisis les points (<b>x</b> = question non évaluée, exclue du barème ; <b>–</b> = non traité). Les cases vides sont en jaune. La colonne ± permet un bonus ou un malus sur la note (ex. −1).</p>
    <div class="gridwrap"><table class="g">
      ${!transposed ? html`
        <thead><tr><th class="stk" rowspan="2">Élève</th>
          ${ev.exercises.map(ex => html`<th colspan=${exSpan(ex)}>${ex.title}</th>`)}<th colspan="3">Note</th>${usedComps.length ? html`<th colspan=${usedComps.length}>Compétences</th>` : null}</tr>
          <tr>${items.map(it => html`<th class=${it.kind === 'q' ? '' : 'tot'}>${head(it)}</th>`)}</tr></thead>
        <tbody>${studs.map(s => html`<tr key=${s.id}><th class="stk">${displayName(s)}</th>${items.map(it => cell(s, it))}</tr>`)}</tbody>
        <tfoot><tr><th class="stk">Moyenne / réussite</th>${items.map(it => html`<td>${foot(it)}</td>`)}</tr></tfoot>`
      : html`
        <thead><tr><th class="stk"></th>${studs.map(s => html`<th style="min-width:78px;height:54px;padding:2px 4px"><b style="font-size:12px">${s.nom}</b><br /><span style="font-weight:500">${s.prenom}</span></th>`)}<th class="tot">Moy.</th></tr></thead>
        <tbody>${items.map((it, i) => {
          const first = it.kind === 'q' && (i === 0 || items[i - 1].kind === 'tot');
          return html`${first ? html`<tr><th class="stk" colspan=${studs.length + 2} style="background:var(--accent-soft);color:var(--accent)">${it.ex.title}</th></tr>` : null}
            <tr key=${it.kind + (it.q ? it.q.id : it.ex ? it.ex.id : it.c || '')}><th class="stk">${it.kind === 'q' ? html`${it.q.label} <small class="muted">/${fmtNum(it.q.max)}</small>` : it.kind === 'comp' ? it.c : it.kind === 'adj' ? 'Bonus / malus' : head(it)}</th>
              ${studs.map(s => cell(s, it))}<td class="tot">${foot(it)}</td></tr>`;
        })}</tbody>`}
    </table></div>
    <div class="pad-space"></div>
    ${sel && selS && selQ ? html`<div class="entry">
      <div class="who"><b>${displayName(selS)}</b><div class="muted small">${selQ.label} · sur ${fmtNum(selQ.max)}${(selQ.comps || []).length ? ' · ' + selQ.comps.join(', ') : ''}</div></div>
      <div class="qk">${quick.map(v => html`<button class=${v === selQ.max ? 'pri' : ''} onClick=${() => commit(v)}>${fmtNum(v)}</button>`)}
        <button onClick=${() => commit('x')} title="Non évalué">x</button><button onClick=${() => commit('-')} title="Non traité">–</button><button onClick=${() => commit(null, false)} title="Effacer">⌫</button></div>
      <input ref=${inp} class=${bad ? 'bad' : ''} inputmode="decimal" placeholder="points" onKeyDown=${onKey} aria-label="Points" />
      <button class="btn" onClick=${() => move('next')}>Suivant ›</button><button class="btn ghost" onClick=${() => setSel(null)}>✕</button></div>` : null}
    ${struct ? html`<${Structure} ev=${ev} onClose=${() => setStruct(false)} />` : null}
    ${meta ? html`<${Meta} ev=${ev} onClose=${() => setMeta(false)} />` : null}
  </div>`;
}

function Meta({ ev, onClose }) {
  const d = useStore();
  const set = p => mutate(dd => Object.assign(dd.evals.find(e => e.id === ev.id), p));
  function del() {
    if (!confirm(`Supprimer l'évaluation « ${ev.name} » et toutes ses notes ?`)) return;
    mutate(dd => { dd.evals = dd.evals.filter(e => e.id !== ev.id); });
    onClose(); go(`/class/${ev.classId}/notes`);
  }
  return html`<${Modal} title="Évaluation" onClose=${onClose} foot=${html`<button class="btn danger" onClick=${del}>Supprimer</button><span class="grow"></span><button class="btn primary" onClick=${onClose}>OK</button>`}>
    <${Field} label="Nom"><input value=${ev.name} onInput=${e => set({ name: e.target.value })} /><//>
    <${Field} label="Date"><input type="date" value=${ev.date} onInput=${e => e.target.value && set({ date: e.target.value })} /><//>
    <${Field} label="Après chaque saisie, passer à…"><select value=${d.settings.advance} onChange=${e => mutate(dd => { dd.settings.advance = e.target.value; })}>
      <option value="student">l'élève suivant (même question)</option><option value="question">la question suivante (même élève)</option></select><//><//>`;
}

function Structure({ ev, onClose }) {
  const d = useStore();
  const [ex, setEx] = useState(() => JSON.parse(JSON.stringify(ev.exercises)));
  const comps = d.settings.comps;
  const upd = (ei, fn) => { const c = JSON.parse(JSON.stringify(ex)); fn(c[ei]); setEx(c); };
  function save() {
    for (const e of ex) for (const q of e.questions) if (!(q.max > 0)) return toast('Chaque question doit avoir un barème > 0');
    const keep = new Set(ex.flatMap(e => e.questions.map(q => q.id)));
    mutate(dd => {
      const e = dd.evals.find(x => x.id === ev.id);
      e.exercises = ex;
      for (const sc of Object.values(e.scores)) for (const k of Object.keys(sc)) if (!keep.has(k)) delete sc[k];
    });
    onClose();
  }
  return html`<${Modal} title="Barème et compétences" wide onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Annuler</button><button class="btn primary" onClick=${save}>Enregistrer</button>`}>
    <p class="hint">Chaque question a un libellé (1, 2a…), un barème et, si besoin, des compétences. Le niveau de compétence (1 à 4) se calcule comme dans ton Excel : part des points obtenus sur les questions rattachées, les questions « x » étant exclues.</p>
    ${ex.map((e, ei) => html`<div class="exbox" key=${e.id}>
      <div class="row"><input class="inp" style="flex:1;font-weight:700" value=${e.title} onInput=${v => upd(ei, x => { x.title = v.target.value; })} />
        <button class="btn small danger" onClick=${() => { if (confirm('Supprimer cet exercice ?')) setEx(ex.filter((_, i) => i !== ei)); }}>Supprimer l'exercice</button></div>
      ${e.questions.map((qq, qi) => html`<div key=${qq.id} class="col" style="gap:6px"><div class="qrow">
          <input class="inp" value=${qq.label} aria-label="Libellé" onInput=${v => upd(ei, x => { x.questions[qi].label = v.target.value; })} />
          <input class="inp" inputmode="decimal" value=${fmtNum(qq.max)} aria-label="Barème" onInput=${v => { const n = Number(v.target.value.replace(',', '.')); upd(ei, x => { x.questions[qi].max = Number.isFinite(n) ? n : 0; }); }} />
          <div class="comp-chips">${comps.map(c => html`<button class=${(qq.comps || []).includes(c) ? 'on' : ''} onClick=${() => upd(ei, x => { const a = x.questions[qi].comps ||= []; const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); else a.push(c); })}>${c}</button>`)}</div>
          <button class="btn small ghost" aria-label="Supprimer la question" onClick=${() => upd(ei, x => { x.questions.splice(qi, 1); })}>🗑</button></div></div>`)}
      <div><button class="btn small" onClick=${() => upd(ei, x => { x.questions.push({ id: uid(), label: String(x.questions.length + 1), max: 1, comps: [] }); })}>＋ Question</button></div></div>`)}
    <div><button class="btn" onClick=${() => setEx([...ex, { id: uid(), title: 'Exercice ' + (ex.length + 1), questions: [{ id: uid(), label: '1', max: 1, comps: [] }] }])}>＋ Exercice</button></div><//>`;
}
