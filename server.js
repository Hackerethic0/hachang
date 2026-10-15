// หาช่าง - หางานช่าง : Node.js + Express + PostgreSQL
// npm i express pg jsonwebtoken bcryptjs multer cors helmet
// env: DATABASE_URL, JWT_SECRET, PORT
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
const upload = multer({ dest: path.join(__dirname, 'uploads'), limits: { fileSize: 5 * 1024 * 1024 } });
const SECRET = process.env.JWT_SECRET || 'change-me';

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: '8mb' }));       // รูป/วิดีโอขนาดเล็กส่งเป็น data URL ได้
app.use(express.static(path.join(__dirname, 'public')));   // เสิร์ฟหน้าเว็บ

const crypto = require('crypto');
// ---------- แผนที่สาธารณะหน้าแรก (real-time ผ่าน SSE) ----------
const pubClients = new Set();
const pubBroadcast = () => { for (const r of pubClients) r.write('data: {"type":"techs"}\n\n'); };
app.use('/api', (req, res, next) => {
  res.on('finish', () => {
    if (req.method !== 'GET' && res.statusCode < 400 && /^\/(auth\/signup|me|me\/location|admin\/users\/[^/]+\/verify)$/.test(req.path)) pubBroadcast();
  });
  next();
});
app.get('/api/public/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders(); res.write(': connected\n\n'); pubClients.add(res);
  req.on('close', () => pubClients.delete(res));
});
const { PROV } = require('./public/vendor/provinces.js');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- helpers ----------
const q = (text, params) => pool.query(text, params);
const wrap = fn => (req, res) => fn(req, res).catch(e => {
  console.error(e);
  res.status(e.status || 500).json({ error: e.message || 'server error' });
});
const fail = (status, message) => Object.assign(new Error(message), { status });

async function setting(key, client = pool) {
  const r = await client.query('SELECT value FROM settings WHERE key=$1', [key]);
  return Number(r.rows[0]?.value);
}
async function log(level, actorId, action, detail = {}, ip = null, client = pool) {
  await client.query(
    'INSERT INTO event_logs(level,actor_id,action,detail,ip) VALUES ($1,$2,$3,$4,$5)',
    [level, actorId, action, detail, ip]
  );
  broadcast({ type: 'log', level, action, detail });          // real-time -> admin dashboard
}

