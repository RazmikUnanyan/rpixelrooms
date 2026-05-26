const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveTempClip: (buffer, clipId) => ipcRenderer.invoke('save-temp-clip', { buffer, clipId }),
  pickFile: (filters, title) => ipcRenderer.invoke('pick-file', { filters, title }),
  pickDirectory: (title) => ipcRenderer.invoke('pick-directory', { title }),
  getDefaultAssets: () => ipcRenderer.invoke('get-default-assets'),
  exportVideo: (opts) => ipcRenderer.invoke('export-video', opts),
  onFfmpegProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('ffmpeg-progress', handler);
    return () => ipcRenderer.removeListener('ffmpeg-progress', handler);
  },
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', { filePath }),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  platform: process.platform,
});
