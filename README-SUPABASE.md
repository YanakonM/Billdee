# ใช้ Billdee กับ Supabase (คลาวด์)

โหมดนี้เก็บข้อมูลทั้งหมดไว้บน [Supabase](https://supabase.com) (Postgres บนคลาวด์)
— ใช้ได้หลายเครื่องผ่านอินเทอร์เน็ต ต่างจาก PocketBase ที่เหมาะกับ LAN ในโรงงาน

> ⚠️ สถานะ: โค้ดฝั่งแอปพอร์ตมาจากโหมด PocketBase แบบโครงสร้างเดียวกัน
> แต่ยังไม่ได้ทดสอบกับโปรเจกต์ Supabase จริง — หลังตั้งค่าเสร็จ ให้กด
> "ทดสอบการเชื่อมต่อ" และลองเพิ่มลูกค้า/สินค้า 1 รายการก่อนใช้งานจริง

## ขั้นตอนติดตั้ง

### 1. สร้างโปรเจกต์ Supabase
1. สมัคร/ล็อกอินที่ supabase.com → **New project** (แผน Free ก็พอ)
2. จด **Project URL** (`https://xxxx.supabase.co`) และ **anon public key**
   จากเมนู Project Settings → API

### 2. สร้างตาราง — รัน SQL นี้ใน SQL Editor

```sql
-- Billdee schema: ทุกตารางเก็บ object เต็มในคอลัมน์ data (jsonb)
-- + คอลัมน์ index บางตัวสำหรับค้นหา

create table if not exists "customers" (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  name text, code text,
  created timestamptz not null default now()
);
create table if not exists "products" (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  barcode text, code text,
  created timestamptz not null default now()
);
create table if not exists "invoices" (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  created timestamptz not null default now()
);
create table if not exists "quotations" (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  created timestamptz not null default now()
);
create table if not exists "creditNotes" (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  created timestamptz not null default now()
);
create table if not exists "stockLogs" (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  created timestamptz not null default now()
);
create table if not exists "settings" (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  key text unique,
  created timestamptz not null default now()
);

create index if not exists idx_customers_name on "customers"(name);
create index if not exists idx_products_barcode on "products"(barcode);

-- RLS: เปิดไว้พร้อม policy แบบอนุญาต anon ทั้งหมด (เหมาะกับใช้ภายในทีม)
-- ⚠️ ใครมี anon key = อ่าน/เขียนข้อมูลได้ทั้งหมด — อย่าแชร์ key สาธารณะ
do $$
declare t text;
begin
  foreach t in array array['customers','products','invoices','quotations','creditNotes','stockLogs','settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists billdee_all on %I', t);
    execute format('create policy billdee_all on %I for all using (true) with check (true)', t);
  end loop;
end $$;
```

### 3. ตั้งค่าในแอป
1. เปิด Billdee → **ตั้งค่า → ที่เก็บข้อมูล**
2. เลือก **Supabase (คลาวด์)** → กรอก Project URL + anon key
3. กด **ทดสอบการเชื่อมต่อ** → ต้องขึ้น ✅
4. กด **บันทึกและรีโหลด**
5. ย้ายข้อมูลเดิม: ก่อนสลับโหมด ให้ **ส่งออก (Export)** ข้อมูลจากโหมดเดิมไว้ก่อน
   แล้วหลังรีโหลดค่อย **นำเข้า (Import)** ไฟล์นั้นในแท็บ สำรอง/กู้คืน

## ข้อจำกัด
- เลขรันเอกสารถูกล็อกกันชนกัน **ต่อเครื่อง** — ถ้าหลายเครื่องออกบิลพร้อมกันเป๊ะๆ
  ยังมีโอกาสชนได้ (เหมือนโหมด PocketBase) ระบบกันซ้ำจะเตือนถ้าเลขถูกใช้แล้ว
- ต้องมีอินเทอร์เน็ต — ออฟไลน์ใช้โหมดนี้ไม่ได้ (ต่างจาก IndexedDB/SQLite)
- อย่าใช้ service_role key ในแอป — ใช้ anon key เท่านั้น
