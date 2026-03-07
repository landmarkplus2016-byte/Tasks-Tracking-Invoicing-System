/* ══════════════════════════════════════════════════════
   TTIS — app.js  |  App bootstrap, upload screen, routing
   ══════════════════════════════════════════════════════ */

'use strict';

// ── App state ─────────────────────────────────────────────
let _rows       = [];
let _activeTab  = 'dashboard';

// ── DOM refs (resolved after DOMContentLoaded) ────────────
let $uploadScreen, $appShell, $dropZone, $fileInput,
    $fileInfo, $fileName, $fileSize,
    $uploadProgress, $uploadProgressFill, $uploadProgressText,
    $uploadError, $dataBadge;

document.addEventListener('DOMContentLoaded', () => {
  $uploadScreen       = document.getElementById('uploadScreen');
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
  _bindUploadEvents();
  _bindTabEvents();
  _bindReloadBtn();
  _tryAutoConnect();
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

// ── Auto-connect on startup ────────────────────────────────
async function _tryAutoConnect() {
  try {
    const file = await Settings.autoConnect();
    if (file) {
      showToast('Auto-connecting via saved provider…', 'info');
      _loadFile(file);
    }
  } catch (err) {
    showToast(`Auto-connect failed: ${err.message}`, 'error');
  }
}

// ── Toast ──────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 3800);
}
