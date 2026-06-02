const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
let win;

// ★★ แก้จอดำ: ปิด GPU/hardware acceleration ★★
// อาการ DOM โหลดครบแต่หน้าต่างวาดเป็นสีดำ เกิดจาก GPU compositing
// บนเครื่อง Windows บางรุ่น / VM / การ์ดจอเก่า — ปิดแล้วหาย
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

function createWindow() {
  win = new BrowserWindow({
    width:  500,
    height: 820,
    minWidth:  340,
    minHeight: 480,
    resizable: true,
    frame: true,
    title: 'SUOMSIANGCRYPTO MUSIC',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    backgroundColor: '#0d0b06',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // อนุญาตเล่นไฟล์ local
    },
    autoHideMenuBar: true,
  });

  // ใช้ path เต็ม กัน path เพี้ยนตอน build เป็น .exe
  win.loadFile(path.join(__dirname, 'index.html'));

  // ถ้าโหลดหน้าไม่สำเร็จ เด้งบอกสาเหตุ + เปิด DevTools
  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    win.webContents.openDevTools();
    dialog.showErrorBox('โหลดหน้าไม่สำเร็จ',
      'errorCode: ' + code + '\nerrorDesc: ' + desc + '\nurl: ' + url);
  });

  // กด F12 เปิด DevTools
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') win.webContents.openDevTools();
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
