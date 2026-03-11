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
  Settings.init(_rows);

  // Show app
  setTimeout(() => {
    $uploadScreen.style.display = 'none';
    $appShell.style.display = 'block';
    _switchTab('dashboard');
    // Stamp sync time BEFORE SyncManager.init() so it reads the correct
    // value from localStorage and renders 'Synced today' straight away.
    // meta.savedAt is set when data came from Drive (uses the file's own
    // timestamp); for manual Excel uploads it is undefined so we use now.
    if (meta.savedAt) {
      SyncManager.markSyncedAt(meta.savedAt);
    } else {
      SyncManager.markSynced();
    }
    SyncManager.init();
    if (typeof LockManager !== 'undefined') LockManager.init();
    UserManager.applyAccess();
    showToast(`Loaded ${_rows.length.toLocaleString()} rows from "${meta.fileName}"`, 'success');
    // Write presence immediately so new users appear in the Users table
    // right away instead of waiting up to 5 minutes for the next heartbeat.
    UserManager.writePresence();
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
  const { loaded: driveLoaded, error: driveError } = await _tryLoadFromDrive();
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
    // Non-admin: show no-access screen with specific Drive error if available
    _showNoAccessScreen(driveError || null);
  }
}

// ── No-access screen (non-admin, Drive not ready) ──────────
function _showNoAccessScreen(msg) {
  _hideProgress();
  $uploadScreen.style.display = 'none';
  $noAccessScreen.style.display = 'flex';
  const msgEl = document.getElementById('noAccessMsg');
  if (msgEl) {
    if (msg) {
      msgEl.innerHTML = `<strong>Could not load data from Google Drive:</strong><br><code style="font-size:0.85em;word-break:break-all">${_esc(msg)}</code><br><br>Please try again or contact your Admin.`;
    } else {
      msgEl.innerHTML = 'Google Drive connection failed or was cancelled.<br>Please use the <strong>Retry Connection</strong> button to sign in again.';
    }
  }
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Retry Drive load (called from noAccessScreen button) ───
// Forces a full fresh OAuth flow so the user can pick a different account
// or re-consent after a scope change (drive.file → drive.readonly).
async function _retryDriveLoad() {
  $noAccessScreen.style.display = 'none';
  $uploadScreen.style.display = 'flex';
  _showProgress('Connecting to Google Drive…', 10);

  // Clear any stale token so we always show the account picker on retry
  if (typeof GoogleDriveStorage !== 'undefined') GoogleDriveStorage.reset();

  const { loaded, error } = await _tryLoadFromDrive({ forceAuth: true });
  if (!loaded) {
    _hideProgress();
    const isAdmin = typeof UserManager !== 'undefined' && UserManager.isAdmin();
    if (!isAdmin) _showNoAccessScreen(error || null);
    else if (error) showToast(error, 'error');
  }
}

// ── Load tasks.json from Google Drive Sync ─────────────────
// Returns { loaded: bool, error: string|null }
async function _tryLoadFromDrive(opts = {}) {
  const forceAuth = opts.forceAuth || false;

  if (typeof GoogleDriveStorage === 'undefined') return { loaded: false, error: 'GoogleDriveStorage not available' };

  const folderId = _gdCfg('folderId');
  const clientId = _gdCfg('clientId');
  console.log(`[TTIS] _tryLoadFromDrive — clientId: ${clientId ? clientId.slice(0,20)+'…' : '(none)'}, folderId: ${folderId}`);
  if (!folderId || !clientId) return { loaded: false, error: 'Drive not configured (no clientId or folderId)' };

  // GIS loads async — wait up to 4 s for it to become available
  if (!GoogleDriveStorage.isReady()) {
    _showProgress('Waiting for Google Identity Services…', 15);
    const ready = await _waitForGis(4000);
    if (!ready) return { loaded: false, error: 'Google Identity Services script did not load — check network' };
    GoogleDriveStorage.init(clientId);
    if (!GoogleDriveStorage.isReady()) return { loaded: false, error: 'Could not initialise Google Drive client — check the OAuth Client ID' };
  }

  // Auth flow:
  //   normal startup : silent first, then account-picker if silent fails
  //   forceAuth      : skip silent, go straight to account-picker
  if (!GoogleDriveStorage.isAuthorized()) {
    _showProgress('Waiting for Google sign-in…', 20);
    if (!forceAuth) {
      try {
        await GoogleDriveStorage.authorize({ prompt: '' });
        console.log('[TTIS] silent auth succeeded');
      } catch(e) {
        console.log('[TTIS] silent auth failed, trying account picker:', e.message);
        try {
          await GoogleDriveStorage.authorize({ prompt: 'select_account' });
          console.log('[TTIS] account-picker auth succeeded');
        } catch(e2) {
          return { loaded: false, error: null }; // user cancelled — no error message needed
        }
      }
    } else {
      try {
        await GoogleDriveStorage.authorize({ prompt: 'select_account' });
        console.log('[TTIS] forced account-picker auth succeeded');
      } catch(e2) {
        return { loaded: false, error: null }; // user cancelled
      }
    }
  }

  console.log('[TTIS] authorized — token present, fetching tasks.json from folder:', folderId);

  // Try fetching tasks.json
  try {
    _showProgress('Loading data from Google Drive…', 35);
    const raw = await GoogleDriveStorage.load(folderId, 'tasks.json');
    if (!raw) {
      // File found in search but empty, or not found at all
      return { loaded: false, error: 'tasks.json not found in the configured Drive folder. Has the Admin pushed data yet?' };
    }

    _showProgress('Parsing data…', 60);
    const data = JSON.parse(raw);
    const rows = Array.isArray(data) ? data : (data.rows || []);
    if (!rows.length) {
      return { loaded: false, error: 'tasks.json exists but contains no rows.' };
    }

    // Normalise region / sub_region / vendor to Title Case
    if (typeof normalizeRowFields !== 'undefined') normalizeRowFields(rows);

    _rows = rows;
    _showProgress('Rendering app…', 85);
    await new Promise(r => setTimeout(r, 120));
    _launchApp({ fileName: 'Google Drive · tasks.json', sheetFound: true, savedAt: data.savedAt || null });
    return { loaded: true, error: null };
  } catch(e) {
    _hideProgress();
    console.error('[TTIS] Drive load failed:', e.message);
    return { loaded: false, error: e.message };
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

// Read gdsync config from localStorage, falling back to DEFAULT_CONFIG for new users
function _gdCfg(key) {
  try {
    const saved = JSON.parse(localStorage.getItem('TTIS_CONFIG') || '{}').gdsync?.[key] || '';
    if (saved) return saved;
    // Fall back to hardcoded defaults so new users connect automatically
    if (key === 'clientId') return (typeof DEFAULT_CONFIG !== 'undefined' ? DEFAULT_CONFIG.oauthClientId : '') || '';
    if (key === 'folderId') return (typeof DEFAULT_CONFIG !== 'undefined' ? DEFAULT_CONFIG.driveFolderId : '') || '';
    return '';
  } catch(e) { return ''; }
}

// ── Toast ──────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 3800);
}
