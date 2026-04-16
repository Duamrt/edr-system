// EDR System — Service Worker (network-first para HTML/JS/CSS, cache-first para imagens)
// DEPLOY_VERSION é atualizado automaticamente pelo deploy.sh
const CACHE_NAME = 'edr-system-v20260416183349';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/img/icon-192.png',
  '/img/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Supabase sempre vai pra rede
  if (url.includes('supabase.co') || url.includes('/rest/') || url.includes('/auth/')) {
    return;
  }

  // Google Fonts — cache-first
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return resp;
      }))
    );
    return;
  }

  // HTMLs, JS e CSS — network-first (sempre pega atualizado, cache como fallback)
  const urlPath = url.split('?')[0];
  if (urlPath.endsWith('.html') || urlPath.endsWith('.js') || urlPath.endsWith('.css') || e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp.ok && e.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match(e.request).then(cached => {
        if (cached) return cached;
        if (e.request.mode === 'navigate') return caches.match('/index.html');
      }))
    );
    return;
  }

  // Imagens e outros assets — cache-first, fallback rede
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      if (resp.ok && e.request.method === 'GET') {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
      return resp;
    })).catch(() => {})
  );
});
