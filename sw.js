/* Rotacje – service worker: aplikacja działa offline, sync.php zawsze idzie do sieci. */
const V = 'rotacje-2.4-69a8dbe8';
const ASSETS = ["./", "index.html", "app.css", "i18n-data.js", "i18n.js", "engine.js", "app.js", "sync.js", "manifest.webmanifest", "barlow-condensed-latin-600-normal.woff2", "barlow-condensed-latin-700-normal.woff2", "barlow-condensed-latin-ext-600-normal.woff2", "barlow-condensed-latin-ext-700-normal.woff2", "barlow-latin-400-normal.woff2", "barlow-latin-500-normal.woff2", "barlow-latin-600-normal.woff2", "barlow-latin-ext-400-normal.woff2", "barlow-latin-ext-500-normal.woff2", "barlow-latin-ext-600-normal.woff2", "icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png"];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || /\/sync\.php$/.test(url.pathname)) return;
  e.respondWith(caches.open(V).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    if (hit) { net.catch(() => { }); return hit; }          // najpierw kopia z telefonu, w tle odświeżenie
    return net.catch(() => e.request.mode === 'navigate' ? c.match('./index.html') : Response.error());
  })));
});
