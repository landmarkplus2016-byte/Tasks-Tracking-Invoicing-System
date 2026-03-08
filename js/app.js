/* ══════════════════════════════════════════════════════
   TTIS — app.js  |  App bootstrap, upload screen, routing
   ══════════════════════════════════════════════════════ */

'use strict';

// ── App state ─────────────────────────────────────────────
let _rows       = [];
let _activeTab  = 'dashboard';

// ── DOM refs (resolved after DOMContentLoaded) ────────────
let $uploadScreen, $noAccessScreen, $appShell, $dropZone, $fileInput,
    $fileInfo, $fileName, $fileSize,
    $uploadProgress, $uploadProgressFill, $uploadProgressText,
    $uploadError, $dataBadge;

document.addEventListener('DOMContentLoaded', () => {
  $uploadScreen       = document.getElementById('uploadScreen');
  $noAccessScreen     = document.getElementById('noAccessScreen');
  $appShell           = document.getElementById('appShell');
  $dropZone           = document.getElementById('dropZone');
  $fileInput          = document.getElementById('fileInput');
  $fileInfo           = document.getElementById('fileInfo');
  $fileName           = document.getElementById('fileName');
  $fileSize           = document.getElementById('fileSize');
  $uploadProgress     = document.getElementById('uploadProgress');
  $uploadProgressFill = document.getElementById('uploadProgressFill');
  $uploadProgressText = document.getElementById('uploadProgressText');
  $uploadError        = document.getElementById('uploadError');
  $dataBadge          = document.getElementById('dataBadge');

  PriceList.init();
  UserManager.init(_onUserReady);
  _bindUploadEvents();
  _bindTabEvents();
  _bindReloadBtn();
});

// ── Upload events ──────────────────────────────────────────
function _bindUploadEvents() {
  // File input change
  $fileInput.addEventListener('change', e => {
    if (e.target.files[0]) _loadFile(e.target.files[0]);
  });

  // Click on drop zone (not on button) triggers file input
  $dropZone.addEventListener('click', e => {
    if (!e.target.closest('.upload-browse-btn')) {
      $fileInput.click();
    }
  });

  // Drag & drop
  $dropZone.addEventListener('dragenter', e => { e.preventDefault(); $dropZone.classList.add('drag-over'); });
  $dropZone.addEventListener('dragover',  e => { e.preventDefault(); $dropZone.classList.add('drag-over'); });
  $dropZone.addEventListener('dragleave', e => {
    if (!$dropZone.contains(e.relatedTarget)) $dropZone.classList.remove('drag-over');
  });
  $dropZone.addEventListener('drop', e => {
    e.preventDefault();
    $dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) _loadFile(file);
    else _showUploadError('No file detected in drop.');
  });

  // Global drag-over prevention (outside drop zone)
  document.addEventListener('dragover',  e => e.preventDefault());
  document.addEventListener('drop',      e => e.preventDefault());
}

// ── Load & parse file ──────────────────────────────────────
async function _loadFile(file) {
  const validExts = ['.xlsm', '.xlsx', '.xls'];
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!validExts.includes(ext)) {
    _showUploadError(`Invalid file type "${ext}". Please upload a .xlsm or .xlsx file.`);
    return;
  }

  _hideUploadError();
  _showFileInfo(file);
  _showProgress('Reading file…', 10);

  try {
    _showProgress('Parsing workbook…', 35);

    const result = await parseExcelFile(file);

    _showProgress('Building data model…', 70);

    if (!result.sheetFound) {
      showToast(`Sheet "${SHEET_NAME}" not found — used "${result.sheetUsed}" instead`, 'warn');
    }

    _rows = result.rows;

    _showProgress('Rendering app…', 90);

    // Small delay so progress animation is visible
    await new Promise(r => setTimeout(r, 150));

    _launchApp(result);
  } catch (err) {
    _hideProgress();
    _showUploadError(err.message || 'Unknown error during parsing.');
  }
}

function _launchApp(meta) {
  _showProgress('Done!', 100);

  // Update data badge
  if ($dataBadge) {
    $dataBadge.textContent = `${_rows.length.toLocaleString()} rows · ${meta.fileName}`;
  }

  // Build all sections
  buildDashboard(_rows);
  Tasks.init(_rows);
  Invoicing.init(_rows);
  Readiness.init(_rows);
  Settings.init(_rows);

  // Show app
  setTimeout(() => {
    $uploadScreen.style.display = 'none';
    $appShell.style.display = 'block';
    _switchTab('dashboard');
    SyncManager.init();
    UserManager.applyAccess();
    showToast(`Loaded ${_rows.length.toLocaleString()} rows from "${meta.fileName}"`, 'success');
  }, 200);
}

// ── Tab switching ──────────────────────────────────────────
function _bindTabEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
  });
}

function _switchTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `sec-${tab}`);
  });
}

// ── Reload button ──────────────────────────────────────────
function _bindReloadBtn() {
  document.getElementById('reloadBtn')?.addEventListener('click', () => {
    // Show upload screen again
    $uploadScreen.style.display = 'flex';
    $appShell.style.display = 'none';
    _hideUploadError();
    _hideProgress();
    $fileInfo.style.display = 'none';
    $fileInput.value = '';
  });
}

// ── Upload screen helpers ──────────────────────────────────
function _showFileInfo(file) {
  $fileName.textContent = file.name;
  $fileSize.textContent = fmtBytes(file.size);
  $fileInfo.style.display = 'flex';
}

