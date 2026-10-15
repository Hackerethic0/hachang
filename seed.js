// สร้างข้อมูลตัวอย่าง: node seed.js  (รันหลัง npm run db:init)
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { PROV } = require('./public/vendor/provinces.js');

(async () => {
  const hash = await bcrypt.hash('1234', 10), adminHash = await bcrypt.hash('admin', 10);
  const U = [
    ['customer','สมชาย ใจดี','customer@demo.th',hash,'กรุงเทพฯ',null,0,'ว่าง','081-234-5678','dev-c1',13.75,100.5,false],
    ['tech','ช่างต้น แอร์เย็น','tech@demo.th',hash,'กรุงเทพฯ','ช่างแอร์',300,'ว่าง','089-111-2222','dev-t1',13.77,100.53,true],
    ['tech','อู่ช่างเอก ยานยนต์','tech2@demo.th',hash,'เชียงใหม่','ซ่อมรถยนต์',800,'คิวสั้น','082-333-4444','dev-t2',18.8,98.99,true],
    ['tech','ช่างนก ประปา','tech3@demo.th',hash,'ขอนแก่น','ช่างประปา',0,'ว่าง','086-555-6666','dev-t3',16.45,102.84,false],
    ['tech','ช่างหนึ่ง ไฟฟ้า','tech4@demo.th',hash,'ชลบุรี','ช่างไฟฟ้า',200,'คิวเต็ม','084-777-8888','dev-t4',13.37,100.99,false],
    ['admin','ผู้ดูแลระบบ','admin@demo.th',adminHash,'กรุงเทพฯ',null,0,'ว่าง',null,'dev-a1',null,null,false]
  ];
  const ids = {};
  for (const u of U) {
    const r = await pool.query(
      `INSERT INTO users(role,name,email,password_hash,province,trade,credit,queue_status,phone,device_id,last_lat,last_lng,verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`, u);
    ids[u[2]] = r.rows[0].id;
    if (u[6] > 0) await pool.query(`INSERT INTO credit_ledger(user_id,type,amount) VALUES ($1,'topup',$2)`, [r.rows[0].id, u[6]]);
  }
  const c = ids['customer@demo.th'];
  const J = [
    ['ล้างแอร์ 3 เครื่อง','ช่างแอร์','แอร์ผนัง 12000 BTU 3 เครื่อง ต้องการล้างและเช็กน้ำยา','กรุงเทพฯ',1500],
    ['ท่อน้ำใต้ซิงค์รั่ว','ช่างประปา','น้ำหยดตลอดเวลา ต้องเปลี่ยนข้อต่อ','ชลบุรี',2400],
    ['เช็กระยะและเปลี่ยนผ้าเบรก','ซ่อมรถยนต์','รถเก๋ง 80,000 กม. มีเสียงดังตอนเบรก','เชียงใหม่',3500]
  ];
  for (const j of J) {
    const [la, lo] = PROV[j[3]];
    await pool.query(`INSERT INTO jobs(customer_id,title,trade,detail,province,budget,lat,lng) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [c, j[0], j[1], j[2], j[3], j[4], la, lo]);
  }
  await pool.query(`INSERT INTO portfolio(tech_id,title) VALUES ($1,'ติดตั้งแอร์ Inverter คอนโด'),($2,'เปลี่ยนชุดคลัตช์ รถกระบะ')`,
    [ids['tech@demo.th'], ids['tech2@demo.th']]);
  await pool.query(`INSERT INTO promotions(tech_id,title) VALUES ($1,'ล้างแอร์ 2 เครื่อง ลด 15% สัปดาห์นี้')`, [ids['tech@demo.th']]);
  await pool.query(`INSERT INTO payment_slips(tech_id,amount,slip_url) VALUES ($1,300,'')`, [ids['tech3@demo.th']]);
  console.log('seed เสร็จแล้ว: customer@demo.th / tech@demo.th รหัส 1234, admin@demo.th รหัส admin');
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
