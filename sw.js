/* Service worker : met l'application en cache pour un usage hors connexion.
   Stratégie : réseau d'abord (pour recevoir les mises à jour), cache en secours. */
const CACHE = 'ma-classe-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css', 'icons/favicon.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/preact-htm.js', 'vendor/xlsx.mini.min.js', 'js/app.js', 'js/util.js', 'js/db.js', 'js/router.js', 'js/store.js', 'js/logic.js',
  'js/views/common.js', 'js/views/schedule.js', 'js/views/student.js', 'js/views/importer.js', 'js/views/plan.js', 'js/views/classes.js', 'js/views/appel.js', 'js/views/eval.js', 'js/views/settings.js', 'js/views/etabs.js', 'js/icons.js', 'js/views/salles.js', 'js/views/progressions.js', 'js/views/notes.js', 'minuteur/index.html'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