function _showProgress(text, pctVal) {
  $uploadProgress.style.display = 'block';
  $uploadProgressFill.style.width = pctVal + '%';
  $uploadProgressText.textContent = text;
}

function _hideProgress() {
  $uploadProgress.style.display = 'none';
  $uploadProgressFill.style.width = '0%';
}

function _showUploadError(msg) {
  $uploadError.textContent = msg;
  $uploadError.style.display = 'block';
}

function _hideUploadError() {
  $uploadError.style.display = 'none';
}

// ── Smart startup load (called once identity is confirmed) ─
// Google Drive is always the source of truth.
// Upload screen is only for Admin users — non-admins see a "contact admin" screen.
async function _onUserReady() {
  const isAdmin = typeof UserManager !== 'undefined' && UserManager.isAdmin();

  // 1. Always try Google Drive first (silent auth → explicit auth → fetch tasks.json)
  const driveLoaded = await _tryLoadFromDrive();
  if (driveLoaded) return;

  // 2. Drive did not load — Admin gets the upload screen; non-Admin gets no-access screen
  if (isAdmin) {
    // Admin fallback: try Storage Provider auto-connect (Dropbox / GDrive API key)
    try {
      const file = await Settings.autoConnect();
      if (file) {
        showToast('Auto-connecting via saved provider…', 'info');
        _loadFile(file);
        return;
      }
    } catch (err) {
      showToast(`Auto-connect failed: ${err.message}`, 'error');
    }
    // Admin sees the upload screen for manual first-time setup
    _hideProgress();
  } else {
    // Non-admin: never show the upload screen — tell them to contact Admin
    _showNoAccessScreen();
  }
}

// ── No-access screen (non-admin, Drive not ready) ──────────
function _showNoAccessScreen(msg) {
  _hideProgress();
  $uploadScreen.style.display = 'none';
  $noAccessScreen.style.display = 'flex';
  const msgEl = document.getElementById('noAccessMsg');
  if (msgEl && msg) msgEl.innerHTML = msg;
}

// ── Retry Drive load (called from noAccessScreen button) ───
async function _retryDriveLoad() {
  $noAccessScreen.style.display = 'none';
  $uploadScreen.style.display = 'flex';
  _showProgress('Retrying Google Drive connection…', 20);
  const driveLoaded = await _tryLoadFromDrive();
  if (!driveLoaded) {
    _hideProgress();
    const isAdmin = typeof UserManager !== 'undefined' && UserManager.isAdmin();
    if (!isAdmin) _showNoAccessScreen();
  }
}

// ── Load tasks.json from Google Drive Sync ─────────────────
async function _tryLoadFromDrive() {
  if (typeof GoogleDriveStorage === 'undefined') return false;

  const folderId = _gdCfg('folderId');
  const clientId = _gdCfg('clientId');
  if (!folderId || !clientId) return false;

  // GIS loads async — wait up to 4 s for it to become available
  if (!GoogleDriveStorage.isReady()) {
    const ready = await _waitForGis(4000);
    if (!ready) return false;
    GoogleDriveStorage.init(clientId);
    if (!GoogleDriveStorage.isReady()) return false;
  }

  // Attempt a silent token first; if that fails, try explicit auth (account picker).
  // This ensures new users (no prior token) still auto-load from Drive after welcome modal.
  if (!GoogleDriveStorage.isAuthorized()) {
    try {
      await GoogleDriveStorage.authorize({ prompt: '' });
    } catch(e) {
      try {
        await GoogleDriveStorage.authorize({ prompt: 'select_account' });
      } catch(e2) {
        // User cancelled or authorization unavailable
        return false;
      }
    }
  }

  // Try fetching tasks.json
  try {
    _showProgress('Loading from Google Drive…', 25);
    const raw = await GoogleDriveStorage.load(folderId, 'tasks.json');
    if (!raw) {
      // File doesn't exist yet — Drive is configured but no data pushed yet
      _hideProgress();
      return false;
    }

    _showProgress('Parsing data…', 60);
    const data = JSON.parse(raw);
    const rows = Array.isArray(data) ? data : (data.rows || []);
    if (!rows.length) { _hideProgress(); return false; }

    _rows = rows;
    _showProgress('Rendering app…', 85);
    await new Promise(r => setTimeout(r, 120));
    _launchApp({ fileName: 'Google Drive · tasks.json', sheetFound: true });
    return true;
  } catch(e) {
    _hideProgress();
    console.warn('[TTIS] Drive load failed:', e.message);
    return false;
  }
}

// Wait for Google Identity Services script to finish loading
function _waitForGis(ms) {
  return new Promise(resolve => {
    if (typeof google !== 'undefined' && google?.accounts?.oauth2) { resolve(true); return; }
    const start    = Date.now();
    const interval = setInterval(() => {
      if (typeof google !== 'undefined' && google?.accounts?.oauth2) {
        clearInterval(interval); resolve(true);
      } else if (Date.now() - start >= ms) {
        clearInterval(interval); resolve(false);
      }
    }, 100);
  });
}

// Read gdsync config from localStorage
function _gdCfg(key) {
  try { return JSON.parse(localStorage.getItem('TTIS_CONFIG') || '{}').gdsync?.[key] || ''; }
  catch(e) { return ''; }
}

// ── Toast ──────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 3800);
}
