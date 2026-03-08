/* ══════════════════════════════════════════════════════
   TTIS — settings.js  |  Settings tab: storage providers,
                          DB export/import, auto-connect
   ══════════════════════════════════════════════════════ */

'use strict';

const Settings = (() => {

  const CONFIG_KEY = 'TTIS_CONFIG';

  let _cfg = {
    provider:    'local',
    dropbox:     { token: '', path: '' },
    googledrive: { apiKey: '', fileId: '' },
    gdsync:      { clientId: '', folderId: '1A4vBy6B-78FX9voZsu4bYGEPaBpKpLDu' }
  };

  let _rows = [];

  // ── Public: init ───────────────────────────────────────
  function init(rows) {
    _rows = rows;
    _loadConfig();
    ImportManager.init(rows);
    // Re-init Drive storage client in case clientId was loaded from config
    if (_cfg.gdsync.clientId) GoogleDriveStorage.init(_cfg.gdsync.clientId);
    _render();
  }

  // ── Public: auto-connect on startup ───────────────────
  // Returns a File object if provider has saved credentials, null otherwise.
  async function autoConnect() {
    _loadConfig();
    if (_cfg.provider === 'local') return null;

    try {
      if (_cfg.provider === 'dropbox')     return await _fetchDropbox();
      if (_cfg.provider === 'googledrive') return await _fetchGoogleDrive();
    } catch (err) {
      // surfaced to caller
      throw err;
    }
    return null;
  }

  // ── Config helpers ─────────────────────────────────────
  function _loadConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      _cfg = {
        provider:    saved.provider    || 'local',
        dropbox:     { ..._cfg.dropbox,     ...(saved.dropbox     || {}) },
        googledrive: { ..._cfg.googledrive, ...(saved.googledrive || {}) },
        gdsync:      { ..._cfg.gdsync,      ...(saved.gdsync      || {}) }
      };
    } catch (e) { /* corrupt storage — ignore */ }
  }

  function _saveConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(_cfg));
  }

  // ── Render ─────────────────────────────────────────────
  function _render() {
    const sec = document.getElementById('sec-settings');
    if (!sec) return;

    sec.innerHTML = `
      <div class="stg-wrap">

        <!-- Storage Provider card -->
        <div class="stg-card">
          <div class="stg-card-header">
            <div class="stg-card-title">Storage Provider</div>
            <div class="stg-card-sub">Where TTIS auto-fetches your tracking file from on startup</div>
          </div>

          <div class="stg-provider-row">
            ${_providerBtn('local',       'Local File',   '&#128190;', 'Upload manually each session')}
            ${_providerBtn('dropbox',     'Dropbox',      '&#128230;', 'Auto-fetch from Dropbox')}
            ${_providerBtn('googledrive', 'Google Drive', '&#128193;', 'Auto-fetch from Google Drive')}
          </div>

          <div id="stgFields" class="stg-fields">${_fieldsHtml()}</div>

          <div class="stg-actions">
            <button class="stg-btn stg-btn-test" id="stgTestBtn">Test Connection</button>
            <div class="stg-test-result" id="stgTestResult"></div>
            <div style="flex:1"></div>
            <button class="stg-btn stg-btn-save" id="stgSaveBtn">Save &amp; Apply</button>
          </div>
        </div>

        <!-- Database card -->
        <div class="stg-card">
          <div class="stg-card-header">
            <div class="stg-card-title">Database</div>
            <div class="stg-card-sub">Export or restore all loaded task rows as a JSON snapshot</div>
          </div>
          <div class="stg-db-row">
            <div class="stg-db-stat">
              <div class="stg-db-count">${_rows.length.toLocaleString()}</div>
              <div class="stg-db-label">rows currently loaded</div>
            </div>
            <div class="stg-db-btns">
              <button class="stg-btn stg-btn-export" id="stgExportBtn">&#8595; Export Database</button>
              <button class="stg-btn stg-btn-import" id="stgImportBtn">&#8593; Import Database</button>
              <input type="file" id="stgImportInput" accept=".json" style="display:none">
              <button class="stg-btn stg-btn-reset" id="stgResetBtn">&#128465; Reset Database</button>
            </div>
          </div>
        </div>

        <!-- Exclusion List card -->
        <div class="stg-card">
          <div class="stg-card-header">
            <div class="stg-card-title">Exclusion List</div>
            <div class="stg-card-sub">Task IDs in this list are silently skipped during every PC Tracking import</div>
          </div>
          <div class="stg-db-row">
            <div class="stg-db-stat">
              <div class="stg-db-count" id="stgExclCount">${ImportManager.getExcludedCount().toLocaleString()}</div>
              <div class="stg-db-label">IDs currently excluded</div>
            </div>
            <div class="stg-db-btns">
              <button class="stg-btn stg-btn-import" id="stgExclUploadBtn">&#8593; Upload Exclusion List</button>
              <input type="file" id="stgExclInput" accept=".xlsx,.xlsm" style="display:none">
            </div>
          </div>
          <div class="stg-field-hint" style="padding:0 20px 14px">
            Upload any Excel file with a column headed <strong>ID#</strong> or <strong>ID</strong>.
            All values in that column will be added to the exclusion set and stored in localStorage.
          </div>
        </div>

        <!-- Google Drive Sync card -->
        <div class="stg-card">
          <div class="stg-card-header">
            <div class="stg-card-title">Google Drive Sync</div>
            <div class="stg-card-sub">Push tasks.json &amp; settings.json to a shared Drive folder on demand</div>
          </div>
          ${_gdSyncCardHtml()}
        </div>

        <!-- Price List card -->
        <div class="stg-card">
          <div class="stg-card-header">
            <div class="stg-card-title">Price List</div>
            <div class="stg-card-sub">Versioned price list used to calculate Total Price for each task row</div>
          </div>
          ${_plCardHtml()}
        </div>

        <!-- Users card -->
        <div class="stg-card">
          <div class="stg-card-header">
            <div class="stg-card-title">Users</div>
            <div class="stg-card-sub">All users who have ever logged in — change roles or update your own identity</div>
          </div>
          <div id="stgUsersCard">${_usersCardHtml([])}</div>
        </div>

        <!-- Stored config preview card -->
        <div class="stg-card">
          <div class="stg-card-header">
            <div class="stg-card-title">Stored Config</div>
            <div class="stg-card-sub">Current TTIS_CONFIG in localStorage (secrets masked)</div>
          </div>
          <pre class="stg-config-preview" id="stgConfigPreview">${_configPreview()}</pre>
        </div>

      </div>`;

    _bindEvents();
    // Async: populate users card after render
    _refreshUsersCard();
  }

  function _providerBtn(id, label, icon, hint) {
    const active = _cfg.provider === id ? ' active' : '';
    return `<button class="stg-provider-btn${active}" data-provider="${id}">
      <span class="stg-provider-icon">${icon}</span>
      <span class="stg-provider-label">${label}</span>
      <span class="stg-provider-hint">${hint}</span>
    </button>`;
  }

  function _fieldsHtml() {
    if (_cfg.provider === 'dropbox') {
      return `
        <div class="stg-field-group">
          <label class="stg-label">Access Token</label>
          <input class="stg-input" id="stgDbxToken" type="password"
            placeholder="sl.xxxxxxxxxxxx…" value="${_esc(_cfg.dropbox.token)}">
          <div class="stg-field-hint">
            Generate at <strong>dropbox.com/developers</strong> &rarr; App Console &rarr; Generated Access Token
          </div>
        </div>
        <div class="stg-field-group">
          <label class="stg-label">File Path in Dropbox</label>
          <input class="stg-input" id="stgDbxPath" type="text"
            placeholder="/LMP/Tracking File.xlsm" value="${_esc(_cfg.dropbox.path)}">
          <div class="stg-field-hint">Full path from Dropbox root, including file name and extension</div>
        </div>`;
    }

    if (_cfg.provider === 'googledrive') {
      return `
        <div class="stg-field-group">
          <label class="stg-label">API Key</label>
          <input class="stg-input" id="stgGdKey" type="password"
            placeholder="AIzaSy…" value="${_esc(_cfg.googledrive.apiKey)}">
          <div class="stg-field-hint">
            Create at <strong>console.cloud.google.com</strong> &rarr; Credentials &rarr; API Key
            (restrict to Drive API). File must be set to "Anyone with the link can view".
          </div>
        </div>
        <div class="stg-field-group">
          <label class="stg-label">File ID</label>
          <input class="stg-input" id="stgGdFileId" type="text"
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            value="${_esc(_cfg.googledrive.fileId)}">
          <div class="stg-field-hint">
            From the share URL: drive.google.com/file/d/<strong>FILE_ID</strong>/view
          </div>
        </div>`;
    }

    // local
    return `<div class="stg-local-note">
      No credentials needed &mdash; upload your Excel file manually each session via the main upload screen.
    </div>`;
  }

  // ── Google Drive Sync card ─────────────────────────────
  function _gdSyncCardHtml() {
    const { clientId, folderId } = _cfg.gdsync;
    const authStatus = GoogleDriveStorage.isAuthorized()
      ? '<span class="stg-auth-badge stg-auth-ok">&#10003; Authorized</span>'
      : '<span class="stg-auth-badge stg-auth-pending">Not authorized</span>';

    return `
      <div class="stg-fields">
        <div class="stg-field-group">
          <label class="stg-label">OAuth2 Client ID</label>
          <input class="stg-input" id="stgGdClientId" type="text"
            placeholder="xxxxxxxxxx.apps.googleusercontent.com"
            value="${_esc(clientId)}">
          <div class="stg-field-hint">
            Create at <strong>console.cloud.google.com</strong> &rarr; Credentials &rarr; OAuth 2.0 Client ID
            (Web application). Add your app's origin to Authorised JavaScript Origins.
          </div>
        </div>
        <div class="stg-field-group">
          <label class="stg-label">Drive Folder ID</label>
          <input class="stg-input" id="stgGdFolderId" type="text"
            placeholder="1A4vBy6B-78FX9voZsu4bYGEPaBpKpLDu"
            value="${_esc(folderId)}">
          <div class="stg-field-hint">
            From the folder URL: drive.google.com/drive/folders/<strong>FOLDER_ID</strong>.
            Share the folder with the account you will authorize with.
          </div>
        </div>
      </div>
      <div class="stg-gd-action-row">
        <div class="stg-gd-left">
          <button class="stg-btn stg-btn-save" id="stgGdSaveCfgBtn">Save Config</button>
          <button class="stg-btn stg-btn-test" id="stgGdAuthBtn">Authorize</button>
          <button class="stg-btn stg-btn-test" id="stgGdTestBtn">Test Connection</button>
          <div class="stg-test-result" id="stgGdTestResult"></div>
        </div>
        <div class="stg-gd-right">
          <div class="stg-gd-auth-status">${authStatus}</div>
          <button class="stg-btn stg-btn-gdsave" id="stgGdSaveBtn">&#8679; Save Data to Drive</button>
        </div>
      </div>
      <div class="stg-gd-save-status" id="stgGdSaveStatus"></div>`;
  }

  function _saveGdSyncConfig() {
    _cfg.gdsync.clientId  = (document.getElementById('stgGdClientId')?.value  || '').trim();
    _cfg.gdsync.folderId  = (document.getElementById('stgGdFolderId')?.value  || '').trim();
    _saveConfig();
    GoogleDriveStorage.init(_cfg.gdsync.clientId);
    showToast('Google Drive config saved', 'success');
    // Refresh auth badge
    const badge = document.querySelector('.stg-gd-auth-status');
    if (badge) badge.innerHTML = GoogleDriveStorage.isAuthorized()
      ? '<span class="stg-auth-badge stg-auth-ok">&#10003; Authorized</span>'
      : '<span class="stg-auth-badge stg-auth-pending">Not authorized</span>';
  }

  async function _gdAuthorize() {
    const clientId = (document.getElementById('stgGdClientId')?.value || '').trim();
    if (!clientId) { showToast('Enter a Client ID first', 'error'); return; }
    _cfg.gdsync.clientId = clientId;
    GoogleDriveStorage.init(clientId);

    const btn    = document.getElementById('stgGdAuthBtn');
    const badge  = document.querySelector('.stg-gd-auth-status');
    if (btn) { btn.disabled = true; btn.textContent = 'Authorizing…'; }

    try {
      await GoogleDriveStorage.authorize();
      if (badge) badge.innerHTML = '<span class="stg-auth-badge stg-auth-ok">&#10003; Authorized</span>';
      showToast('Google Drive authorized', 'success');
    } catch (err) {
      if (badge) badge.innerHTML = '<span class="stg-auth-badge stg-auth-error">&#10005; Failed</span>';
      showToast('Authorization failed: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Authorize'; }
    }
  }

  async function _gdTestConnection() {
    const resEl    = document.getElementById('stgGdTestResult');
    const btn      = document.getElementById('stgGdTestBtn');
    const folderId = (document.getElementById('stgGdFolderId')?.value || '').trim();

    if (!GoogleDriveStorage.isAuthorized()) {
      _setResult(resEl, 'error', 'Authorize first before testing');
      return;
    }
    btn.disabled = true; btn.textContent = 'Testing…';
    _setResult(resEl, 'loading', 'Checking folder…');

    try {
      const meta = await GoogleDriveStorage.testConnection(folderId);
      _setResult(resEl, 'ok', `Folder "${meta.name}" is accessible`);
    } catch (err) {
      _setResult(resEl, 'error', err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Test Connection';
    }
  }

  async function _saveToGDrive() {
    const folderId = (_cfg.gdsync.folderId || '').trim();
    const clientId = (_cfg.gdsync.clientId || '').trim();
    if (!clientId)  { showToast('Set and save a Client ID first', 'error');  return; }
    if (!folderId)  { showToast('Set and save a Folder ID first', 'error');  return; }

    const btn      = document.getElementById('stgGdSaveBtn');
    const statusEl = document.getElementById('stgGdSaveStatus');

    btn.disabled = true; btn.textContent = 'Saving…';
    _setGdStatus(statusEl, 'loading', 'Preparing…');

    try {
      // Authorize if needed (opens popup)
      if (!GoogleDriveStorage.isAuthorized()) {
        _setGdStatus(statusEl, 'loading', 'Waiting for Google authorization…');
        await GoogleDriveStorage.authorize();
        const badge = document.querySelector('.stg-gd-auth-status');
        if (badge) badge.innerHTML = '<span class="stg-auth-badge stg-auth-ok">&#10003; Authorized</span>';
      }

      // Build tasks payload
      _setGdStatus(statusEl, 'loading', 'Uploading tasks.json…');
      const tasksPayload = JSON.stringify(
        { savedAt: new Date().toISOString(), rowCount: _rows.length, rows: _rows },
        null, 2
      );
      await GoogleDriveStorage.save(folderId, 'tasks.json', tasksPayload);

      // Build settings payload (secrets masked)
      _setGdStatus(statusEl, 'loading', 'Uploading settings.json…');
      const cfgCopy = JSON.parse(JSON.stringify(_cfg));
      if (cfgCopy.dropbox?.token)      cfgCopy.dropbox.token      = '••••••••';
      if (cfgCopy.googledrive?.apiKey) cfgCopy.googledrive.apiKey = '••••••••';
      const settingsPayload = JSON.stringify(
        { savedAt: new Date().toISOString(), config: cfgCopy },
        null, 2
      );
      await GoogleDriveStorage.save(folderId, 'settings.json', settingsPayload);

      const ts = new Date().toLocaleString();
      _setGdStatus(statusEl, 'ok', `Saved at ${ts} — ${_rows.length.toLocaleString()} rows`);
      showToast(`Data saved to Google Drive (${_rows.length.toLocaleString()} rows)`, 'success');
    } catch (err) {
      _setGdStatus(statusEl, 'error', err.message);
      showToast('Drive save failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '\u21B9 Save Data to Drive';
    }
  }

  function _setGdStatus(el, state, msg) {
    if (!el) return;
    el.className   = `stg-gd-save-status stg-gd-status-${state}`;
    el.textContent = msg;
  }

  // ── Price List card ────────────────────────────────────
  function _plCardHtml() {
    const versions = PriceList.getVersions();
    const latest   = PriceList.getLatestVersion();
    const items    = latest ? latest.items : [];

    const versionsHtml = versions.slice().reverse().map(v => `
      <div class="pl-ver-row${v.version === latest.version ? ' pl-ver-current' : ''}">
        <span class="pl-ver-badge">v${v.version}</span>
        <span class="pl-ver-date">Eff. ${_esc(v.effectiveDate)}</span>
        <span class="pl-ver-uploaded">Uploaded ${_esc(v.uploadDate)}</span>
        <span class="pl-ver-items">${v.items.length} items</span>
        ${v.version === latest.version ? '<span class="pl-ver-tag">Active</span>' : ''}
      </div>`).join('');

    return `
      <div class="stg-db-row">
        <div class="stg-db-stat">
          <div class="stg-db-count">v${latest ? latest.version : '—'}</div>
          <div class="stg-db-label">active price list (${items.length} items, eff. ${latest ? latest.effectiveDate : '—'})</div>
        </div>
        <div class="stg-db-btns">
          <button class="stg-btn stg-btn-import" id="stgPlUploadBtn">&#8593; Upload New Price List</button>
          <input type="file" id="stgPlInput" accept=".xlsx,.xlsm,.xls" style="display:none">
          <button class="stg-btn stg-btn-export" id="stgPlRecalcBtn">&#8635; Recalculate Prices</button>
        </div>
      </div>
      <div class="pl-ver-list" id="plVerList">${versionsHtml}</div>
      <div class="stg-field-hint" style="padding:0 20px 14px">
        Upload a price list Excel with columns: <strong>Code</strong>, <strong>Description</strong>, <strong>Unit Price</strong>, <strong>Unit</strong>.
        Set an effective date — rows with task dates on or after that date will use the new prices.
      </div>`;
  }

  function _refreshPlCard() {
    const card = document.getElementById('plVerList');
    if (!card) return;
    const versions = PriceList.getVersions();
    const latest   = PriceList.getLatestVersion();
    card.innerHTML = versions.slice().reverse().map(v => `
      <div class="pl-ver-row${v.version === latest.version ? ' pl-ver-current' : ''}">
        <span class="pl-ver-badge">v${v.version}</span>
        <span class="pl-ver-date">Eff. ${_esc(v.effectiveDate)}</span>
        <span class="pl-ver-uploaded">Uploaded ${_esc(v.uploadDate)}</span>
        <span class="pl-ver-items">${v.items.length} items</span>
        ${v.version === latest.version ? '<span class="pl-ver-tag">Active</span>' : ''}
      </div>`).join('');
  }

  // ── Price preview modal ────────────────────────────────
  function _showPricePreview(items, file) {
    document.getElementById('stgPlPreviewOverlay')?.remove();

    const preview  = PriceList.getPricePreview(items);
    const newCount = preview.filter(p => p.status === 'new').length;
    const incCount = preview.filter(p => p.status === 'increase').length;
    const decCount = preview.filter(p => p.status === 'decrease').length;
    const remCount = preview.filter(p => p.status === 'removed').length;
    const unchCount= preview.filter(p => p.status === 'unchanged').length;

    const rows = preview.map(p => {
      const cls = `pl-row-${p.status}`;
      const changeStr = p.change !== null
        ? (p.change > 0 ? `+${p.change.toLocaleString()}` : p.change.toLocaleString())
        : '';
      const oldStr = p.oldPrice !== null ? `EGP ${p.oldPrice.toLocaleString()}` : '—';
      return `<tr class="${cls}">
        <td>${_esc(p.code)}</td>
        <td>${_esc(p.description)}</td>
        <td style="text-align:right">EGP ${p.unitPrice.toLocaleString()}</td>
        <td style="text-align:right">${oldStr}</td>
        <td style="text-align:right">${changeStr}</td>
        <td>${_esc(p.unit)}</td>
        <td><span class="pl-status-tag pl-tag-${p.status}">${p.status}</span></td>
      </tr>`;
    }).join('');

    const today = new Date();
    const defaultDate = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

    const overlay = document.createElement('div');
    overlay.id = 'stgPlPreviewOverlay';
    overlay.className = 'stg-reset-overlay';
    overlay.innerHTML = `
      <div class="stg-reset-dialog pl-preview-dialog">
        <div class="stg-reset-title">Price List Preview — ${_esc(file.name)}</div>
        <div class="pl-preview-stats">
          <span class="pl-stat-tag pl-tag-new">+${newCount} New</span>
          <span class="pl-stat-tag pl-tag-increase">&#8593;${incCount} Increase</span>
          <span class="pl-stat-tag pl-tag-decrease">&#8595;${decCount} Decrease</span>
          <span class="pl-stat-tag pl-tag-removed">${remCount} Removed</span>
          <span class="pl-stat-tag pl-tag-unchanged">${unchCount} Unchanged</span>
        </div>
        <div class="pl-eff-row">
          <label class="stg-label">Effective Date</label>
          <input class="stg-input pl-eff-input" id="plEffDate"
                 placeholder="DD/MM/YYYY" value="${defaultDate}" maxlength="10">
          <div class="stg-field-hint">Tasks with a date on or after this will use the new prices.</div>
        </div>
        <div class="pl-preview-table-wrap">
          <table class="pl-preview-tbl">
            <thead>
              <tr><th>Code</th><th>Description</th><th>New Price</th><th>Old Price</th><th>Change</th><th>Unit</th><th>Status</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="stg-reset-actions">
          <button class="stg-btn" id="stgPlPreviewCancel">Cancel</button>
          <button class="stg-btn stg-btn-save" id="stgPlPreviewConfirm">Apply Price List</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#stgPlPreviewCancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#stgPlPreviewConfirm').addEventListener('click', () => {
      const effDate = (document.getElementById('plEffDate')?.value || '').trim();
      if (!effDate) { showToast('Please enter an effective date', 'error'); return; }
      const vNum = PriceList.addVersion(items, effDate);
      _refreshPlCard();
      overlay.remove();
      showToast(`Price list v${vNum} saved (effective ${effDate})`, 'success');
    });
  }

  // ── Recalculate dialog ─────────────────────────────────
  function _showRecalcDialog() {
    if (!_rows.length) { showToast('No data loaded', 'error'); return; }
    document.getElementById('stgRecalcOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'stgRecalcOverlay';
    overlay.className = 'stg-reset-overlay';
    overlay.innerHTML = `
      <div class="stg-reset-dialog">
        <div class="stg-reset-title">&#8635; Recalculate Prices</div>
        <div class="stg-reset-msg">Choose which tasks to recalculate using the current versioned price list.</div>
        <div class="pl-recalc-opts">
          <label class="pl-recalc-opt">
            <input type="radio" name="recalcMode" value="new" checked>
            <div>
              <strong>New tasks only</strong>
              <div class="stg-field-hint">Only rows that have not yet been priced (no stored price version)</div>
            </div>
          </label>
          <label class="pl-recalc-opt">
            <input type="radio" name="recalcMode" value="all">
            <div>
              <strong>All tasks</strong>
              <div class="stg-field-hint">Recalculate every row — existing prices will be updated</div>
            </div>
          </label>
        </div>
        <div class="stg-reset-actions">
          <button class="stg-btn" id="stgRecalcCancel">Cancel</button>
          <button class="stg-btn stg-btn-save" id="stgRecalcConfirm">Recalculate</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#stgRecalcCancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#stgRecalcConfirm').addEventListener('click', () => {
      const mode = overlay.querySelector('input[name="recalcMode"]:checked')?.value || 'new';
      const { updatedCount } = PriceList.recalculateTasks(_rows, mode);

      // Re-render all sections with updated rows
      buildDashboard(_rows);
      Tasks.init(_rows);
      Invoicing.init(_rows);
      Readiness.init(_rows);

      overlay.remove();
      showToast(`Recalculated prices for ${updatedCount.toLocaleString()} task${updatedCount !== 1 ? 's' : ''}`, 'success');
    });
  }

  // ── Permissions definitions ────────────────────────────
  const PERM_DEFS = [
    { icon: '⚙',  label: 'Settings',      admin: true,  editor: false, viewer: false },
    { icon: '↑',  label: 'Import PC',      admin: true,  editor: false, viewer: false },
    { icon: '↺',  label: 'Load File',      admin: true,  editor: false, viewer: false },
    { icon: '↻',  label: 'Force Refresh',  admin: true,  editor: true,  viewer: false },
    { icon: '✏',  label: 'Edit Tasks',     admin: true,  editor: true,  viewer: false },
    { icon: '👥', label: 'Manage Users',   admin: true,  editor: false, viewer: false },
  ];

  function _permGrid(role) {
    return '<div class="perm-grid">' + PERM_DEFS.map(p => {
      const has = role === 'Admin' ? p.admin : role === 'Editor' ? p.editor : p.viewer;
      return `<span class="perm-cell perm-cell-${has ? 'yes' : 'no'}" title="${_esc(p.label)}">${p.icon}</span>`;
    }).join('') + '</div>';
  }

  // ── Users card ─────────────────────────────────────────
  function _usersCardHtml(users) {
    const isAdmin = typeof UserManager !== 'undefined' && UserManager.isAdmin();
    const me      = typeof UserManager !== 'undefined' ? UserManager.getUser() : null;

    const rows = users.length ? users.map(u => {
      const isSelf    = me && u.name === me.name;
      const isPending = !!u._invited;
      const lastCell  = isPending
        ? '<span class="stg-invite-tag">Pending Invite</span>'
        : (u.lastActive ? new Date(u.lastActive).toLocaleString() : '—');
      const roleBadge = `<span class="stg-role-badge stg-role-${(u.role||'').toLowerCase()}">${_esc(u.role||'')}</span>`;

      let actionHtml = '';
      if (isPending) {
        actionHtml = `<button class="stg-btn stg-invite-revoke" data-name="${_esc(u.name)}">Revoke</button>`;
      } else if (isAdmin) {
        actionHtml = `
          <button class="stg-btn stg-btn-perms" data-name="${_esc(u.name)}">Edit Permissions</button>
          ${!isSelf ? `<button class="stg-users-delete" data-name="${_esc(u.name)}" title="Remove ${_esc(u.name)} from the system">\u2715</button>` : ''}`;
      }

      return `<tr class="${isSelf ? 'stg-users-self' : ''}${isPending ? ' stg-users-pending' : ''}">
        <td>${_esc(u.name)}${isSelf ? ' <span class="stg-users-you">You</span>' : ''}${isPending ? ' <span class="stg-users-you" style="background:rgba(217,119,6,.15);color:#d97706">Invited</span>' : ''}</td>
        <td>${roleBadge}</td>
        <td>${_permGrid(u.role || 'Viewer')}</td>
        <td class="stg-users-last">${lastCell}</td>
        <td class="stg-users-action-cell">${actionHtml}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" class="stg-users-empty">No users recorded yet</td></tr>`;

    return `
      <div class="stg-users-wrap">
        <div class="stg-users-actions">
          <button class="stg-btn stg-btn-test" id="stgUsersRefreshBtn">&#8635; Refresh</button>
          <button class="stg-btn stg-btn-save" id="stgUsersChangeBtn" onclick="UserManager.showChangeIdentityModal()">&#9997; Change My Name/Role</button>
          ${isAdmin ? '<button class="stg-btn stg-btn-import" id="stgAddUserBtn">&#43; Add User</button>' : ''}
        </div>

        <div class="stg-invite-form" id="stgInviteForm" style="display:none">
          <div class="stg-invite-row">
            <input class="stg-input stg-invite-name" id="stgInvName" type="text" placeholder="Full name of new user" autocomplete="off">
            <select class="stg-users-role-sel" id="stgInvRole">
              <option value="Admin">Admin</option>
              <option value="Editor">Editor</option>
              <option value="Viewer" selected>Viewer</option>
            </select>
            <button class="stg-btn stg-btn-save" id="stgInvAddBtn">Add</button>
            <button class="stg-btn" id="stgInvCancelBtn">Cancel</button>
          </div>
          <div class="stg-field-hint" style="margin:6px 0 0">
            When this person opens TTIS and enters the same name, they will automatically receive the pre-assigned role.
          </div>
        </div>

        <table class="stg-users-tbl">
          <thead><tr><th>Name</th><th>Role</th><th>Permissions</th><th>Last Active</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  async function _refreshUsersCard() {
    const el = document.getElementById('stgUsersCard');
    if (!el) return;
    const users = typeof UserManager !== 'undefined' ? await UserManager.getAllUsers() : [];
    el.innerHTML = _usersCardHtml(users);
    _bindUsersCardEvents();
  }

  function _bindUsersCardEvents() {
    document.getElementById('stgUsersRefreshBtn')?.addEventListener('click', _refreshUsersCard);

    // Add user / invite flow
    document.getElementById('stgAddUserBtn')?.addEventListener('click', () => {
      const form = document.getElementById('stgInviteForm');
      if (form) { form.style.display = 'block'; document.getElementById('stgInvName')?.focus(); }
    });
    document.getElementById('stgInvCancelBtn')?.addEventListener('click', () => {
      const form = document.getElementById('stgInviteForm');
      if (form) { form.style.display = 'none'; document.getElementById('stgInvName').value = ''; }
    });
    document.getElementById('stgInvAddBtn')?.addEventListener('click', async () => {
      const name = (document.getElementById('stgInvName')?.value || '').trim();
      const role = document.getElementById('stgInvRole')?.value || 'Viewer';
      if (!name) { showToast('Enter the new user\'s full name', 'error'); return; }
      await UserManager.createInvite(name, role);
      document.getElementById('stgInviteForm').style.display = 'none';
      document.getElementById('stgInvName').value = '';
      showToast(`Invite created for ${name} (${role})`, 'success');
      _refreshUsersCard();
    });

    // Revoke invite buttons
    document.querySelectorAll('.stg-invite-revoke').forEach(btn => {
      btn.addEventListener('click', async () => {
        await UserManager.revokeInvite(btn.dataset.name);
        showToast(`Invite for ${btn.dataset.name} revoked`, 'success');
        _refreshUsersCard();
      });
    });

    // Delete user buttons
    document.querySelectorAll('.stg-users-delete').forEach(btn => {
      btn.addEventListener('click', () => _showDeleteUserDialog(btn.dataset.name));
    });

    // Edit permissions buttons
    document.querySelectorAll('.stg-btn-perms').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name  = btn.dataset.name;
        const users = typeof UserManager !== 'undefined' ? await UserManager.getAllUsers() : [];
        const u     = users.find(x => x.name === name) || { name, role: 'Viewer' };
        _showPermissionsModal(u.name, u.role, u.permissions || null);
      });
    });
  }

  // ── Delete user confirmation dialog ────────────────────
  function _showDeleteUserDialog(name) {
    document.getElementById('stgDeleteUserOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'stgDeleteUserOverlay';
    overlay.className = 'stg-reset-overlay';
    overlay.innerHTML = `
      <div class="stg-reset-dialog">
        <div class="stg-reset-title">Remove User</div>
        <div class="stg-reset-msg">
          Remove <strong>${_esc(name)}</strong> from the system?<br><br>
          They will be asked to register again on next visit.
        </div>
        <div class="stg-reset-actions">
          <button class="stg-btn" id="stgDelUserCancel">Cancel</button>
          <button class="stg-btn stg-btn-reset-confirm" id="stgDelUserConfirm">Remove User</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('#stgDelUserCancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#stgDelUserConfirm').addEventListener('click', async () => {
      await UserManager.deleteUser(name);
      overlay.remove();
      showToast(`${name} removed from the system`, 'success');
      _refreshUsersCard();
    });
  }

  // ── Permissions editor modal ────────────────────────────
  function _showPermissionsModal(userName, userRole, currentPerms) {
    document.getElementById('stgPermsModal')?.remove();

    const TAB_DEFS = [
      { key: 'dashboard', label: 'Dashboard',        adminOnly: false },
      { key: 'tasks',     label: 'Tasks',             adminOnly: false },
      { key: 'invoicing', label: 'Invoicing',         adminOnly: false },
      { key: 'readiness', label: 'Invoice Readiness', adminOnly: false },
      { key: 'settings',  label: 'Settings',          adminOnly: true  },
    ];
    const FIELD_DEFS = [
      { key: 'taskInfo',   label: 'Task Info',         hint: 'Status, Comments, Task Date',                    adminOnly: false },
      { key: 'financial',  label: 'Financial Fields',  hint: 'Prices, Amounts, PO Status',                    adminOnly: false },
      { key: 'acceptance', label: 'Acceptance Fields', hint: 'Acceptance Status, FAC Date, Certificate',      adminOnly: false },
      { key: 'invoicing',  label: 'Invoicing Fields',  hint: 'TSR, PO Number, VF Invoice, Receiving amounts', adminOnly: false },
      { key: 'allFields',  label: 'All Fields',        hint: 'Full edit access — overrides all above',        adminOnly: true  },
    ];

    const isAdmin  = userRole === 'Admin';
    const isEditor = userRole === 'Editor';

    // Merge saved permissions over role defaults
    const defTabs   = { dashboard: true, tasks: true, invoicing: true, readiness: true, settings: isAdmin };
    const defFields = { taskInfo: isAdmin||isEditor, financial: isAdmin, acceptance: isAdmin||isEditor, invoicing: isAdmin||isEditor, allFields: isAdmin };
    const tabs   = { ...defTabs,   ...(currentPerms?.tabs   || {}) };
    const fields = { ...defFields, ...(currentPerms?.fields || {}) };

    const tabChecks = TAB_DEFS.map(t => {
      const locked  = t.adminOnly;
      const checked = locked ? isAdmin : (tabs[t.key] !== false);
      const tag     = locked ? ' <span class="perms-admin-only">Admin only</span>' : '';
      return `<label class="perms-check-row${locked ? ' perms-disabled' : ''}">
        <input type="checkbox" name="tab_${t.key}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}>
        <span class="perms-check-label">${_esc(t.label)}${tag}</span>
      </label>`;
    }).join('');

    const fieldChecks = FIELD_DEFS.map(f => {
      const locked  = f.adminOnly;
      const checked = locked ? isAdmin : (fields[f.key] === true);
      const tag     = locked ? ' <span class="perms-admin-only">Admin only</span>' : '';
      return `<label class="perms-check-row${locked ? ' perms-disabled' : ''}">
        <input type="checkbox" name="field_${f.key}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}>
        <div class="perms-check-info">
          <span class="perms-check-label">${_esc(f.label)}${tag}</span>
          <span class="perms-check-hint">${_esc(f.hint)}</span>
        </div>
      </label>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'stgPermsModal';
    modal.className = 'stg-reset-overlay';
    modal.innerHTML = `
      <div class="stg-reset-dialog stg-perms-dialog">
        <div class="stg-reset-title">Edit Permissions &mdash; ${_esc(userName)}</div>
        <div class="stg-perms-role-row">
          Role: <span class="stg-role-badge stg-role-${(userRole||'').toLowerCase()}">${_esc(userRole||'')}</span>
        </div>
        <div class="stg-perms-section">
          <div class="stg-perms-section-title">Tab Access</div>
          ${tabChecks}
        </div>
        <div class="stg-perms-section">
          <div class="stg-perms-section-title">Field Editing</div>
          ${fieldChecks}
        </div>
        <div class="stg-reset-actions">
          <button class="stg-btn" id="stgPermsCancel">Cancel</button>
          <button class="stg-btn stg-btn-save" id="stgPermsSave">Save Permissions</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.querySelector('#stgPermsCancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#stgPermsSave').addEventListener('click', async () => {
      const newPerms = { tabs: {}, fields: {} };
      TAB_DEFS.forEach(t => {
        newPerms.tabs[t.key] = t.adminOnly
          ? isAdmin
          : !!(modal.querySelector(`[name="tab_${t.key}"]`)?.checked);
      });
      FIELD_DEFS.forEach(f => {
        newPerms.fields[f.key] = f.adminOnly
          ? isAdmin
          : !!(modal.querySelector(`[name="field_${f.key}"]`)?.checked);
      });
      await UserManager.saveUserPermissions(userName, newPerms);
      modal.remove();
      showToast(`Permissions saved for ${userName}`, 'success');
      _refreshUsersCard();
    });
  }

  // ── Event binding ──────────────────────────────────────
  function _bindEvents() {
    const sec = document.getElementById('sec-settings');

    // Provider buttons
    sec.querySelectorAll('.stg-provider-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _cfg.provider = btn.dataset.provider;
        sec.querySelectorAll('.stg-provider-btn').forEach(b =>
          b.classList.toggle('active', b === btn));
        document.getElementById('stgFields').innerHTML = _fieldsHtml();
        _bindFieldSync();
      });
    });

    _bindFieldSync();

    document.getElementById('stgTestBtn').addEventListener('click', _testConnection);
    document.getElementById('stgSaveBtn').addEventListener('click', _saveApply);
    document.getElementById('stgExportBtn').addEventListener('click', _exportDb);
    document.getElementById('stgResetBtn').addEventListener('click', _showResetDialog);
    document.getElementById('stgImportBtn').addEventListener('click', () =>
      document.getElementById('stgImportInput').click());
    document.getElementById('stgImportInput').addEventListener('change', e =>
      _onImportFile(e.target));

    document.getElementById('stgExclUploadBtn')?.addEventListener('click', () =>
      document.getElementById('stgExclInput').click());
    document.getElementById('stgExclInput')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      await ImportManager.loadExclusionList(file);
      const countEl = document.getElementById('stgExclCount');
      if (countEl) countEl.textContent = ImportManager.getExcludedCount().toLocaleString();
      e.target.value = '';
    });

    // Google Drive Sync
    document.getElementById('stgGdSaveCfgBtn')?.addEventListener('click', _saveGdSyncConfig);
    document.getElementById('stgGdAuthBtn')?.addEventListener('click',    _gdAuthorize);
    document.getElementById('stgGdTestBtn')?.addEventListener('click',    _gdTestConnection);
    document.getElementById('stgGdSaveBtn')?.addEventListener('click',    _saveToGDrive);

    // Price List
    document.getElementById('stgPlUploadBtn')?.addEventListener('click', () =>
      document.getElementById('stgPlInput').click());
    document.getElementById('stgPlInput')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const items = await PriceList.parseUploadedFile(file);
        _showPricePreview(items, file);
      } catch (err) {
        showToast('Price list parse error: ' + err.message, 'error');
      }
      e.target.value = '';
    });
    document.getElementById('stgPlRecalcBtn')?.addEventListener('click', _showRecalcDialog);
  }

  function _bindFieldSync() {
    const trim = e => e.target.value.trim();
    document.getElementById('stgDbxToken')?.addEventListener('input',  e => { _cfg.dropbox.token         = trim(e); });
    document.getElementById('stgDbxPath')?.addEventListener('input',   e => { _cfg.dropbox.path          = trim(e); });
    document.getElementById('stgGdKey')?.addEventListener('input',     e => { _cfg.googledrive.apiKey    = trim(e); });
    document.getElementById('stgGdFileId')?.addEventListener('input',  e => { _cfg.googledrive.fileId    = trim(e); });
  }

  // ── Test Connection ────────────────────────────────────
  async function _testConnection() {
    const resEl = document.getElementById('stgTestResult');
    const btn   = document.getElementById('stgTestBtn');

    if (_cfg.provider === 'local') {
      _setResult(resEl, 'ok', 'Local mode — no connection needed');
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'Testing…';
    _setResult(resEl, 'loading', 'Connecting…');

    try {
      if (_cfg.provider === 'dropbox')     await _testDropbox();
      if (_cfg.provider === 'googledrive') await _testGoogleDrive();
      _setResult(resEl, 'ok', 'Connected — credentials valid and file found');
    } catch (err) {
      _setResult(resEl, 'error', err.message);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Test Connection';
    }
  }

  async function _testDropbox() {
    const { token, path } = _cfg.dropbox;
    if (!token) throw new Error('Access token is required');
    if (!path)  throw new Error('File path is required');

    const res = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error_summary || `Dropbox error ${res.status}`);
    }
  }

  async function _testGoogleDrive() {
    const { apiKey, fileId } = _cfg.googledrive;
    if (!apiKey)  throw new Error('API key is required');
    if (!fileId)  throw new Error('File ID is required');

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?key=${apiKey}&fields=id,name,mimeType`
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Drive error ${res.status}`);
    }
  }

  function _setResult(el, state, msg) {
    el.className    = `stg-test-result stg-result-${state}`;
    el.textContent  = msg;
  }

  // ── Save & Apply ───────────────────────────────────────
  function _saveApply() {
    // Sync field values into _cfg in case listeners missed anything
    const v = id => (document.getElementById(id)?.value || '').trim();
    if (_cfg.provider === 'dropbox') {
      _cfg.dropbox.token = v('stgDbxToken');
      _cfg.dropbox.path  = v('stgDbxPath');
    } else if (_cfg.provider === 'googledrive') {
      _cfg.googledrive.apiKey  = v('stgGdKey');
      _cfg.googledrive.fileId  = v('stgGdFileId');
    }

    _saveConfig();

    const prev = document.getElementById('stgConfigPreview');
    if (prev) prev.textContent = _configPreview();

    showToast(`Settings saved — provider: ${_cfg.provider}`, 'success');
  }

  // ── Export / Import Database ───────────────────────────
  function _exportDb() {
    if (!_rows.length) { showToast('No data loaded to export', 'error'); return; }

    const payload = JSON.stringify({ exported: new Date().toISOString(), rows: _rows }, null, 2);
    const blob    = new Blob([payload], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const a       = Object.assign(document.createElement('a'), {
      href: url, download: `TTIS_Database_${_isoDate()}.json`
    });
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${_rows.length.toLocaleString()} rows`, 'success');
  }

  function _onImportFile(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const obj  = JSON.parse(e.target.result);
        const rows = Array.isArray(obj) ? obj : obj.rows;
        if (!Array.isArray(rows)) throw new Error('Expected a rows array in the JSON file');

        // Push rows to all modules
        buildDashboard(rows);
        Tasks.init(rows);
        Invoicing.init(rows);
        Readiness.init(rows);
        init(rows);   // re-render Settings with updated count

        const badge = document.getElementById('dataBadge');
        if (badge) badge.textContent = `${rows.length.toLocaleString()} rows · ${file.name}`;

        showToast(`Imported ${rows.length.toLocaleString()} rows from "${file.name}"`, 'success');
      } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
      }
      input.value = '';
    };
    reader.readAsText(file);
  }

  // ── Auto-fetch helpers ─────────────────────────────────
  async function _fetchDropbox() {
    const { token, path } = _cfg.dropbox;
    if (!token || !path) return null;

    const res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method:  'POST',
      headers: {
        'Authorization':    `Bearer ${token}`,
        'Dropbox-API-Arg':  JSON.stringify({ path })
      }
    });
    if (!res.ok) throw new Error(`Dropbox download failed (HTTP ${res.status})`);

    const blob = await res.blob();
    const name = path.split('/').pop() || 'tracking.xlsx';
    return new File([blob], name, { type: blob.type });
  }

  async function _fetchGoogleDrive() {
    const { apiKey, fileId } = _cfg.googledrive;
    if (!apiKey || !fileId) return null;

    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?key=${apiKey}&fields=name`
    );
    if (!metaRes.ok) throw new Error(`Drive metadata failed (HTTP ${metaRes.status})`);
    const { name } = await metaRes.json();

    const dlRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?key=${apiKey}&alt=media`
    );
    if (!dlRes.ok) throw new Error(`Drive download failed (HTTP ${dlRes.status})`);

    const blob = await dlRes.blob();
    return new File([blob], name || 'tracking.xlsx', { type: blob.type });
  }

  // ── Helpers ────────────────────────────────────────────
  function _configPreview() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return '(not saved yet)';
      const cfg = JSON.parse(raw);
      if (cfg.dropbox?.token)      cfg.dropbox.token      = '••••••••';
      if (cfg.googledrive?.apiKey) cfg.googledrive.apiKey = '••••••••';
      return JSON.stringify(cfg, null, 2);
    } catch (e) { return '(parse error)'; }
  }

  // ── Reset Database ─────────────────────────────────────
  function _showResetDialog() {
    document.getElementById('stgResetOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'stgResetOverlay';
    overlay.className = 'stg-reset-overlay';
    overlay.innerHTML = `
      <div class="stg-reset-dialog">
        <div class="stg-reset-title">&#9888; Reset Database</div>
        <div class="stg-reset-msg">
          This will permanently delete all <strong>${_rows.length.toLocaleString()} tasks</strong> from the active session.
          The next import will run as a <strong>First Load</strong>.<br><br>
          Type <code>CONFIRM</code> below to proceed.
        </div>
        <input class="stg-input stg-reset-input" id="stgResetInput"
               placeholder="Type CONFIRM" autocomplete="off" spellcheck="false">
        <div class="stg-reset-actions">
          <button class="stg-btn" id="stgResetCancelBtn">Cancel</button>
          <button class="stg-btn stg-btn-reset-confirm" id="stgResetConfirmBtn" disabled>
            Reset All Tasks
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const input      = overlay.querySelector('#stgResetInput');
    const confirmBtn = overlay.querySelector('#stgResetConfirmBtn');
    const cancelBtn  = overlay.querySelector('#stgResetCancelBtn');

    input.addEventListener('input', () => {
      confirmBtn.disabled = input.value !== 'CONFIRM';
    });

    cancelBtn.addEventListener('click', () => overlay.remove());

    confirmBtn.addEventListener('click', () => {
      const empty = [];
      buildDashboard(empty);
      Tasks.init(empty);
      Invoicing.init(empty);
      Readiness.init(empty);
      init(empty);   // re-renders Settings with count = 0

      const badge = document.getElementById('dataBadge');
      if (badge) badge.textContent = '0 rows · (reset)';

      overlay.remove();
      showToast('Database reset — all tasks cleared. Next import will run as First Load.', 'success');
    });

    // Close on backdrop click
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    input.focus();
  }

  function _isoDate() { return new Date().toISOString().slice(0, 10); }

  // ── Public API ─────────────────────────────────────────
  return { init, autoConnect };

})();
