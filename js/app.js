import { html, render } from '../vendor/preact-htm.js';
import { init, useStore, S } from './store.js';
import { useRoute, go } from './router.js';
import { Schedule } from './views/schedule.js';
import { ClassList, ClassFolder } from './views/classes.js';
import { Appel } from './views/appel.js';
import { PlanPage } from './views/plan.js';
import { Eval } from './views/eval.js';
import { Settings } from './views/settings.js';

const ICO = {
  cal: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .6 3.5 2.3 3.5 5.2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.5 1.2-1.6 2.8-1.8-.6a7 7 0 0 1-1.6.9L15.5 19.7h-3.2l-.4-1.9a7 7 0 0 1-1.6-.9l-1.8.6-1.6-2.8 1.5-1.2a7 7 0 0 1 0-1.8L6.9 9.5l1.6-2.8 1.8.6a7 7 0 0 1 1.6-.9l.4-1.9h3.2l.4 1.9a7 7 0 0 1 1.6.9l1.8-.6 1.6 2.8-1.5 1.2a7 7 0 0 1 0 1.8z'
};
const Ico = k => html`<svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d=${ICO[k]} /></svg>`;

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
      <nav class="nav">${N('edt', '#/', html`${Ico('cal')} Emploi du temps`)}${N('classes', '#/classes', html`${Ico('users')} Classes`)}</nav><span class="grow"></span><nav class="nav">${N('settings', '#/settings', html`${Ico('gear')} Réglages`)}</nav></header>
    <main class=${'main' + (nav === 'edt' && !a ? ' fit' : '')}>${view}</main></div>`;
}

init().then(() => render(html`<${App} />`, document.getElementById('app')));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
