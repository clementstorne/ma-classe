import { html, render } from '../vendor/preact-htm.js';
import { init, useStore, S } from './store.js';
import { useRoute, go } from './router.js';
import { Schedule } from './views/schedule.js';
import { ClassList, ClassFolder } from './views/classes.js';
import { Appel } from './views/appel.js';
import { PlanPage } from './views/plan.js';
import { Eval } from './views/eval.js';
import { Settings } from './views/settings.js';
import { Ico } from './icons.js';
import { Salles, RoomEditor } from './views/salles.js';
import { Progressions } from './views/progressions.js';
import { startBackups } from './backup.js';

function App() {
  const d = useStore();
  const { parts, q } = useRoute();
  if (!d) return html`<p style="padding:2rem">Chargement…</p>`;
  const [a, b, c, e] = parts;
  let view, nav = a || 'edt', flush = false;
  if (!a) { view = html`<${Schedule} />`; nav = 'edt'; }
  else if (a === 'classes') view = html`<${ClassList} />`;
  else if (a === 'class') { view = html`<${ClassFolder} key=${b} id=${b} tab=${c || 'eleves'} q=${q} />`; nav = 'classes'; }
  else if (a === 'appel') { view = html`<${Appel} key=${b + c + e} classId=${b} date=${c} slotId=${e || 'x'} />`; nav = 'edt'; }
  else if (a === 'plan') { view = html`<${PlanPage} key=${b + c + (q.g || '')} classId=${b} roomId=${c} group=${q.g || ''} />`; nav = 'classes'; }
  else if (a === 'eval') { view = html`<${Eval} key=${b} id=${b} q=${q} />`; nav = 'classes'; }
  else if (a === 'progressions') { view = html`<${Progressions} />`; nav = 'prog'; }
  else if (a === 'minuteur') { view = html`<iframe class="mframe" src="minuteur/index.html" title="Minuteur" allow="fullscreen"></iframe>`; nav = 'minuteur'; }
  else if (a === 'salles') { view = html`<${Salles} />`; nav = 'salles'; }
  else if (a === 'salle') { view = html`<${RoomEditor} key=${b} id=${b} />`; nav = 'salles'; }
  else if (a === 'etabs') { go('/settings/etablissements'); view = null; nav = "settings"; }
  else if (a === 'settings') { view = html`<${Settings} tab=${b} />`; nav = 'settings'; }
  else view = html`<${Schedule} />`;
  const N = (k, href, label) => html`<a class=${nav === k ? 'on' : ''} href=${href}>${label}</a>`;
  return html`<div class="app">
    <header class="topbar"><span class="brand"><img src="icons/favicon.png" alt="" class="logo" />Ma classe</span>
      <nav class="nav">${N('edt', '#/', html`${Ico('cal')} Emploi du temps`)}${N('classes', '#/classes', html`${Ico('users')} Classes`)}${N('prog', '#/progressions', html`${Ico('book')} Progressions`)}${N('salles', '#/salles', html`${Ico('door')} Salles`)}${N('minuteur', '#/minuteur', html`${Ico('timer')} Minuteur`)}</nav><span class="grow"></span><nav class="nav">${N('settings', '#/settings', html`${Ico('gear')} Paramètres`)}</nav></header>
    <main class=${'main' + ((nav === 'edt' && !a) || (a === 'class' && (c === 'suivi' || c === 'notes')) || a === 'eval' || (a === 'progressions') ? ' fit' : '') + (a === 'minuteur' ? ' fit flush' : '')}>${view}</main></div>`;
}

init().then(() => { render(html`<${App} />`, document.getElementById('app')); startBackups(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
