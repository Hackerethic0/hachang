'use strict';
// สร้างวิดีโอ 8 วินาที 4 คลิป (work-1..4.mp4) สำหรับพื้นหลังหน้าเข้าสู่ระบบ
//   ต้องมี: Node.js + sharp (npm i sharp) + ffmpeg
//   ใช้งาน:  node tools/make-videos.js            -> สร้างทั้ง 4 คลิปลง public/media/
//            node tools/make-videos.js still A 3  -> บันทึกภาพนิ่งฉาก A วินาทีที่ 3 (ไว้ตรวจดู)
const { spawn } = require('node:child_process');
const path = require('node:path');
let sharp;
try { sharp = require('sharp'); } catch { sharp = require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'sharp')); }

const TAU = Math.PI * 2, clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), ease = x => x * x * (3 - 2 * x), lerp = (a, b, k) => a + (b - a) * k;
const rnd = k => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const N = v => +(+v).toFixed(2);
const h2 = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const mix = (a, b, k) => { const A = h2(a), B = h2(b); return toHex(A.map((v, i) => v + (B[i] - v) * k)); };
const shade = (c, amt) => amt >= 0 ? mix(c, '#ffffff', amt / 100) : mix(c, '#000000', -amt / 100);

/* ---------------- คน: แขนสองท่อน เคลื่อนไหวด้วยมุม ---------------- */
// มุม 0 = ห้อยลง, ลบ = ยกไปข้างหน้า (หน้าไปทาง +x) ; tool วาดที่ข้อมือ โดยแกน +y คือทิศที่ปลายแขนชี้
function arm(sx, sy, a1, a2, col, skin, tool = '') {
  return `<g transform="translate(${sx} ${sy}) rotate(${N(a1)})"><rect x="-5.5" y="-5" width="11" height="40" rx="5.5" fill="${col}"/>
    <g transform="translate(0 33) rotate(${N(a2)})"><rect x="-4.8" y="-4" width="9.6" height="34" rx="4.8" fill="${shade(col, -6)}"/>
      <rect x="-5.2" y="24" width="10.4" height="6" rx="3" fill="${shade(col, -14)}"/><circle cx="0" cy="35" r="5.6" fill="${skin}"/>
      <g transform="translate(0 35)">${tool}</g></g></g>`;
}
const IDLE = { a1: 6, a2: -10, tool: '' };
function person(P) {
  const { x, y, s = 1, flip = false, skin = '#E0AB82', shirt = '#2D6CDF', pants = '#27364F', shoe = '#161A21', gear = 'hardhat', gearColor = '#FFC21A',
    front = IDLE, back = IDLE, glove = null, vest = '', apron = '', mask = false, goggles = false, lean = 0, bob = 0 } = P;
  const hand = glove || skin, sx = flip ? -1 : 1;
  let g = '';
  if (gear === 'hardhat') g = `<path d="M-16.5 -81 A16.5 16.5 0 0 1 16.5 -81 Z" fill="${gearColor}"/><rect x="-19.5" y="-83" width="39" height="6" rx="3" fill="${shade(gearColor, -14)}"/><rect x="-2.5" y="-98" width="5" height="16" rx="2" fill="${shade(gearColor, -10)}"/><rect x="8" y="-82" width="17" height="5" rx="2.5" fill="${shade(gearColor, -14)}"/>`;
  if (gear === 'cap') g = `<path d="M-15.5 -82 A15.5 14 0 0 1 15.5 -82 Z" fill="${gearColor}"/><path d="M8 -83 h17 q3 0 2.4 3.4 h-19.4z" fill="${shade(gearColor, -16)}"/>`;
  if (gear === 'hood') g = `<path d="M-17.5 -80 A17.5 18 0 0 1 17.5 -80 V-72 A17.5 17 0 0 1 -17.5 -72Z" fill="#F3F5F7"/><ellipse cx="6" cy="-79" rx="10.5" ry="11.5" fill="${skin}"/>`;
  const face = `<circle cx="8" cy="-82" r="1.9" fill="#20170F"/><path d="M12 -78 q2 1 0 3" stroke="${shade(skin, -22)}" stroke-width="1.6" fill="none"/>`;
  const gogs = goggles ? `<rect x="1" y="-88" width="19" height="10" rx="4.5" fill="#CFEBFF" fill-opacity=".8" stroke="#27303C" stroke-width="2.2"/><path d="M-15 -82 H1" stroke="#27303C" stroke-width="2.4"/>` : '';
  const msk = mask ? `<path d="M1 -79 h15 q4 0 4 4 v3 q0 7 -9 7 h-6z" fill="${mask === 'resp' ? '#7C8794' : '#EEF3F7'}"/>${mask === 'resp' ? '<circle cx="16" cy="-72" r="3.5" fill="#4C5560"/>' : ''}` : '';
  return `<g transform="translate(${N(x)} ${N(y + bob)}) scale(${sx * s} ${s}) rotate(${lean})">
    <ellipse cx="2" cy="68" rx="28" ry="5.5" fill="#000" opacity=".26"/>
    ${arm(-4, -54, back.a1, back.a2, shade(shirt, -22), hand, back.tool)}
    <rect x="-13" y="0" width="12.5" height="63" rx="6" fill="${shade(pants, -12)}"/><rect x="1.5" y="0" width="12.5" height="63" rx="6" fill="${pants}"/>
    <rect x="-17" y="59" width="20" height="9.5" rx="4.7" fill="${shoe}"/><rect x="-2" y="59" width="20" height="9.5" rx="4.7" fill="${shoe}"/>
    <path d="M-17 -54 q0 -8 9 -8 h16 q9 0 9 8 v50 q0 7 -7 7 h-20 q-7 0 -7 -7z" fill="${shirt}"/>${vest}${apron}
    <rect x="-5" y="-68" width="10" height="11" rx="3" fill="${shade(skin, -14)}"/><circle cx="0" cy="-80" r="15" fill="${skin}"/>${face}${gear === 'hood' ? g : ''}${msk}${gogs}${gear !== 'hood' ? g : ''}
    ${arm(4, -54, front.a1, front.a2, shirt, hand, front.tool)}</g>`;
}
// ตำแหน่งมือ (โลก) ของแขนหน้า และปลายเครื่องมือ
function fk(P, arm_, len = 0) {
  const sx = P.flip ? -1 : 1, s = P.s || 1, A = arm_.a1 * Math.PI / 180, B = (arm_.a1 + arm_.a2) * Math.PI / 180;
  const lx = 4 - 33 * Math.sin(A) - (35 + len) * Math.sin(B), ly = -54 + 33 * Math.cos(A) + (35 + len) * Math.cos(B);
  return { x: P.x + sx * s * lx, y: P.y + (P.bob || 0) + s * ly };
}
// คำนวณมุมให้แขนชี้ไปที่เป้าหมาย (โลก)
function aim(P, tx, ty, bend = 8) {
  const sx = P.flip ? -1 : 1, s = P.s || 1;
  const vx = (tx - P.x) / (sx * s) - 4, vy = (ty - (P.y + (P.bob || 0))) / s + 54;
  const th = Math.atan2(-vx, vy) * 180 / Math.PI;
  return { a1: th + bend, a2: -bend };
}
// IK สองท่อน: ให้ "ฝ่ามือ" ไปอยู่ที่ (tx,ty) (ถ้าไกลเกินเอื้อมจะเหยียดสุดแขน) k=+1 ศอกชี้ลง
function reach(P, tx, ty, k = 1) {
  const sx = P.flip ? -1 : 1, s = P.s || 1, L1 = 33, L2 = 35;
  const vx = (tx - P.x) / (sx * s) - 4, vy = (ty - (P.y + (P.bob || 0))) / s + 54;
  const d = Math.hypot(vx, vy) || 1, phi = Math.atan2(-vx, vy), dd = Math.min(d, (L1 + L2) * 0.995);
  const al = Math.acos(clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1)), be = Math.acos(clamp((L2 * L2 + dd * dd - L1 * L1) / (2 * L2 * dd), -1, 1));
  return { a1: (phi + k * al) * 180 / Math.PI, a2: -k * (al + be) * 180 / Math.PI };
}
// ชี้เครื่องมือไปที่เป้าหมาย: วางมือบนเส้นตรงไปเป้าหมาย เว้นระยะให้เครื่องมือ
function aimTool(P, tx, ty, toolLen, gap = 20, k = 1) {
  const sx = P.flip ? -1 : 1, s = P.s || 1, Sx = P.x + sx * s * 4, Sy = P.y + (P.bob || 0) - 54 * s;
  const d = Math.hypot(tx - Sx, ty - Sy) || 1, ux = (tx - Sx) / d, uy = (ty - Sy) / d;
  const hd = clamp(d - gap * s, 34 * s, 62 * s);   // มือเหยียดเกือบสุด ปลายเครื่องมือยื่นไปหาเป้าหมาย
  return reach(P, Sx + ux * hd, Sy + uy * hd, k);
}
const dot = (x, y, r, fill, op = 1) => `<circle cx="${N(x)}" cy="${N(y)}" r="${N(r)}" fill="${fill}" opacity="${N(op)}"/>`;
function spray(G, T, col, t, spread = 36, n = 46, speed = 2.9) {
  const dx = T.x - G.x, dy = T.y - G.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  let s = `<polygon points="${N(G.x)},${N(G.y)} ${N(T.x + nx * spread)},${N(T.y + ny * spread)} ${N(T.x - nx * spread)},${N(T.y - ny * spread)}" fill="${col}" opacity=".2"/>`;
  for (let k = 0; k < n; k++) {
    const u = (k * 0.6180339 + t * speed) % 1, sp = (rnd(k * 7.3) - .5) * 2;
    s += dot(G.x + ux * L * u + nx * sp * spread * u, G.y + uy * L * u + ny * sp * spread * u, 1.1 + rnd(k) * 2.3, col, .6 * (1 - .5 * u));
  }
  return s;
}