const haversine = (a, b, c, d) => {
  const R = 6371, t = x => x * Math.PI / 180;
  const dLa = t(c - a), dLo = t(d - b);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// ---------- กันการลงช่องทางติดต่อโดยตรง ----------
const CONTACT_RE = /(\d[\s.\-–]*){8,}|ไลน์|\bline\b|@[a-z0-9_.]{3,}|facebook|เฟส|\bfb\b|โทร|\btel\b|whatsapp|wechat|https?:\/\/|www\./i;
const noContact = (...fields) => (req, _res, next) => {
  for (const f of fields) {
    if (CONTACT_RE.test(req.body[f] || '')) {
      return next(fail(422, `ช่อง "${f}" ห้ามใส่เบอร์โทร / Line / ช่องทางติดต่อโดยตรง`));
    }
  }
  next();
};

// ---------- SSE (real-time) ----------
const clients = new Set();
function broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) c.write(msg);
}
app.get('/api/stream', auth('admin'), (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

// ---------- auth ----------
function auth(...roles) {
  return (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      req.user = jwt.verify(token, SECRET);
      if (roles.length && !roles.includes(req.user.role)) throw fail(403, 'forbidden');
      next();
    } catch (e) { next(e.status ? e : fail(401, 'unauthorized')); }
  };
}
const sign = u => jwt.sign({ id: u.id, role: u.role, name: u.name }, SECRET, { expiresIn: '7d' });

app.post('/api/auth/signup', noContact('bio', 'name'), wrap(async (req, res) => {
  const { role, name, email, password, province, trade, deviceId } = req.body;
  const [pLat, pLng] = PROV[province] || [null, null];
  if (!['customer', 'tech'].includes(role)) throw fail(400, 'role ไม่ถูกต้อง');
  const hash = await bcrypt.hash(password, 10);
  try {
    const r = await q(
      `INSERT INTO users(role,name,email,password_hash,province,trade,device_id,last_lat,last_lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,role,name`,
      [role, name, email, hash, province, trade || null, deviceId || null, pLat, pLng]);
    await log('info', r.rows[0].id, 'signup', { role }, req.ip);
    res.json({ token: sign(r.rows[0]), user: r.rows[0] });
  } catch (e) { throw e.code === '23505' ? fail(409, 'อีเมลนี้ถูกใช้แล้ว') : e; }
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password, role } = req.body;
  const r = await q('SELECT * FROM users WHERE email=$1 AND role=$2', [email, role]);
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw fail(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  await log('info', u.id, 'login', {}, req.ip);
  res.json({ token: sign(u), user: { id: u.id, role: u.role, name: u.name } });
}));

// ---------- โปรไฟล์ ----------
app.put('/api/me', auth(), noContact('bio', 'name'), wrap(async (req, res) => {
  const { name, bio, phone, avatar_url, cover_url, queue_status, province, trade, dbd_number, dbd_doc_url, workplace } = req.body;
  await q(
    `UPDATE users SET name=COALESCE($2,name), bio=COALESCE($3,bio), phone=COALESCE($4,phone),
       avatar_url=COALESCE($5,avatar_url), cover_url=COALESCE($6,cover_url),
       queue_status=COALESCE($7,queue_status), province=COALESCE($8,province),
       dbd_number=COALESCE($9,dbd_number), dbd_doc_url=COALESCE($10,dbd_doc_url),
       trade=COALESCE($11,trade)
     WHERE id=$1`,
    [req.user.id, name, bio, phone, avatar_url, cover_url, queue_status, province, dbd_number, dbd_doc_url, trade]);
  if (Array.isArray(workplace)) {
    await q('DELETE FROM workplace_photos WHERE tech_id=$1', [req.user.id]);
    for (const url of workplace) await q('INSERT INTO workplace_photos(tech_id,url) VALUES ($1,$2)', [req.user.id, url]);
  }
  res.json({ ok: true });
}));

app.post('/api/upload', auth(), upload.single('file'), (req, res) =>
  res.json({ url: `/uploads/${req.file.filename}` }));

// ตำแหน่งปัจจุบันของอุปกรณ์ (ใช้ตรวจโกง + tracking)
app.post('/api/me/location', auth(), wrap(async (req, res) => {
  const { lat, lng, deviceId } = req.body;
  await q('UPDATE users SET last_lat=COALESCE($2,last_lat), last_lng=COALESCE($3,last_lng), device_id=COALESCE($4,device_id) WHERE id=$1',
    [req.user.id, lat ?? null, lng ?? null, deviceId ?? null]);
  res.json({ ok: true });
}));

// ข้อมูลสาธารณะ: ไม่มีชื่อ/รหัสผู้ใช้/พิกัดจริง (ศูนย์กลางจังหวัด + ค่าเลื่อนคงที่ต่อราย)
const jit = (id, salt) => { let h = 0; for (const ch of id + salt) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 1000) / 1000 - 0.5; };
app.get('/api/public/techs', wrap(async (_req, res) => {
  const rows = (await q("SELECT id,trade,province,queue_status,verified FROM users WHERE role='tech' ORDER BY created_at DESC LIMIT 300")).rows;
  const techs = rows.filter(u => PROV[u.province]).map(u => ({
    k: crypto.createHash('sha256').update(u.id).digest('hex').slice(0, 10), trade: u.trade || 'ช่าง', province: u.province,
    queue: u.queue_status || 'ว่าง', verified: u.verified,
    lat: +(PROV[u.province][0] + jit(u.id, 'a') * 0.5).toFixed(3), lng: +(PROV[u.province][1] + jit(u.id, 'b') * 0.5).toFixed(3) }));
  res.json({ techs, total: rows.length, available: rows.filter(u => (u.queue_status || 'ว่าง') === 'ว่าง').length });
}));

