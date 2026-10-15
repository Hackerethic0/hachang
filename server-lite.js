'use strict';
// หาช่าง - หางานช่าง : เวอร์ชัน "พร้อมรัน" ไม่ต้องติดตั้งอะไรเพิ่ม
// ต้องการเพียง Node.js 22.13 ขึ้นไป (ใช้ node:sqlite ในตัว) ไม่ต้องใช้ npm install / PostgreSQL
// API เหมือน server.js (Express + PostgreSQL) ใช้กับ public/index.html ตัวเดียวกัน
//   รัน: node server-lite.js   แล้วเปิด http://localhost:3000
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); }
catch { console.error('\n  ต้องใช้ Node.js เวอร์ชัน 22.13 ขึ้นไป (เครื่องนี้คือ ' + process.version + ')\n  ดาวน์โหลดได้ที่ https://nodejs.org\n'); process.exit(1); }

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';              // ค่าเริ่มต้นเปิดเฉพาะเครื่องนี้
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'hachang.db');
const DEMO_MODE = process.env.DEMO_MODE !== '0';           // DEMO_MODE=0 ปิดปุ่มจำลองคอมมิชชัน Affiliate
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- secret ----------
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  const f = path.join(__dirname, '.secret');
  try { SECRET = fs.readFileSync(f, 'utf8'); }
  catch { SECRET = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(f, SECRET, { mode: 0o600 }); }
}

// ---------- helpers ----------
const fail = (status, message) => Object.assign(new Error(message), { status });
const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const n = v => (v === undefined ? null : v);
const { PROV } = require('./public/vendor/provinces.js');   // จังหวัดทั้ง 77 แห่ง ใช้ไฟล์เดียวกับหน้าเว็บ
const haversine = (a, b, c, d) => { const R = 6371, t = x => x * Math.PI / 180; const dLa = t(c - a), dLo = t(d - b); const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const CONTACT_RE = /(\d[\s.\-–]*){8,}|ไลน์|\bline\b|@[a-z0-9_.]{3,}|facebook|เฟส|\bfb\b|โทร|\btel\b|whatsapp|wechat|https?:\/\/|www\./i;

// password: scrypt, token: HS256 JWT (ไม่ใช้ไลบรารีภายนอก)
const hashPw = pw => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(String(pw), salt, 32).toString('hex'); };
const checkPw = (pw, stored) => { const [salt, h] = String(stored).split(':'); const c = crypto.scryptSync(String(pw), salt, 32); const b = Buffer.from(h, 'hex'); return c.length === b.length && crypto.timingSafeEqual(c, b); };
const b64 = s => Buffer.from(s).toString('base64url');
const signToken = u => { const h = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' })); const p = b64(JSON.stringify({ id: u.id, role: u.role, name: u.name, exp: Math.floor(Date.now() / 1000) + 7 * 86400 })); return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url')}`; };
const verifyToken = t => {
  const [h, p, s] = String(t || '').split('.');
  if (!s) throw fail(401, 'unauthorized');
  const e = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url');
  if (e.length !== s.length || !crypto.timingSafeEqual(Buffer.from(e), Buffer.from(s))) throw fail(401, 'unauthorized');
  const d = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (d.exp < Date.now() / 1000) throw fail(401, 'unauthorized');
  return d;
};

// ---------- database ----------
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
const all = (s, ...p) => db.prepare(s).all(...p);
const get = (s, ...p) => db.prepare(s).get(...p);
const run = (s, ...p) => db.prepare(s).run(...p);
const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  phone TEXT, province TEXT, avatar_url TEXT, cover_url TEXT, bio TEXT, trade TEXT, queue_status TEXT DEFAULT 'ว่าง',
  credit REAL NOT NULL DEFAULT 0 CHECK (credit >= 0), dbd_number TEXT, dbd_doc_url TEXT, verified INTEGER NOT NULL DEFAULT 0,
  device_id TEXT, last_lat REAL, last_lng REAL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workplace_photos (id TEXT PRIMARY KEY, tech_id TEXT, url TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, title TEXT NOT NULL, trade TEXT NOT NULL, detail TEXT NOT NULL, province TEXT NOT NULL,
  lat REAL, lng REAL, budget REAL NOT NULL CHECK (budget > 0), fee_rate REAL, status TEXT NOT NULL DEFAULT 'open',
  hired_tech TEXT, paid_amount REAL, created_at TEXT NOT NULL, closed_at TEXT);
CREATE TABLE IF NOT EXISTS job_images (id TEXT PRIMARY KEY, job_id TEXT, url TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS job_bids (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, tech_id TEXT NOT NULL, fee REAL NOT NULL, created_at TEXT NOT NULL, UNIQUE (job_id, tech_id));
CREATE TABLE IF NOT EXISTS credit_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL, ref_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payment_slips (id TEXT PRIMARY KEY, tech_id TEXT NOT NULL, amount REAL NOT NULL, slip_url TEXT, status TEXT NOT NULL DEFAULT 'pending', reviewed_by TEXT, created_at TEXT NOT NULL, reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS event_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL, detail TEXT, ip TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tracks (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, tech_id TEXT, lat REAL NOT NULL, lng REAL NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, job_id TEXT UNIQUE, tech_id TEXT NOT NULL, customer_id TEXT NOT NULL, stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5), body TEXT, image_url TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, from_user TEXT NOT NULL, target_user TEXT NOT NULL, job_id TEXT, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS portfolio (id TEXT PRIMARY KEY, tech_id TEXT NOT NULL, title TEXT NOT NULL, media_url TEXT, media_kind TEXT DEFAULT 'image', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS affiliate_events (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, portfolio_id TEXT NOT NULL, kind TEXT NOT NULL, commission REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS promotions (id TEXT PRIMARY KEY, tech_id TEXT NOT NULL, title TEXT NOT NULL, media_url TEXT, media_kind TEXT DEFAULT 'image', active INTEGER DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value REAL NOT NULL);
`);
for (const [k, v] of [['fee_rate_pct', 10], ['min_fee', 20], ['cost_rate_pct', 8], ['max_distance_km', 300], ['affiliate_commission', 50]])
  run('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)', k, v);

db.exec(`CREATE TABLE IF NOT EXISTS support_messages (id TEXT PRIMARY KEY, thread_user TEXT NOT NULL, sender TEXT NOT NULL, admin_id TEXT, body TEXT NOT NULL,
  created_at TEXT NOT NULL, read_user INTEGER NOT NULL DEFAULT 0, read_admin INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS support_thread_idx ON support_messages(thread_user, created_at);`);
