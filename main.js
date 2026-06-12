const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// Register custom protocol as standard and secure
protocol.registerSchemesAsPrivileged([
  { 
    scheme: 'local-media', 
    privileges: { 
      standard: true, 
      secure: true, 
      bypassCSP: true, 
      stream: true, 
      supportFetchAPI: true, 
      corsEnabled: true 
    } 
  }
]);

let mainWindow;

function readDirectoryAndGetPhotos(dirPath) {
  const files = fs.readdirSync(dirPath);
  const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  
  // Filter and collect image files
  const photos = files
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return supportedExtensions.includes(ext);
    })
    .map(file => {
      const fullPath = path.join(dirPath, file);
      const stats = fs.statSync(fullPath);
      return {
        name: file,
        path: fullPath,
        size: stats.size,
        mtime: stats.mtimeMs
      };
    });

  // Sort by name naturally
  photos.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return photos;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    title: "Photo Nitis - Premium Photo Organizer",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    frame: true,
    show: false
  });

  if (process.argv.includes('--test')) {
    mainWindow.loadFile('index.html', { query: { test: 'true' } });
  } else {
    mainWindow.loadFile('index.html');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (!process.argv.includes('--test')) {
      mainWindow.maximize();
    }
  });

  // Pipe renderer console logs to main process stdout when running in test mode
  if (process.argv.includes('--test')) {
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[RENDERER] ${message}`);
    });
  }
}

app.whenReady().then(() => {
  // Handle local-media:// protocol by reading files from filesystem natively
  protocol.handle('local-media', (request) => {
    try {
      // request.url will be like local-media://c:/Projects/... or local-media:///C:/...
      let rawPath = request.url.replace(/^local-media:\/\/+/, '');
      if (rawPath.startsWith('/')) {
        rawPath = rawPath.slice(1);
      }
      let decodedPath = decodeURIComponent(rawPath);
      
      // Restore the drive letter colon if it was stripped by browser hostname parsing
      if (/^[a-zA-Z]\//.test(decodedPath)) {
        decodedPath = decodedPath[0] + ':' + decodedPath.slice(1);
      }
      
      if (!fs.existsSync(decodedPath)) {
        console.error(`[PROTOCOL ERROR] File not found: ${decodedPath}`);
        return new Response('File not found', { status: 404 });
      }
      
      const fileBuffer = fs.readFileSync(decodedPath);
      return new Response(fileBuffer);
    } catch (error) {
      console.error('Failed to handle local-media protocol:', error);
      return new Response('Error loading file', { status: 500 });
    }
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: Select Directory (Mocks in test mode)
ipcMain.handle('select-directory', async () => {
  if (process.argv.includes('--test')) {
    const testDir = path.join(__dirname, 'test-photos');
    console.log('[MAIN] Test mode: Auto-selecting test-photos directory:', testDir);
    const photos = readDirectoryAndGetPhotos(testDir);
    return {
      canceled: false,
      directoryPath: testDir,
      photos: photos
    };
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const dirPath = result.filePaths[0];
  try {
    const photos = readDirectoryAndGetPhotos(dirPath);
    return {
      canceled: false,
      directoryPath: dirPath,
      photos: photos
    };
  } catch (error) {
    console.error('Error reading directory:', error);
    throw error;
  }
});

// IPC: Move Photo to folder
ipcMain.handle('move-photo', async (event, { filePath, targetFolderName }) => {
  try {
    const dirName = path.dirname(filePath);
    const baseName = path.basename(filePath);
    const targetDir = path.join(dirName, targetFolderName);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetFilePath = path.join(targetDir, baseName);

    let finalTargetFilePath = targetFilePath;
    if (fs.existsSync(targetFilePath)) {
      const ext = path.extname(baseName);
      const nameWithoutExt = path.basename(baseName, ext);
      finalTargetFilePath = path.join(targetDir, `${nameWithoutExt}_${Date.now()}${ext}`);
    }

    fs.renameSync(filePath, finalTargetFilePath);

    return {
      success: true,
      originalPath: filePath,
      newPath: finalTargetFilePath
    };
  } catch (error) {
    console.error('Error moving file:', error);
    return { success: false, error: error.message };
  }
});

// IPC: Undo move
ipcMain.handle('undo-move', async (event, { originalPath, newPath }) => {
  try {
    if (!fs.existsSync(newPath)) {
      throw new Error(`File not found at: ${newPath}`);
    }

    const originalDir = path.dirname(originalPath);
    if (!fs.existsSync(originalDir)) {
      fs.mkdirSync(originalDir, { recursive: true });
    }

    let finalOriginalPath = originalPath;
    if (fs.existsSync(originalPath)) {
      const ext = path.extname(originalPath);
      const nameWithoutExt = path.basename(originalPath, ext);
      const dir = path.dirname(originalPath);
      finalOriginalPath = path.join(dir, `${nameWithoutExt}_undo_${Date.now()}${ext}`);
    }

    fs.renameSync(newPath, finalOriginalPath);

    return {
      success: true,
      restoredPath: finalOriginalPath
    };
  } catch (error) {
    console.error('Error undoing move:', error);
    return { success: false, error: error.message };
  }
});

// IPC: Exit App (For Automated Tests)
ipcMain.on('exit-app', (event, code) => {
  console.log(`[MAIN] Exiting application with code ${code}`);
  app.exit(code);
});
