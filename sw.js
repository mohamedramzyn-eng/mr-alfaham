/* استيراد الـ Service Worker بتاع OneSignal جوه نفس الملف ده — عشان
   نتفادى تعارض إن يكون عندنا Service Worker في نفس الـ scope ("/").
   لازم يفضل في أول سطر في الملف. */
importScripts("https://cdn.onesignal.com/sdks/OneSignalSDKWorker.js");

/* ============================================================
   Service Worker — عالفحم MR
   استراتيجية "الشبكة أولاً" (Network First) لملف التطبيق نفسه
   (index.html وأي صفحة)، عشان أي تحديث بترفعه على GitHub يوصل
   فورًا لأول واحد يفتح التطبيق وهو متصل بالنت — من غير ما يحتاج
   يمسح التطبيق أو ينزّله تاني. الكاش هنا بيُستخدم بس كـ fallback
   لو النت مقطوع، مش كمصدر أساسي.

   ملحوظة مهمة: الملف ده معندوش أي علاقة ببيانات المطعم (الموظفين/
   التقييمات/الحضور...) — دي كلها في Firebase مش هنا، فمسح الكاش أو
   تحديث الـ Service Worker مبيأثرش عليها خالص.

   ⚠️ كل مرة بترفع تحديث جديد لأي ملف (index.html، manifest.json...):
   لازم تزوّد رقم APP_VERSION تحت بواحد، عشان المتصفح يعتبر الكاش
   القديم "منتهي" ويجيب أحدث نسخة. لو نسيت تزوّده، التحديث برضو
   هيوصل (لإن الإستراتيجية Network First أصلًا) بس أبطأ شوية.
   ============================================================ */
const APP_VERSION = 'v1';
const CACHE_NAME = 'mr-alfaham-' + APP_VERSION;
const OFFLINE_FALLBACK_URLS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // ياخد السيطرة فورًا من غير ما يستنى قفل كل التابات القديمة
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_FALLBACK_URLS)).catch(() => {})
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    // أي حاجة من Firebase أو أي دومين تاني (خطوط، CDN...) سيبها تروح
    // للشبكة عادي من غير ما الـ Service Worker يتدخل فيها.
    if (new URL(req.url).origin !== self.location.origin) return;

    event.respondWith(
        fetch(req)
            .then((res) => {
                const copy = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
                return res;
            })
            .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
});
