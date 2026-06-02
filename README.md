# SUOMSIANGCRYPTO MUSIC — Electron Desktop (สร้างจากต้นฉบับ)

เวอร์ชัน Electron ที่สร้างจากไฟล์ต้นฉบับโดยตรง โค้ดเครื่องเล่นไม่ถูกแก้
จึงทำงานเหมือนเวอร์ชัน Chrome เป๊ะ + แก้ปัญหาจอดำ (ปิด GPU acceleration)

## ไฟล์
- `main.js`     — Electron main process (ปิด GPU + ดักจับ error)
- `index.html`  — สร้างจาก player.html ต้นฉบับ + override สำหรับ Electron
- `player.js`   — โค้ดเครื่องเล่นต้นฉบับ (ไม่แก้)
- `player.css`  — สไตล์ต้นฉบับ (ไม่แก้)
- `icons/`      — ไอคอนจริงจากต้นฉบับ (icon.ico, icon.png, logo.png ฯลฯ)
- `package.json`— build script (มี --publish never แล้ว)

## วิธีใช้
```
npm install
npm start            # ทดสอบก่อน ควรเห็นหน้าตาแอปครบ
npm run build-win    # build เป็น .exe -> โฟลเดอร์ dist/
```

## หมายเหตุสำคัญ
- **จอดำแก้แล้ว**: main.js ปิด hardware acceleration (app.disableHardwareAcceleration
  + disable-gpu) เพราะอาการ DOM โหลดครบแต่จอดำ = GPU วาดภาพไม่ได้ ไม่ใช่โค้ดพัง
- โหลดไฟล์เพลงด้วยปุ่ม "เพิ่มไฟล์" หรือลากวาง — ไฟล์เก็บใน IndexedDB เหมือนเดิม
- กด F12 = เปิด DevTools
- ติดตั้งแค่ตัวเดียวพอ (Portable หรือ Installer) เป็นแอปเดียวกัน
