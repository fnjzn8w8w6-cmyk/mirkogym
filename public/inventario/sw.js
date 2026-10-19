// Service worker: rende l'app apribile anche senza rete.
// Le chiamate a Gemini non passano di qui (vanno sempre in rete).
const CACHE = 'inventario-v7';
const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const LOCAL = ['./', 'index.html', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL);
    // libreria Excel: scaricata subito, così l'export funziona anche offline
    for (const url of [EXCELJS, JSZIP]) {
      try { await cache.add(new Request(url, { mode: 'cors' })); } catch (e) {}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && req.url !== EXCELJS && req.url !== JSZIP) return;

  // La pagina: prima la rete (così arrivano gli aggiornamenti), poi la copia salvata
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        if (res.ok) cache.put('index.html', res.clone());
        return res;
      } catch (e) {
        return (await caches.match('index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // Tutto il resto: prima la copia salvata
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  })());
});
