/* Calculs purs : évaluations, suivi. */

export const questionsOf = ev => ev.exercises.flatMap(ex => ex.questions.map(q => ({ ...q, exId: ex.id })));

/** Statistiques d'un élève pour une évaluation. 'x' = question non évaluée (exclue du barème). */
export function studentStats(ev, sid, comps) {
  const sc = ev.scores[sid] || {};
  let total = 0, max = 0, entered = 0;
  const perEx = {};
  const compAcc = {};
  for (const ex of ev.exercises) {
    let t = 0, m = 0;
    for (const q of ex.questions) {
      const v = sc[q.id];
      if (v === 'x') continue;
      m += q.max;
      if (typeof v === 'number') { t += v; entered++; }
      for (const c of q.comps || []) {
        const a = compAcc[c] ||= { num: 0, den: 0 };
        a.den += q.max;
        if (typeof v === 'number') a.num += v;
      }
    }
    perEx[ex.id] = { total: t, max: m };
    total += t; max += m;
  }
  const levels = {};
  for (const c of comps) {
    const a = compAcc[c];
    if (!a || a.den === 0 || entered === 0) levels[c] = null;
    else levels[c] = Math.min(4, Math.floor(a.num / a.den * 4 + 1));
  }
  // ajustement manuel (bonus / malus), ex. -1 point ; un élève sans aucune saisie n'a pas de note
  const adj = (ev.adjust && ev.adjust[sid]) || 0;
  const final = Math.max(0, total + adj);
  return { total, adj, final, max, note20: entered > 0 && max > 0 ? final / max * 20 : null, entered, perEx, levels };
}

export function evalAverage(ev, studentIds, comps) {
  const notes = studentIds.map(id => studentStats(ev, id, comps).note20).filter(n => n != null);
  return notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null;
}

export function questionAverage(ev, q, studentIds) {
  const vals = studentIds.map(id => (ev.scores[id] || {})[q.id]).filter(v => typeof v === 'number');
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { avg, pct: q.max ? avg / q.max * 100 : null, n: vals.length };
}

export const inRange = (date, range) => !range || (date >= range.start && date <= range.end);

/** Compteurs de suivi par élève sur une période. */
export function suiviStats(d, classId, studentIds, range) {
  const by = {};
  studentIds.forEach(id => { by[id] = { dev: 0, mat: 0, abs: 0, ret: 0 }; });
  for (const e of d.events) {
    if (e.classId !== classId || !by[e.sid] || !inRange(e.date, range)) continue;
    if (e.type === 'devoir') by[e.sid].dev++; else by[e.sid].mat++;
  }
  for (const se of Object.values(d.sessions)) {
    if (se.classId !== classId || !inRange(se.date, range)) continue;
    for (const [sid, m] of Object.entries(se.marks || {})) {
      if (!by[sid]) continue;
      if (m === 'A') by[sid].abs++; else if (m === 'R') by[sid].ret++;
    }
  }
  return by;
}
