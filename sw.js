// Service worker: بيخلي التطبيق يفتح ويشتغل من غير نت.
// الاستراتيجية: نجيب من النت الأول (علشان التحديثات توصل)، ولو مفيش نت نرجع للنسخة المحفوظة.
const CACHE = "azkarak-v2";
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "virtues.js",
  "logo.svg",
  "manifest.webmanifest",
  "data/hisn-27.json",
  "data/hisn-28.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // الخطوط مش بتتغير، فناخدها من المحفوظ الأول
  if (url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com") {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // ملفات الموقع والـ API: النت الأول، وبعدين المحفوظ
  // (ignoreSearch علشان style.css?v=7 تلاقي style.css المحفوظة)
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true })
          .then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))
      )
  );
});