// ---------- แผนที่ช่าง (Home ลูกค้า) ----------
app.get('/api/techs', wrap(async (req, res) => {
  const { province, trade } = req.query;
  const r = await q(
    `SELECT u.id,u.name,u.trade,u.province,u.avatar_url,u.cover_url,u.queue_status,u.verified,
            u.last_lat AS lat,u.last_lng AS lng,
            COALESCE(AVG(rv.stars),0)::numeric(3,2) AS rating, COUNT(rv.id) AS reviews
       FROM users u LEFT JOIN reviews rv ON rv.tech_id=u.id
      WHERE u.role='tech' AND ($1::text IS NULL OR u.province=$1) AND ($2::text IS NULL OR u.trade=$2)
      GROUP BY u.id`, [province || null, trade || null]);
  res.json(r.rows);
}));

// ---------- โพสต์งาน ----------
app.post('/api/jobs', auth('customer'), noContact('title', 'detail'), wrap(async (req, res) => {
  const { title, trade, detail, province, budget, images = [] } = req.body;
  const [lat, lng] = PROV[province] || [req.body.lat ?? null, req.body.lng ?? null];
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const j = await c.query(
      `INSERT INTO jobs(customer_id,title,trade,detail,province,budget,lat,lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, title, trade, detail, province, budget, lat, lng]);
    for (const url of images) await c.query('INSERT INTO job_images(job_id,url) VALUES ($1,$2)', [j.rows[0].id, url]);
    await log('info', req.user.id, 'job.create', { job: j.rows[0].id }, req.ip, c);
    await c.query('COMMIT');
    res.json(j.rows[0]);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}));

// ลูกค้า: เฉพาะงานที่ยัง open (ยกเลิก/เสร็จ จะหายจากรายการอัตโนมัติ)
app.get('/api/my/jobs', auth('customer'), wrap(async (req, res) => {
  const r = await q(
    `SELECT j.*, COALESCE(json_agg(json_build_object('techId',b.tech_id,'fee',b.fee)) FILTER (WHERE b.id IS NOT NULL),'[]') AS bids
       FROM jobs j LEFT JOIN job_bids b ON b.job_id=j.id
      WHERE j.customer_id=$1 AND j.status='open' GROUP BY j.id ORDER BY j.created_at DESC`, [req.user.id]);
  res.json(r.rows);
}));

// ช่าง: ต้องมีเครดิต > 0 จึงจะเห็นงาน
app.get('/api/jobs/open', auth('tech'), wrap(async (req, res) => {
  const me = (await q('SELECT credit FROM users WHERE id=$1', [req.user.id])).rows[0];
  if (Number(me.credit) <= 0) throw fail(402, 'กรุณาเติมเครดิตก่อนดูงาน');
  const r = await q(
    `SELECT j.id,j.title,j.trade,j.detail,j.province,j.budget,j.fee_rate,
            (SELECT json_agg(url) FROM job_images WHERE job_id=j.id) AS images
       FROM jobs j WHERE j.status='open' ORDER BY j.created_at DESC`);
  res.json(r.rows);
}));

app.post('/api/jobs/:id/cancel', auth('customer'), wrap(async (req, res) => {
  const r = await q(`UPDATE jobs SET status='cancelled', closed_at=now()
                      WHERE id=$1 AND customer_id=$2 AND status='open' RETURNING id`, [req.params.id, req.user.id]);
  if (!r.rowCount) throw fail(404, 'ไม่พบงาน');
  await log('info', req.user.id, 'job.cancel', { job: req.params.id }, req.ip);
  res.json({ ok: true });
}));

app.post('/api/jobs/:id/complete', auth('customer'), wrap(async (req, res) => {
  const { techId, paid } = req.body;
  const r = await q(
    `UPDATE jobs SET status='done', hired_tech=$3, paid_amount=COALESCE($4,budget), closed_at=now()
      WHERE id=$1 AND customer_id=$2 AND status='open'
        AND EXISTS (SELECT 1 FROM job_bids WHERE job_id=$1 AND tech_id=$3) RETURNING id`,
    [req.params.id, req.user.id, techId, paid]);
  if (!r.rowCount) throw fail(400, 'ปิดงานไม่ได้ (ช่างต้องเคยรับงานนี้)');
  await log('info', req.user.id, 'job.complete', { job: req.params.id, techId }, req.ip);
  res.json({ ok: true });
}));

// ---------- ช่างกดรับงาน: หักเครดิตใน transaction เดียว ----------
app.post('/api/jobs/:id/accept', auth('tech'), wrap(async (req, res) => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const job = (await c.query(`SELECT j.*, u.device_id AS cust_device, u.phone AS cust_phone, u.name AS cust_name
                                  FROM jobs j JOIN users u ON u.id=j.customer_id
                                 WHERE j.id=$1 AND j.status='open' FOR UPDATE OF j`, [req.params.id])).rows[0];
    if (!job) throw fail(404, 'งานนี้ถูกปิดหรือไม่มีอยู่');
    const tech = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.user.id])).rows[0];

    // 1) กันใช้อุปกรณ์เดียวกับลูกค้า (ปั่นเครดิต)
    if (tech.device_id && tech.device_id === job.cust_device) {
      await log('block', tech.id, 'accept.same_device', { job: job.id }, req.ip, c);
      await c.query('COMMIT');
      throw fail(403, 'ตรวจพบอุปกรณ์เดียวกับเจ้าของงาน');
    }
    // 2) กันตำแหน่งผิดปกติ
    const maxKm = await setting('max_distance_km', c);
    if (tech.last_lat != null && job.lat != null) {
      const d = haversine(tech.last_lat, tech.last_lng, job.lat, job.lng);
      if (d > maxKm) {
        await log('block', tech.id, 'accept.too_far', { job: job.id, km: Math.round(d) }, req.ip, c);
        await c.query('COMMIT');
        throw fail(403, `ตำแหน่งห่างจากงาน ${Math.round(d)} กม. เกินที่กำหนด`);
      }
      if (d > maxKm * 0.6) await log('warn', tech.id, 'accept.far', { job: job.id, km: Math.round(d) }, req.ip, c);
    }
    // 3) คำนวณค่าธรรมเนียม: อัตราต่องาน (admin ปรับได้) > ค่า default
    const rate = job.fee_rate != null ? Number(job.fee_rate) : await setting('fee_rate_pct', c);
    const fee = Math.max(await setting('min_fee', c), Math.round(Number(job.budget) * rate / 100));
    if (Number(tech.credit) < fee) throw fail(402, 'เครดิตไม่พอ');

    await c.query('INSERT INTO job_bids(job_id,tech_id,fee) VALUES ($1,$2,$3)', [job.id, tech.id, fee]); // UNIQUE กันรับซ้ำ
    await c.query('UPDATE users SET credit = credit - $2 WHERE id=$1', [tech.id, fee]);
    await c.query(`INSERT INTO credit_ledger(user_id,type,amount,ref_id) VALUES ($1,'fee',$2,$3)`, [tech.id, -fee, job.id]);
    await log('info', tech.id, 'job.accept', { job: job.id, fee, rate }, req.ip, c);
    await c.query('COMMIT');
    // เปิดเผยข้อมูลติดต่อลูกค้า + QR payload
    res.json({ fee, customer: { name: job.cust_name, phone: job.cust_phone }, qr: `HACHANG:JOB:${job.id}:${tech.id}` });
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}));

// ---------- เติมเครดิต + สลิป ----------
app.post('/api/credit/topup', auth('tech'), upload.single('slip'), wrap(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!(amount >= 100)) throw fail(400, 'ขั้นต่ำ 100 บาท');
  const r = await q('INSERT INTO payment_slips(tech_id,amount,slip_url) VALUES ($1,$2,$3) RETURNING id',
    [req.user.id, amount, req.file ? `/uploads/${req.file.filename}` : (req.body.slip || '')]);
  await log('info', req.user.id, 'topup.request', { slip: r.rows[0].id, amount }, req.ip);
  res.json({ id: r.rows[0].id, status: 'pending' });
}));

app.post('/api/admin/slips/:id/:decision', auth('admin'), wrap(async (req, res) => {
  const ok = req.params.decision === 'approve';
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const s = (await c.query(`UPDATE payment_slips SET status=$2, reviewed_by=$3, reviewed_at=now()
                               WHERE id=$1 AND status='pending' RETURNING *`,
      [req.params.id, ok ? 'approved' : 'rejected', req.user.id])).rows[0];
    if (!s) throw fail(404, 'ไม่พบสลิปที่รอตรวจ');
    if (ok) {
      await c.query('UPDATE users SET credit = credit + $2 WHERE id=$1', [s.tech_id, s.amount]);
      await c.query(`INSERT INTO credit_ledger(user_id,type,amount,ref_id) VALUES ($1,'topup',$2,$3)`, [s.tech_id, s.amount, s.id]);
    }
    await log('info', req.user.id, `slip.${req.params.decision}`, { slip: s.id, amount: s.amount }, req.ip, c);
    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}));

// ---------- Tracking ----------
app.post('/api/track', auth('tech'), wrap(async (req, res) => {
  const { jobId, lat, lng } = req.body;
  await q('INSERT INTO tracks(job_id,tech_id,lat,lng) VALUES ($1,$2,$3,$4)', [jobId, req.user.id, lat, lng]);
  await q('UPDATE users SET last_lat=$2,last_lng=$3 WHERE id=$1', [req.user.id, lat, lng]);
  res.json({ ok: true });
}));

app.get('/api/track/:jobId', auth('customer'), wrap(async (req, res) => {
  const j = (await q('SELECT lat,lng FROM jobs WHERE id=$1 AND customer_id=$2', [req.params.jobId, req.user.id])).rows[0];
  const t = (await q('SELECT lat,lng,created_at FROM tracks WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1', [req.params.jobId])).rows[0];
  if (!j || !t) throw fail(404, 'ยังไม่มีข้อมูลตำแหน่ง');
  const distKm = haversine(t.lat, t.lng, j.lat, j.lng);
  res.json({ position: t, distanceKm: distKm, etaMinutes: Math.ceil(distKm / 40 * 60) });  // สมมติ 40 กม./ชม.
}));

// ---------- รีวิว / รายงาน ----------
app.post('/api/reviews', auth('customer'), noContact('body'), wrap(async (req, res) => {
  const { jobId, stars, body, imageUrl } = req.body;
  const j = (await q(`SELECT hired_tech FROM jobs WHERE id=$1 AND customer_id=$2 AND status='done'`, [jobId, req.user.id])).rows[0];
  if (!j) throw fail(400, 'รีวิวได้หลังงานเสร็จเท่านั้น');
  await q('INSERT INTO reviews(job_id,tech_id,customer_id,stars,body,image_url) VALUES ($1,$2,$3,$4,$5,$6)',
    [jobId, j.hired_tech, req.user.id, stars, body, imageUrl]);
  await log('info', req.user.id, 'review.create', { jobId, stars }, req.ip);
  res.json({ ok: true });
}));

app.post('/api/reports', auth(), wrap(async (req, res) => {
  const { targetId, jobId, body } = req.body;
  const r = await q('INSERT INTO reports(from_user,target_user,job_id,body) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.user.id, targetId, jobId || null, body]);
  await log('warn', req.user.id, 'report.create', { report: r.rows[0].id, targetId }, req.ip);
  res.json({ ok: true });
}));

// ---------- Affiliate ----------
app.post('/api/affiliate/convert', auth('customer'), wrap(async (req, res) => {
  // เรียกจาก webhook เมื่อลูกค้าใหม่ที่เข้าผ่านลิงก์ตกลงจ้างงาน
  if (process.env.DEMO_MODE === '0') throw fail(403, 'ปิดการจำลองคอมมิชชัน');   // ของจริงต้องมาจาก webhook ที่ยืนยันการจ้างงาน
  const commission = await setting('affiliate_commission');
  await q(`INSERT INTO affiliate_events(customer_id,portfolio_id,kind,commission) VALUES ($1,$2,'hired',$3)`,
    [req.user.id, req.body.portfolioId, commission]);
  await q(`INSERT INTO credit_ledger(user_id,type,amount) VALUES ($1,'commission',$2)`, [req.user.id, commission]);
  res.json({ commission });
}));

// ---------- Admin: รายงานรายได้ / ต้นทุน / logger ----------
app.get('/api/admin/summary', auth('admin'), wrap(async (_req, res) => {
  const [daily, totals, logs] = await Promise.all([
    q('SELECT * FROM daily_revenue ORDER BY day DESC LIMIT 30'),
    q(`SELECT COALESCE(SUM(amount) FILTER (WHERE type='topup'),0) AS topups,
              COALESCE(SUM(-amount) FILTER (WHERE type='fee'),0) AS fees,
              COALESCE(SUM(amount) FILTER (WHERE type='commission'),0) AS commissions FROM credit_ledger`),
    q(`SELECT * FROM event_logs WHERE level IN ('warn','block') ORDER BY created_at DESC LIMIT 100`)
  ]);
  res.json({ daily: daily.rows, totals: totals.rows[0], alerts: logs.rows });
}));

app.put('/api/admin/jobs/:id/fee-rate', auth('admin'), wrap(async (req, res) => {
  await q('UPDATE jobs SET fee_rate=$2 WHERE id=$1', [req.params.id, req.body.rate]);   // null = ใช้ default
  await log('info', req.user.id, 'job.fee_rate', { job: req.params.id, rate: req.body.rate }, req.ip);
  res.json({ ok: true });
}));

app.put('/api/admin/settings', auth('admin'), wrap(async (req, res) => {
  for (const [k, v] of Object.entries(req.body))
    await q('UPDATE settings SET value=$2 WHERE key=$1', [k, v]);
  res.json({ ok: true });
}));

// ---------- AI Support chat ----------
app.post('/api/support', auth(), wrap(async (req, res) => {
  // ต่อ Claude API ฝั่งเซิร์ฟเวอร์ (ไม่เปิด API key ที่ฝั่ง client)
  // const reply = await anthropic.messages.create({ model: process.env.CLAUDE_MODEL, system: SUPPORT_PROMPT, messages: [...] })
  await log('support', req.user.id, 'support.message', { text: req.body.text }, req.ip);
  res.json({ reply: 'ขอบคุณที่ติดต่อ ทีมงานได้รับเรื่องแล้ว' });
}));


// ---------- ผลงาน / โปรโมชัน ----------
app.post('/api/portfolio', auth('tech'), noContact('title'), wrap(async (req, res) => {
  const { title, media } = req.body;
  await q('INSERT INTO portfolio(tech_id,title,media_url,media_kind) VALUES ($1,$2,$3,$4)',
    [req.user.id, title, media?.src || null, media?.kind || 'image']);
  res.json({ ok: true });
}));
app.post('/api/promos', auth('tech'), noContact('title'), wrap(async (req, res) => {
  const { title, media } = req.body;
  await q('INSERT INTO promotions(tech_id,title,media_url,media_kind) VALUES ($1,$2,$3,$4)',
    [req.user.id, title, media?.src || null, media?.kind || 'image']);
  res.json({ ok: true });
}));

// ---------- admin เพิ่มเติม ----------
app.put('/api/admin/users/:id/verify', auth('admin'), wrap(async (req, res) => {
  await q(`UPDATE users SET verified=$2 WHERE id=$1 AND role='tech'`, [req.params.id, !!req.body.verified]);
  await log('info', req.user.id, 'tech.verify', { tech: req.params.id, verified: !!req.body.verified }, req.ip);
  res.json({ ok: true });
}));
app.post('/api/admin/reports/:id/close', auth('admin'), wrap(async (req, res) => {
  await q(`UPDATE reports SET status='closed' WHERE id=$1`, [req.params.id]);
  await log('info', req.user.id, 'report.close', { report: req.params.id }, req.ip);
  res.json({ ok: true });
}));

// หน้าเว็บส่งเหตุการณ์ที่ถูกบล็อกฝั่ง client (เช่น พยายามลงเบอร์โทร) เข้า Data logger
app.post('/api/log', auth(), wrap(async (req, res) => {
  await log('warn', req.user.id, 'client.blocked', { msg: String(req.body.msg || '').slice(0, 200) }, req.ip);
  res.json({ ok: true });
}));

// ---------- สถานะรวมสำหรับหน้าเว็บ (กรองตามสิทธิ์ของผู้ใช้) ----------
app.get('/api/state', auth(), wrap(async (req, res) => {
  const me = req.user, isAdmin = me.role === 'admin';
  const [users, photos, jobsR, imgs, bidsR, ledger, slips, reviews, reports, portfolio, promos, setR, logs] = await Promise.all([
    q('SELECT * FROM users'),
    q('SELECT tech_id,url FROM workplace_photos'),
    q('SELECT * FROM jobs ORDER BY created_at DESC'),
    q('SELECT job_id,url FROM job_images'),
    q('SELECT * FROM job_bids'),
    isAdmin ? q('SELECT * FROM credit_ledger ORDER BY created_at DESC LIMIT 500')
            : q('SELECT * FROM credit_ledger WHERE user_id=$1 ORDER BY created_at DESC', [me.id]),
    isAdmin ? q('SELECT * FROM payment_slips ORDER BY created_at DESC')
            : q('SELECT * FROM payment_slips WHERE tech_id=$1 ORDER BY created_at DESC', [me.id]),
    q('SELECT * FROM reviews ORDER BY created_at DESC'),
    isAdmin ? q('SELECT * FROM reports ORDER BY created_at DESC')
            : q('SELECT * FROM reports WHERE from_user=$1 ORDER BY created_at DESC', [me.id]),
    q('SELECT * FROM portfolio ORDER BY created_at DESC'),
    q('SELECT * FROM promotions WHERE active ORDER BY created_at DESC'),
    q('SELECT key,value FROM settings'),
    isAdmin ? q('SELECT l.*, u.name AS actor_name FROM event_logs l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.created_at DESC LIMIT 300')
            : Promise.resolve({ rows: [] })
  ]);

  const meRow = users.rows.find(u => u.id === me.id);
  const myCredit = Number(meRow?.credit || 0);
  const group = (rows, key) => rows.reduce((m, r) => ((m[r[key]] ||= []).push(r), m), {});
  const bidsBy = group(bidsR.rows, 'job_id'), imgsBy = group(imgs.rows, 'job_id'), photosBy = group(photos.rows, 'tech_id');

  // ช่างเห็นงานเปิดได้ก็ต่อเมื่อมีเครดิต > 0 (หรือเป็นงานที่ตนรับ/ถูกจ้างไปแล้ว)
  const visibleJobs = jobsR.rows.filter(j => isAdmin
    || (me.role === 'customer' ? j.customer_id === me.id
        : (bidsBy[j.id] || []).some(b => b.tech_id === me.id) || j.hired_tech === me.id || (j.status === 'open' && myCredit > 0)));

  const jobs = visibleJobs.map(j => {
    const all = bidsBy[j.id] || [];
    const bids = (isAdmin || j.customer_id === me.id ? all : all.filter(b => b.tech_id === me.id))
      .map(b => ({ techId: b.tech_id, fee: Number(b.fee), at: b.created_at }));
    return { id: j.id, custId: j.customer_id, title: j.title, trade: j.trade, detail: j.detail, province: j.province,
      budget: Number(j.budget), images: (imgsBy[j.id] || []).map(i => i.url), status: j.status, bids,
      rate: j.fee_rate != null ? Number(j.fee_rate) : undefined, hiredTech: j.hired_tech || undefined,
      paid: j.paid_amount != null ? Number(j.paid_amount) : undefined, at: j.created_at };
  });

  // เบอร์ลูกค้าเปิดเผยให้ช่างที่กดรับงานนั้นแล้วเท่านั้น
  const phoneVisible = u => u.id === me.id || isAdmin ||
    (me.role === 'tech' && u.role === 'customer' &&
      jobs.some(j => j.custId === u.id && j.bids.some(b => b.techId === me.id)));
  const media = (src, kind) => src ? { src, kind: kind || 'image' } : null;

  const mapUsers = users.rows.map(u => {
    const self = u.id === me.id || isAdmin;
    return { id: u.id, role: u.role, name: u.name, province: u.province, trade: u.trade,
      avatar: u.avatar_url || '', cover: u.cover_url || '', bio: u.bio || '',
      queue: u.queue_status, verified: u.verified,
      dbd: { no: u.dbd_number || '', img: u.dbd_doc_url || '' },
      lat: u.last_lat ?? PROV[u.province]?.[0] ?? null, lng: u.last_lng ?? PROV[u.province]?.[1] ?? null,
      workplace: (photosBy[u.id] || []).map(p => ({ src: p.url, kind: 'image' })),
      phone: phoneVisible(u) ? (u.phone || '') : '',
      deviceId: self ? u.device_id : undefined, credit: self ? Number(u.credit) : 0 };
  });

  const S = Object.fromEntries(setR.rows.map(r => [r.key, Number(r.value)]));
  res.json({
    me: me.id, users: mapUsers, jobs,
    ledger: ledger.rows.map(l => ({ id: l.id, userId: l.user_id, type: l.type, amount: Number(l.amount), at: l.created_at, ref: l.ref_id || '' })),
    slips: slips.rows.map(z => ({ id: z.id, techId: z.tech_id, amount: Number(z.amount), img: z.slip_url, status: z.status, at: z.created_at })),
    logs: logs.rows.map(l => ({ id: String(l.id), at: l.created_at, level: l.level, actor: l.actor_name || 'ระบบ',
      msg: l.action + (l.detail && Object.keys(l.detail).length ? ' ' + JSON.stringify(l.detail) : '') })),
    reviews: reviews.rows.map(r => ({ id: r.id, jobId: r.job_id, techId: r.tech_id, custId: r.customer_id, stars: r.stars, text: r.body || '', img: r.image_url || '', at: r.created_at })),
    reports: reports.rows.map(r => ({ id: r.id, from: r.from_user, targetId: r.target_user, jobId: r.job_id, text: r.body, status: r.status, at: r.created_at })),
    portfolio: portfolio.rows.map(p => ({ id: p.id, techId: p.tech_id, title: p.title, media: media(p.media_url, p.media_kind), at: p.created_at })),
    promos: promos.rows.map(p => ({ id: p.id, techId: p.tech_id, title: p.title, media: media(p.media_url, p.media_kind), at: p.created_at })),
    settings: { rate: S.fee_rate_pct, minFee: S.min_fee, costRate: S.cost_rate_pct, maxKm: S.max_distance_km, affCommission: S.affiliate_commission }
  });
}));

app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
app.listen(process.env.PORT || 3000, () => console.log('หาช่าง API ready'));
