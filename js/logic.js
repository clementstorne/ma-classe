/* Calculs purs : évaluations, suivi. */

export const questionsOf = ev => ev.exercises.flatMap(ex => ex.questions.map(q => ({ ...q, exId: ex.id })));

/** Statistiques d'un élève pour une évaluation. 'x' = question non évaluée (exclue du barème). */
/** `student` (facultatif) : un élève avec aménagement voit sa note ramenée sur 20 et arrondie au quart de point. */
export function studentStats(ev, sid, comps, student) {
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
  const absent = !!(ev.absent && ev.absent[sid]);
  // La note reste en points (barème de l'évaluation). Seuls les élèves avec aménagement sont ramenés sur 20, au quart de point.
  let note = null, noteMax = max;
  if (!absent && entered > 0 && max > 0) {
    if (student && String(student.amenagement || '').trim()) { note = Math.round(final / max * 20 * 4) / 4; noteMax = 20; }
    else note = final;
  }
  return { total, adj, final, max, note, noteMax, absent, entered, perEx, levels };
}

export function evalAverage(ev, studentIds, comps, byId = {}) {
  const notes = studentIds.map(id => studentStats(ev, id, comps, byId[id]).note).filter(n => n != null);
  return notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null;
}

/** Synthèse d'une évaluation : effectif noté, moyenne, min, médiane, max, barème, et répartition des élèves par niveau (1 à 4) pour chaque compétence. */
export function evalSummary(ev, studentIds, comps, byId = {}) {
  const sts = studentIds.map(id => studentStats(ev, id, comps, byId[id]));
  const notes = sts.map(s => s.note).filter(n => n != null).sort((a, b) => a - b);
  const n = notes.length;
  const med = !n ? null : n % 2 ? notes[(n - 1) / 2] : (notes[n / 2 - 1] + notes[n / 2]) / 2;
  const dist = {};
  for (const c of comps) {
    const arr = [0, 0, 0, 0];
    for (const s of sts) if (s.levels[c] != null) arr[s.levels[c] - 1]++;
    if (c) dist[c] = arr;
  }
  return { n, avg: n ? notes.reduce((a, b) => a + b, 0) / n : null, min: n ? notes[0] : null, max: n ? notes[n - 1] : null, med, dist,
    barème: ev.exercises.reduce((t, x) => t + x.questions.reduce((m, q) => m + q.max, 0), 0) };
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
