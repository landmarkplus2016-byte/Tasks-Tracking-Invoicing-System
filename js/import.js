/* ══════════════════════════════════════════════════════
   TTIS — import.js  |  Smart PC_Tracking Excel importer
   ══════════════════════════════════════════════════════ */

'use strict';

const ImportManager = (() => {

  const EXCL_KEY      = 'TTIS_EXCLUDED_IDS';
  const PC_SHEET      = 'Collective';
  const MAX_HDR_SCAN  = 15;

  // Reverse map: internal key → display label  (from COL_MAP in data.js)
  const FIELD_LABELS  = Object.fromEntries(Object.entries(COL_MAP).map(([h, k]) => [k, h]));

  // Normalized COL_MAP for header detection
  const NORM_COL_MAP  = Object.fromEntries(
    Object.entries(COL_MAP).map(([h, k]) => [_norm(h), k])
  );

  let _currentRows  = [];
  let _excludedIds  = new Set();
  let _pending      = null;   // confirmed import payload
  let _detailTab    = 'new';

  // ── Public API ─────────────────────────────────────────
  function init(rows) {
    _currentRows = rows;
    _loadExcludedIds();
  }

  function getExcludedCount() { return _excludedIds.size; }

  // Open file picker → triggers the import flow
  function open() {
    let inp = document.getElementById('impFileInput');
    if (!inp) {
      inp = Object.assign(document.createElement('input'), {
        type: 'file', id: 'impFileInput', accept: '.xlsm,.xlsx',
        style: 'display:none'
      });
      inp.addEventListener('change', e => _onFileChosen(e.target));
      document.body.appendChild(inp);
    }
    inp.value = '';
    inp.click();
  }

  // Load exclusion list from an Excel file (column headed 'ID#' or 'ID')
  async function loadExclusionList(file) {
    try {
      const wb = await _readWorkbook(file);
      const wsName = wb.SheetNames[0];
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wsName], {
        header: 1, raw: false, defval: ''
      });
      if (!raw.length) throw new Error('File appears empty');

      // Find the ID column
      let idColIdx = -1;
      let headerRow = -1;
      for (let r = 0; r < Math.min(MAX_HDR_SCAN, raw.length); r++) {
        idColIdx = raw[r].findIndex(c => /^id#?$/i.test(_norm(c)));
        if (idColIdx !== -1) { headerRow = r; break; }
      }
      if (idColIdx === -1) throw new Error('No column matching "ID#" or "ID" found in file');

      const ids = raw.slice(headerRow + 1)
        .map(row => String(row[idColIdx] || '').trim())
        .filter(Boolean);

      _excludedIds = new Set(ids);
      _persistExcludedIds();
      showToast(`Exclusion list updated — ${ids.length} IDs excluded`, 'success');
      return ids.length;
    } catch (err) {
      showToast('Exclusion list error: ' + err.message, 'error');
      return 0;
    }
  }

  // ── File chosen → parse → diff → show modal ───────────
  async function _onFileChosen(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';

    showToast('Parsing import file…', 'info');
    try {
      const importedRows = await _parseCollective(file);
      if (!importedRows.length) { showToast('No data rows found in Collective sheet', 'error'); return; }

      const result = _buildDiff(importedRows, file.name);
      _pending = result;
      _detailTab = 'new';
      _renderModal(result);
    } catch (err) {
      showToast('Import error: ' + err.message, 'error');
    }
  }

  // ── Parse 'Collective' sheet ───────────────────────────
  async function _parseCollective(file) {
    const wb = await _readWorkbook(file);

    // Find 'Collective' sheet (case-insensitive)
    const sheetName =
      wb.SheetNames.find(n => n === PC_SHEET) ||
      wb.SheetNames.find(n => n.toLowerCase() === PC_SHEET.toLowerCase()) ||
      wb.SheetNames[0];

    const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1, raw: false, dateNF: 'DD/MM/YYYY', defval: ''
    });

    const hdrIdx = _detectHeaderRow(raw);
    if (hdrIdx === -1) throw new Error(`No recognisable header row found in the first ${MAX_HDR_SCAN} rows`);

    // Build column index map
    const headers = raw[hdrIdx];
    const colIndex = {};
    headers.forEach((h, i) => {
      const key = NORM_COL_MAP[_norm(h)];
      if (key) colIndex[key] = i;
    });

    const priceList = _buildPriceList();
    const rows = [];

    for (let ri = hdrIdx + 1; ri < raw.length; ri++) {
      const rawRow = raw[ri];
      if (!rawRow || rawRow.every(c => c === '' || c == null)) continue;

      const row = {};
      for (const [key, idx] of Object.entries(colIndex)) {
        let val = rawRow[idx];
        if (val === '' || val == null) { row[key] = null; continue; }
        val = String(val).trim();
        if (!val) { row[key] = null; continue; }

        if (NUMERIC_KEYS.has(key)) {
          const n = parseFloat(val.replace(/,/g, ''));
          row[key] = isNaN(n) ? null : n;
        } else {
          row[key] = val;
        }
      }

      if (!row.id && !row.logical_site_id && !row.job_code) continue;

      // Normalise status
      const { status, status_raw } = normalizeStatus(row.status);
      row.status     = status;
      row.status_raw = status_raw;

      // Line item matching + price calculation
      _applyLineItemMatch(row, priceList);
      if (typeof PriceList !== 'undefined') PriceList.calculateForRow(row);

      rows.push(row);
    }
    return rows;
  }

  // ── Header row detection ───────────────────────────────
  function _detectHeaderRow(rawRows) {
    let bestRow = -1, bestScore = 0;
    const limit = Math.min(MAX_HDR_SCAN, rawRows.length);
    for (let r = 0; r < limit; r++) {
      const score = rawRows[r].filter(c => NORM_COL_MAP[_norm(c)]).length;
      if (score > bestScore) { bestScore = score; bestRow = r; }
    }
    return bestScore >= 2 ? bestRow : -1;
  }

  // ── Price list from currently loaded rows ──────────────
  function _buildPriceList() {
    const seen = new Set();
    const list = [];
    for (const r of _currentRows) {
      if (!r.line_item) continue;
      const code = _extractCode(r.line_item);
      const key  = code || _normText(r.line_item);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ code, name: r.line_item, normName: _normText(r.line_item), price: r.new_price });
    }
    return list;
  }

  // ── Line item matching ────────────────────────────────
  function _applyLineItemMatch(row, priceList) {
    const rawText = row.line_item || '';
    row.line_item_raw = rawText;

    if (!rawText || !priceList.length) {
      if (rawText) row.price_unmatched = true;
      return;
    }

    const importCode  = _extractCode(rawText);
    const importNorm  = _normText(rawText);
    let match = null;

    // 1 — exact 4-char code match
    if (importCode) match = priceList.find(p => p.code === importCode);

    // 2 — normalized name substring match in either direction
    if (!match) {
      match = priceList.find(p =>
        p.normName && (importNorm.includes(p.normName) || p.normName.includes(importNorm))
      );
    }

    if (match) {
      row.line_item_code    = match.code || importCode;
      row.line_item_matched = match.name;
      row.line_item         = match.name;   // normalise to canonical name
      if (match.price != null && row.new_price == null) row.new_price = match.price;
    } else {
      row.line_item_code = importCode || null;
      row.price_unmatched = true;
    }
  }

  // ── Diff computation ───────────────────────────────────
  function _buildDiff(importedRows, fileName) {
    // Auto-detect mode: empty database → First Load, otherwise Update
    if (!_currentRows.length) return _buildFirstLoad(importedRows, fileName);

    const existingById = new Map(_currentRows.map(r => [String(r.id || ''), r]));
    const newRows      = [];
    const changedRows  = [];  // { existing, updated, diffs: [{ field, label, oldVal, newVal }] }
    let   excludedCnt  = 0;
    const unmatchedRows = [];

    for (const row of importedRows) {
      const id = String(row.id || '').trim();

      // Exclusion check
      if (id && _excludedIds.has(id)) { excludedCnt++; continue; }

      if (row.price_unmatched) unmatchedRows.push(row);

      if (!id || !existingById.has(id)) {
        newRows.push(row);
      } else {
        const existing = existingById.get(id);
        const diffs = _diffFields(existing, row);
        if (diffs.length) changedRows.push({ existing, updated: row, diffs });
      }
    }

    return { mode: 'update', newRows, changedRows, excludedCnt, unmatchedRows, fileName };
  }

  function _buildFirstLoad(importedRows, fileName) {
    const loadedRows    = [];
    let   excludedCnt   = 0;
    const unmatchedRows = [];

    for (const row of importedRows) {
      const id = String(row.id || '').trim();
      if (id && _excludedIds.has(id)) { excludedCnt++; continue; }
      loadedRows.push(row);
      if (row.price_unmatched) unmatchedRows.push(row);
    }

    return { mode: 'first', loadedRows, excludedCnt, unmatchedRows, fileName };
  }

  function _diffFields(old, upd) {
    const diffs = [];
    for (const [key] of Object.entries(COL_MAP)) {
      const field = COL_MAP[key];
      const ov = old[field] != null ? String(old[field]) : '';
      const nv = upd[field] != null ? String(upd[field]) : '';
      if (ov !== nv) diffs.push({ field, label: key, oldVal: ov || '—', newVal: nv || '—' });
    }
    return diffs;
  }

  // ── Confirmation modal ─────────────────────────────────
  function _renderModal(result) {
    document.getElementById('impOverlay')?.remove();
    result.mode === 'first' ? _renderFirstLoadModal(result) : _renderUpdateModal(result);
  }

  function _renderFirstLoadModal(result) {
    const { loadedRows, excludedCnt, unmatchedRows, fileName } = result;

    const overlay = document.createElement('div');
    overlay.id = 'impOverlay';
    overlay.className = 'imp-overlay';
    overlay.innerHTML = `
      <div class="imp-modal">
        <div class="imp-modal-head">
          <div>
            <div class="imp-modal-title">First Import — Full Load</div>
            <div class="imp-modal-file">${_esc(fileName)}</div>
          </div>
          <button class="imp-close" id="impCloseBtn">&#10005;</button>
        </div>

        <div class="imp-first-banner">
          <div class="imp-first-icon">&#10024;</div>
          <div>
            <div class="imp-first-title">Database is empty &mdash; this is your first import</div>
            <div class="imp-first-sub">All rows from the file will be loaded as your initial dataset. There are no existing tasks to compare against, so no diff is needed.</div>
          </div>
        </div>

        <div class="imp-stats imp-stats-3">
          <div class="imp-stat imp-stat-new">
            <div class="imp-stat-num">${loadedRows.length.toLocaleString()}</div>
            <div class="imp-stat-lbl">Tasks to Load</div>
          </div>
          <div class="imp-stat imp-stat-excluded">
            <div class="imp-stat-num">${excludedCnt}</div>
            <div class="imp-stat-lbl">Excluded Skipped</div>
          </div>
          <div class="imp-stat imp-stat-unmatched">
            <div class="imp-stat-num">${unmatchedRows.length}</div>
            <div class="imp-stat-lbl">Unmatched Items</div>
          </div>
        </div>

        ${unmatchedRows.length ? `
          <div class="imp-section-hdr">&#9888; Unmatched Line Items — review before confirming</div>
          <div class="imp-detail">
            <table class="imp-tbl">
              <thead><tr><th>ID</th><th>Site ID</th><th>Raw Line Item Text</th><th>Code Found</th></tr></thead>
              <tbody>${unmatchedRows.map(r => `<tr>
                <td>${_esc(r.id||'')}</td>
                <td>${_esc(r.logical_site_id||'')}</td>
                <td title="${_esc(r.line_item_raw||'')}">${_esc(_trunc(r.line_item_raw||'',60))}</td>
                <td>${r.line_item_code
                  ? `<span class="badge badge-price-ok">${_esc(r.line_item_code)}</span>`
                  : '<span style="color:var(--text3)">—</span>'}</td>
              </tr>`).join('')}</tbody>
            </table>
          </div>` : ''}

        <div class="imp-footer">
          <button class="imp-btn imp-btn-cancel" id="impCancelBtn">Cancel</button>
          <button class="imp-btn imp-btn-confirm" id="impConfirmBtn"
            ${!loadedRows.length ? 'disabled' : ''}>
            Confirm &mdash; Load ${loadedRows.length.toLocaleString()} Tasks
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('#impCloseBtn').addEventListener('click', _cancel);
    overlay.querySelector('#impCancelBtn').addEventListener('click', _cancel);
    overlay.querySelector('#impConfirmBtn').addEventListener('click', _applyImport);
  }

  function _renderUpdateModal(result) {
    const { newRows, changedRows, excludedCnt, unmatchedRows, fileName } = result;

    const overlay = document.createElement('div');
    overlay.id = 'impOverlay';
    overlay.className = 'imp-overlay';
    overlay.innerHTML = `
      <div class="imp-modal">
        <div class="imp-modal-head">
          <div>
            <div class="imp-modal-title">Import Confirmation</div>
            <div class="imp-modal-file">${_esc(fileName)}</div>
          </div>
          <button class="imp-close" id="impCloseBtn">&#10005;</button>
        </div>

        <div class="imp-stats">
          <div class="imp-stat imp-stat-new">
            <div class="imp-stat-num">${newRows.length}</div>
            <div class="imp-stat-lbl">New Tasks</div>
          </div>
          <div class="imp-stat imp-stat-changed">
            <div class="imp-stat-num">${changedRows.length}</div>
            <div class="imp-stat-lbl">Changed</div>
          </div>
          <div class="imp-stat imp-stat-excluded">
            <div class="imp-stat-num">${excludedCnt}</div>
            <div class="imp-stat-lbl">Excluded</div>
          </div>
          <div class="imp-stat imp-stat-unmatched">
            <div class="imp-stat-num">${unmatchedRows.length}</div>
            <div class="imp-stat-lbl">Unmatched</div>
          </div>
        </div>

        <div class="imp-tab-row" id="impTabRow">
          <button class="imp-tab${_detailTab==='new'?' active':''}" data-t="new">New (${newRows.length})</button>
          <button class="imp-tab${_detailTab==='changed'?' active':''}" data-t="changed">Changes (${changedRows.length})</button>
          <button class="imp-tab${_detailTab==='excluded'?' active':''}" data-t="excluded">Excluded (${excludedCnt})</button>
          <button class="imp-tab${_detailTab==='unmatched'?' active':''}" data-t="unmatched">Unmatched (${unmatchedRows.length})</button>
        </div>

        <div class="imp-detail" id="impDetail">${_detailHtml(result, _detailTab)}</div>

        <div class="imp-footer">
          <button class="imp-btn imp-btn-cancel" id="impCancelBtn">Cancel</button>
          <button class="imp-btn imp-btn-confirm" id="impConfirmBtn"
            ${(!newRows.length && !changedRows.length) ? 'disabled' : ''}>
            Confirm Import
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#impCloseBtn').addEventListener('click', _cancel);
    overlay.querySelector('#impCancelBtn').addEventListener('click', _cancel);
    overlay.querySelector('#impConfirmBtn').addEventListener('click', _applyImport);
    overlay.querySelector('#impTabRow').addEventListener('click', e => {
      const btn = e.target.closest('.imp-tab');
      if (!btn) return;
      _detailTab = btn.dataset.t;
      overlay.querySelectorAll('.imp-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('impDetail').innerHTML = _detailHtml(result, _detailTab);
    });
  }  // end _renderUpdateModal

  function _detailHtml(result, tab) {
    const { newRows, changedRows, excludedCnt, unmatchedRows } = result;

    if (tab === 'new') {
      if (!newRows.length) return _emptyDetail('No new tasks to add');
      return `<table class="imp-tbl">
        <thead><tr><th>ID</th><th>Site ID</th><th>Task Name</th><th>Status</th><th>Line Item</th><th>Price Match</th></tr></thead>
        <tbody>${newRows.map(r => `<tr>
          <td>${_esc(r.id||'')}</td>
          <td>${_esc(r.logical_site_id||'')}</td>
          <td title="${_esc(r.task_name||'')}">${_esc(_trunc(r.task_name,40))}</td>
          <td>${_esc(r.status||'')}</td>
          <td title="${_esc(r.line_item_raw||r.line_item||'')}">${_esc(_trunc(r.line_item||'',35))}</td>
          <td>${r.price_unmatched
            ? `<span class="badge badge-price-warn" title="${_esc(r.line_item_raw||'')}">&#9888; Unmatched</span>`
            : `<span class="badge badge-price-ok">${_esc(r.line_item_code||'OK')}</span>`
          }</td>
        </tr>`).join('')}</tbody>
      </table>`;
    }

    if (tab === 'changed') {
      if (!changedRows.length) return _emptyDetail('No existing tasks have changes');
      return changedRows.map(({ existing, updated, diffs }) => `
        <div class="imp-change-block">
          <div class="imp-change-head">
            <span class="imp-change-id">${_esc(existing.id||'')}</span>
            <span class="imp-change-site">${_esc(existing.logical_site_id||'')}</span>
            <span class="imp-change-badge">${diffs.length} field${diffs.length>1?'s':''} changed</span>
          </div>
          <table class="imp-diff-tbl">
            <thead><tr><th>Field</th><th>Current Value</th><th>New Value</th></tr></thead>
            <tbody>${diffs.map(d => `<tr>
              <td class="imp-diff-field">${_esc(d.label)}</td>
              <td class="imp-diff-old">${_esc(d.oldVal)}</td>
              <td class="imp-diff-new">${_esc(d.newVal)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`).join('');
    }

    if (tab === 'excluded') {
      if (!excludedCnt) return _emptyDetail('No rows matched the exclusion list');
      return `<div class="imp-excl-note">
        <span class="imp-excl-num">${excludedCnt}</span>
        row${excludedCnt>1?'s':''} from the imported file matched your exclusion list and were silently skipped.
        They will not appear as new or changed tasks.
      </div>`;
    }

    if (tab === 'unmatched') {
      if (!unmatchedRows.length) return _emptyDetail('All line items matched successfully');
      return `<table class="imp-tbl">
        <thead><tr><th>ID</th><th>Site ID</th><th>Raw Line Item Text</th><th>Code Found</th></tr></thead>
        <tbody>${unmatchedRows.map(r => `<tr>
          <td>${_esc(r.id||'')}</td>
          <td>${_esc(r.logical_site_id||'')}</td>
          <td title="${_esc(r.line_item_raw||'')}">${_esc(_trunc(r.line_item_raw||'',60))}</td>
          <td>${r.line_item_code ? `<span class="badge badge-price-ok">${_esc(r.line_item_code)}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    }

    return '';
  }

  function _emptyDetail(msg) {
    return `<div class="imp-empty">${msg}</div>`;
  }

  // ── Apply confirmed import ─────────────────────────────
  function _applyImport() {
    if (!_pending) return;
    const p = _pending;
    let merged, toastMsg;

    if (p.mode === 'first') {
      // Full load — replace everything with the imported rows
      if (typeof UserManager !== 'undefined') p.loadedRows.forEach(r => UserManager.stampCreated(r));
      merged   = p.loadedRows;
      toastMsg = `First import complete — ${merged.length.toLocaleString()} tasks loaded`;
    } else {
      // Update mode — patch existing + append new
      if (typeof UserManager !== 'undefined') p.newRows.forEach(r => UserManager.stampCreated(r));
      const existingById = new Map(_currentRows.map(r => [String(r.id||''), r]));
      for (const { updated } of p.changedRows) {
        if (typeof UserManager !== 'undefined') UserManager.stampUpdated(updated);
        const id = String(updated.id || '');
        if (existingById.has(id)) Object.assign(existingById.get(id), updated);
      }
      merged   = [..._currentRows, ...p.newRows];
      toastMsg = `Import applied — ${p.newRows.length} new, ${p.changedRows.length} updated`;
    }

    _currentRows = merged;

    buildDashboard(merged);
    Tasks.init(merged);
    Invoicing.init(merged);
    Readiness.init(merged);
    Settings.init(merged);

    const badge = document.getElementById('dataBadge');
    if (badge) badge.textContent = `${merged.length.toLocaleString()} rows · (imported)`;

    _pending = null;
    if (typeof SyncManager !== 'undefined') SyncManager.markSynced();
    _cancel();
    showToast(toastMsg, 'success');
  }

  function _cancel() {
    document.getElementById('impOverlay')?.remove();
  }

  // ── Exclusion list persistence ─────────────────────────
  function _loadExcludedIds() {
    try {
      const raw = localStorage.getItem(EXCL_KEY);
      _excludedIds = raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) { _excludedIds = new Set(); }
  }

  function _persistExcludedIds() {
    localStorage.setItem(EXCL_KEY, JSON.stringify([..._excludedIds]));
  }

  // ── Utility helpers ────────────────────────────────────
  async function _readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => {
        try {
          resolve(XLSX.read(new Uint8Array(e.target.result), {
            type: 'array', cellDates: true, raw: false
          }));
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  function _extractCode(text) {
    const m = String(text || '').trim().match(/^([A-Za-z]{2}\d{2})/);
    return m ? m[1].toUpperCase() : '';
  }

  function _norm(s)     { return String(s||'').toLowerCase().trim().replace(/\s+/g,' '); }
  function _normText(s) { return String(s||'').toLowerCase().trim().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' '); }
  function _trunc(s, n) { s = String(s||''); return s.length > n ? s.slice(0, n) + '…' : s; }

  // ── Public API ─────────────────────────────────────────
  return { init, open, loadExclusionList, getExcludedCount, getCurrentRowCount: () => _currentRows.length };

})();