for (const col of ["kind TEXT NOT NULL DEFAULT 'text'", 'lat REAL', 'lng REAL']) { try { db.exec('ALTER TABLE support_messages ADD COLUMN ' + col); } catch { /* มีคอลัมน์แล้ว */ } }
for (const q of ['ALTER TABLE jobs ADD COLUMN sub TEXT', 'ALTER TABLE users ADD COLUMN subs TEXT']) { try { db.exec(q); } catch { /* มีคอลัมน์แล้ว */ } }
// เปลี่ยนชื่อประเภท "ช่างยนต์/อู่" เป็น "ซ่อมรถยนต์" (ข้อมูลเดิมถูกย้ายให้อัตโนมัติ)
db.exec("UPDATE users SET trade='ซ่อมรถยนต์' WHERE trade='ช่างยนต์/อู่'; UPDATE jobs SET trade='ซ่อมรถยนต์' WHERE trade='ช่างยนต์/อู่'");

const setting = k => Number(get('SELECT value FROM settings WHERE key=?', k)?.value);
const log = (level, actor, action, detail = {}, ip = null) =>
  run('INSERT INTO event_logs(level,actor_id,action,detail,ip,created_at) VALUES (?,?,?,?,?,?)', level, n(actor), action, JSON.stringify(detail), n(ip), nowIso());

// ---------- ข้อมูลตัวอย่าง (สร้างครั้งแรกครั้งเดียว) ----------
function seedDemo() {
  if (get('SELECT COUNT(*) AS c FROM users').c > 0) return;
  const pw = hashPw('1234'), apw = hashPw('admin'), ids = {};
  const U = [
    ['customer','สมชาย ใจดี','customer@demo.th',pw,'กรุงเทพฯ',null,0,'ว่าง','081-234-5678','dev-c1',13.75,100.5,0],
    ['tech','ช่างต้น แอร์เย็น','tech@demo.th',pw,'กรุงเทพฯ','ช่างแอร์',300,'ว่าง','089-111-2222','dev-t1',13.77,100.53,1],
    ['tech','อู่ช่างเอก ยานยนต์','tech2@demo.th',pw,'เชียงใหม่','ซ่อมรถยนต์',800,'คิวสั้น','082-333-4444','dev-t2',18.8,98.99,1],
    ['tech','ช่างนก ประปา','tech3@demo.th',pw,'ขอนแก่น','ช่างประปา',0,'ว่าง','086-555-6666','dev-t3',16.45,102.84,0],
    ['tech','ช่างหนึ่ง ไฟฟ้า','tech4@demo.th',pw,'ชลบุรี','ช่างไฟฟ้า',200,'คิวเต็ม','084-777-8888','dev-t4',13.37,100.99,0],
    ['admin','ผู้ดูแลระบบ','admin@demo.th',apw,'กรุงเทพฯ',null,0,'ว่าง',null,'dev-a1',null,null,0]
  ];
  for (const u of U) {
    const id = newId(); ids[u[2]] = id;
    run('INSERT INTO users(id,role,name,email,password_hash,province,trade,credit,queue_status,phone,device_id,last_lat,last_lng,verified,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, u[0], u[1], u[2], u[3], u[4], u[5], u[6], u[7], u[8], u[9], u[10], u[11], u[12], nowIso());
    if (u[6] > 0) run('INSERT INTO credit_ledger(id,user_id,type,amount,created_at) VALUES (?,?,?,?,?)', newId(), id, 'topup', u[6], nowIso());
  }
  run("UPDATE users SET dbd_number='0105561234567' WHERE email='tech@demo.th'");
  run("UPDATE users SET dbd_number='0505562000111' WHERE email='tech2@demo.th'");
  run("UPDATE users SET bio='ล้าง ซ่อม ติดตั้งแอร์ ประสบการณ์ 10 ปี' WHERE email='tech@demo.th'");
  run("UPDATE users SET bio='อู่ซ่อมรถครบวงจร เช็กระยะ เปลี่ยนอะไหล่' WHERE email='tech2@demo.th'");
  run("UPDATE users SET bio='แก้ท่อรั่ว ติดตั้งปั๊มน้ำ' WHERE email='tech3@demo.th'");
  run("UPDATE users SET bio='เดินสายไฟ ติดตั้งโคมไฟ ตรวจระบบไฟบ้าน' WHERE email='tech4@demo.th'");
  const c = ids['customer@demo.th'];
  for (const j of [
    ['ล้างแอร์ 3 เครื่อง','ช่างแอร์','แอร์ผนัง 12000 BTU 3 เครื่อง ต้องการล้างและเช็กน้ำยา','กรุงเทพฯ',1500],
    ['ท่อน้ำใต้ซิงค์รั่ว','ช่างประปา','น้ำหยดตลอดเวลา ต้องเปลี่ยนข้อต่อ','ชลบุรี',2400],
    ['เช็กระยะและเปลี่ยนผ้าเบรก','ซ่อมรถยนต์','รถเก๋ง 80,000 กม. มีเสียงดังตอนเบรก','เชียงใหม่',3500]])
    run('INSERT INTO jobs(id,customer_id,title,trade,detail,province,budget,lat,lng,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', newId(), c, j[0], j[1], j[2], j[3], j[4], PROV[j[3]][0], PROV[j[3]][1], nowIso());
  run('INSERT INTO portfolio(id,tech_id,title,created_at) VALUES (?,?,?,?)', newId(), ids['tech@demo.th'], 'ติดตั้งแอร์ Inverter คอนโด', nowIso());
  run('INSERT INTO portfolio(id,tech_id,title,created_at) VALUES (?,?,?,?)', newId(), ids['tech2@demo.th'], 'เปลี่ยนชุดคลัตช์ รถกระบะ', nowIso());
  run('INSERT INTO promotions(id,tech_id,title,created_at) VALUES (?,?,?,?)', newId(), ids['tech@demo.th'], 'ล้างแอร์ 2 เครื่อง ลด 15% สัปดาห์นี้', nowIso());
  run("INSERT INTO payment_slips(id,tech_id,amount,slip_url,created_at) VALUES (?,?,300,'',?)", newId(), ids['tech3@demo.th'], nowIso());
  for (const [em, subs] of [['tech@demo.th', ['ล้างแอร์', 'ซ่อมแอร์', 'ติดตั้งแอร์']], ['tech2@demo.th', ['ซ่อมสีตัวถัง', 'ซ่อมเครื่อง', 'ซ่อมรถอุบัติเหตุ', 'ซ่อมรถน้ำท่วม']]])
    run('UPDATE users SET subs=? WHERE email=?', JSON.stringify(subs), em);
  log('info', null, 'system.seed', { note: 'สร้างข้อมูลตัวอย่าง' });
}
seedDemo();

// ---------- router ----------
const routes = [];
const route = (method, pattern, opts, handler) => {
  if (typeof opts === 'function') { handler = opts; opts = {}; }
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, opts, handler });
};
const authed = (...roles) => ({ auth: true, roles });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 8 * 1024 * 1024) { reject(fail(413, 'ไฟล์/ข้อมูลใหญ่เกินไป')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(fail(400, 'JSON ไม่ถูกต้อง')); } });
    req.on('error', reject);
  });
}
const sendJson = (res, status, data) => { const b = JSON.stringify(data); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(b); };
const MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.woff2': 'font/woff2' };