/* ---------------- ฉาก A: พ่นสี + เคาะปะผุรถยนต์ (800x470) ---------------- */
function sceneA(t) {
  const FLOOR = 376, pe = ease(clamp((t - 1.0) / 6.2)), q = Math.sin(TAU * 2 * t);
  const car = { x: 170, y: 352 };
  let g = `<defs>
    <linearGradient id="wA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D3DCE6"/><stop offset="1" stop-color="#8E9FB2"/></linearGradient>
    <linearGradient id="fA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6B7787"/><stop offset="1" stop-color="#3F4856"/></linearGradient>
    <linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A9CDEB"/><stop offset="1" stop-color="#41668B"/></linearGradient>
    <radialGradient id="lamp" cx="50%" cy="0%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <clipPath id="red"><rect x="${N(450 - 216 * pe - 4)}" y="-150" width="${N(216 * pe + 40)}" height="170"/></clipPath></defs>
    <rect x="-80" y="-80" width="960" height="${FLOOR + 80}" fill="url(#wA)"/><rect x="-80" y="${FLOOR - 24}" width="960" height="140" fill="url(#fA)"/>
    <rect x="-80" y="${FLOOR - 28}" width="960" height="6" fill="#58636F"/>
    <rect x="40" y="46" width="190" height="124" rx="6" fill="#DCE3EA" stroke="#A4B1C0" stroke-width="3"/>
    ${[0, 1, 2, 3, 4].map(i => `<rect x="${58 + i * 34}" y="${66 + (i % 2) * 14}" width="10" height="${50 - (i % 2) * 8}" rx="3" fill="#6B7787"/><circle cx="${63 + i * 34}" cy="${124 + (i % 2) * 6}" r="9" fill="none" stroke="#6B7787" stroke-width="4"/>`).join('')}
    <rect x="300" y="26" width="300" height="9" rx="4.5" fill="#fff"/><rect x="250" y="35" width="400" height="190" fill="url(#lamp)" opacity=".35"/>
    <rect x="640" y="60" width="110" height="170" rx="6" fill="#B7C2CF" stroke="#98A5B4" stroke-width="3"/>${[0, 1, 2, 3].map(i => `<rect x="650" y="${72 + i * 38}" width="90" height="26" rx="3" fill="#C8D2DD"/>`).join('')}
    <ellipse cx="${car.x + 230}" cy="${car.y + 14}" rx="270" ry="22" fill="#000" opacity=".28"/>`;
  // รถ
  const body = fill => `<path d="M0 -30 L0 -62 Q0 -80 20 -84 L110 -92 L150 -128 Q160 -138 176 -138 L300 -138 Q318 -138 330 -126 L372 -92 L430 -84 Q460 -80 460 -60 L460 -30 Z" fill="${fill}"/>`;
  g += `<g transform="translate(${car.x} ${car.y})">${body('#A9B2BD')}<g clip-path="url(#red)">${body('#D63A3A')}<path d="M224 -88 H440 V-84 H224z" fill="#fff" opacity=".25"/></g>
    <path d="M150 -92 L168 -123 L218 -123 L218 -92Z" fill="url(#gl)"/><path d="M228 -92 L228 -123 L296 -123 L336 -92Z" fill="url(#gl)"/>
    <path d="M224 -92 V-34" stroke="#00000040" stroke-width="2.5"/><rect x="236" y="-80" width="22" height="5" rx="2.5" fill="#00000050"/>
    <path d="M20 -84 L110 -92" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
    <rect x="-4" y="-66" width="10" height="14" rx="3" fill="#E24A4A"/><rect x="448" y="-70" width="14" height="14" rx="4" fill="#FFF3B0"/>
    ${[92, 368].map(cx => `<circle cx="${cx}" cy="-34" r="40" fill="#1D222A"/><circle cx="${cx}" cy="-34" r="34" fill="#12161C"/><circle cx="${cx}" cy="-34" r="21" fill="#C5CDD8"/><circle cx="${cx}" cy="-34" r="7" fill="#7D8896"/>${[0, 1, 2, 3, 4].map(i => `<path d="M${cx} -34 L${N(cx + 19 * Math.cos(i * TAU / 5))} ${N(-34 + 19 * Math.sin(i * TAU / 5))}" stroke="#8D98A6" stroke-width="3"/>`).join('')}`).join('')}
    </g>`;
  // รอยบุบ (หดลงเมื่อถูกเคาะ)
  const dk = 1 - ease(clamp(t / 5.4)), dentX = car.x + 190, dentY = car.y - 60;
  g += `<g opacity="${N(clamp(dk * 1.2))}"><ellipse cx="${dentX}" cy="${dentY}" rx="${N(30 * dk + .1)}" ry="${N(13 * dk + .1)}" fill="#6A737E" opacity=".55"/><ellipse cx="${dentX - 3}" cy="${dentY - 3}" rx="${N(22 * dk + .1)}" ry="${N(6 * dk + .1)}" fill="#fff" opacity=".35"/></g>`;
  // ช่างเคาะ
  const hy = FLOOR + 6, W1 = { x: 243, y: hy - 67 * 1.28, s: 1.28, shirt: '#E8EDF2', pants: '#3A4658', gear: 'cap', gearColor: '#2F6BFF', goggles: true, bob: 0.8 * Math.abs(q) };
  const hammer = `<rect x="-2.6" y="0" width="5.2" height="26" rx="2" fill="#B07A45"/><rect x="-12" y="23" width="24" height="10" rx="2.5" fill="#8C95A1"/><rect x="-12" y="23" width="6" height="10" rx="2" fill="#5C6570"/>`;
  W1.front = { a1: -60, a2: -30 + 26 * q, tool: hammer }; W1.back = { ...reach(W1, dentX - 6, dentY + 6), tool: `<rect x="-9" y="-3" width="18" height="12" rx="3" fill="#6C7683"/>` };
  g += person(W1);
  const hh = fk(W1, W1.front, 30), spk = clamp((q - .82) / .18);
  g += `<g opacity="${N(spk)}"><path d="M${N(hh.x)} ${N(hh.y - 12)} L${N(hh.x + 5)} ${N(hh.y - 3)} L${N(hh.x + 14)} ${N(hh.y)} L${N(hh.x + 5)} ${N(hh.y + 4)} L${N(hh.x)} ${N(hh.y + 13)} L${N(hh.x - 4)} ${N(hh.y + 4)} L${N(hh.x - 13)} ${N(hh.y)} L${N(hh.x - 4)} ${N(hh.y - 3)}Z" fill="#FFE27A"/></g>`;
  // ช่างพ่นสี (เดินตามแนวพ่น)
  const tx = car.x + (450 - 216 * pe) + 6, ty = car.y - 62;
  const W2 = { x: tx + 118, y: hy - 67 * 1.28, s: 1.28, flip: true, shirt: '#F3F5F7', pants: '#F3F5F7', shoe: '#2B3340', gear: 'hood', mask: 'resp', goggles: true, glove: '#4D5966', bob: 1.2 * Math.abs(Math.sin(TAU * 2 * t)) };
  const gun = `<rect x="-5" y="2" width="10" height="20" rx="3" fill="#2B2F36"/><rect x="-3" y="20" width="6" height="16" rx="2" fill="#9AA3AE"/><rect x="3" y="-14" width="15" height="15" rx="3" fill="#D63A3A"/><rect x="-1.5" y="34" width="3" height="6" fill="#C5CDD8"/>`;
  W2.front = { ...aimTool(W2, tx, ty, 40, 40), tool: gun }; W2.back = { a1: -22, a2: -48, tool: '' };
  const gt = fk(W2, W2.front, 40);
  g += spray(gt, { x: tx, y: ty }, '#D63A3A', t, 46, 70) + person(W2);
  g += `<g opacity=".8">${[0, 1, 2, 3, 4, 5].map(k => dot(tx + 20 + rnd(k) * 60 + Math.sin(t * 2 + k) * 6, ty - 20 - ((t * 25 + k * 30) % 90), 5 + rnd(k + 9) * 6, '#D63A3A', .08)).join('')}</g>`;
  return g;
}

