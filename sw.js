// Service worker: precaches the whole game on first load so it runs offline.
// Bump VERSION when the list of files below changes, or to clear out old caches.

// Institution packs live in their own cache: only the one a student chose is
// ever downloaded, and it survives app updates.
const PACKS = 'fys-packs-v1';
const VERSION = 'fys-v62';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/pdf.js',
  './js/engine.js',
  './js/i18n.js',
  './js/plan.js',
  './js/budget.js',
  './js/content.js',
  './js/forecast.js',
  './js/charts.js',
  './js/server.js',
  './js/glossary.js',
  './content/core.json',
  './content/realities.json',
  './content/chapters/index.json',
  './content/chapters/prequel.json',
  './content/chapters/arrival.json',
  './content/chapters/first_term.json',
  './content/chapters/first_exams.json',
  './content/chapters/middle_years.json',
  './content/chapters/bounce_back.json',
  './content/chapters/finish_line.json',
  './i18n/en.json',
  './i18n/zu.json',
  './i18n/af.json',
  './i18n/xh.json',
  './i18n/st.json',
  './i18n/tn.json',
  './i18n/nso.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Only our own old app caches: the chosen university's pack has its own and is kept.
      .then((keys) => Promise.all(keys.filter((k) => /^fys-v\d+$/.test(k) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first: when the player is online a refresh always shows the latest
// files, so nobody is left on an old copy. The server answers unchanged files
// with a tiny "not modified" reply, so this costs little data. Offline, or when
// the connection stalls, the cached copy is used instead.
const NETWORK_WAIT_MS = 4000;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/portal/')) return;
  // The directory and the chosen institution's pack: answer from the cache at
  // once (so it works offline and costs no data to open), and fetch a fresh
  // copy in the background for next time.
  // The chosen language's card text (content/lang) is kept the same way.
  if (/\/content\/institutions\/[^/]+\.json$/.test(url.pathname) || /\/content\/lang\/[^/]+\.json$/.test(url.pathname)) {
    event.respondWith(caches.open(PACKS).then((cache) => cache.match(request).then((cached) => {
      const fresh = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
      if (!cached) return fresh;
      fresh.catch(() => {});
      return cached;
    })));
    return;
  }
  // Server endpoints always go to the network; the app falls back to bundled packs.
  if (/\/(institutions|stats|plan|packs\/[^/]+)$/.test(url.pathname)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    const fresh = fetch(request, { cache: 'no-cache' }).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy));
      }
      return response;
    });
    if (!cached) {
      return fresh.catch(() => (request.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }
    // Slow connection: show the cached copy now; the fresh one is still stored for next time.
    const slow = new Promise((resolve) => { setTimeout(() => resolve(cached), NETWORK_WAIT_MS); });
    return Promise.race([fresh.then((response) => (response.ok ? response : cached)).catch(() => cached), slow]);
  })());
});
