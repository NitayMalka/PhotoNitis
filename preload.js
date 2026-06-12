const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  movePhoto: (filePath, targetFolderName) => ipcRenderer.invoke('move-photo', { filePath, targetFolderName }),
  undoMove: (originalPath, newPath) => ipcRenderer.invoke('undo-move', { originalPath, newPath }),
  getLocalUrl: (filePath) => {
    try {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const parts = normalizedPath.split('/').map(part => encodeURIComponent(part));
      if (parts.length > 0 && parts[0].endsWith('%3A')) {
        parts[0] = parts[0].replace('%3A', ':');
      }
      return 'local-media:///' + parts.join('/');
    } catch (e) {
      console.error('Failed to convert path to URL:', e);
      return '';
    }
  },
  isTestMode: () => {
    // Check main process arguments or URL query parameters
    return false; // Renderer checks URL parameter directly
  },
  exitApp: (code) => ipcRenderer.send('exit-app', code)
});