// ---------- Real-time (SSE) สำหรับแผนที่ช่างหน้าแรก ไม่ต้องล็อกอิน ----------
const sseClients = new Set();
const broadcastTechs = () => { for (const r of sseClients) { try { r.write('data: {"type":"techs"}\n\n'); } catch { sseClients.delete(r); } } };
// ---------- Real-time ทั้งระบบ: ทุกครั้งที่มีการเขียนข้อมูล แจ้งทุกหน้าจอที่ล็อกอินอยู่ให้ดึงสถานะใหม่ทันที ----------
const streamClients = new Set();
let pushTimer = null;
const pushState = () => { if (pushTimer) return; pushTimer = setTimeout(() => { pushTimer = null; for (const r of streamClients) { try { r.write('data: {"type":"state"}\n\n'); } catch { streamClients.delete(r); } } }, 100); };
const TECH_CHANGE_RE = /^\/api\/(auth\/signup|me|me\/location|admin\/users\/[^/]+\/verify)$/;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/stream') {
    let who; try { who = verifyToken((req.headers.authorization || '').replace('Bearer ', '')); } catch { return sendJson(res, 401, { error: 'unauthorized' }); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.uid = who.id;
    res.write(': connected\n\n'); res.write('data: {"type":"state"}\n\n'); streamClients.add(res);
    pushState();   // แจ้งหลังบ้านว่ามีผู้ใช้ออนไลน์เพิ่ม
    const hb2 = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 25000);
    req.on('close', () => { clearInterval(hb2); streamClients.delete(res); pushState(); });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/public/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(': connected\n\n'); sseClients.add(res);
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 25000);
    req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    try {
      let r, m;
      for (const x of routes) { if (x.method !== req.method) continue; m = x.re.exec(url.pathname); if (m) { r = x; break; } }
      if (!r) throw fail(404, 'ไม่พบ endpoint');
      const ctx = { params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), query: Object.fromEntries(url.searchParams), body: {}, user: null, ip: req.socket.remoteAddress };
      if (r.opts.auth) {
        const t = (req.headers.authorization || '').replace('Bearer ', '');
        ctx.user = verifyToken(t);
        if (!get('SELECT 1 FROM users WHERE id=?', ctx.user.id)) throw fail(401, 'unauthorized');
        if (r.opts.roles?.length && !r.opts.roles.includes(ctx.user.role)) throw fail(403, 'forbidden');
      }
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) ctx.body = await readBody(req);
      for (const f of r.opts.noContact || []) if (CONTACT_RE.test(String(ctx.body[f] || ''))) throw fail(422, `ช่อง "${f}" ห้ามใส่เบอร์โทร / Line / ช่องทางติดต่อโดยตรง`);
      sendJson(res, 200, (await r.handler(ctx)) ?? { ok: true });
      if (req.method !== 'GET' && TECH_CHANGE_RE.test(url.pathname)) broadcastTechs();
      if (req.method !== 'GET') pushState();
    } catch (e) { if (!e.status) console.error(e); sendJson(res, e.status || 500, { error: e.status ? e.message : 'เซิร์ฟเวอร์ขัดข้อง' }); if (req.method !== 'GET') pushState(); }
    return;
  }
  // static
  let rel = decodeURIComponent(url.pathname); if (rel === '/') rel = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const base = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
      const end = Math.min(m[1] && m[2] ? Number(m[2]) : st.size - 1, st.size - 1);
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...base, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
});

// ---------- ข้อมูลสาธารณะสำหรับแผนที่หน้าแรก (ไม่มีชื่อ/รหัสผู้ใช้/พิกัดจริง) ----------
// พิกัดคือศูนย์กลางจังหวัด + ค่าเลื่อนคงที่ต่อช่างหนึ่งราย เพื่อไม่เปิดเผยที่ตั้งจริง
const pubKey = id => crypto.createHash('sha256').update(id).digest('hex').slice(0, 10);
const jit = (id, salt) => { let h = 0; for (const ch of id + salt) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 1000) / 1000 - 0.5; };
route('GET', '/api/public/techs', () => {
  const rows = all("SELECT id,trade,province,queue_status,verified,created_at FROM users WHERE role='tech' ORDER BY created_at DESC LIMIT 300");
  const techs = rows.filter(u => PROV[u.province]).map(u => ({
    k: pubKey(u.id), trade: u.trade || 'ช่าง', province: u.province, queue: u.queue_status || 'ว่าง', verified: !!u.verified,
    lat: +(PROV[u.province][0] + jit(u.id, 'a') * 0.5).toFixed(3), lng: +(PROV[u.province][1] + jit(u.id, 'b') * 0.5).toFixed(3) }));
  return { techs, total: rows.length, available: rows.filter(u => (u.queue_status || 'ว่าง') === 'ว่าง').length };
});

