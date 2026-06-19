# ทำ Tex V2 เป็นแอปติดตั้ง (.exe) เก็บข้อมูลใน SQLite

แอปนี้พร้อมห่อเป็นโปรแกรมเดสก์ท็อปด้วย **Tauri** แล้ว เมื่อรันเป็นแอปติดตั้ง มันจะ
**เก็บข้อมูลในไฟล์ SQLite จริงโดยอัตโนมัติ** (ไม่ผูกกับเบราว์เซอร์ ไม่ต้องรัน server)

> ✅ ฝั่งโค้ดทำเสร็จแล้ว — เหลือแค่ "build เป็น .exe" ที่ต้องทำบนเครื่อง Windows ที่ลง Rust
> (ผม build ในเครื่อง dev ไม่ได้ จึงต้องให้คุณรันคำสั่ง build เอง ตามด้านล่าง)

## 1. ลงเครื่องมือที่ต้องใช้ (ครั้งเดียว)

1. **Rust** — โหลดจาก https://rustup.rs → รัน `rustup-init.exe` → กด Enter ผ่านทุกอย่าง (default)
2. **Microsoft C++ Build Tools** — โหลด "Build Tools for Visual Studio" → ติดตั้ง workload
   **"Desktop development with C++"** (Tauri ต้องใช้ลิงก์เกอร์ของ MSVC)
3. **WebView2** — Windows 10/11 มักมีอยู่แล้ว ถ้าไม่มีโหลดจาก Microsoft (Evergreen Runtime)
4. ปิด-เปิด PowerShell ใหม่ แล้วเช็ค: `rustc --version` ต้องขึ้นเวอร์ชัน

> Node.js + dependencies ของโปรเจกต์ลงไว้แล้ว (`@tauri-apps/cli`, plugin-sql ฯลฯ)

## 2. ทดสอบ (เปิดเป็นหน้าต่างแอป)

```powershell
cd "C:\Users\yanak\Downloads\Tex V2"
npm run tauri:dev
```

ครั้งแรกจะคอมไพล์ Rust นานหน่อย (หลายนาที) แล้วจะเด้งหน้าต่างแอป Tex V2 ขึ้นมา
แก้โค้ดหน้าเว็บแล้วอัปเดตสดได้เหมือน dev ปกติ

## 3. Build เป็นตัวติดตั้ง (.exe / .msi)

```powershell
npm run tauri:build
```

ได้ไฟล์ติดตั้งที่:
```
src-tauri\target\release\bundle\nsis\Tex V2_0.1.0_x64-setup.exe   ← ตัวติดตั้ง (แนะนำ)
src-tauri\target\release\bundle\msi\Tex V2_0.1.0_x64_en-US.msi
```
ดับเบิลคลิกติดตั้ง → ได้ไอคอน Tex V2 ใน Start menu เปิดเหมือนโปรแกรมทั่วไป

## 4. ข้อมูลเก็บที่ไหน & สำรองยังไง

- ไฟล์ฐานข้อมูล SQLite: **`%APPDATA%\com.texv2.app\tex_v2.db`**
  (เปิด File Explorer พิมพ์ `%APPDATA%\com.texv2.app` ที่ช่อง address)
- **สำรอง = copy ไฟล์ `tex_v2.db` ไฟล์เดียว** ขึ้น USB/cloud — ง่ายมาก
- ปุ่ม Export/Import ในแอปก็ยังใช้ได้ (ส่งออกเป็น JSON)
- เปิดดู/ตรวจสอบไฟล์ด้วยโปรแกรม **DB Browser for SQLite** ได้

## 5. ย้ายข้อมูลเดิม (จากเวอร์ชันเบราว์เซอร์) เข้าแอปติดตั้ง

แอปที่ติดตั้งใหม่จะเริ่มจากฐานข้อมูลว่าง วิธีเอาข้อมูลเดิมเข้า:
1. เปิดเวอร์ชันเบราว์เซอร์เดิม (ที่ข้อมูลอยู่) → ตั้งค่า → สำรอง/กู้คืน → **ส่งออก (Export)** เก็บไฟล์ JSON
2. เปิดแอป Tex V2 ที่ติดตั้ง → ตั้งค่า → สำรอง/กู้คืน → **นำเข้า (Import)** เลือกไฟล์ JSON นั้น
3. ข้อมูลจะถูกเขียนลง SQLite — เสร็จ

## 6. เปลี่ยนไอคอนเป็นโลโก้บริษัท (ถ้าต้องการ)

```powershell
npm run tauri icon path\to\logo.png
```
(ใช้ภาพ PNG สี่เหลี่ยมจัตุรัส ขนาด ≥ 512x512)

## หมายเหตุ / แก้ปัญหา

- แอปเลือกที่เก็บข้อมูลให้อัตโนมัติ: **รันเป็นแอปติดตั้ง → SQLite** เสมอ
  (โค้ดเช็ค `window.__TAURI__` ใน `src/db/database.js`)
- ถ้าเปิดแล้วหน้าต่าง**ขาวเปล่า** หลัง build: สร้างไฟล์ `vite.config.js` ใส่ `export default { base: './' }`
  แล้ว build ใหม่
- `npm run tauri:dev` คอมไพล์ครั้งแรกช้าเป็นปกติ ครั้งต่อไปจะเร็วขึ้นมาก
- ฝั่ง Rust ผมตั้ง plugin-sql ไว้ใน `src-tauri/Cargo.toml`, `src/lib.rs`, `capabilities/default.json`
  ถ้า build แล้วฟ้อง permission ของ sql ให้แจ้งผมพร้อมข้อความ error
