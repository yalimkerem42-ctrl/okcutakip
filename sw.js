/* ============================================================
   OKÇUTAKİP — Service Worker (v2)
   GitHub Pages + Chrome + Samsung Internet uyumlu
   - Dirençli ön-bellekleme: tek bir dosya hatası SW kurulumunu düşürmez
   - Gezinmeler: önce ağ, çevrimdışında önbellek (offline desteği)
   - Diğer kaynaklar: önce önbellek, arka planda güncelleme
   ============================================================ */

const CACHE_VERSION = 'okcutakip-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './favicon.ico'
];

/* Kurulum: kabuğu dirençli şekilde önbelleğe al.
   addAll() tek dosya hatasında tüm kurulumu iptal eder;
   bu yüzden dosyalar tek tek eklenir, hatalar yutulur. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Önbelleğe alınamadı:', url, err);
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

/* Etkinleştirme: eski sürümlerin önbelleklerini temizle */
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

  // Yalnızca aynı kaynaklı veya CORS GET istekleri; diğerlerine karışma
  if (req.method !== 'GET') return;

  // Chrome uzantıları vb. şemaları atla
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Sayfa gezinmeleri: önce ağ, çevrimdışında önbellekteki index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) =>
            cached || caches.match('./index.html') || caches.match('./')
          )
        )
    );
    return;
  }

  // Diğer kaynaklar: önce önbellek, arka planda ağdan tazele
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
