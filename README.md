# SUOMSIANGCRYPTO MUSIC — Electron Desktop

ชุดไฟล์เวอร์ชัน Electron ที่สะอาดและพร้อมใช้งาน

## ไฟล์ในโปรเจกต์
- `main.js` — main process (มีตัวดัก error ถ้าโหลดหน้าไม่สำเร็จ)
- `preload.js` — bridge ระหว่าง main กับ renderer
- `index.html` — หน้าตาแอป
- `app.js` — โค้ดทำงานฝั่งหน้าเว็บ
- `player.css` — สไตล์/ธีม
- `icons/` — ไอคอน (icon.png, icon.ico, logo.png) **เป็น placeholder — เอาไอคอนจริงมาทับได้**
- `package.json` — config + build script (มี `--publish never` แล้ว)

## วิธีใช้

### 1) ทดสอบรันก่อน (แนะนำ)
```
npm install
npm start
```
ถ้าหน้าตาแอปขึ้นปกติ = พร้อม build

### 2) Build เป็น .exe
```
npm run build-win
```
ไฟล์จะอยู่ในโฟลเดอร์ `dist/`:
- `SUOMSIANGCRYPTO-MUSIC-Portable.exe` (พกพา รันได้เลย)
- `SUOMSIANGCRYPTO MUSIC Setup 1.0.0.exe` (ตัวติดตั้ง)

## หมายเหตุ
- ไฟล์เวอร์ชัน Chrome Extension (player.html, player.js, manifest.json,
  background.js, sw.js, app.webmanifest) **ไม่ต้องใช้** ใน Electron
  อย่าเอามาปนในโฟลเดอร์นี้
- ถ้าจอยังดำตอนรัน จะมี dialog เด้งบอกสาเหตุ + เปิด DevTools อัตโนมัติ
  (หรือกด F12 เองได้)
- กด F12 = เปิด/ปิด DevTools
