const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // เปิด file dialog เลือกไฟล์
  openFiles: () => ipcRenderer.invoke('open-files'),
  // อ่าน metadata ไฟล์
  readFilePath: (path) => ipcRenderer.invoke('read-file-path', path),
  // แปลง path เป็น file:// URL สำหรับเล่นตรง
  getFileUrl: (path) => ipcRenderer.invoke('get-file-url', path),
});
