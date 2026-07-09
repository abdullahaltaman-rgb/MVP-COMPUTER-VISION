// عامل خدمة PWA — تخزين قشرة التطبيق فقط؛ البيانات دائمًا من الشبكة
// (لوحات الامتثال يجب أن تعرض الحالة الحية، لا نسخًا مخبأة)
const CACHE = 'abyad-vision-v1';
const SHELL = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // الشبكة أولًا لكل شيء؛ القشرة الثابتة من الكاش عند الانقطاع
  if (SHELL.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  }
});
