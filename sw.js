// Alza questo numero a ogni pubblicazione: e' il cambiamento di questo file
// che fa accorgere il browser che c'e' una versione nuova, e quindi fa
// comparire l'avviso "Nuova versione disponibile" (vedi js/pwa-shell.js).
const CACHE_VERSION = 'mygym-v7';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/state.js',
  'js/router.js',
  'js/components.js',
  'js/pwa-shell.js',
  'js/exercise-api.js',
  'js/views/home.js',
  'js/views/day.js',
  'js/views/exercises.js',
  'js/views/workout.js',
  'js/views/workout-history.js',
  'js/views/progress.js',
  'js/views/measurements.js',
  'js/views/personal-trainer.js',
  'js/views/settings.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.png',
];

// Niente skipWaiting() qui: la versione nuova resta "in attesa" finche' non e'
// l'utente a toccare "Aggiorna" nell'avviso, cosi' l'app non si ricarica sotto
// le dita mentre si sta registrando una serie. Il messaggio arriva da
// js/pwa-shell.js.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('mygym-') && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    // App shell: rete prima, cosi' chi e' online vede sempre l'ultima
    // versione pubblicata senza dover aspettare che il service worker si
    // aggiorni da solo (puo' metterci minuti/ore). Cache come fallback solo
    // per quando manca la connessione.
    event.respondWith(
      fetch(request).then((res) => {
        const clone = res.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
        return res;
      }).catch(() => caches.match(request))
    );
  } else {
    // Cross-origin (exercise dataset / images): stale-while-revalidate.
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request).then((res) => {
          if (res && res.status === 200) cache.put(request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
