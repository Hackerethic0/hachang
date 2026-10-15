// ทดสอบ end-to-end: node test-lite.js  (เริ่มเซิร์ฟเวอร์ชั่วคราวบนฐานข้อมูลชั่วคราวให้เอง)
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const PORT = 3199, BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(os.tmpdir(), 'hachang-test-' + Date.now() + '.db');
let pass = 0, failN = 0;
const ok = (c, name, extra = '') => { c ? pass++ : failN++; console.log((c ? '  ✓ ' : '  ✗ ') + name + (c ? '' : '  ' + extra)); };
async function api(method, p, body, token) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: await r.json().catch(() => ({})) };
}
const login = async (email, password, role) => (await api('POST', '/api/auth/login', { email, password, role }, null)).j.token;

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'server-lite.js')], { env: { ...process.env, PORT, DB_FILE: DB, JWT_SECRET: 'test' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  try {
    const C = await login('customer@demo.th', '1234', 'customer'), T1 = await login('tech@demo.th', '1234', 'tech'),
          T3 = await login('tech3@demo.th', '1234', 'tech'), T4 = await login('tech4@demo.th', '1234', 'tech'), AD = await login('admin@demo.th', 'admin', 'admin');
    ok(C && T1 && T3 && T4 && AD, 'เข้าสู่ระบบทุกบทบาท');
    ok((await api('POST', '/api/auth/login', { email: 'tech@demo.th', password: 'x', role: 'tech' })).s === 401, 'รหัสผ่านผิดถูกปฏิเสธ');
    ok((await api('GET', '/api/state')).s === 401, 'ไม่มี token -> 401');
    ok((await api('PUT', '/api/admin/settings', { fee_rate_pct: 5 }, C)).s === 403, 'ลูกค้าเข้าหน้า admin ไม่ได้');

    console.log('\nสิทธิ์ข้อมูล / เครดิตเป็นเงื่อนไขเห็นงาน');
    const s1 = (await api('GET', '/api/state', null, T1)).j, s3 = (await api('GET', '/api/state', null, T3)).j;
    ok(s1.jobs.filter(j => j.status === 'open').length === 3, 'ช่างที่มีเครดิตเห็นงานเปิด 3 งาน');
    ok(s3.jobs.length === 0, 'ช่างเครดิต 0 มองไม่เห็นงาน');
    ok(s1.users.find(u => u.role === 'customer').phone === '', 'เบอร์ลูกค้าถูกซ่อนก่อนรับงาน');
    const jobs = Object.fromEntries(s1.jobs.map(j => [j.title, j]));
    const j1 = jobs['ล้างแอร์ 3 เครื่อง'], j2 = jobs['ท่อน้ำใต้ซิงค์รั่ว'], j3 = jobs['เช็กระยะและเปลี่ยนผ้าเบรก'];

    console.log('\nรับงาน + หักเครดิต');
    let r = await api('POST', `/api/jobs/${j1.id}/accept`, null, T1);
    ok(r.s === 200 && r.j.fee === 150, 'รับงาน 1,500 บาท หัก 10% = 150', JSON.stringify(r));
    ok(r.j.customer?.phone === '081-234-5678', 'เปิดเผยเบอร์ลูกค้าหลังรับงาน');
    ok((await api('POST', `/api/jobs/${j1.id}/accept`, null, T1)).s === 409, 'รับงานซ้ำไม่ได้');
    const s1b = (await api('GET', '/api/state', null, T1)).j;
    ok(s1b.users.find(u => u.email === undefined && u.id === s1b.me).credit === 150, 'เครดิตคงเหลือ 300-150 = 150');
    ok(s1b.users.find(u => u.role === 'customer').phone === '081-234-5678', 'state เปิดเบอร์ลูกค้าให้ช่างที่รับงาน');

    console.log('\nปรับอัตราหักเครดิตรายงาน (หลังบ้าน)');
    ok((await api('PUT', `/api/admin/jobs/${j2.id}/fee-rate`, { rate: 20 }, AD)).s === 200, 'แอดมินตั้งงานท่อน้ำเป็น 20%');
    r = await api('POST', `/api/jobs/${j2.id}/accept`, null, T4);
    ok(r.s === 402, 'ที่ 20% ต้องใช้ ฿480 > เครดิต 200 -> เครดิตไม่พอ', JSON.stringify(r));
    ok((await api('PUT', `/api/admin/jobs/${j2.id}/fee-rate`, { rate: 5 }, AD)).s === 200, 'แอดมินปรับเป็น 5%');
    r = await api('POST', `/api/jobs/${j2.id}/accept`, null, T4);
    ok(r.s === 200 && r.j.fee === 120, 'ที่ 5% หัก ฿120', JSON.stringify(r));
    ok((await api('PUT', `/api/admin/jobs/${j2.id}/fee-rate`, { rate: 500 }, AD)).s === 400, 'อัตรา 500% ถูกปฏิเสธ');
    ok((await api('PUT', '/api/admin/settings', { fee_rate_pct: 15, min_fee: 30, cost_rate_pct: 8, max_distance_km: 300, affiliate_commission: 50 }, AD)).s === 200, 'แอดมินเปลี่ยนอัตรามาตรฐานเป็น 15%');
    ok((await api('PUT', '/api/admin/settings', { fee_rate_pct: 500 }, AD)).s === 400, 'ค่ามาตรฐาน 500% ถูกปฏิเสธ');
    ok((await api('PUT', '/api/admin/jobs/' + j2.id + '/fee-rate', { rate: null }, AD)).s === 200, 'ล้างอัตรารายงาน -> ใช้ค่ามาตรฐาน');

    console.log('\nกันโกง');
    r = await api('POST', `/api/jobs/${j3.id}/accept`, null, T1);
    ok(r.s === 403 && /ห่างจากงาน/.test(r.j.error), 'ช่างกรุงเทพรับงานเชียงใหม่ (>300 กม.) ถูกบล็อก', JSON.stringify(r));
    await api('POST', '/api/me/location', { deviceId: 'dev-c1' }, T1);
    r = await api('POST', `/api/jobs/${j2.id}/accept`, null, T1);
    ok(r.s === 403 && /อุปกรณ์เดียวกับ/.test(r.j.error), 'อุปกรณ์เดียวกับลูกค้าถูกบล็อก', JSON.stringify(r));
    const logs = (await api('GET', '/api/state', null, AD)).j.logs;
    ok(logs.filter(l => l.level === 'block').length >= 2, 'บันทึก block ลง Data logger');

    console.log('\nกันช่องทางติดต่อ');
    ok((await api('POST', '/api/jobs', { title: 'ซ่อมแอร์ โทร 081-234-5678', trade: 'ช่างแอร์', detail: 'x', province: 'กรุงเทพฯ', budget: 1000 }, C)).s === 422, 'เบอร์โทรในหัวข้อถูกบล็อก');
    ok((await api('POST', '/api/jobs', { title: 'ซ่อมแอร์', trade: 'ช่างแอร์', detail: 'ทักไลน์ได้เลย', province: 'กรุงเทพฯ', budget: 1000 }, C)).s === 422, 'คำว่า "ไลน์" ในรายละเอียดถูกบล็อก');
    ok((await api('POST', '/api/jobs', { title: 'ซ่อมแอร์', trade: 'ช่างแอร์', detail: 'ล้างแอร์ 1 เครื่อง', province: 'กรุงเทพฯ', budget: 1000 }, C)).s === 200, 'โพสต์ปกติผ่าน');

    console.log('\nเติมเครดิต + สลิป');
    ok((await api('POST', '/api/credit/topup', { amount: 50, slip: 'x' }, T3)).s === 400, 'ต่ำกว่า 100 ถูกปฏิเสธ');
    ok((await api('POST', '/api/credit/topup', { amount: 500, slip: 'data:image/png;base64,AAAA' }, T3)).s === 200, 'ส่งสลิป 500');
    let adm = (await api('GET', '/api/state', null, AD)).j;
    for (const z of adm.slips.filter(z => z.status === 'pending')) await api('POST', `/api/admin/slips/${z.id}/approve`, null, AD);
    const s3b = (await api('GET', '/api/state', null, T3)).j;
    ok(s3b.users.find(u => u.id === s3b.me).credit === 800, 'อนุมัติแล้วเครดิต 300+500 = 800', JSON.stringify(s3b.users.find(u => u.id === s3b.me).credit));
    ok((await api('POST', `/api/admin/slips/${adm.slips[0].id}/approve`, null, AD)).s === 404, 'อนุมัติสลิปซ้ำไม่ได้ (กันเครดิตเบิ้ล)');

    console.log('\nปิดงาน + รีวิว + ยกเลิก');
    ok((await api('POST', `/api/jobs/${j1.id}/complete`, { techId: s1b.me }, C)).s === 200, 'ลูกค้าปิดงาน');
    ok((await api('POST', '/api/reviews', { jobId: j1.id, stars: 5, body: 'ดีมาก', imageUrl: '' }, C)).s === 200, 'รีวิว 5 ดาว');
    ok((await api('POST', '/api/reviews', { jobId: j1.id, stars: 1, body: 'x' }, C)).s === 409, 'รีวิวซ้ำไม่ได้');
    const cs = (await api('GET', '/api/state', null, C)).j;
    ok(cs.jobs.find(j => j.id === j1.id).status === 'done', 'งานเปลี่ยนเป็น done (ออกจากรายการเปิด)');
    ok((await api('POST', `/api/jobs/${j3.id}/cancel`, null, C)).s === 200, 'ยกเลิกโพสต์');
    ok(cs.ledger.every(l => l.userId === cs.me), 'ลูกค้าเห็นเฉพาะ ledger ของตัวเอง');

    console.log('\nแผนที่สาธารณะ real-time (ไม่ต้องล็อกอิน)');
    let pubR = await fetch(BASE + '/api/public/techs'); let pub = await pubR.json();
    ok(pubR.status === 200 && pub.total === 4 && pub.techs.length === 4, 'ดึงรายชื่อช่างสาธารณะได้ 4 ราย โดยไม่ต้องล็อกอิน');
    const raw = JSON.stringify(pub);
    ok(!/ช่างต้น|tech@demo|dev-t|089-111/.test(raw) && !('id' in pub.techs[0]) && !('name' in pub.techs[0]), 'ไม่เปิดเผยชื่อ/อีเมล/เบอร์/รหัสผู้ใช้');
    ok(pub.techs.every(t => Math.abs(t.lat - 13.75) < 20 && typeof t.k === 'string'), 'ส่งเฉพาะพิกัดระดับจังหวัดแบบเลื่อนค่า');
    const ac = new AbortController(); const sse = await fetch(BASE + '/api/public/stream', { signal: ac.signal });
    const rd = sse.body.getReader(); const dec = new TextDecoder(); let buf = '';
    const waitFor = async (needle, ms = 3000) => { const t0 = Date.now(); while (!buf.includes(needle) && Date.now() - t0 < ms) { const r = await Promise.race([rd.read(), new Promise(r => setTimeout(() => r(null), 300))]); if (r && r.value) buf += dec.decode(r.value); } return buf.includes(needle); };
    ok(await waitFor(': connected'), 'เปิดช่อง SSE ได้');
    await api('POST', '/api/auth/signup', { role: 'tech', name: 'ช่างใหม่ทดสอบ', email: 'new@t.th', password: '1234', province: 'ภูเก็ต', trade: 'ช่างแอร์', deviceId: 'dev-new' });
    ok(await waitFor('"type":"techs"'), 'ช่างสมัครใหม่ -> ส่งเหตุการณ์ real-time ทันที');
    pub = await (await fetch(BASE + '/api/public/techs')).json();
    ok(pub.total === 5 && pub.techs.some(t => t.province === 'ภูเก็ต'), 'หมุดช่างใหม่ที่ภูเก็ตปรากฏในข้อมูลสาธารณะ');
    buf = ''; const T1b = await login('tech@demo.th', '1234', 'tech');
    await api('PUT', '/api/me', { queue_status: 'คิวเต็ม' }, T1b);
    ok(await waitFor('"type":"techs"'), 'ช่างเปลี่ยนสถานะคิว -> ส่งเหตุการณ์ real-time');
    pub = await (await fetch(BASE + '/api/public/techs')).json();
    ok(pub.available === 2 && pub.techs.filter(t => t.queue === 'คิวเต็ม').length === 2, 'จำนวนช่างว่างอัปเดตตามสถานะ');
    ac.abort();
    const rg = await fetch(BASE + '/index.html', { headers: { Range: 'bytes=0-99' } });
    ok(rg.status === 206 && (await rg.arrayBuffer()).byteLength === 100, 'รองรับ HTTP Range (วิดีโอบน Safari/มือถือ)');
    for (const n of [1, 2, 3, 4]) { const mv = await fetch(BASE + `/media/work-${n}.mp4`); ok(mv.status === 200 && mv.headers.get('content-type') === 'video/mp4' && (await mv.arrayBuffer()).byteLength > 50000, `วิดีโอ work-${n}.mp4 พร้อมเล่น`); }
    const vr = await fetch(BASE + '/media/work-1.mp4', { headers: { Range: 'bytes=100-199' } }); ok(vr.status === 206 && vr.headers.get('content-range')?.startsWith('bytes 100-199/'), 'วิดีโอรองรับ Range (กรอ/วนบน Safari)');

    console.log('\nReal-time ทั้งระบบ (SSE พร้อมสิทธิ์)');
    ok((await fetch(BASE + '/api/stream')).status === 401, 'ไม่มี token เปิด stream ไม่ได้');
    const ac2 = new AbortController(); const st = await fetch(BASE + '/api/stream', { headers: { Authorization: 'Bearer ' + AD }, signal: ac2.signal });
    const rd2 = st.body.getReader(), dec2 = new TextDecoder(); let buf2 = '';
    const wait2 = async (needle, ms = 3000) => { const t0 = Date.now(); while (!buf2.includes(needle) && Date.now() - t0 < ms) { const r = await Promise.race([rd2.read(), new Promise(r => setTimeout(() => r(null), 300))]); if (r && r.value) buf2 += dec2.decode(r.value); } return buf2.includes(needle); };
    ok(await wait2('"type":"state"'), 'ต่อ stream สำเร็จ ได้สัญญาณเริ่มต้น');
    buf2 = ''; await api('POST', '/api/jobs', { title: 'ทดสอบ realtime', trade: 'ช่างแอร์', detail: 'ล้างแอร์', province: 'กรุงเทพฯ', budget: 800 }, C);
    ok(await wait2('"type":"state"'), 'ลูกค้าโพสต์งาน -> แอดมินได้สัญญาณทันที');

    console.log('\nแชทติดต่อ/ร้องเรียนผ่านหลังบ้าน');
    ok((await api('POST', '/api/support', { text: 'x' }, AD)).s === 403, 'แอดมินใช้แชทผู้ใช้ไม่ได้');
    ok((await api('POST', '/api/support', { text: '   ' }, C)).s === 400, 'ข้อความว่างถูกปฏิเสธ');
    ok((await api('POST', '/api/support', { text: 'เติมเครดิตไม่เข้า' }, C)).s === 200, 'ลูกค้าส่งข้อความ');
    let cs2 = (await api('GET', '/api/state', null, C)).j;
    ok(cs2.support.some(m => m.sender === 'user') && cs2.support.some(m => m.sender === 'ai' && /เครดิต/.test(m.text)), 'AI ตอบอัตโนมัติเมื่อยังไม่มีเจ้าหน้าที่');
    let ad2 = (await api('GET', '/api/state', null, AD)).j;
    const th = ad2.support.find(m => m.sender === 'user');
    ok(th && th.name && th.readAdmin === false, 'แอดมินเห็นข้อความใหม่ (ยังไม่อ่าน) พร้อมชื่อผู้ส่ง');
    ok((await api('POST', `/api/admin/support/${th.threadUser}/reply`, { text: 'ตรวจสลิปให้แล้วครับ' }, C)).s === 403, 'ผู้ใช้ทั่วไปตอบในนามแอดมินไม่ได้');
    ok((await api('POST', `/api/admin/support/${th.threadUser}/reply`, { text: 'ตรวจสลิปให้แล้วครับ' }, AD)).s === 200, 'แอดมินตอบกลับ');
    cs2 = (await api('GET', '/api/state', null, C)).j;
    const am = cs2.support.find(m => m.sender === 'admin');
    ok(am && am.readUser === false, 'ลูกค้าเห็นข้อความจากทีมงาน (ยังไม่อ่าน)');
    const before = cs2.support.length; await api('POST', '/api/support', { text: 'ขอบคุณครับ' }, C);
    cs2 = (await api('GET', '/api/state', null, C)).j;
    ok(cs2.support.length === before + 1, 'เจ้าหน้าที่ดูแลอยู่ AI ไม่แทรก');
    await api('POST', '/api/support/read', null, C); cs2 = (await api('GET', '/api/state', null, C)).j;
    ok(cs2.support.filter(m => m.sender === 'admin').every(m => m.readUser), 'ลูกค้าอ่านแล้ว');
    await api('POST', `/api/admin/support/${th.threadUser}/read`, null, AD); ad2 = (await api('GET', '/api/state', null, AD)).j;
    ok(ad2.support.filter(m => m.sender === 'user').every(m => m.readAdmin), 'แอดมินอ่านแล้ว');
    ok((await api('GET', '/api/state', null, T1)).j.support.length === 0, 'ผู้ใช้อื่นไม่เห็นบทสนทนาของลูกค้า');
    ac2.abort();

    console.log('\nแท็บผู้ใช้ / แชร์โลเคชัน / โทรหลังบ้าน');
    const uid = id => (async () => (await api('GET', '/api/state', null, id)).j.me)();
    const CID = await uid(C), T1ID = await uid(T1);
    const admS = (await api('GET', '/api/state', null, AD)).j;
    ok(admS.users.every(u => u.at) && admS.users.some(u => u.lastSeen), 'แอดมินเห็นวันที่สมัคร + ใช้งานล่าสุดของผู้ใช้ทุกคน');
    ok((await api('GET', '/api/state', null, C)).j.users.every(u => u.lastSeen === undefined), 'ผู้ใช้ทั่วไปไม่เห็นเวลาใช้งานล่าสุดของคนอื่น');
    ok((await api('POST', `/api/admin/support/${CID}/reply`, { location: { lat: 999, lng: 100 } }, AD)).s === 400, 'พิกัดผิดช่วงถูกปฏิเสธ');
    ok((await api('POST', `/api/admin/support/${CID}/reply`, { location: { lat: 13.7563, lng: 100.5018 }, label: 'สำนักงาน' }, AD)).s === 200, 'แอดมินแชร์โลเคชันถึงลูกค้า');
    const nBefore = (await api('GET', '/api/state', null, C)).j.support.length;
    ok((await api('POST', '/api/support', { location: { lat: 13.74, lng: 100.52 } }, C)).s === 200, 'ลูกค้าแชร์โลเคชันถึงหลังบ้าน');
    const cs3 = (await api('GET', '/api/state', null, C)).j.support, locs = cs3.filter(m => m.kind === 'location');
    ok(locs.length === 2 && locs.every(m => typeof m.lat === 'number'), 'ข้อความโลเคชันมีพิกัดครบทั้งสองฝั่ง');
    ok(cs3.length === nBefore + 1, 'แชร์โลเคชันแล้ว AI ไม่ตอบแทรก');

    const stream = async tok => { const ac = new AbortController(), r = await fetch(BASE + '/api/stream', { headers: { Authorization: 'Bearer ' + tok }, signal: ac.signal }), ev = [];
      (async () => { const rd = r.body.getReader(), d = new TextDecoder(); let b = ''; try { for (;;) { const { value, done } = await rd.read(); if (done) break; b += d.decode(value, { stream: true }); let i; while ((i = b.indexOf('\n\n')) >= 0) { const ch = b.slice(0, i); b = b.slice(i + 2); if (ch.startsWith('data: ')) try { ev.push(JSON.parse(ch.slice(6))); } catch {} } } } catch {} })();
      return { ac, ev }; };
    const waitEv = async (ev, f, ms = 2500) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = ev.find(f); if (m) return m; await new Promise(r => setTimeout(r, 30)); } return null; };
    ok((await api('POST', `/api/admin/call/${CID}`, null, C)).s === 403, 'ผู้ใช้โทรเข้าหลังบ้านไม่ได้ (โทรได้เฉพาะหลังบ้าน)');
    r = await api('POST', `/api/admin/call/${T1ID}`, null, AD);
    ok(r.s === 409 && /ไม่ได้เปิดแอป/.test(r.j.error), 'โทรหาผู้ใช้ที่ออฟไลน์ไม่ได้', JSON.stringify(r));
    const sc = await stream(C), sa = await stream(AD), st1 = await stream(T1);
    r = await api('POST', `/api/admin/call/${CID}`, null, AD); const callId = r.j.callId;
    ok(r.s === 200 && callId, 'หลังบ้านโทรหาลูกค้าที่ออนไลน์');
    ok(!!(await waitEv(sc.ev, e => e.type === 'call' && e.ev === 'incoming' && e.callId === callId)), 'ลูกค้าได้รับสัญญาณสายเรียกเข้า');
    r = await api('POST', `/api/admin/call/${T1ID}`, null, AD);
    ok(r.s === 409 && /สายหลังบ้านไม่ว่าง/.test(r.j.error), 'สายหลังบ้านมีสายเดียว: โทรซ้อนไม่ได้', JSON.stringify(r));
    ok((await api('GET', '/api/state', null, AD)).j.line?.callId === callId, 'หลังบ้านเห็นสถานะสายที่ใช้อยู่');
    ok((await api('POST', `/api/call/${callId}/accept`, null, T1)).s === 404, 'คนนอกสายรับสายแทนไม่ได้');
    ok((await api('POST', `/api/call/${callId}/accept`, null, C)).s === 200, 'ลูกค้ารับสาย');
    ok(!!(await waitEv(sa.ev, e => e.ev === 'accepted')), 'หลังบ้านได้รับสัญญาณว่ารับสายแล้ว');
    ok((await api('POST', `/api/call/${callId}/signal`, { kind: 'offer', data: { sdp: 'x' } }, AD)).s === 200 && !!(await waitEv(sc.ev, e => e.ev === 'signal' && e.kind === 'offer')), 'ส่งสัญญาณ WebRTC ถึงอีกฝั่ง');
    ok((await api('POST', `/api/call/${callId}/signal`, { kind: 'hack', data: 1 }, AD)).s === 400, 'สัญญาณชนิดแปลกถูกปฏิเสธ');
    ok((await api('POST', `/api/admin/support/${CID}/reply`, { text: 'ระหว่างโทรยังแชทได้' }, AD)).s === 200, 'ระหว่างโทรฟังก์ชันอื่น (แชท) ยังใช้ได้ปกติ');
    await api('POST', `/api/call/${callId}/end`, null, C);
    ok(!!(await waitEv(sa.ev, e => e.ev === 'ended' && e.callId === callId)) && (await api('GET', '/api/state', null, AD)).j.line === null, 'วางสายแล้วสายหลังบ้านว่างทันที');
    r = await api('POST', `/api/admin/call/${T1ID}`, null, AD);
    ok(r.s === 200, 'สายว่างแล้วโทรหาคนถัดไปได้'); await api('POST', `/api/call/${r.j.callId}/decline`, null, T1);
    ok(!!(await waitEv(sa.ev, e => e.ev === 'ended' && e.reason === 'declined')), 'ผู้ใช้ปฏิเสธสาย -> ปล่อยสายหลังบ้าน');
    ok((await api('GET', '/api/state', null, AD)).j.logs.some(l => /call\.end/.test(l.msg)), 'บันทึกการโทรลง Data logger');
    sc.ac.abort(); sa.ac.abort(); st1.ac.abort();

    console.log('\nจังหวัดครบ 77 / ซ่อมรถยนต์ / หมวดย่อย');
    const P = require('./public/vendor/provinces.js');
    ok(Object.keys(P.PROV).length === 77 && Object.values(P.PROV).every(([a, b]) => a > 5 && a < 21 && b > 97 && b < 106), 'มีจังหวัดครบ 77 แห่ง พิกัดอยู่ในประเทศไทย');
    r = await api('POST', '/api/jobs', { title: 'ซ่อมสีกันชนหน้า', trade: 'ซ่อมรถยนต์', sub: 'ซ่อมสีตัวถัง', detail: 'รอยถลอกกันชน', province: 'ตราด', budget: 2500 }, C);
    ok(r.s === 200, 'โพสต์งานในจังหวัดที่เพิ่มใหม่ (ตราด) พร้อมหมวดย่อยได้', JSON.stringify(r));
    const sj = (await api('GET', '/api/state', null, C)).j.jobs.find(j => j.id === r.j.id);
    ok(sj && sj.sub === 'ซ่อมสีตัวถัง' && sj.trade === 'ซ่อมรถยนต์', 'state มีหมวดย่อยของงาน');
    ok((await api('POST', '/api/jobs', { title: 'x', trade: 'ซ่อมรถยนต์', detail: 'x', province: 'ไม่มีจังหวัดนี้', budget: 100 }, C)).s === 400, 'จังหวัดที่ไม่มีจริงถูกปฏิเสธ');
    ok((await api('POST', '/api/jobs', { title: 'x', trade: 'ซ่อมรถยนต์', sub: 'โทร 0812345678', detail: 'x', province: 'ตราด', budget: 100 }, C)).s === 422, 'หมวดย่อยใส่เบอร์โทรไม่ได้');
    ok((await api('PUT', '/api/me', { subs: ['ซ่อมเครื่อง', 'ซ่อมเครื่อง', 'โทร 0812345678', ' ซ่อมรถน้ำท่วม '] }, T1)).s === 200, 'ช่างตั้งหมวดย่อยที่รับ');
    const mine = (await api('GET', '/api/state', null, T1)).j, me1 = mine.users.find(u => u.id === mine.me);
    ok(JSON.stringify(me1.subs) === JSON.stringify(['ซ่อมเครื่อง', 'ซ่อมรถน้ำท่วม']), 'หมวดย่อยถูกล้างค่าซ้ำ/ช่องทางติดต่อ', JSON.stringify(me1.subs));
    ok(mine.users.some(u => u.trade === 'ซ่อมรถยนต์') && !mine.users.some(u => u.trade === 'ช่างยนต์/อู่'), 'ประเภท "ช่างยนต์/อู่" ถูกเปลี่ยนเป็น "ซ่อมรถยนต์"');
    console.log('\nรีวิวได้เมื่อใช้บริการแล้วเท่านั้น');
    ok((await api('POST', '/api/reviews', { jobId: j2.id, stars: 5, body: 'x' }, C)).s === 400, 'งานที่ยังไม่ปิด รีวิวไม่ได้');

    console.log('\nสรุปรายได้ (admin)');
    adm = (await api('GET', '/api/state', null, AD)).j;
    const fees = -adm.ledger.filter(l => l.type === 'fee').reduce((a, b) => a + b.amount, 0);
    ok(fees === 270, 'ค่ารับงานรวม 150+120 = 270', String(fees));
    const sp = await fetch(BASE + '/'); ok(sp.status === 200 && (await sp.text()).includes('หาช่าง'), 'เสิร์ฟหน้าเว็บที่ /');
  } catch (e) { failN++; console.error(e); }
  srv.kill(); for (const f of [DB, DB + '-wal', DB + '-shm']) try { fs.unlinkSync(f); } catch {}
  console.log(`\nผ่าน ${pass} / ไม่ผ่าน ${failN}`); process.exit(failN ? 1 : 0);
})();
