'use strict';
// ฝังวิดีโอ public/media/work-1..4.mp4 ลงใน public/index.html (เป็น data URI)
// เพื่อให้ index.html ไฟล์เดียวก็เล่นวิดีโอได้ ถึงจะไม่มีโฟลเดอร์ media   รัน: node tools/embed-videos.js
const fs = require('node:fs'), path = require('node:path');
const idx = path.join(__dirname, '..', 'public', 'index.html'), media = path.join(__dirname, '..', 'public', 'media');
const map = {};
for (const n of [1, 2, 3, 4]) { const f = path.join(media, `work-${n}.mp4`); if (fs.existsSync(f)) map[n] = 'data:video/mp4;base64,' + fs.readFileSync(f).toString('base64'); }
let html = fs.readFileSync(idx, 'utf8');
const re = /<script id="embedded-videos">[\s\S]*?<\/script>/;
if (!re.test(html)) throw new Error('ไม่พบ <script id="embedded-videos"> ใน index.html');
html = html.replace(re, () => `<script id="embedded-videos">window.EMBED_VIDEOS = ${JSON.stringify(map)};</script>`);
fs.writeFileSync(idx, html);
console.log('ฝังวิดีโอแล้ว', Object.keys(map).join(', '), '->', (html.length / 1048576).toFixed(2), 'MB');
