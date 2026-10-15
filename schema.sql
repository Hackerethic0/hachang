-- หาช่าง - หางานช่าง : PostgreSQL schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role   AS ENUM ('customer','tech','admin');
CREATE TYPE job_status  AS ENUM ('open','done','cancelled');
CREATE TYPE slip_status AS ENUM ('pending','approved','rejected');
CREATE TYPE ledger_type AS ENUM ('topup','fee','commission','refund');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role          user_role NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone         TEXT,                      -- private: เปิดเผยหลังช่างกดรับงานเท่านั้น
  province      TEXT,
  avatar_url    TEXT,
  cover_url     TEXT,                      -- รูปหน้าปก (ช่าง)
  bio           TEXT,
  trade         TEXT,                      -- ประเภทช่าง
  queue_status  TEXT DEFAULT 'ว่าง',       -- ว่าง / คิวสั้น / คิวเต็ม / หยุดพัก
  credit        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  dbd_number    TEXT,
  dbd_doc_url   TEXT,
  verified      BOOLEAN NOT NULL DEFAULT FALSE,   -- admin ตรวจ DBD แล้ว
  device_id     TEXT,                      -- ใช้ตรวจโกงเครดิต
  last_lat      DOUBLE PRECISION,
  last_lng      DOUBLE PRECISION,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workplace_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_id UUID REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL
);

CREATE TABLE jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  trade       TEXT NOT NULL,
  detail      TEXT NOT NULL,
  province    TEXT NOT NULL,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  budget      NUMERIC(12,2) NOT NULL CHECK (budget > 0),
  fee_rate    NUMERIC(5,2),               -- NULL = ใช้ค่า default จาก settings; admin ปรับรายงานได้
  status      job_status NOT NULL DEFAULT 'open',
  hired_tech  UUID REFERENCES users(id),
  paid_amount NUMERIC(12,2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ
);
CREATE INDEX jobs_open_idx ON jobs(status, province);

CREATE TABLE job_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  url TEXT NOT NULL
);

-- ช่างกดรับงาน (bid) + เครดิตที่ถูกหัก
CREATE TABLE job_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id  UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tech_id UUID NOT NULL REFERENCES users(id),
  fee     NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, tech_id)
);

-- สมุดบัญชีเครดิต (append-only) ใช้ทำรายงานรายได้/ต้นทุน
CREATE TABLE credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type ledger_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL,          -- + เข้า, - ออก
  ref_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_user_idx ON credit_ledger(user_id, created_at DESC);

-- หลักฐานการโอน (สลิป)
CREATE TABLE payment_slips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(12,2) NOT NULL,
  slip_url TEXT NOT NULL,
  status slip_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

-- Data logger: ทุกเหตุการณ์สำคัญ
CREATE TABLE event_logs (
  id BIGSERIAL PRIMARY KEY,
  level TEXT NOT NULL,                    -- info | warn | block | support
  actor_id UUID,
  action TEXT NOT NULL,
  detail JSONB,
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tracking ตำแหน่งช่าง
CREATE TABLE tracks (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  tech_id UUID REFERENCES users(id),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tracks_job_idx ON tracks(job_id, created_at DESC);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID UNIQUE REFERENCES jobs(id),
  tech_id UUID NOT NULL REFERENCES users(id),
  customer_id UUID NOT NULL REFERENCES users(id),
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  body TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user UUID NOT NULL REFERENCES users(id),
  target_user UUID NOT NULL REFERENCES users(id),
  job_id UUID REFERENCES jobs(id),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ผลงานช่าง + Affiliate
CREATE TABLE portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  media_url TEXT,
  media_kind TEXT DEFAULT 'image',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE affiliate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),   -- เจ้าของลิงก์แชร์
  portfolio_id UUID NOT NULL REFERENCES portfolio(id),
  kind TEXT NOT NULL,                                -- click | lead | hired
  commission NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  media_url TEXT,
  media_kind TEXT DEFAULT 'image',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL
);
INSERT INTO settings(key,value) VALUES
 ('fee_rate_pct',10), ('min_fee',20), ('cost_rate_pct',8),
 ('max_distance_km',300), ('affiliate_commission',50);

-- รายงานรายได้สุทธิ (หลังหักต้นทุน) แบบรายวัน -> ใช้ทำกราฟ
CREATE VIEW daily_revenue AS
SELECT date_trunc('day', created_at) AS day,
       SUM(-amount) FILTER (WHERE type='fee') AS fee_revenue,
       SUM(-amount) FILTER (WHERE type='fee') *
         (SELECT value FROM settings WHERE key='cost_rate_pct')/100 AS cost,
       SUM(-amount) FILTER (WHERE type='fee') *
         (1 - (SELECT value FROM settings WHERE key='cost_rate_pct')/100) AS net
FROM credit_ledger GROUP BY 1 ORDER BY 1;

-- แชทติดต่อ/ร้องเรียน (ผู้ใช้ <-> AI <-> ทีมงาน)  ยังไม่ได้พอร์ตไปที่ server.js (Express)
CREATE TABLE support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_user UUID NOT NULL REFERENCES users(id),
  sender TEXT NOT NULL CHECK (sender IN ('user','ai','admin')),
  admin_id UUID REFERENCES users(id),
  body TEXT NOT NULL,
  read_user BOOLEAN NOT NULL DEFAULT FALSE,
  read_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_thread_idx ON support_messages(thread_user, created_at);
