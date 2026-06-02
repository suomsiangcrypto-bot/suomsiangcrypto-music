const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs   = require('fs');

let win;

function createWindow() {
  win = new BrowserWindow({
    width:  500,
    height: 820,
    minWidth:  340,
    minHeight: 480,
    maxWidth:  1200,
    maxHeight: 1400,
    resizable: true,          // จับมุมขยายได้
    frame: true,
    title: 'SUOMSIANGCRYPTO MUSIC',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    backgroundColor: '#0d0b06',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // อนุญาตโหลดไฟล์ local ทุก drive
      webSecurity: false,
    },
    autoHideMenuBar: true,
  });

  win.loadFile('index.html');

  // เปิด DevTools เมื่อกด F12
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') win.webContents.openDevTools();
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC: เปิด file dialog ────────────────────────────────
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

// ── IPC: อ่านไฟล์เป็น base64 (รองรับไฟล์ใหญ่ streaming) ──
ipcMain.handle('read-file-path', async (event, filePath) => {
  try {
    const stat = fs.statSync(filePath);
    return {
      ok: true,
      path: filePath,
      size: stat.size,
      name: path.basename(filePath),
    };
  } catch(e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: Get file URL (ให้ renderer โหลดตรงจาก disk) ──────
ipcMain.handle('get-file-url', async (event, filePath) => {
  // แปลง path เป็น file:// URL
  const url = 'file:///' + filePath.replace(/\\/g, '/');
  return url;
});
