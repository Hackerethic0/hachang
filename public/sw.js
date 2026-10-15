// Service worker แบบเบา: ไฟล์หน้าเว็บของเครื่องนี้โหลดเร็วขึ้น ส่วน /api ไม่แคชเด็ดขาด (ข้อมูลต้องสดเสมอ)
const CACHE = 'hachang-shell-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/media/')) return;
  // network-first: ได้หน้าล่าสุดเสมอ ถ้าออฟไลน์ค่อยใช้ของเดิม
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
});
