/* ============================================================
   OKÇUTAKİP — Service Worker
   GitHub Pages uyumlu (göreli yollar, alt dizin desteği)
   Strateji:
   - Uygulama kabuğu önbelleğe alınır (precache)
   - Gezinme istekleri: önce ağ, ağ yoksa önbellek (offline desteği)
   - Diğer istekler: önce önbellek, arka planda güncelleme
   ============================================================ */

const CACHE_VERSION = 'okcutakip-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon.ico'
];

/* Kurulum: uygulama kabuğunu önbelleğe al */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* Etkinleştirme: eski önbellekleri temizle */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* İstekleri karşıla */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Yalnızca GET istekleri önbelleklenir
  if (req.method !== 'GET') return;

  // Sayfa gezinmeleri: önce ağ, başarısızsa önbellekteki index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Diğer kaynaklar (yazı tipleri, ikonlar vb.): önce önbellek,
  // arka planda ağdan güncelle (stale-while-revalidate)
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