// ---------- auth ----------
route('POST', '/api/auth/signup', { noContact: ['bio', 'name'] }, ({ body: b, ip }) => {
  if (!['customer', 'tech'].includes(b.role)) throw fail(400, 'role ไม่ถูกต้อง');
  if (!b.name || !b.email || !b.password || String(b.password).length < 4) throw fail(400, 'กรอกข้อมูลให้ครบ (รหัสผ่านอย่างน้อย 4 ตัวอักษร)');
  const [la, lo] = PROV[b.province] || [null, null];
  const id = newId();
  try {
    run('INSERT INTO users(id,role,name,email,password_hash,province,trade,device_id,last_lat,last_lng,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id, b.role, b.name, String(b.email).trim().toLowerCase(), hashPw(b.password), n(b.province), n(b.role === 'tech' ? b.trade : null), n(b.deviceId), la, lo, nowIso());
  } catch (e) { throw /UNIQUE/.test(e.message) ? fail(409, 'อีเมลนี้ถูกใช้แล้ว') : e; }
  log('info', id, 'signup', { role: b.role }, ip);
  const u = { id, role: b.role, name: b.name };
  return { token: signToken(u), user: u };
});
route('POST', '/api/auth/login', ({ body: b, ip }) => {
  const u = get('SELECT * FROM users WHERE email=? AND role=?', String(b.email || '').trim().toLowerCase(), b.role);
  if (!u || !checkPw(b.password, u.password_hash)) { log('warn', u?.id, 'login.failed', { email: b.email }, ip); throw fail(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'); }
  log('info', u.id, 'login', {}, ip);
  return { token: signToken(u), user: { id: u.id, role: u.role, name: u.name } };
});

// ---------- โปรไฟล์ ----------
const cleanSubs = a => [...new Set((Array.isArray(a) ? a : []).map(x => String(x || '').trim().slice(0, 40)).filter(x => x && !CONTACT_RE.test(x)))].slice(0, 12);
route('PUT', '/api/me', { ...authed(), noContact: ['bio', 'name'] }, ({ user, body: b }) => {
  tx(() => {
    if (Array.isArray(b.subs)) run('UPDATE users SET subs=? WHERE id=?', JSON.stringify(cleanSubs(b.subs)), user.id);
    run(`UPDATE users SET name=COALESCE(?,name), bio=COALESCE(?,bio), phone=COALESCE(?,phone), avatar_url=COALESCE(?,avatar_url),
         cover_url=COALESCE(?,cover_url), queue_status=COALESCE(?,queue_status), province=COALESCE(?,province),
         dbd_number=COALESCE(?,dbd_number), dbd_doc_url=COALESCE(?,dbd_doc_url), trade=COALESCE(?,trade) WHERE id=?`,
      n(b.name), n(b.bio), n(b.phone), n(b.avatar_url), n(b.cover_url), n(b.queue_status), n(b.province), n(b.dbd_number), n(b.dbd_doc_url), n(b.trade), user.id);
    if (Array.isArray(b.workplace)) {
      run('DELETE FROM workplace_photos WHERE tech_id=?', user.id);
      for (const url of b.workplace) run('INSERT INTO workplace_photos(id,tech_id,url) VALUES (?,?,?)', newId(), user.id, url);
    }
  });
});
route('POST', '/api/me/location', authed(), ({ user, body: b }) => {
  run('UPDATE users SET last_lat=COALESCE(?,last_lat), last_lng=COALESCE(?,last_lng), device_id=COALESCE(?,device_id) WHERE id=?', n(b.lat), n(b.lng), n(b.deviceId), user.id);
});

// ---------- โพสต์งาน ----------
route('POST', '/api/jobs', { ...authed('customer'), noContact: ['title', 'detail', 'sub'] }, ({ user, body: b, ip }) => {
  const budget = Number(b.budget);
  if (!b.title || !b.detail || !b.trade || !PROV[b.province] || !(budget > 0)) throw fail(400, 'กรอกข้อมูลงานให้ครบ');
  const id = newId();
  tx(() => {
    run('INSERT INTO jobs(id,customer_id,title,trade,detail,province,budget,lat,lng,created_at,sub) VALUES (?,?,?,?,?,?,?,?,?,?,?)', id, user.id, b.title, b.trade, b.detail, b.province, budget, PROV[b.province][0], PROV[b.province][1], nowIso(), n(String(b.sub || '').trim().slice(0, 40) || null));
    for (const url of (b.images || []).slice(0, 8)) run('INSERT INTO job_images(id,job_id,url) VALUES (?,?,?)', newId(), id, url);
    log('info', user.id, 'job.create', { job: id }, ip);
  });
  return { id };
});
route('POST', '/api/jobs/:id/cancel', authed('customer'), ({ user, params, ip }) => {
  const r = run("UPDATE jobs SET status='cancelled', closed_at=? WHERE id=? AND customer_id=? AND status='open'", nowIso(), params.id, user.id);
  if (!r.changes) throw fail(404, 'ไม่พบงาน');
  log('info', user.id, 'job.cancel', { job: params.id }, ip);
});
route('POST', '/api/jobs/:id/complete', authed('customer'), ({ user, params, body: b, ip }) => {
  const r = run(`UPDATE jobs SET status='done', hired_tech=?, paid_amount=COALESCE(?,budget), closed_at=?
                 WHERE id=? AND customer_id=? AND status='open' AND EXISTS (SELECT 1 FROM job_bids WHERE job_id=jobs.id AND tech_id=?)`,
    n(b.techId), n(b.paid), nowIso(), params.id, user.id, n(b.techId));
  if (!r.changes) throw fail(400, 'ปิดงานไม่ได้ (ช่างต้องเคยรับงานนี้)');
  log('info', user.id, 'job.complete', { job: params.id, techId: b.techId }, ip);
});

// ---------- ช่างกดรับงาน: หักเครดิตใน transaction เดียว ----------
route('POST', '/api/jobs/:id/accept', authed('tech'), ({ user, params, ip }) => {
  const out = tx(() => {
    const job = get(`SELECT j.*, u.device_id AS cust_device, u.phone AS cust_phone, u.name AS cust_name FROM jobs j JOIN users u ON u.id=j.customer_id WHERE j.id=? AND j.status='open'`, params.id);
    if (!job) return { status: 404, err: 'งานนี้ถูกปิดหรือไม่มีอยู่' };
    const t = get('SELECT * FROM users WHERE id=?', user.id);
    if (get('SELECT 1 FROM job_bids WHERE job_id=? AND tech_id=?', job.id, t.id)) return { status: 409, err: 'คุณรับงานนี้แล้ว' };
    if (t.device_id && t.device_id === job.cust_device) { log('block', t.id, 'accept.same_device', { job: job.id }, ip); return { status: 403, err: 'ตรวจพบอุปกรณ์เดียวกับเจ้าของงาน' }; }
    const maxKm = setting('max_distance_km');
    if (t.last_lat != null && job.lat != null) {
      const d = haversine(t.last_lat, t.last_lng, job.lat, job.lng);
      if (d > maxKm) { log('block', t.id, 'accept.too_far', { job: job.id, km: Math.round(d) }, ip); return { status: 403, err: `ตำแหน่งห่างจากงาน ${Math.round(d)} กม. เกินที่กำหนด (${maxKm} กม.)` }; }
      if (d > maxKm * 0.6) log('warn', t.id, 'accept.far', { job: job.id, km: Math.round(d) }, ip);
    }
    const rate = job.fee_rate != null ? job.fee_rate : setting('fee_rate_pct');       // อัตราต่องาน (แอดมินปรับได้) > ค่ามาตรฐาน
    const fee = Math.max(setting('min_fee'), Math.round(job.budget * rate / 100));
    if (t.credit < fee) return { status: 402, err: `เครดิตไม่พอ ต้องใช้ ฿${fee}` };
    run('INSERT INTO job_bids(id,job_id,tech_id,fee,created_at) VALUES (?,?,?,?,?)', newId(), job.id, t.id, fee, nowIso());
    run('UPDATE users SET credit = credit - ? WHERE id=?', fee, t.id);
    run("INSERT INTO credit_ledger(id,user_id,type,amount,ref_id,created_at) VALUES (?,?,'fee',?,?,?)", newId(), t.id, -fee, job.id, nowIso());
    log('info', t.id, 'job.accept', { job: job.id, fee, rate }, ip);
    return { ok: { fee, rate, customer: { name: job.cust_name, phone: job.cust_phone }, qr: `HACHANG:JOB:${job.id}:${t.id}` } };
  });
  if (out.err) throw fail(out.status, out.err);
  return out.ok;
});

// ---------- เติมเครดิต + สลิป ----------
route('POST', '/api/credit/topup', authed('tech'), ({ user, body: b, ip }) => {
  const amount = Number(b.amount);
  if (!(amount >= 100)) throw fail(400, 'ขั้นต่ำ 100 บาท');
  if (!b.slip) throw fail(400, 'กรุณาแนบสลิป');
  const id = newId();
  run('INSERT INTO payment_slips(id,tech_id,amount,slip_url,created_at) VALUES (?,?,?,?,?)', id, user.id, amount, b.slip, nowIso());
  log('info', user.id, 'topup.request', { slip: id, amount }, ip);
  return { id, status: 'pending' };
});
route('POST', '/api/admin/slips/:id/:decision', authed('admin'), ({ user, params, ip }) => {
  if (!['approve', 'reject'].includes(params.decision)) throw fail(400, 'decision ไม่ถูกต้อง');
  const ok = params.decision === 'approve';
  tx(() => {
    const s = get("SELECT * FROM payment_slips WHERE id=? AND status='pending'", params.id);
    if (!s) throw fail(404, 'ไม่พบสลิปที่รอตรวจ');
    run('UPDATE payment_slips SET status=?, reviewed_by=?, reviewed_at=? WHERE id=?', ok ? 'approved' : 'rejected', user.id, nowIso(), s.id);
    if (ok) {
      run('UPDATE users SET credit = credit + ? WHERE id=?', s.amount, s.tech_id);
      run("INSERT INTO credit_ledger(id,user_id,type,amount,ref_id,created_at) VALUES (?,?,'topup',?,?,?)", newId(), s.tech_id, s.amount, s.id, nowIso());
    }
    log('info', user.id, 'slip.' + params.decision, { slip: s.id, amount: s.amount }, ip);
  });
});

// ---------- Tracking ----------
route('POST', '/api/track', authed('tech'), ({ user, body: b }) => {
  if (typeof b.lat !== 'number' || typeof b.lng !== 'number') throw fail(400, 'พิกัดไม่ถูกต้อง');
  run('INSERT INTO tracks(job_id,tech_id,lat,lng,created_at) VALUES (?,?,?,?,?)', n(b.jobId), user.id, b.lat, b.lng, nowIso());
  run('UPDATE users SET last_lat=?, last_lng=? WHERE id=?', b.lat, b.lng, user.id);
});
route('GET', '/api/track/:jobId', authed('customer'), ({ user, params }) => {
  const j = get('SELECT lat,lng FROM jobs WHERE id=? AND customer_id=?', params.jobId, user.id);
  const t = get('SELECT lat,lng,created_at FROM tracks WHERE job_id=? ORDER BY id DESC LIMIT 1', params.jobId);
  if (!j || !t) throw fail(404, 'ยังไม่มีข้อมูลตำแหน่ง');
  const distanceKm = haversine(t.lat, t.lng, j.lat, j.lng);
  return { position: t, distanceKm, etaMinutes: Math.ceil(distanceKm / 40 * 60) };
});

// ---------- รีวิว / รายงาน / ผลงาน / โปรโมชัน ----------
route('POST', '/api/reviews', { ...authed('customer'), noContact: ['body'] }, ({ user, body: b, ip }) => {
  const j = get("SELECT hired_tech FROM jobs WHERE id=? AND customer_id=? AND status='done'", n(b.jobId), user.id);
  const stars = Number(b.stars);
  if (!j || !j.hired_tech) throw fail(400, 'รีวิวได้หลังงานเสร็จเท่านั้น');
  if (!(stars >= 1 && stars <= 5)) throw fail(400, 'คะแนน 1-5');
  try { run('INSERT INTO reviews(id,job_id,tech_id,customer_id,stars,body,image_url,created_at) VALUES (?,?,?,?,?,?,?,?)', newId(), b.jobId, j.hired_tech, user.id, stars, n(b.body), n(b.imageUrl), nowIso()); }
  catch (e) { throw /UNIQUE/.test(e.message) ? fail(409, 'รีวิวงานนี้แล้ว') : e; }
  log('info', user.id, 'review.create', { job: b.jobId, stars }, ip);
});
route('POST', '/api/reports', authed(), ({ user, body: b, ip }) => {
  if (!b.targetId || !String(b.body || '').trim()) throw fail(400, 'กรอกรายละเอียดรายงาน');
  const id = newId();
  run('INSERT INTO reports(id,from_user,target_user,job_id,body,created_at) VALUES (?,?,?,?,?,?)', id, user.id, b.targetId, n(b.jobId), b.body, nowIso());
  log('warn', user.id, 'report.create', { report: id, targetId: b.targetId }, ip);
});
route('POST', '/api/portfolio', { ...authed('tech'), noContact: ['title'] }, ({ user, body: b }) => {
  run('INSERT INTO portfolio(id,tech_id,title,media_url,media_kind,created_at) VALUES (?,?,?,?,?,?)', newId(), user.id, b.title, n(b.media?.src), b.media?.kind || 'image', nowIso());
});
route('POST', '/api/promos', { ...authed('tech'), noContact: ['title'] }, ({ user, body: b }) => {
  run('INSERT INTO promotions(id,tech_id,title,media_url,media_kind,created_at) VALUES (?,?,?,?,?,?)', newId(), user.id, b.title, n(b.media?.src), b.media?.kind || 'image', nowIso());
});

// ---------- Affiliate ----------
route('POST', '/api/affiliate/convert', authed('customer'), ({ user, body: b }) => {
  // ของจริงต้องเรียกจาก webhook ที่ยืนยันการจ้างงาน ไม่ใช่ปุ่มให้ลูกค้ากดเอง -> ปิดด้วย DEMO_MODE=0
  if (!DEMO_MODE) throw fail(403, 'ปิดการจำลองคอมมิชชัน');
  const c = setting('affiliate_commission');
  tx(() => {
    run("INSERT INTO affiliate_events(id,customer_id,portfolio_id,kind,commission,created_at) VALUES (?,?,?,'hired',?,?)", newId(), user.id, n(b.portfolioId), c, nowIso());
    run("INSERT INTO credit_ledger(id,user_id,type,amount,created_at) VALUES (?,?,'commission',?,?)", newId(), user.id, c, nowIso());
  });
  return { commission: c };
});

// ---------- Admin ----------
route('PUT', '/api/admin/jobs/:id/fee-rate', authed('admin'), ({ user, params, body: b, ip }) => {
  const rate = b.rate === null || b.rate === undefined ? null : Number(b.rate);
  if (rate !== null && !(rate >= 0 && rate <= 100)) throw fail(400, 'อัตราต้องอยู่ระหว่าง 0-100');
  const r = run("UPDATE jobs SET fee_rate=? WHERE id=?", rate, params.id);
  if (!r.changes) throw fail(404, 'ไม่พบงาน');
  log('info', user.id, 'job.fee_rate', { job: params.id, rate }, ip);
});
route('PUT', '/api/admin/settings', authed('admin'), ({ user, body: b, ip }) => {
  const limits = { fee_rate_pct: [0, 100], min_fee: [0, 100000], cost_rate_pct: [0, 100], max_distance_km: [1, 5000], affiliate_commission: [0, 100000] };
  tx(() => {
    for (const [k, v] of Object.entries(b)) {
      if (!limits[k]) throw fail(400, 'ไม่รู้จักค่า ' + k);
      const x = Number(v); if (!(x >= limits[k][0] && x <= limits[k][1])) throw fail(400, `ค่า ${k} ต้องอยู่ระหว่าง ${limits[k][0]}-${limits[k][1]}`);
      run('UPDATE settings SET value=? WHERE key=?', x, k);
    }
    log('info', user.id, 'settings.update', b, ip);
  });
});
route('PUT', '/api/admin/users/:id/verify', authed('admin'), ({ user, params, body: b, ip }) => {
  run("UPDATE users SET verified=? WHERE id=? AND role='tech'", b.verified ? 1 : 0, params.id);
  log('info', user.id, 'tech.verify', { tech: params.id, verified: !!b.verified }, ip);
});
route('POST', '/api/admin/reports/:id/close', authed('admin'), ({ user, params, ip }) => {
  run("UPDATE reports SET status='closed' WHERE id=?", params.id);
  log('info', user.id, 'report.close', { report: params.id }, ip);
});
route('POST', '/api/log', authed(), ({ user, body: b, ip }) => { log('warn', user.id, 'client.blocked', { msg: String(b.msg || '').slice(0, 200) }, ip); });
// ---------- แชทติดต่อ/ร้องเรียน: ผู้ใช้ <-> AI <-> ทีมงานหลังบ้าน ----------
const botReply = q => {
  if (/เครดิต|เติม|สลิป/.test(q)) return 'เติมเครดิตที่แท็บ "แดชบอร์ด" โอนตาม QR แล้วแนบสลิป ทีมงานจะตรวจและเพิ่มเครดิตให้เมื่ออนุมัติ';
  if (/หัก|ค่า|%/.test(q)) return `ค่ารับงานคิดเป็นเปอร์เซ็นต์ของงบงาน (ค่ามาตรฐาน ${setting('fee_rate_pct')}%) และหักเมื่อกดรับงานสำเร็จ ดูยอดที่จะหักก่อนกดได้ที่ปุ่มรับงาน`;
  if (/โกง|หลอก|ทุจริต|ร้องเรียน|รายงาน/.test(q)) return 'กรุณากดปุ่ม "รายงาน" ที่โปรไฟล์ช่างหรืองานนั้น ระบบจะเก็บ Log เหตุการณ์ และเจ้าหน้าที่จะตอบกลับในแชทนี้ด้วย';
  if (/ยกเลิก|ลบ/.test(q)) return 'ที่หน้า "โพสต์ของฉัน" กด "ยกเลิกโพสต์" รายการจะถูกนำออกจากระบบทันที';
  return 'ขอบคุณครับ ส่งเรื่องนี้ให้ทีมงานแล้ว เจ้าหน้าที่จะตอบกลับในแชทนี้';
};
const addSupport = (threadUser, sender, body, adminId = null, loc = null) => run(
  'INSERT INTO support_messages(id,thread_user,sender,admin_id,body,created_at,read_user,read_admin,kind,lat,lng) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  newId(), threadUser, sender, adminId, body, nowIso(), sender === 'user' ? 1 : 0, sender === 'admin' ? 1 : 0, loc ? 'location' : 'text', loc ? loc.lat : null, loc ? loc.lng : null);
const parseLoc = o => { const lat = Number(o?.lat), lng = Number(o?.lng); if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw fail(400, 'พิกัดไม่ถูกต้อง'); return { lat, lng }; };
route('POST', '/api/support', authed('customer', 'tech'), ({ user, body: b, ip }) => {
  if (b.location) {   // แชร์โลเคชัน: ไม่ให้ AI ตอบแทรก
    const loc = parseLoc(b.location); addSupport(user.id, 'user', String(b.label || 'แชร์ตำแหน่ง').slice(0, 100), null, loc);
    log('support', user.id, 'support.location', loc, ip); return;
  }
  const text = String(b.text || '').trim().slice(0, 1000);
  if (!text) throw fail(400, 'พิมพ์ข้อความก่อนส่ง');
  addSupport(user.id, 'user', text);
  // ถ้าเจ้าหน้าที่เพิ่งตอบในช่วง 30 นาทีที่ผ่านมา ให้เจ้าหน้าที่ดูแลต่อ ไม่ให้ AI แทรก
  const lastAdmin = get("SELECT created_at FROM support_messages WHERE thread_user=? AND sender='admin' ORDER BY created_at DESC LIMIT 1", user.id);
  const human = lastAdmin && Date.now() - Date.parse(lastAdmin.created_at) < 30 * 60 * 1000;
  if (!human) { addSupport(user.id, 'ai', botReply(text)); run("UPDATE support_messages SET read_user=1 WHERE thread_user=? AND sender='ai'", user.id); }
  log('support', user.id, 'support.message', { text: text.slice(0, 300), handledBy: human ? 'admin' : 'ai' }, ip);
});
route('POST', '/api/support/read', authed('customer', 'tech'), ({ user }) => { run("UPDATE support_messages SET read_user=1 WHERE thread_user=? AND sender<>'user'", user.id); });
route('POST', '/api/admin/support/:uid/reply', authed('admin'), ({ user, params, body: b, ip }) => {
  if (!get("SELECT 1 FROM users WHERE id=? AND role IN ('customer','tech')", params.uid)) throw fail(404, 'ไม่พบผู้ใช้');
  if (b.location) { const loc = parseLoc(b.location); addSupport(params.uid, 'admin', String(b.label || 'แชร์ตำแหน่ง').slice(0, 100), user.id, loc); log('info', user.id, 'support.admin_location', { to: params.uid }, ip); return; }
  const text = String(b.text || '').trim().slice(0, 1000);
  if (!text) throw fail(400, 'พิมพ์ข้อความก่อนส่ง');
  addSupport(params.uid, 'admin', text, user.id);
  run("UPDATE support_messages SET read_admin=1 WHERE thread_user=? AND sender='user'", params.uid);
  log('info', user.id, 'support.admin_reply', { to: params.uid }, ip);
});
route('POST', '/api/admin/support/:uid/read', authed('admin'), ({ params }) => { run("UPDATE support_messages SET read_admin=1 WHERE thread_user=? AND sender='user'", params.uid); });

// ---------- โทรเสียงจากหลังบ้านถึงผู้ใช้ (WebRTC; เซิร์ฟเวอร์ทำหน้าที่ส่งสัญญาณเท่านั้น เสียงไม่ผ่านเซิร์ฟเวอร์) ----------
// กติกา: สายหลังบ้านมีสายเดียว ใครโทรอยู่ คนอื่นโทรซ้อนไม่ได้ (แชท/ฟังก์ชันอื่นใช้ได้ปกติ) ผู้ใช้โทรเข้าหลังบ้านไม่ได้ ให้ส่งข้อความแทน
const ICE = process.env.ICE_SERVERS ? JSON.parse(process.env.ICE_SERVERS) : [{ urls: 'stun:stun.l.google.com:19302' }];
const calls = new Map();            // callId -> { id, adminId, userId, state, t0, ring }
let adminLine = null;               // callId ที่ครองสายหลังบ้านอยู่ (null = ว่าง)
const sendTo = (uid, obj) => { let k = 0; for (const r of streamClients) if (r.uid === uid) { try { r.write('data: ' + JSON.stringify({ type: 'call', ...obj }) + '\n\n'); k++; } catch { streamClients.delete(r); } } return k; };
const onlineIds = () => [...new Set([...streamClients].map(r => r.uid).filter(Boolean))];
const endCall = (c, reason, by = null) => {
  if (!calls.delete(c.id)) return;
  clearTimeout(c.ring); if (adminLine === c.id) adminLine = null;
  log('info', c.adminId, 'call.end', { user: c.userId, reason, secs: c.state === 'active' ? Math.round((Date.now() - c.t0) / 1000) : 0, by });
  sendTo(c.adminId, { ev: 'ended', callId: c.id, reason }); sendTo(c.userId, { ev: 'ended', callId: c.id, reason }); pushState();
};
setInterval(() => { for (const c of calls.values()) if (Date.now() - c.t0 > 4 * 3600e3) endCall(c, 'timeout'); }, 60e3).unref();
const callOf = (id, uid) => { const c = calls.get(id); if (!c || (c.adminId !== uid && c.userId !== uid)) throw fail(404, 'ไม่พบสายนี้ (อาจวางสายแล้ว)'); return c; };
route('GET', '/api/ice', authed(), () => ({ iceServers: ICE }));
route('POST', '/api/admin/call/:uid', authed('admin'), ({ user, params, ip }) => {
  const u = get("SELECT id,name FROM users WHERE id=? AND role IN ('customer','tech')", params.uid);
  if (!u) throw fail(404, 'ไม่พบผู้ใช้');
  if (adminLine) { const c = calls.get(adminLine); const nm = id => get('SELECT name FROM users WHERE id=?', id)?.name || '-'; throw fail(409, `สายหลังบ้านไม่ว่าง: ${nm(c.adminId)} กำลังโทรหา ${nm(c.userId)} (โทรได้ครั้งละหนึ่งสาย)`); }
  if (!onlineIds().includes(u.id)) throw fail(409, 'ผู้ใช้ไม่ได้เปิดแอปอยู่ จึงโทรเข้าไม่ได้ ลองส่งข้อความแทน');
  const c = { id: newId(), adminId: user.id, userId: u.id, state: 'ringing', t0: Date.now() };
  calls.set(c.id, c); adminLine = c.id; c.ring = setTimeout(() => endCall(c, 'noanswer'), 45000);
  sendTo(u.id, { ev: 'incoming', callId: c.id, from: 'ทีมงานหาช่าง' });
  log('info', user.id, 'call.start', { user: u.id }, ip);
  return { callId: c.id };
});
route('POST', '/api/call/:id/accept', authed('customer', 'tech'), ({ user, params }) => {
  const c = callOf(params.id, user.id); if (c.userId !== user.id || c.state !== 'ringing') throw fail(409, 'รับสายไม่ได้');
  c.state = 'active'; c.t0 = Date.now(); clearTimeout(c.ring); sendTo(c.adminId, { ev: 'accepted', callId: c.id });
});
route('POST', '/api/call/:id/decline', authed('customer', 'tech'), ({ user, params }) => { const c = callOf(params.id, user.id); endCall(c, 'declined', user.id); });
route('POST', '/api/call/:id/end', authed(), ({ user, params }) => { const c = calls.get(params.id); if (c && (c.adminId === user.id || c.userId === user.id)) endCall(c, 'hangup', user.id); });
route('POST', '/api/call/:id/signal', authed(), ({ user, params, body: b }) => {
  const c = callOf(params.id, user.id); if (!['offer', 'answer', 'ice'].includes(b.kind)) throw fail(400, 'ชนิดสัญญาณไม่ถูกต้อง');
  sendTo(user.id === c.adminId ? c.userId : c.adminId, { ev: 'signal', callId: c.id, kind: b.kind, data: b.data });
});

// ---------- สถานะรวมสำหรับหน้าเว็บ (กรองตามสิทธิ์) ----------
route('GET', '/api/state', authed(), ({ user: me }) => {
  const isAdmin = me.role === 'admin';
  const users = all('SELECT * FROM users');
  const meRow = users.find(u => u.id === me.id);
  const myCredit = Number(meRow?.credit || 0);
  const group = (rows, key) => rows.reduce((m, r) => ((m[r[key]] ||= []).push(r), m), {});
  const bidsBy = group(all('SELECT * FROM job_bids'), 'job_id');
  const imgsBy = group(all('SELECT job_id,url FROM job_images'), 'job_id');
  const photosBy = group(all('SELECT tech_id,url FROM workplace_photos'), 'tech_id');

  const visibleJobs = all('SELECT * FROM jobs ORDER BY created_at DESC').filter(j => isAdmin
    || (me.role === 'customer' ? j.customer_id === me.id
        : (bidsBy[j.id] || []).some(b => b.tech_id === me.id) || j.hired_tech === me.id || (j.status === 'open' && myCredit > 0)));
  const jobs = visibleJobs.map(j => {
    const bs = bidsBy[j.id] || [];
    const bids = (isAdmin || j.customer_id === me.id ? bs : bs.filter(b => b.tech_id === me.id)).map(b => ({ techId: b.tech_id, fee: b.fee, at: b.created_at }));
    return { id: j.id, custId: j.customer_id, title: j.title, trade: j.trade, detail: j.detail, province: j.province, budget: j.budget,
      images: (imgsBy[j.id] || []).map(i => i.url), status: j.status, bids, rate: j.fee_rate ?? undefined, sub: j.sub || undefined, doneAt: j.closed_at || undefined,
      hiredTech: j.hired_tech || undefined, paid: j.paid_amount ?? undefined, at: j.created_at };
  });
  const phoneVisible = u => u.id === me.id || isAdmin || (me.role === 'tech' && u.role === 'customer' && jobs.some(j => j.custId === u.id && j.bids.some(b => b.techId === me.id)));
  const media = (src, kind) => (src ? { src, kind: kind || 'image' } : null);

  const S = Object.fromEntries(all('SELECT key,value FROM settings').map(r => [r.key, r.value]));
  const seen = isAdmin ? Object.fromEntries(all('SELECT actor_id, MAX(created_at) m FROM event_logs WHERE actor_id IS NOT NULL GROUP BY actor_id').map(r => [r.actor_id, r.m])) : {};
  const lineC = isAdmin && adminLine ? calls.get(adminLine) : null;
  return {
    me: me.id,
    users: users.map(u => { const self = u.id === me.id || isAdmin; return {
      id: u.id, role: u.role, name: u.name, province: u.province, trade: u.trade, avatar: u.avatar_url || '', cover: u.cover_url || '', bio: u.bio || '',
      queue: u.queue_status, verified: !!u.verified, dbd: { no: u.dbd_number || '', img: u.dbd_doc_url || '' }, subs: (() => { try { return JSON.parse(u.subs || '[]'); } catch { return []; } })(), at: u.created_at, lastSeen: isAdmin ? (seen[u.id] || null) : undefined,
      lat: u.last_lat ?? PROV[u.province]?.[0] ?? null, lng: u.last_lng ?? PROV[u.province]?.[1] ?? null,
      workplace: (photosBy[u.id] || []).map(p => ({ src: p.url, kind: 'image' })),
      phone: phoneVisible(u) ? (u.phone || '') : '', deviceId: self ? u.device_id : undefined, credit: self ? u.credit : 0 }; }),
    jobs,
    ledger: (isAdmin ? all('SELECT * FROM credit_ledger ORDER BY created_at DESC LIMIT 500') : all('SELECT * FROM credit_ledger WHERE user_id=? ORDER BY created_at DESC', me.id))
      .map(l => ({ id: l.id, userId: l.user_id, type: l.type, amount: l.amount, at: l.created_at, ref: l.ref_id || '' })),
    slips: (isAdmin ? all('SELECT * FROM payment_slips ORDER BY created_at DESC') : all('SELECT * FROM payment_slips WHERE tech_id=? ORDER BY created_at DESC', me.id))
      .map(z => ({ id: z.id, techId: z.tech_id, amount: z.amount, img: z.slip_url, status: z.status, at: z.created_at })),
    logs: isAdmin ? all('SELECT l.*, u.name AS actor_name FROM event_logs l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.id DESC LIMIT 300').map(l => {
      const d = l.detail && l.detail !== '{}' ? ' ' + l.detail : '';
      return { id: String(l.id), at: l.created_at, level: l.level, actor: l.actor_name || 'ระบบ', msg: l.action + d }; }) : [],
    reviews: all('SELECT * FROM reviews ORDER BY created_at DESC').map(r => ({ id: r.id, jobId: r.job_id, techId: r.tech_id, custId: r.customer_id, stars: r.stars, text: r.body || '', img: r.image_url || '', at: r.created_at })),
    reports: (isAdmin ? all('SELECT * FROM reports ORDER BY created_at DESC') : all('SELECT * FROM reports WHERE from_user=? ORDER BY created_at DESC', me.id))
      .map(r => ({ id: r.id, from: r.from_user, targetId: r.target_user, jobId: r.job_id, text: r.body, status: r.status, at: r.created_at })),
    portfolio: all('SELECT * FROM portfolio ORDER BY created_at DESC').map(p => ({ id: p.id, techId: p.tech_id, title: p.title, media: media(p.media_url, p.media_kind), at: p.created_at })),
    promos: all('SELECT * FROM promotions WHERE active=1 ORDER BY created_at DESC').map(p => ({ id: p.id, techId: p.tech_id, title: p.title, media: media(p.media_url, p.media_kind), at: p.created_at })),
    support: (isAdmin
      ? all('SELECT m.*, u.name AS uname, u.role AS urole FROM support_messages m JOIN users u ON u.id=m.thread_user ORDER BY m.created_at DESC LIMIT 600')
      : all('SELECT m.*, NULL AS uname, NULL AS urole FROM support_messages m WHERE m.thread_user=? ORDER BY m.created_at ASC', me.id))
      .map(m => ({ id: m.id, threadUser: m.thread_user, sender: m.sender, text: m.body, at: m.created_at, readUser: !!m.read_user, readAdmin: !!m.read_admin, name: m.uname, role: m.urole, kind: m.kind || 'text', lat: m.lat ?? undefined, lng: m.lng ?? undefined })),
    online: isAdmin ? onlineIds() : [],
    line: lineC ? { callId: lineC.id, adminId: lineC.adminId, userId: lineC.userId, state: lineC.state, since: lineC.t0 } : null,
    settings: { rate: S.fee_rate_pct, minFee: S.min_fee, costRate: S.cost_rate_pct, maxKm: S.max_distance_km, affCommission: S.affiliate_commission }
  };
});

if (require.main === module) {
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') console.error(`\n  พอร์ต ${PORT} ถูกใช้งานอยู่ (อาจเปิดระบบนี้ค้างไว้อีกหน้าต่าง) ปิดหน้าต่างเดิมก่อน หรือตั้ง PORT เป็นเลขอื่น แล้วเปิด http://localhost:เลขนั้น\n`);
    else console.error(e);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    console.log(`\n  หาช่าง - หางานช่าง  พร้อมใช้งานที่  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    if (HOST === '0.0.0.0') {   // โหมดทดสอบบนมือถือ: แสดงที่อยู่ที่มือถือในวง Wi-Fi เดียวกันเปิดได้
      const ips = Object.values(require('node:os').networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
      ips.forEach(ip => console.log(`  เปิดจากมือถือ (Wi-Fi เดียวกัน):  http://${ip}:${PORT}`));
    }
    console.log('  ลูกค้า customer@demo.th | ช่าง tech@demo.th (รหัส 1234) | แอดมิน admin@demo.th (รหัส admin)');
    console.log(`  ฐานข้อมูล: ${DB_FILE}\n`);
    if (process.env.OPEN_BROWSER === '1') {   // start.bat ตั้งค่านี้ให้ เปิดเบราว์เซอร์เองโดยไม่ต้องใช้คำสั่งซ้อนใน .bat
      const url = `http://localhost:${PORT}`, { exec } = require('node:child_process');
      exec(process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`, () => {});
    }
  });
}
module.exports = { server };