/* ---------------- ฉาก B: ล้างแอร์ (520x800) ---------------- */
function sceneB(t) {
  const clean = ease(clamp((t - 0.6) / 6.6)), sweep = Math.sin(TAU * t / 4);
  let g = `<defs><linearGradient id="wB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F1ECE2"/><stop offset="1" stop-color="#D6CDBE"/></linearGradient>
    <linearGradient id="fB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C39467"/><stop offset="1" stop-color="#8E6542"/></linearGradient>
    <linearGradient id="acB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix('#D8CBA6', '#FFFFFF', clean)}"/><stop offset="1" stop-color="${mix('#BFAE86', '#E9EEF3', clean)}"/></linearGradient></defs>
    <rect x="-80" y="-80" width="680" height="800" fill="url(#wB)"/><rect x="-80" y="700" width="680" height="200" fill="url(#fB)"/><rect x="-80" y="688" width="680" height="14" fill="#E7E0D3"/>
    <polygon points="360,0 520,0 520,560 250,560" fill="#fff" opacity=".22"/>
    <rect x="440" y="300" width="70" height="90" rx="4" fill="#C9D9E6" stroke="#B3A68F" stroke-width="4"/><path d="M440 345 H510 M475 300 V390" stroke="#B3A68F" stroke-width="3"/>`;
  // แอร์
  g += `<rect x="50" y="64" width="420" height="132" rx="20" fill="#000" opacity=".12" transform="translate(0 8)"/><rect x="50" y="64" width="420" height="132" rx="20" fill="url(#acB)"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<rect x="${72 + i * 46}" y="78" width="30" height="6" rx="3" fill="#000" opacity="${N(.18 * (1 - clean * .7))}"/>`).join('')}
    ${[0, 1, 2, 3, 4].map(i => `<rect x="${70 + i * 78 + rnd(i) * 20}" y="${104 + rnd(i + 4) * 30}" width="${30 + rnd(i + 7) * 40}" height="10" rx="5" fill="#8D7B52" opacity="${N(.45 * (1 - clean))}"/>`).join('')}
    <rect x="68" y="166" width="384" height="20" rx="9" fill="#27303C"/><path d="M72 168 L448 168" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>
    ${dot(432, 110, 4.5, '#43D9AD', .6 + .4 * Math.sin(TAU * 2 * t))}`;
  if (clean > .92) { const sp = clamp((clean - .92) / .08) * (0.6 + .4 * Math.sin(TAU * 3 * t)); g += `<g opacity="${N(sp)}" transform="translate(420 92)"><path d="M0 -16 L4 -4 L16 0 L4 4 L0 16 L-4 4 L-16 0 L-4 -4Z" fill="#fff"/></g>`; }
  // ถุงรองน้ำ + สายระบาย + ถัง
  g += `<path d="M58 198 Q70 318 330 332 L400 332 Q460 310 462 198Z" fill="#7DB7E8" opacity=".42" stroke="#4E8FCC" stroke-width="3"/><rect x="384" y="326" width="14" height="326" rx="7" fill="#4E8FCC" opacity=".5"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map(k => { const u = (k / 8 + t * .5) % 1; return dot(391, 340 + u * 300, 3.2, '#7A6845', .85); }).join('')}
    ${[0, 1, 2, 3, 4, 5].map(k => { const u = (k / 6 + t * .9) % 1; return dot(120 + rnd(k) * 290, 200 + u * 120, 2.4, '#7A6845', .55 * (1 - clean * .6)); }).join('')}
    <path d="M338 650 L446 650 L434 740 L350 740Z" fill="#8795A6"/><rect x="342" y="${N(740 - 8 - clean * 36)}" width="96" height="${N(8 + clean * 36)}" fill="#8A7A55" opacity=".85"/><ellipse cx="392" cy="650" rx="54" ry="9" fill="#697687"/>
    <rect x="196" y="722" width="104" height="50" rx="9" fill="#2D3B52"/><rect x="208" y="710" width="80" height="14" rx="6" fill="#1E293B"/><circle cx="280" cy="747" r="6" fill="#43D9AD"/>`;
  // บันได
  const rail = (x1, x2, c) => `<path d="M${x1} 300 L${x2} 700" stroke="${c}" stroke-width="13" stroke-linecap="round"/>`;
  g += `<g opacity=".95">${rail(120, 20, '#E69A1E')}${rail(230, 332, '#E69A1E')}${[330, 390, 450, 510, 570, 630].map(y => { const k = (y - 300) / 400; return `<rect x="${N(120 - 100 * k - 4)}" y="${y - 5}" width="${N(110 + 200 * k + 8)}" height="10" rx="4" fill="#F4B63C"/>`; }).join('')}</g>`;
  // ช่าง
  const W = { x: 176, y: 450 - 67 * 1.55, s: 1.55, shirt: '#1F6FEB', pants: '#2B3445', gear: 'cap', gearColor: '#FFB400', mask: 'surg', glove: '#E9EEF3', bob: .8 * Math.abs(Math.sin(TAU * t / 2)) };
  const nozzle = `<rect x="-5" y="2" width="10" height="22" rx="3" fill="#2B2F36"/><rect x="-3" y="22" width="6" height="22" rx="2" fill="#E3B52B"/><rect x="-2" y="42" width="4" height="8" fill="#C5CDD8"/>`;
  const tx = 340 + 105 * sweep, ty = 178;
  W.front = { ...aimTool(W, tx, ty, 50, 14), tool: nozzle }; W.back = { a1: -24, a2: -34, tool: '' };
  const G = fk(W, W.front, 50);
  g += `<path d="M${N(G.x)} ${N(G.y)} C ${N(G.x - 60)} ${N(G.y + 160)}, 300 600, 250 716" stroke="#1F2630" stroke-width="7" fill="none" stroke-linecap="round" opacity=".9"/>`;
  g += person(W);
  // น้ำพุ่ง + ฟอง
  const dx = tx - G.x, dy = ty - G.y, L = Math.hypot(dx, dy) || 1;
  g += `<g>${[-8, 0, 8].map(o => `<path d="M${N(G.x)} ${N(G.y)} L${N(tx + o)} ${ty}" stroke="#DDF1FF" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 10" stroke-dashoffset="${N(-t * 220 + o)}" opacity=".85"/>`).join('')}
    ${[...Array(18).keys()].map(k => { const u = (k * .37 + t * 2.2) % 1, a = rnd(k) * TAU; return dot(tx + Math.cos(a) * 34 * u, ty + 6 + Math.sin(a) * 18 * u + u * 24, 2 + rnd(k + 3) * 3, '#fff', .8 * (1 - u)); }).join('')}
    ${[...Array(8).keys()].map(k => dot(tx - 40 + rnd(k) * 80, ty + 24 + ((t * 40 + k * 17) % 60), 5 + rnd(k + 5) * 5, '#fff', .35 * (1 - clean * .6))).join('')}</g>`;
  return g;
}

/* ---------------- ฉาก C: ช่างไฟ เดินสาย/ไวริ่ง (600x790) ---------------- */
function sceneC(t) {
  const p = ease(clamp((t - 0.8) / 5.6)), lampOn = ease(clamp((t - 6.4) / 0.7));
  const path = [[190, 430], [430, 430]], len = 240, tipX = 190 + len * p, tipY = 430;
  let g = `<defs><linearGradient id="wC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BDB5A8"/><stop offset="1" stop-color="#A39B8D"/></linearGradient>
    <linearGradient id="fC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8A857C"/><stop offset="1" stop-color="#5F5B54"/></linearGradient>
    <radialGradient id="lampC" cx="50%" cy="0%" r="95%"><stop offset="0" stop-color="#FFE9A8" stop-opacity=".9"/><stop offset="1" stop-color="#FFE9A8" stop-opacity="0"/></radialGradient></defs>
    <rect x="-80" y="-80" width="760" height="860" fill="url(#wC)"/>
    ${[...Array(18).keys()].map(r => `<path d="M-40 ${r * 46} H680" stroke="#8F887B" stroke-width="2" opacity=".6"/>${[...Array(8).keys()].map(c => `<path d="M${c * 92 + (r % 2) * 46 - 20} ${r * 46} v46" stroke="#8F887B" stroke-width="2" opacity=".6"/>`).join('')}`).join('')}
    <rect x="-80" y="-80" width="760" height="130" fill="#7D776C"/><rect x="-80" y="48" width="760" height="6" fill="#6A655C"/>
    <rect x="-80" y="702" width="760" height="140" fill="url(#fC)"/><rect x="-80" y="696" width="760" height="8" fill="#4D4A44"/>`;
  // ท่อร้อยสายไปที่โคมไฟเพดาน
  g += `<path d="M115 330 V96 H470 V58" stroke="#D9DEE4" stroke-width="10" fill="none" stroke-linejoin="round"/><path d="M115 330 V96 H470 V58" stroke="#fff" stroke-opacity=".5" stroke-width="2" fill="none" transform="translate(-2 -2)"/>
    ${[[115, 200], [260, 96], [400, 96], [470, 80]].map(([x, y]) => `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3" fill="#9AA3AD"/>`).join('')}`;
  // ตู้เบรกเกอร์
  g += `<rect x="30" y="330" width="170" height="200" rx="6" fill="#8C97A3" stroke="#6E7884" stroke-width="3"/><rect x="42" y="342" width="146" height="176" rx="4" fill="#2B323B"/>
    ${[0, 1].map(c => [0, 1, 2, 3, 4].map(r => `<rect x="${54 + c * 68}" y="${354 + r * 32}" width="58" height="24" rx="3" fill="#EDF1F5"/><rect x="${72 + c * 68}" y="${358 + r * 32}" width="12" height="16" rx="2" fill="#2B323B" opacity="${(r + c) % 2 ? .9 : .5}"/>${dot(104 + c * 68, 366 + r * 32, 3, (r * 3 + c + Math.floor(t * 2)) % 5 === 0 ? '#FF5C4D' : '#3DDC97', .95)}`).join('')).join('')}
    <path d="M30 330 L6 346 V516 L30 530Z" fill="#7A8591"/>`;
  // เส้นสายไฟที่กำลังเดิน (ทีละเส้น: แดง/น้ำเงิน/เหลือง) + กิ๊บรัดสาย
  const cols = ['#E5483D', '#2F7BEA', '#F2C230'];
  g += cols.map((c, i) => `<path d="M190 ${424 + i * 6} H${N(190 + len * p)}" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`).join('');
  for (let k = 0; k < 5; k++) { const cx = 210 + k * 50; if (cx < tipX - 4) g += `<rect x="${cx - 4}" y="418" width="9" height="26" rx="3" fill="#E9EDF1" stroke="#9AA3AD" stroke-width="1.5"/>`; }
  // กล่องปลั๊ก
  g += `<rect x="404" y="404" width="62" height="72" rx="6" fill="#F3F5F7" stroke="#B6BEC7" stroke-width="3"/><rect x="418" y="418" width="34" height="18" rx="9" fill="#2B323B"/><rect x="418" y="444" width="34" height="18" rx="9" fill="#2B323B"/>`;
  const spk = clamp(1 - Math.abs(t - 6.3) / .35); if (spk > 0) g += `<g opacity="${N(spk)}"><path d="M404 ${tipY} l-14 -14 l8 14 l-14 4 l16 4 l-6 14z" fill="#FFE27A"/></g>`;
  // โคมไฟ
  g += `<rect x="460" y="52" width="20" height="18" rx="4" fill="#59606A"/><path d="M458 70 Q470 112 482 70Z" fill="${mix('#A9B0B8', '#FFF4C2', lampOn)}"/><circle cx="470" cy="86" r="${N(7 + 3 * lampOn)}" fill="${mix('#D0D5DA', '#FFF6D0', lampOn)}"/>`;
  if (lampOn > 0) g += `<polygon points="458,86 482,86 640,704 300,704" fill="url(#lampC)" opacity="${N(.5 * lampOn)}"/><circle cx="470" cy="88" r="${N(60 * lampOn)}" fill="#FFE9A8" opacity="${N(.35 * lampOn)}"/>`;
  // ช่าง
  const W = { x: lerp(260, 340, p), y: 560 - 67 * 1.62, s: 1.62, shirt: '#33476B', pants: '#3A3F4A', gear: 'hardhat', gearColor: '#F5F6F2', glove: '#B07A45', goggles: true, bob: .7 * Math.abs(Math.sin(TAU * 3 * t)),
    vest: `<path d="M-15 -56 L-6 -56 L-4 -4 L-16 -4Z" fill="#FF7A1A"/><path d="M15 -56 L6 -56 L4 -4 L16 -4Z" fill="#FF7A1A"/><rect x="-16" y="-34" width="32" height="5" fill="#E3EAF0" opacity=".95"/><rect x="-16" y="-16" width="32" height="5" fill="#E3EAF0" opacity=".95"/>` };
  const strip = `<rect x="-5" y="-4" width="10" height="12" rx="3" fill="#E5483D"/><rect x="-1.5" y="6" width="3" height="8" fill="#B6BEC7"/>`;
  W.front = { ...reach(W, tipX, tipY), tool: strip }; W.back = { ...reach(W, tipX - 26, tipY + 6), tool: '' };
  g += person(W);
  // รอกสายไฟ + สายที่ดึงมา
  const wob = Math.sin(TAU * 4 * t) * 1.5;
  g += `<g transform="translate(80 650)"><circle r="42" fill="#C58A3E"/><circle r="30" fill="#E2B063"/><circle r="9" fill="#5D4A2B"/><g>${[0, 1, 2, 3, 4].map(i => `<path d="M0 0 L${N(30 * Math.cos(i * TAU / 5 + t * .3))} ${N(30 * Math.sin(i * TAU / 5 + t * .3))}" stroke="#5D4A2B" stroke-width="3"/>`).join('')}</g></g>
    <path d="M110 640 C 150 520, 190 470, 190 ${430 + wob}" stroke="#E5483D" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  return g;
}

