// --- STATE MANAGEMENT ---
let state = {
  currentDirectory: '',
  photos: [],            // Remaining photos in folder
  originalTotal: 0,      // Number of photos when first scanned
  currentIndex: 0,
  undoStack: [],         // History stack for undoing moves
  zoom: {
    scale: 1,
    x: 0,
    y: 0
  },
  folders: {
    left: 'delete',
    up: 'not sure',
    right: 'save'
  },
  drag: {
    isDragging: false,
    startX: 0,
    startY: 0
  }
};

// --- DOM ELEMENTS ---
const elements = {
  // Navigation & Folder Selection
  btnSelectFolder: document.getElementById('btn-select-folder'),
  btnEmptySelectFolder: document.getElementById('btn-empty-select-folder'),
  displayFolderPath: document.getElementById('display-folder-path'),
  
  // Actions
  btnUndo: document.getElementById('btn-undo'),
  btnSettings: document.getElementById('btn-settings'),
  
  // Viewer Panels
  viewerActive: document.getElementById('viewer-active'),
  viewerEmpty: document.getElementById('viewer-empty'),
  photoViewport: document.getElementById('photo-viewport'),
  displayPhoto: document.getElementById('display-photo'),
  
  // HUD Elements
  hudFilename: document.getElementById('hud-filename'),
  hudResolution: document.getElementById('hud-resolution'),
  hudFilesize: document.getElementById('hud-filesize'),
  zoomIndicator: document.getElementById('zoom-indicator'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomReset: document.getElementById('btn-zoom-reset'),
  
  // Sidebar Elements
  statTotal: document.getElementById('stat-total'),
  statOrganized: document.getElementById('stat-organized'),
  progressFill: document.getElementById('progress-fill'),
  progressPercent: document.getElementById('progress-percent'),
  queueContainer: document.getElementById('queue-container'),
  legendDirLeft: document.getElementById('legend-dir-left'),
  legendDirUp: document.getElementById('legend-dir-up'),
  legendDirRight: document.getElementById('legend-dir-right'),
  
  // Settings Modal
  settingsModal: document.getElementById('settings-modal'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnCancelSettings: document.getElementById('btn-cancel-settings'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  inputFolderLeft: document.getElementById('input-folder-left'),
  inputFolderUp: document.getElementById('input-folder-up'),
  inputFolderRight: document.getElementById('input-folder-right')
};

// --- INITIALIZATION ---
function init() {
  loadSettings();
  setupEventListeners();
  updateLegendUI();
  
  const isTest = new URLSearchParams(window.location.search).get('test') === 'true';
  if (isTest) {
    console.log('[TEST] Starting automated test mode...');
    setTimeout(async () => {
      try {
        console.log('[TEST] Automatically triggering directory load...');
        await chooseFolder();
        
        const img = elements.displayPhoto;
        console.log('[TEST] Current image src:', img.src);
        
        const handleImageCheck = () => {
          console.log('[TEST] Image load triggered! Dimensions:', img.naturalWidth, 'x', img.naturalHeight);
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            console.log('[TEST SUCCESS] Photo loaded successfully!');
            window.api.exitApp(0);
          } else {
            console.error('[TEST FAILURE] Photo loaded with 0 dimensions! Source:', img.src);
            window.api.exitApp(1);
          }
        };

        if (img.complete) {
          handleImageCheck();
        } else {
          img.onload = handleImageCheck;
          img.onerror = (e) => {
            console.error('[TEST FAILURE] Image failed to load! Source:', img.src);
            window.api.exitApp(1);
          };
        }
      } catch (err) {
        console.error('[TEST FAILURE] Exception during test execution:', err);
        window.api.exitApp(1);
      }
    }, 1000);
  }
}

// Load configurations from localStorage
function loadSettings() {
  const left = localStorage.getItem('folder_left');
  const up = localStorage.getItem('folder_up');
  const right = localStorage.getItem('folder_right');
  
  if (left) state.folders.left = left;
  if (up) state.folders.up = up;
  if (right) state.folders.right = right;
  
  // Update Settings Inputs
  elements.inputFolderLeft.value = state.folders.left;
  elements.inputFolderUp.value = state.folders.up;
  elements.inputFolderRight.value = state.folders.right;
}

// Save configurations to localStorage
function saveSettings() {
  const left = elements.inputFolderLeft.value.trim() || 'delete';
  const up = elements.inputFolderUp.value.trim() || 'not sure';
  const right = elements.inputFolderRight.value.trim() || 'save';
  
  localStorage.setItem('folder_left', left);
  localStorage.setItem('folder_up', up);
  localStorage.setItem('folder_right', right);
  
  state.folders.left = left;
  state.folders.up = up;
  state.folders.right = right;
  
  updateLegendUI();
  closeSettingsModal();
}

function updateLegendUI() {
  elements.legendDirLeft.textContent = state.folders.left;
  elements.legendDirUp.textContent = state.folders.up;
  elements.legendDirRight.textContent = state.folders.right;
}

// --- DIRECTORY MANAGEMENT ---
async function chooseFolder() {
  try {
    const result = await window.api.selectDirectory();
    if (result.canceled) return;
    
    if (result.photos.length === 0) {
      alert("No supported images found in this folder. Supported extensions are: .jpg, .jpeg, .png, .gif, .webp, .bmp");
      return;
    }
    
    state.currentDirectory = result.directoryPath;
    state.photos = result.photos;
    state.originalTotal = result.photos.length;
    state.currentIndex = 0;
    state.undoStack = [];
    
    elements.displayFolderPath.textContent = state.currentDirectory;
    elements.displayFolderPath.title = state.currentDirectory;
    
    elements.viewerEmpty.classList.add('hidden');
    elements.viewerActive.classList.remove('hidden');
    
    loadPhoto();
    updateStatsUI();
  } catch (error) {
    console.error('Error choosing directory:', error);
    alert('Failed to read folder contents. Please try again.');
  }
}

// --- PHOTO LOADING ---
function loadPhoto() {
  // If no photos are left, show complete/empty state
  if (state.photos.length === 0) {
    showFinishedState();
    return;
  }
  
  // Ensure index is valid
  if (state.currentIndex >= state.photos.length) {
    state.currentIndex = state.photos.length - 1;
  }
  if (state.currentIndex < 0) {
    state.currentIndex = 0;
  }
  
  const photo = state.photos[state.currentIndex];
  const url = window.api.getLocalUrl(photo.path);
  
  // Setup image source and loading details
  elements.displayPhoto.style.opacity = '0';
  elements.displayPhoto.src = url;
  
  elements.displayPhoto.onload = () => {
    elements.hudResolution.textContent = `${elements.displayPhoto.naturalWidth} × ${elements.displayPhoto.naturalHeight}`;
    elements.displayPhoto.classList.remove('slide-out-left', 'slide-out-right', 'slide-out-up');
    elements.displayPhoto.classList.add('fade-in-center');
    elements.displayPhoto.style.opacity = '1';
    
    // Remove fade class after animation to avoid repeating it on zoom
    setTimeout(() => {
      elements.displayPhoto.classList.remove('fade-in-center');
    }, 250);
  };
  
  elements.hudFilename.textContent = photo.name;
  elements.hudFilename.title = photo.name;
  elements.hudFilesize.textContent = formatBytes(photo.size);
  
  // Reset zoom & pan
  resetZoom();
  
  // Update sidebar previews & stats
  updateQueueUI();
  updateStatsUI();
}

function showFinishedState() {
  elements.viewerActive.classList.add('hidden');
  elements.viewerEmpty.classList.remove('hidden');
  
  // Modify empty state contents to show done message
  const card = elements.viewerEmpty.querySelector('.empty-state-card');
  card.innerHTML = `
    <div class="empty-icon-wrapper" style="color: var(--color-save)">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
    </div>
    <h2>All Done!</h2>
    <p>You have successfully organized all the photos in this directory.</p>
    <div style="display:flex; gap:12px; justify-content:center;">
      <button id="btn-done-select" class="btn btn-primary">Choose Another Folder</button>
      <button id="btn-done-undo" class="btn btn-secondary" ${state.undoStack.length === 0 ? 'disabled' : ''}>Undo Last Move</button>
    </div>
  `;
  
  // Re-bind listeners for elements inside the dynamically replaced card
  document.getElementById('btn-done-select').addEventListener('click', chooseFolder);
  const undoBtn = document.getElementById('btn-done-undo');
  undoBtn.addEventListener('click', undoLastMove);
  if (state.undoStack.length > 0) {
    undoBtn.removeAttribute('disabled');
  } else {
    undoBtn.setAttribute('disabled', 'true');
  }
}

// --- PHOTO MOVEMENT & CLASSIFICATION ---
async function classifyPhoto(direction) {
  if (state.photos.length === 0) return;
  
  const folderName = state.folders[direction];
  if (!folderName) return;
  
  const currentPhoto = state.photos[state.currentIndex];
  
  // Apply visual transition before file rename
  const animationClass = `slide-out-${direction}`;
  elements.displayPhoto.classList.add(animationClass);
  
  // Wait for animation, then execute
  setTimeout(async () => {
    try {
      const response = await window.api.movePhoto(currentPhoto.path, folderName);
      if (response.success) {
        // Record in undo stack
        state.undoStack.push({
          originalPath: response.originalPath,
          newPath: response.newPath,
          index: state.currentIndex,
          photoData: currentPhoto
        });
        
        elements.btnUndo.removeAttribute('disabled');
        
        // Remove from current active list
        state.photos.splice(state.currentIndex, 1);
        
        // Load the next photo (current index remains same as list shifted, clamp if at end)
        loadPhoto();
      } else {
        alert(`Failed to move photo: ${response.error}`);
        elements.displayPhoto.classList.remove(animationClass);
      }
    } catch (err) {
      console.error('Classification error:', err);
      elements.displayPhoto.classList.remove(animationClass);
    }
  }, 200);
}

// --- UNDO OPERATION ---
async function undoLastMove() {
  if (state.undoStack.length === 0) return;
  
  const lastOp = state.undoStack.pop();
  try {
    const response = await window.api.undoMove(lastOp.originalPath, lastOp.newPath);
    if (response.success) {
      // Restore the correct local path
      lastOp.photoData.path = response.restoredPath;
      
      // If we were in the "All Done" view, switch back to active view
      if (elements.viewerActive.classList.contains('hidden')) {
        // Restore elements.viewerEmpty HTML to original structure
        restoreOriginalEmptyState();
        elements.viewerEmpty.classList.add('hidden');
        elements.viewerActive.classList.remove('hidden');
      }
      
      // Put back in active photo list
      state.photos.splice(lastOp.index, 0, lastOp.photoData);
      state.currentIndex = lastOp.index;
      
      // Reload photo
      loadPhoto();
    } else {
      alert(`Could not undo last move: ${response.error}`);
    }
  } catch (err) {
    console.error('Undo error:', err);
  }
  
  if (state.undoStack.length === 0) {
    elements.btnUndo.setAttribute('disabled', 'true');
    // If finished view is currently showing, disable its undo button too
    const finishedUndoBtn = document.getElementById('btn-done-undo');
    if (finishedUndoBtn) finishedUndoBtn.setAttribute('disabled', 'true');
  }
}

function restoreOriginalEmptyState() {
  const card = elements.viewerEmpty.querySelector('.empty-state-card');
  card.innerHTML = `
    <div class="empty-icon-wrapper">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21 15 16 10 5 21"></polyline>
      </svg>
    </div>
    <h2>Organize Your Photos in Snap</h2>
    <p>Select a folder to begin. You'll be able to quickly classify photos using your arrow keys, zoom in/out, and easily undo mistakes.</p>
    <button id="btn-empty-select-folder" class="btn btn-primary btn-large">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
      <span>Choose Folder</span>
    </button>
  `;
  document.getElementById('btn-empty-select-folder').addEventListener('click', chooseFolder);
}

// --- ZOOM & PAN LOGIC ---
function applyZoomTransform(smooth = false) {
  if (smooth) {
    elements.displayPhoto.style.transition = 'transform 0.15s ease-out';
  } else {
    elements.displayPhoto.style.transition = 'none';
  }
  
  elements.displayPhoto.style.transform = `translate(${state.zoom.x}px, ${state.zoom.y}px) scale(${state.zoom.scale})`;
  elements.zoomIndicator.textContent = `${Math.round(state.zoom.scale * 100)}%`;
}

function zoom(multiplier, clientX, clientY) {
  const newScale = Math.min(Math.max(state.zoom.scale * multiplier, 0.1), 10);
  if (newScale === state.zoom.scale) return;
  
  // If coordinates are provided, zoom towards that specific point
  if (clientX !== undefined && clientY !== undefined) {
    const rect = elements.displayPhoto.getBoundingClientRect();
    
    // Position relative to image center
    const imgCenterX = rect.left + rect.width / 2;
    const imgCenterY = rect.top + rect.height / 2;
    
    // Zoom focus coordinates relative to image origin
    const focusX = clientX - imgCenterX;
    const focusY = clientY - imgCenterY;
    
    // Adjust translations so the focus point stays relatively in the same place
    const factor = (newScale / state.zoom.scale) - 1;
    state.zoom.x -= focusX * factor / state.zoom.scale;
    state.zoom.y -= focusY * factor / state.zoom.scale;
  }
  
  state.zoom.scale = newScale;
  applyZoomTransform();
}

function resetZoom() {
  state.zoom.scale = 1;
  state.zoom.x = 0;
  state.zoom.y = 0;
  applyZoomTransform();
}

// Pan dragging implementation
function startDrag(e) {
  if (state.zoom.scale <= 1) return; // Only pan when zoomed in
  state.drag.isDragging = true;
  state.drag.startX = e.clientX - state.zoom.x;
  state.drag.startY = e.clientY - state.zoom.y;
  elements.photoViewport.style.cursor = 'grabbing';
}

function onDrag(e) {
  if (!state.drag.isDragging) return;
  state.zoom.x = e.clientX - state.drag.startX;
  state.zoom.y = e.clientY - state.drag.startY;
  applyZoomTransform();
}

function stopDrag() {
  if (!state.drag.isDragging) return;
  state.drag.isDragging = false;
  elements.photoViewport.style.cursor = 'grab';
}

// --- SIDEBAR PREVIEW & STATS RENDERING ---
function updateQueueUI() {
  elements.queueContainer.innerHTML = '';
  
  const upcomingCount = 5;
  let itemsRendered = 0;
  
  for (let i = 1; i <= upcomingCount; i++) {
    const index = state.currentIndex + i;
    if (index >= state.photos.length) break;
    
    const photo = state.photos[index];
    const itemUrl = window.api.getLocalUrl(photo.path);
    
    const itemEl = document.createElement('div');
    itemEl.className = 'queue-item';
    itemEl.innerHTML = `
      <div class="queue-thumb-container">
        <img class="queue-thumb" src="${itemUrl}" alt="" loading="lazy">
      </div>
      <div class="queue-details">
        <span class="queue-filename">${photo.name}</span>
        <span class="queue-index">#${index + 1}</span>
      </div>
    `;
    
    // Make sidebar queue item clickable to jump to that photo
    itemEl.addEventListener('click', () => {
      state.currentIndex = index;
      loadPhoto();
    });
    
    elements.queueContainer.appendChild(itemEl);
    itemsRendered++;
  }
  
  if (itemsRendered === 0) {
    elements.queueContainer.innerHTML = '<div class="queue-empty-message">No upcoming photos</div>';
  }
}

function updateStatsUI() {
  const organized = state.originalTotal - state.photos.length;
  elements.statTotal.textContent = state.originalTotal;
  elements.statOrganized.textContent = organized;
  
  const percentage = state.originalTotal > 0 ? Math.round((organized / state.originalTotal) * 100) : 0;
  elements.progressFill.style.width = `${percentage}%`;
  elements.progressPercent.textContent = `${percentage}% complete (${state.photos.length} left)`;
}

// --- SETTINGS MODAL DIALOG ---
function openSettingsModal() {
  elements.inputFolderLeft.value = state.folders.left;
  elements.inputFolderUp.value = state.folders.up;
  elements.inputFolderRight.value = state.folders.right;
  elements.settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  elements.settingsModal.classList.add('hidden');
}

// --- UTILITY ---
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// --- EVENT BINDINGS ---
function setupEventListeners() {
  // Folder Chooser Buttons
  elements.btnSelectFolder.addEventListener('click', chooseFolder);
  elements.btnEmptySelectFolder.addEventListener('click', chooseFolder);
  
  // Settings Button & Modal Actions
  elements.btnSettings.addEventListener('click', openSettingsModal);
  elements.btnCloseSettings.addEventListener('click', closeSettingsModal);
  elements.btnCancelSettings.addEventListener('click', closeSettingsModal);
  elements.btnSaveSettings.addEventListener('click', saveSettings);
  
  // Close settings on outside click
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeSettingsModal();
  });
  
  // Undo Button click
  elements.btnUndo.addEventListener('click', undoLastMove);
  
  // Zoom Buttons
  elements.btnZoomIn.addEventListener('click', () => zoom(1.2));
  elements.btnZoomOut.addEventListener('click', () => zoom(1 / 1.2));
  elements.btnZoomReset.addEventListener('click', resetZoom);
  
  // Mouse Wheel Zoom
  elements.photoViewport.addEventListener('wheel', (e) => {
    if (state.photos.length === 0) return;
    e.preventDefault();
    const multiplier = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoom(multiplier, e.clientX, e.clientY);
  }, { passive: false });
  
  // Mouse Drag to Pan
  elements.photoViewport.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
  
  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // If settings inputs are focused, don't capture hotkeys
    if (document.activeElement.tagName === 'INPUT') return;
    
    // Select folder: Ctrl+O
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      chooseFolder();
      return;
    }
    
    // Undo: Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoLastMove();
      return;
    }
    
    // Zoom In: Ctrl + Plus / Ctrl + Equal
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      zoom(1.2);
      return;
    }
    
    // Zoom Out: Ctrl + Minus
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      zoom(1 / 1.2);
      return;
    }
    
    // Zoom Reset: Ctrl + 0
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      resetZoom();
      return;
    }
    
    // Image Navigation Keys: Arrow Left, Arrow Up, Arrow Right
    if (state.photos.length > 0) {
      if (e.key === 'ArrowLeft') {
        classifyPhoto('left');
      } else if (e.key === 'ArrowUp') {
        classifyPhoto('up');
      } else if (e.key === 'ArrowRight') {
        classifyPhoto('right');
      }
    }
  });
}

// Start app
init();
