const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
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
    maxWidth:  1200,
    maxHeight: 1400,
    resizable: true,
    frame: true,
    title: 'SUOMSIANGCRYPTO MUSIC',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    backgroundColor: '#0d0b06',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // อนุญาตโหลดไฟล์ local ทุก drive
    },
    autoHideMenuBar: true,
  });

  // ใช้ path เต็ม กัน path เพี้ยนตอน build เป็น .exe
  win.loadFile(path.join(__dirname, 'index.html'));

  // ดักจับกรณีโหลดหน้าไม่สำเร็จ — เด้งบอกสาเหตุจริง + เปิด DevTools
  win.webContents.on('did-fail-load', (e, errorCode, errorDesc, validatedURL) => {
    win.webContents.openDevTools();
    dialog.showErrorBox(
      'โหลดหน้าไม่สำเร็จ',
      'errorCode: ' + errorCode + '\n' +
      'errorDesc: ' + errorDesc + '\n' +
      'url: ' + validatedURL
    );
  });

  // เปิด DevTools เมื่อกด F12
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') win.webContents.openDevTools();
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC: เปิด file dialog เลือกไฟล์ ───────────────────────
ipcMain.handle('open-files', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'เลือกไฟล์เพลง',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'ไฟล์เสียงและวิดีโอ', extensions: ['mp3','mp4','wav','ogg','flac','aac','m4a','webm','mkv','mov','avi','wma','opus'] },
      { name: 'ทั้งหมด', extensions: ['*'] }
    ]
  });
  if (result.canceled) return [];
  return result.filePaths;
});

// ── IPC: อ่าน metadata ไฟล์ ───────────────────────────────
ipcMain.handle('read-file-path', async (event, filePath) => {
  try {
    const stat = fs.statSync(filePath);
    return { ok: true, path: filePath, size: stat.size, name: path.basename(filePath) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: แปลง path เป็น file:// URL (เล่นตรงจาก disk) ──────
ipcMain.handle('get-file-url', async (event, filePath) => {
  return 'file:///' + filePath.replace(/\\/g, '/');
});