/* ---------------- ฉาก D: ช่างไม้ซ่อมบ้าน (720x480) ---------------- */
function sceneD(t) {
  const studs = [90, 175, 260, 345, 430], tgtI = [1, 2, 3];
  const u = t / (8 / 3), k = Math.min(2, Math.floor(u)), fr = u - k, blend = k < 2 ? ease(clamp((fr - .8) / .2)) : 0;
  const tx = lerp(studs[tgtI[k]], studs[tgtI[Math.min(2, k + 1)]], blend) + 12, ty = 238;
  const q = Math.sin(TAU * 1.5 * t), saw = Math.sin(TAU * 3 * t), cut = clamp((t - 1) / 5.5);
  let g = `<defs><linearGradient id="skyD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ED2F2"/><stop offset="1" stop-color="#EAF7FF"/></linearGradient>
    <linearGradient id="woodD" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E2B374"/><stop offset="1" stop-color="#C99556"/></linearGradient>
    <linearGradient id="flD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C89B63"/><stop offset="1" stop-color="#8D6A41"/></linearGradient></defs>
    <rect x="-80" y="-80" width="880" height="560" fill="url(#skyD)"/>
    <ellipse cx="${N(130 + t * 6)}" cy="70" rx="70" ry="20" fill="#fff" opacity=".85"/><ellipse cx="${N(560 - t * 5)}" cy="120" rx="90" ry="22" fill="#fff" opacity=".8"/>
    <path d="M-80 340 Q60 270 200 330 T480 320 T800 300 V440 H-80Z" fill="#8CC17B"/><path d="M-80 380 Q120 330 300 372 T800 350 V440 H-80Z" fill="#6FA866"/>
    <polygon points="520,-40 800,-40 800,320 600,320" fill="#FFF3B5" opacity=".18"/>`;
  g += `<rect x="-80" y="408" width="880" height="100" fill="url(#flD)"/>${[0, 1, 2].map(i => `<path d="M-80 ${420 + i * 22} H800" stroke="#6E4F2E" stroke-width="2" opacity=".5"/>`).join('')}`;
  // โครงบ้าน
  g += `<rect x="56" y="64" width="420" height="22" rx="3" fill="url(#woodD)"/><rect x="56" y="388" width="420" height="22" rx="3" fill="url(#woodD)"/>
    ${studs.map(x => `<rect x="${x}" y="86" width="24" height="302" fill="url(#woodD)"/><path d="M${x + 7} 90 V384 M${x + 16} 100 V370" stroke="#B07E42" stroke-width="1.6" opacity=".6"/>`).join('')}
    <rect x="72" y="224" width="388" height="30" fill="#EDC58B"/><path d="M72 232 H460 M72 246 H460" stroke="#C99556" stroke-width="1.6" opacity=".6"/>`;
  // ตะปู (โผล่ตามลำดับ)
  studs.slice(1, 4).forEach((x, i) => { if (t > .9 + i * 2.67) g += dot(x + 12, 239, 3.6, '#2E3138'); });
  // ช่างตอกตะปู
  const FL = 432, W1 = { x: tx - 96, y: FL - 67 * 1.3, s: 1.3, shirt: '#E6762B', pants: '#394B66', gear: 'cap', gearColor: '#FFFFFF', goggles: true, glove: '#C99556',
    bob: .9 * Math.abs(q), apron: `<path d="M-17 -10 H17 V0 H-17Z" fill="#7B5230"/><rect x="-14" y="-6" width="9" height="14" rx="2" fill="#5E3F22"/><rect x="2" y="-6" width="11" height="12" rx="2" fill="#5E3F22"/>` };
  const hammer = `<rect x="-2.8" y="0" width="5.6" height="28" rx="2" fill="#B07A45"/><rect x="-13" y="25" width="26" height="11" rx="2.5" fill="#8C95A1"/>`;
  W1.front = { a1: -58, a2: -30 + 26 * q, tool: hammer }; W1.back = { ...reach(W1, tx - 6, ty + 4), tool: '' };
  g += person(W1);
  const hh = fk(W1, W1.front, 34), hit = clamp((q - .8) / .2);
  g += `<g opacity="${N(hit)}"><path d="M${N(hh.x)} ${N(hh.y - 11)} l4 8 l9 3 l-9 3 l-4 9 l-4 -9 l-9 -3 l9 -3z" fill="#FFE27A"/></g>`;
  // ม้าตัดไม้ + ไม้กระดาน + เลื่อย
  g += `<path d="M520 420 L548 336 H566 L574 420" stroke="#8D5B2E" stroke-width="12" fill="none" stroke-linejoin="round"/><path d="M640 420 L624 336 H606 L598 420" stroke="#8D5B2E" stroke-width="12" fill="none" stroke-linejoin="round"/>
    <rect x="492" y="318" width="76" height="18" fill="#EDC58B"/><rect x="574" y="318" width="120" height="18" fill="#EDC58B"/><rect x="568" y="${N(318 + (1 - cut) * 18)}" width="6" height="${N(18 * cut)}" fill="#3A2A18" opacity=".95"/>`;
  const sx0 = 571, W2 = { x: 650, y: FL - 67 * 1.2, s: 1.2, flip: true, shirt: '#3B8F6B', pants: '#3A4658', gear: 'hardhat', gearColor: '#FFC21A', glove: '#C99556', lean: 10, bob: .5 * Math.abs(saw) };
  const sawT = `<rect x="-3.5" y="0" width="7" height="14" rx="2.5" fill="#C0392B"/><path d="M-3 14 L3 14 L12 62 L-12 62Z" fill="#D5DBE2"/><path d="M-12 62 H12" stroke="#8C95A1" stroke-width="2" stroke-dasharray="3 2"/>`;
  W2.front = { ...aimTool(W2, sx0 + 12 * saw, 318, 56, 4), tool: sawT }; W2.back = { ...reach(W2, sx0 + 36, 324), tool: '' };
  g += person(W2);
  g += `<g>${[...Array(28).keys()].map(kk => { const uu = (kk * .37 + t * 1.4) % 1; return dot(sx0 + (rnd(kk) - .5) * 26 * uu + 2, 336 + uu * 76, 1.5 + rnd(kk + 2) * 1.6, '#EBCB9A', .9 * (1 - uu) * clamp(cut * 6)); }).join('')}</g>`;
  g += `<g>${[...Array(10).keys()].map(kk => { const uu = (kk * .53 + t * 1.1) % 1; return dot(tx + 4 + (rnd(kk + 11) - .3) * 30 * uu, 250 + uu * 60, 1.4, '#EBCB9A', .8 * (1 - uu) * hit); }).join('')}</g>`;
  return g;
}

