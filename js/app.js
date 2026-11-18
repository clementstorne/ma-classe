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
  else if (a === 'plan') { view = html`<${PlanPage} key=${b + c} classId=${b} roomId=${c} />`; nav = 'classes'; }
  else if (a === 'eval') { view = html`<${Eval} key=${b} id=${b} q=${q} />`; nav = 'classes'; }
  else if (a === 'etabs') { go('/settings/etablissements'); view = null; nav = "settings"; }
  else if (a === 'settings') { view = html`<${Settings} tab=${b} />`; nav = 'settings'; }
  else view = html`<${Schedule} />`;
  const N = (k, href, label) => html`<a class=${nav === k ? 'on' : ''} href=${href}>${label}</a>`;
  return html`<div class="app">
    <header class="topbar"><span class="brand"><img src="icons/favicon.png" alt="" class="logo" />Ma classe</span>
      <nav class="nav">${N('edt', '#/', html`${Ico('cal')} Emploi du temps`)}${N('classes', '#/classes', html`${Ico('users')} Classes`)}</nav><span class="grow"></span><nav class="nav">${N('settings', '#/settings', html`${Ico('gear')} Paramètres`)}</nav></header>
    <main class=${'main' + (nav === 'edt' && !a ? ' fit' : '')}>${view}</main></div>`;
}

init().then(() => render(html`<${App} />`, document.getElementById('app')));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