/* ---------------- กล้อง/ฟิล์ม ---------------- */
function frameSVG(fn, t, W, H) {
  const zoom = 1.03 + 0.05 * (t / 8), pan = -8 + 16 * (t / 8), fade = clamp(Math.min(t / 0.4, (8 - t) / 0.4));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g transform="translate(${W / 2} ${H / 2}) scale(${N(zoom)}) translate(${N(-W / 2 + pan)} ${-H / 2})">${fn(t)}</g>
  <defs><radialGradient id="vig" cx="50%" cy="48%" r="78%"><stop offset="52%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".5"/></radialGradient>
  <linearGradient id="warm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC27A" stop-opacity=".10"/><stop offset="1" stop-color="#4C7BFF" stop-opacity=".07"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#warm)"/><rect width="${W}" height="${H}" fill="url(#vig)"/>
  <rect width="${W}" height="${H}" fill="#050B16" opacity="${N(1 - fade)}"/></svg>`;
}
const SCENES = { A: [sceneA, 800, 470, 'work-1'], B: [sceneB, 520, 800, 'work-2'], C: [sceneC, 600, 790, 'work-3'], D: [sceneD, 720, 480, 'work-4'] };
const png = async (svg) => sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();

async function renderVideo(key, outDir) {
  const [fn, W, H, name] = SCENES[key], FPS = 24, SUB = 3, out = path.join(outDir, name + '.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-an',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'medium', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise(r => ff.on('close', r));
  for (let i = 0; i < FPS * 8; i++) {
    const acc = new Uint16Array(W * H * 4);
    for (let s = 0; s < SUB; s++) { const b = await png(frameSVG(fn, (i + (s / SUB) * 0.5) / FPS, W, H)); for (let j = 0; j < b.length; j++) acc[j] += b[j]; }
    const o = Buffer.alloc(W * H * 4); for (let j = 0; j < o.length; j++) o[j] = Math.round(acc[j] / SUB);
    if (!ff.stdin.write(o)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await done; console.log('สร้างแล้ว', out);
}

if (require.main === module) (async () => {
  const [a, b, c] = process.argv.slice(2);
  if (a === 'still') { const [fn, W, H] = SCENES[b]; const t = Number(c || 3); await sharp(Buffer.from(frameSVG(fn, t, W, H))).png().toFile(`/tmp/work/still-${b}-${t}.png`); console.log('ok'); return; }
  const outDir = path.join(__dirname, '..', 'public', 'media');
  const keys = a === 'only' ? [b, c].filter(Boolean) : Object.keys(SCENES);   // เช่น: node tools/make-videos.js only B C
  for (const k of keys) await renderVideo(k, outDir);
})();
