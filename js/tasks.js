/* ══════════════════════════════════════════════════════
   TTIS — tasks.js  |  Tasks table with filter/sort/paginate
   ══════════════════════════════════════════════════════ */

'use strict';

const Tasks = (() => {
  let _allRows     = [];
  let _filtered    = [];
  let _page        = 1;
  let _sortCol     = null;
  let _sortDir     = 1;
  const PAGE_SZ    = 100;

  // ── Edit state ────────────────────────────────────────
  let _editState   = null;
  let _conflictState = null;

  // All fields — every field is editable
  const EDITABLE_FIELDS = [
    { key: 'id',                 label: 'ID#',                  type: 'text' },
    { key: 'job_code',           label: 'Job Code',             type: 'text' },
    { key: 'logical_site_id',    label: 'Logical Site ID',      type: 'text' },
    { key: 'physical_site_id',   label: 'Physical Site ID',     type: 'text' },
    { key: 'site_option',        label: 'Site Option',          type: 'text' },
    { key: 'facing',             label: 'Facing',               type: 'text' },
    { key: 'region',             label: 'Region',               type: 'text' },
    { key: 'sub_region',         label: 'Sub Region',           type: 'text' },
    { key: 'vendor',             label: 'Vendor',               type: 'text' },
    { key: 'tx_rf',              label: 'TX/RF',                type: 'text' },
    { key: 'stream',             label: 'General Stream',       type: 'text' },
    { key: 'task_name',          label: 'Task Name',            type: 'text' },
    { key: 'contractor',         label: 'Contractor',           type: 'text' },
    { key: 'engineer',           label: "Engineer's Name",      type: 'text' },
    { key: 'line_item',          label: 'Line Item',            type: 'text' },
    { key: 'abs_qty',            label: 'Absolute Quantity',    type: 'text' },
    { key: 'act_qty',            label: 'Actual Quantity',      type: 'text' },
    { key: 'distance',           label: 'Distance (km)',        type: 'text' },
    { key: 'new_price',          label: 'New Price',            type: 'text' },
    { key: 'total_price',        label: 'New Total Price',      type: 'text' },
    { key: 'comments',           label: 'Comments',             type: 'text' },
    { key: 'status',             label: 'Status',               type: 'select',
      options: ['', 'Done', 'In Progress', 'Cancelled', 'Assigned'] },
    { key: 'task_date',          label: 'Task Date',            type: 'text', placeholder: 'DD/MM/YYYY' },
    { key: 'vf_owner',           label: 'VF Task Owner',        type: 'text' },
    { key: 'coordinator',        label: 'Coordinator',          type: 'text' },
    { key: 'acceptance_status',  label: 'Acceptance Status',    type: 'select',
      options: ['', 'FAC', 'TOC', 'PAC'] },
    { key: 'fac_date',           label: 'FAC Date',             type: 'text', placeholder: 'DD/MM/YYYY' },
    { key: 'certificate',        label: 'Certificate #',        type: 'text' },
    { key: 'acceptance_week',    label: 'Acceptance Week',      type: 'text' },
    { key: 'tsr_sub',            label: 'TSR Sub#',             type: 'text' },
    { key: 'po_status',          label: 'PO Status',            type: 'text' },
    { key: 'po_number',          label: 'PO Number',            type: 'text' },
    { key: 'vf_invoice',         label: 'VF Invoice #',         type: 'text' },
    { key: 'recv1_date',         label: '1st Receiving Date',   type: 'text', placeholder: 'DD/MM/YYYY' },
    { key: 'recv1_amount',       label: '1st Receiving Amount', type: 'text' },
    { key: 'recv1_qty',          label: '1st Receiving Qty',    type: 'text' },
    { key: 'recv2_date',         label: '2nd Receiving Date',   type: 'text', placeholder: 'DD/MM/YYYY' },
    { key: 'recv2_amount',       label: '2nd Receiving Amount', type: 'text' },
    { key: 'recv2_qty',          label: '2nd Receiving Qty',    type: 'text' },
    { key: 'remaining',          label: 'Remaining Amounts',    type: 'text' },
    { key: 'lmp_portion',        label: 'LMP Portion',          type: 'text' },
    { key: 'contractor_portion', label: 'Contractor Portion',   type: 'text' },
  ];

  // ── Public API ───────────────────────────────────────
  function init(rows) {
    _allRows = rows;
    _renderShell();
    _populateSelects();
    applyFilters();
  }

  // ── Shell HTML ───────────────────────────────────────
  function _renderShell() {
    document.getElementById('sec-tasks').innerHTML = `
      <div class="filter-bar">
        <input id="tSearch" type="text"
               placeholder="Search by Site ID, Job Code, Coordinator, Contractor…"
               oninput="Tasks.applyFilters()">
        <select id="tContractor" onchange="Tasks.applyFilters()">
          <option value="">All Contractors</option>
        </select>
        <select id="tStatus" onchange="Tasks.applyFilters()">
          <option value="">All Statuses</option>
        </select>
        <select id="tDateYear" onchange="Tasks._onDateYearChange()">
          <option value="">All Years</option>
        </select>
        <select id="tDateMonth" onchange="Tasks._onDateMonthChange()" disabled>
          <option value="">All Months</option>
        </select>
        <select id="tDateDay" onchange="Tasks.applyFilters()" disabled>
          <option value="">All Days</option>
        </select>
        <select id="tCoordinator" onchange="Tasks.applyFilters()">
          <option value="">All Coordinators</option>
        </select>
        <select id="tAcceptance" onchange="Tasks.applyFilters()">
          <option value="">All Acceptance</option>
        </select>
        <select id="tPoStatus" onchange="Tasks.applyFilters()">
          <option value="">All PO Statuses</option>
        </select>
        <span class="filter-count" id="tCount">— rows</span>
        <button class="clear-btn" onclick="Tasks.clearFilters()">✕ Clear</button>
      </div>

      <div class="table-wrap">
        <div class="table-scroll">
          <table id="taskTable">
            <thead>
              <tr>
                <th onclick="Tasks.sortBy('id')">ID</th>
                <th onclick="Tasks.sortBy('job_code')">Job Code</th>
                <th onclick="Tasks.sortBy('logical_site_id')">Logical Site ID</th>
                <th onclick="Tasks.sortBy('site_option')">Site Option</th>
                <th onclick="Tasks.sortBy('facing')">Facing</th>
                <th onclick="Tasks.sortBy('region')">Region</th>
                <th onclick="Tasks.sortBy('abs_qty')">Abs. Qty</th>
                <th onclick="Tasks.sortBy('act_qty')">Act. Qty</th>
                <th onclick="Tasks.sortBy('contractor')">Contractor</th>
                <th onclick="Tasks.sortBy('line_item')">Line Item</th>
                <th onclick="Tasks.sortBy('new_price')">New Price</th>
                <th onclick="Tasks.sortBy('total_price')">New Total Price</th>
                <th onclick="Tasks.sortBy('status')">Status</th>
                <th onclick="Tasks.sortBy('task_date')">Task Date</th>
                <th onclick="Tasks.sortBy('vf_owner')">VF Owner</th>
                <th onclick="Tasks.sortBy('coordinator')">Coordinator</th>
                <th onclick="Tasks.sortBy('acceptance_status')">Acceptance</th>
                <th onclick="Tasks.sortBy('fac_date')">FAC Date</th>
                <th onclick="Tasks.sortBy('certificate')">Certificate #</th>
                <th onclick="Tasks.sortBy('acceptance_week')">Acc. Week</th>
                <th onclick="Tasks.sortBy('tsr_sub')">TSR Sub#</th>
                <th onclick="Tasks.sortBy('po_status')">PO Status</th>
                <th onclick="Tasks.sortBy('po_number')">PO Number</th>
                <th onclick="Tasks.sortBy('vf_invoice')">VF Invoice #</th>
                <th onclick="Tasks.sortBy('recv1_date')">1st Recv Date</th>
                <th class="col-action"></th>
              </tr>
            </thead>
            <tbody id="taskBody"></tbody>
          </table>
        </div>
        <div class="pagination">
          <span class="page-info" id="tPageInfo"></span>
          <div class="page-btns" id="tPageBtns"></div>
        </div>
      </div>`;
  }

  // ── Populate filter dropdowns ─────────────────────────
  function _populateSelects() {
    _fillSelect('tContractor',  _unique(_allRows, 'contractor'));
    _fillSelect('tStatus',      _unique(_allRows, 'status'));
    _fillSelect('tCoordinator', _unique(_allRows, 'coordinator'));
    _fillSelect('tAcceptance',  _unique(_allRows, 'acceptance_status'));
    _fillSelect('tPoStatus',    _unique(_allRows, 'po_status'));
    // Populate year dropdown from task_date (DD/MM/YYYY)
    const years = [...new Set(
      _allRows.map(r => _parseDatePart(r.task_date, 'year')).filter(Boolean)
    )].sort();
    _fillSelect('tDateYear', years);
  }

  function _unique(rows, field) {
    return [...new Set(rows.map(r => r[field]).filter(Boolean))].sort();
  }

  function _fillSelect(id, items) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const first = sel.options[0].outerHTML;
    sel.innerHTML = first + items.map(v =>
      `<option value="${_esc(String(v))}">${_esc(String(v))}</option>`).join('');
  }

  // Parse a DD/MM/YYYY date string for 'year', 'month', or 'day'
  function _parseDatePart(dateStr, part) {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    // Support DD/MM/YYYY and YYYY-MM-DD
    let day, month, year;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      [day, month, year] = s.split('/');
    } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      [year, month, day] = s.slice(0,10).split('-');
    } else {
      return null;
    }
    if (part === 'year')  return year;
    if (part === 'month') return month.padStart(2,'0');
    if (part === 'day')   return day.padStart(2,'0');
    return null;
  }

  // Called when year dropdown changes — repopulate months
  function _onDateYearChange() {
    const year = document.getElementById('tDateYear')?.value || '';
    const monthSel = document.getElementById('tDateMonth');
    const daySel   = document.getElementById('tDateDay');
    if (!monthSel || !daySel) return;

    monthSel.innerHTML = '<option value="">All Months</option>';
    daySel.innerHTML   = '<option value="">All Days</option>';
    daySel.disabled    = true;

    if (!year) {
      monthSel.disabled = true;
    } else {
      const months = [...new Set(
        _allRows
          .filter(r => _parseDatePart(r.task_date, 'year') === year)
          .map(r => _parseDatePart(r.task_date, 'month'))
          .filter(Boolean)
      )].sort();
      const MONTH_NAMES = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      monthSel.innerHTML = '<option value="">All Months</option>' +
        months.map(m => `<option value="${m}">${MONTH_NAMES[parseInt(m,10)] || m}</option>`).join('');
      monthSel.disabled = false;
    }
    applyFilters();
  }

  // Called when month dropdown changes — repopulate days
  function _onDateMonthChange() {
    const year  = document.getElementById('tDateYear')?.value  || '';
    const month = document.getElementById('tDateMonth')?.value || '';
    const daySel = document.getElementById('tDateDay');
    if (!daySel) return;

    daySel.innerHTML = '<option value="">All Days</option>';
    if (!year || !month) {
      daySel.disabled = true;
    } else {
      const days = [...new Set(
        _allRows
          .filter(r =>
            _parseDatePart(r.task_date, 'year')  === year &&
            _parseDatePart(r.task_date, 'month') === month
          )
          .map(r => _parseDatePart(r.task_date, 'day'))
          .filter(Boolean)
      )].sort();
      daySel.innerHTML = '<option value="">All Days</option>' +
        days.map(d => `<option value="${d}">${d}</option>`).join('');
      daySel.disabled = days.length === 0;
    }
    applyFilters();
  }

  // ── Filter logic ──────────────────────────────────────
  function applyFilters() {
    const q   = (document.getElementById('tSearch')?.value      || '').toLowerCase().trim();
    const ct  =  document.getElementById('tContractor')?.value  || '';
    const st  =  document.getElementById('tStatus')?.value      || '';
    const yr  =  document.getElementById('tDateYear')?.value    || '';
    const mo  =  document.getElementById('tDateMonth')?.value   || '';
    const dy  =  document.getElementById('tDateDay')?.value     || '';
    const co  =  document.getElementById('tCoordinator')?.value || '';
    const ac  =  document.getElementById('tAcceptance')?.value  || '';
    const po  =  document.getElementById('tPoStatus')?.value    || '';

    _filtered = _allRows.filter(r => {
      if (ct && r.contractor        !== ct) return false;
      if (st && r.status            !== st) return false;
      if (co && r.coordinator       !== co) return false;
      if (ac && r.acceptance_status !== ac) return false;
      if (po && r.po_status         !== po) return false;
      if (yr && _parseDatePart(r.task_date, 'year')  !== yr) return false;
      if (mo && _parseDatePart(r.task_date, 'month') !== mo) return false;
      if (dy && _parseDatePart(r.task_date, 'day')   !== dy) return false;
      if (q) {
        const hay = [
          r.id, r.job_code, r.logical_site_id, r.physical_site_id,
          r.coordinator, r.line_item, r.contractor, r.vf_owner,
          r.engineer, r.task_name, r.tsr_sub, r.po_number
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (_sortCol) _sort();
    _page = 1;
    _render();
  }

  function clearFilters() {
    ['tSearch','tContractor','tStatus','tCoordinator','tAcceptance','tPoStatus']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    // Reset cascading date selects
    const yearSel  = document.getElementById('tDateYear');
    const monthSel = document.getElementById('tDateMonth');
    const daySel   = document.getElementById('tDateDay');
    if (yearSel)  yearSel.value  = '';
    if (monthSel) { monthSel.innerHTML = '<option value="">All Months</option>'; monthSel.disabled = true; }
    if (daySel)   { daySel.innerHTML   = '<option value="">All Days</option>';   daySel.disabled   = true; }
    applyFilters();
  }

  // ── Sort ──────────────────────────────────────────────
  function sortBy(col) {
    if (_sortCol === col) _sortDir *= -1;
    else { _sortCol = col; _sortDir = 1; }
    _updateSortHeaders('taskTable', col, _sortDir);
    _sort();
    _page = 1;
    _render();
  }

  function _sort() {
    _filtered.sort((a, b) => {
      const av = a[_sortCol] ?? '';
      const bv = b[_sortCol] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * _sortDir;
      return String(av).localeCompare(String(bv)) * _sortDir;
    });
  }

  // ── Row attributes: class + title + double-click ──────
  function _rowAttrs(r) {
    const classes = [];
    const titles  = [];

    if (r.created_by) titles.push(`Created by ${r.created_by}${r.created_at ? ' · ' + new Date(r.created_at).toLocaleString() : ''}`);
    if (r.updated_by) titles.push(`Updated by ${r.updated_by}${r.updated_at ? ' · ' + new Date(r.updated_at).toLocaleString() : ''}`);
    if (titles.length) classes.push('row-audited');

    if (r.id && typeof LockManager !== 'undefined') {
      if (LockManager.isImportLocked())                classes.push('row-import-locked');
      else if (LockManager.isLockedByMe(String(r.id))) classes.push('row-locked-mine');
      else if (LockManager.isLocked(String(r.id)))     classes.push('row-locked-other');
    }

    let attrs = ' style="cursor:pointer"';
    if (classes.length) attrs += ` class="${classes.join(' ')}"`;
    if (titles.length)  attrs += ` title="${_esc(titles.join('\n'))}"`;
    if (r.id)           attrs += ` ondblclick="Tasks.openEdit('${_esc(String(r.id))}')"`;
    return attrs;
  }

  // ── Render table ──────────────────────────────────────
  function _render() {
    const total  = _filtered.length;
    const pages  = Math.ceil(total / PAGE_SZ) || 1;
    const start  = (_page - 1) * PAGE_SZ;
    const slice  = _filtered.slice(start, start + PAGE_SZ);

    const countEl = document.getElementById('tCount');
    if (countEl) countEl.textContent = `${total.toLocaleString()} rows`;

    const tbody = document.getElementById('taskBody');
    if (!tbody) return;

    if (slice.length === 0) {
      tbody.innerHTML = `<tr><td colspan="26" class="empty-state">
        <div class="empty-state-text">No matching records</div></td></tr>`;
    } else {
      tbody.innerHTML = slice.map(r => `
        <tr${_rowAttrs(r)}>
          <td>${_esc(r.id || '')}</td>
          <td>${_esc(r.job_code || '')}</td>
          <td>${_esc(r.logical_site_id || '')}</td>
          <td>${_esc(r.site_option || '—')}</td>
          <td>${_esc(r.facing || '—')}</td>
          <td>${_esc(r.region || '')}</td>
          <td style="text-align:right">${r.abs_qty != null ? r.abs_qty : '—'}</td>
          <td style="text-align:right">${r.act_qty != null ? r.act_qty : '—'}</td>
          <td>${_esc(r.contractor || '')}</td>
          <td style="max-width:160px" title="${_esc(r.line_item || '')}">${_esc(r.line_item || '')}</td>
          <td style="text-align:right">${r.new_price != null ? fmtEGP(r.new_price) : '—'}</td>
          <td style="text-align:right">${_totalPriceCell(r)}</td>
          <td>${_statusBadge(r.status, r.status_raw)}</td>
          <td>${_esc(r.task_date || '—')}</td>
          <td>${_esc(r.vf_owner || '')}</td>
          <td>${_esc(r.coordinator || '')}</td>
          <td>${_acceptBadge(r.acceptance_status)}</td>
          <td>${_esc(r.fac_date || '—')}</td>
          <td>${_esc(r.certificate || '—')}</td>
          <td>${_esc(r.acceptance_week || '—')}</td>
          <td>${_esc(r.tsr_sub || '—')}</td>
          <td>${_poBadge(r.po_status)}</td>
          <td>${_esc(r.po_number || '—')}</td>
          <td>${_esc(r.vf_invoice || '—')}</td>
          <td>${_esc(r.recv1_date || '—')}</td>
          <td class="col-action">${_rowAction(r)}</td>
        </tr>`).join('');
    }

    const infoEl = document.getElementById('tPageInfo');
    if (infoEl) infoEl.textContent = `Page ${_page} of ${pages} · ${total.toLocaleString()} records`;

    _renderPagination('tPageBtns', _page, pages, p => { _page = p; _render(); });
  }

  // ── Lock indicator helpers ────────────────────────────
  function _rowAction(r) {
    if (!r.id) return '';
    const id = _esc(String(r.id));

    if (typeof LockManager !== 'undefined' && LockManager.isImportLocked()) {
      const il = LockManager.getImportLock();
      const who = il?.lockedByName || 'someone';
      return `<span class="lock-icon lock-import" title="Import in progress by ${_esc(who)}">&#9889;</span>`;
    }

    if (typeof LockManager !== 'undefined' && LockManager.isLockedByMe(String(r.id))) {
      return `<span class="lock-icon lock-mine" title="You are editing this row">&#9998;</span>`;
    }

    if (typeof LockManager !== 'undefined' && LockManager.isLocked(String(r.id))) {
      const lock = LockManager.getLock(String(r.id));
      const who  = lock?.lockedByName || 'Unknown';
      const at   = lock?.lockedAt ? new Date(lock.lockedAt).toLocaleTimeString() : '';
      const tip  = `Locked by ${who}${at ? ' since ' + at : ''}`;
      const isAdmin = (typeof UserManager !== 'undefined' && UserManager.isAdmin());
      return `<span class="lock-icon lock-other" title="${_esc(tip)}">&#128274;</span>` +
        (isAdmin ? `<button class="row-break-btn" onclick="Tasks.breakLock('${id}')" title="Break lock (Admin)">&#128275;</button>` : '');
    }

    return `<button class="row-edit-btn" onclick="Tasks.openEdit('${id}')" title="Edit row">&#9998;</button>`;
  }

  // ── Public: open edit modal ───────────────────────────
  function openEdit(rowId) {
    const row = _allRows.find(r => String(r.id) === String(rowId));
    if (!row) { showToast('Row not found', 'error'); return; }

    // Check cached lock state (no network call) — block if locked by someone else
    if (typeof LockManager !== 'undefined') {
      if (typeof LockManager !== 'undefined' && LockManager.isImportLocked()) {
        const il = LockManager.getImportLock();
        showToast(`Import in progress by ${il?.lockedByName || 'someone'} — edits blocked`, 'warn');
        return;
      }
      if (LockManager.isLocked(String(rowId)) && !LockManager.isLockedByMe(String(rowId))) {
        const lock = LockManager.getLock(String(rowId));
        const who  = lock?.lockedByName || 'Unknown';
        const at   = lock?.lockedAt ? new Date(lock.lockedAt).toLocaleString() : '';
        const isAdmin = typeof UserManager !== 'undefined' && UserManager.isAdmin();
        _showLockBlockedModal(rowId, who, at, isAdmin);
        return;
      }
    }

    _editState = {
      rowId:    String(rowId),
      row:      row,
      baseline: _snapshotRow(row)
    };
    _showEditModal(row);
  }

  // ── Public: cancel edit ───────────────────────────────
  async function cancelEdit() {
    document.getElementById('taskEditOverlay')?.remove();
    if (_editState && typeof LockManager !== 'undefined') {
      await LockManager.releaseLock(_editState.rowId);
    }
    _editState = null;
    _render();
  }

  // ── Public: save edit ─────────────────────────────────
  async function saveEdit() {
    if (!_editState) return;
    const { rowId, row, baseline } = _editState;

    const edits = {};
    EDITABLE_FIELDS.forEach(f => {
      const el = document.getElementById('te_' + f.key);
      if (el) edits[f.key] = el.value.trim() || null;
    });

    const saveBtn = document.getElementById('taskEditSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    if (typeof GoogleDriveStorage !== 'undefined' && GoogleDriveStorage.isAuthorized()) {
      try {
        const folderId = _getFolderId();
        if (folderId) {
          const raw  = await GoogleDriveStorage.load(folderId, 'tasks.json');
          if (raw) {
            const data      = JSON.parse(raw);
            const driveRows = Array.isArray(data) ? data : (data.rows || []);
            const driveRow  = driveRows.find(r => String(r.id) === rowId);
            if (driveRow) {
              const baselineAt = baseline.updated_at || null;
              const driveAt    = driveRow.updated_at  || null;
              if (baselineAt && driveAt && baselineAt !== driveAt) {
                _conflictState = { rowId, baseline, remote: _snapshotRow(driveRow), mine: edits };
                document.getElementById('taskEditOverlay')?.remove();
                _showConflictModal();
                return;
              }
            }
          }
        }
      } catch(e) {
        console.warn('[TTIS] Conflict check failed:', e.message);
      }
    }

    _applyEdits(rowId, row, edits);
  }

  // ── Public: admin break lock ──────────────────────────
  async function breakLock(rowId) {
    if (typeof LockManager === 'undefined') return;
    try {
      await LockManager.breakLock(String(rowId));
      showToast('Lock broken', 'success');
      _render();
    } catch(e) {
      showToast(e.message, 'error');
    }
  }

  // ── Public: resolve conflict ──────────────────────────
  async function resolveConflict(choice) {
    if (!_conflictState) return;
    if (choice === 'cancel') {
      const rowId = _conflictState.rowId;
      _closeConflict();
      if (typeof LockManager !== 'undefined') await LockManager.releaseLock(rowId);
      _editState = null;
      _render();
      return;
    }
    const { rowId, baseline, remote, mine } = _conflictState;
    const row = _allRows.find(r => String(r.id) === rowId);
    if (!row) { showToast('Row no longer found', 'error'); _closeConflict(); return; }

    let edits;
    if (choice === 'mine') {
      edits = mine;
    } else if (choice === 'theirs') {
      edits = remote;
    } else {
      edits = {};
      EDITABLE_FIELDS.forEach(f => {
        const radio = document.querySelector(`input[name="cf_${f.key}"]:checked`);
        edits[f.key] = radio ? radio.value : mine[f.key];
      });
    }

    _closeConflict();
    _applyEdits(rowId, row, edits);
  }

  function _closeConflict() {
    document.getElementById('conflictOverlay')?.remove();
    _conflictState = null;
  }

  // ── Apply edits to the row and save ──────────────────
  function _applyEdits(rowId, row, edits) {
    if (typeof UserManager !== 'undefined') UserManager.stampUpdated(row);

    EDITABLE_FIELDS.forEach(f => {
      if (f.key in edits) row[f.key] = edits[f.key] || '';
    });

    // Close modal and re-render immediately (optimistic)
    _editState = null;
    document.getElementById('taskEditOverlay')?.remove();
    buildDashboard(_allRows);
    _render();

    // Save to Drive in background
    _saveRowsToDrive().then(() => {
      showToast('Row saved successfully', 'success');
      if (typeof SyncManager !== 'undefined') SyncManager.markSynced();
    }).catch(e => {
      showToast('Save failed: ' + e.message + ' — changes kept locally only', 'error');
    });

    if (typeof LockManager !== 'undefined') {
      LockManager.releaseLock(rowId).catch(() => {});
    }
  }

  // ── Edit modal ────────────────────────────────────────
  function _showEditModal(row) {
    document.getElementById('taskEditOverlay')?.remove();

    const fields = EDITABLE_FIELDS.map(f => {
      const val = row[f.key] != null ? String(row[f.key]) : '';
      if (f.type === 'select') {
        const opts = f.options.map(o =>
          `<option value="${_esc(o)}"${o === val ? ' selected' : ''}>${o || '—'}</option>`
        ).join('');
        return `<div class="te-group">
          <label class="te-label">${_esc(f.label)}</label>
          <select class="te-input" id="te_${f.key}">${opts}</select>
        </div>`;
      }
      return `<div class="te-group">
        <label class="te-label">${_esc(f.label)}</label>
        <input class="te-input" id="te_${f.key}" type="text"
               value="${_esc(val)}" placeholder="${_esc(f.placeholder || '')}">
      </div>`;
    }).join('');

    const div = document.createElement('div');
    div.id        = 'taskEditOverlay';
    div.className = 'task-edit-overlay';
    div.innerHTML = `
      <div class="task-edit-modal task-edit-modal-lg">
        <div class="task-edit-header">
          <div>
            <div class="task-edit-title">Edit Task</div>
            <div class="task-edit-meta">#${_esc(String(row.id || ''))} · ${_esc(row.logical_site_id || '')} · ${_esc(row.task_name || '')}</div>
          </div>
          <button class="task-edit-close" onclick="Tasks.cancelEdit()">&#10005;</button>
        </div>
        <div class="task-edit-body">
          <div class="te-grid">${fields}</div>
        </div>
        <div class="task-edit-footer">
          <button class="te-btn te-btn-cancel" onclick="Tasks.cancelEdit()">Cancel</button>
          <button class="te-btn te-btn-save" id="taskEditSaveBtn" onclick="Tasks.saveEdit()">Save Changes</button>
        </div>
      </div>`;
    document.body.appendChild(div);
  }

  // ── Lock blocked modal ────────────────────────────────
  function _showLockBlockedModal(rowId, lockedBy, lockedAt, isAdmin) {
    document.getElementById('taskEditOverlay')?.remove();

    const div = document.createElement('div');
    div.id        = 'taskEditOverlay';
    div.className = 'task-edit-overlay';
    div.innerHTML = `
      <div class="task-edit-modal task-edit-modal-sm">
        <div class="task-edit-header">
          <div class="task-edit-title">&#128274; Row Locked</div>
          <button class="task-edit-close" onclick="document.getElementById('taskEditOverlay')?.remove()">&#10005;</button>
        </div>
        <div class="task-edit-body">
          <div class="lock-blocked-msg">
            <strong>${_esc(lockedBy)}</strong> is currently editing this row.
            ${lockedAt ? `<div class="lock-blocked-time">Locked at ${_esc(lockedAt)}</div>` : ''}
            <div class="lock-blocked-hint">The lock expires automatically after 5 minutes of inactivity.</div>
          </div>
        </div>
        <div class="task-edit-footer">
          <button class="te-btn te-btn-cancel" onclick="document.getElementById('taskEditOverlay')?.remove()">Close</button>
          ${isAdmin ? `<button class="te-btn te-btn-break" onclick="Tasks.breakLock('${_esc(rowId)}');document.getElementById('taskEditOverlay')?.remove()">&#128275; Break Lock (Admin)</button>` : ''}
        </div>
      </div>`;
    document.body.appendChild(div);
  }

  // ── Conflict resolution modal ─────────────────────────
  function _showConflictModal() {
    document.getElementById('conflictOverlay')?.remove();
    const { baseline, remote, mine } = _conflictState;

    const diffFields = EDITABLE_FIELDS.filter(f =>
      (baseline[f.key] || '') !== (remote[f.key] || '') ||
      (baseline[f.key] || '') !== (mine[f.key] || '')
    );

    const rows = diffFields.map(f => {
      const bv = baseline[f.key] || '—';
      const rv = remote[f.key]   || '—';
      const mv = mine[f.key]     || '—';
      const remoteChanged = bv !== rv;
      const mineChanged   = bv !== mv;
      return `<tr>
        <td class="cf-field">${_esc(f.label)}</td>
        <td class="cf-base">${_esc(bv)}</td>
        <td class="cf-remote${remoteChanged ? ' cf-changed' : ''}">${_esc(rv)}</td>
        <td class="cf-mine${mineChanged ? ' cf-changed' : ''}">${_esc(mv)}</td>
        <td class="cf-pick">
          <label class="cf-radio"><input type="radio" name="cf_${f.key}" value="${_esc(rv)}" ${!mineChanged ? 'checked' : ''}> Theirs</label>
          <label class="cf-radio"><input type="radio" name="cf_${f.key}" value="${_esc(mv)}" ${mineChanged ? 'checked' : ''}> Mine</label>
        </td>
      </tr>`;
    }).join('');

    const div = document.createElement('div');
    div.id        = 'conflictOverlay';
    div.className = 'conflict-overlay';
    div.innerHTML = `
      <div class="conflict-modal">
        <div class="conflict-header">
          <span>&#9889; Editing Conflict Detected</span>
          <button class="task-edit-close" onclick="Tasks.resolveConflict('cancel')">&#10005;</button>
        </div>
        <div class="conflict-body">
          <p class="conflict-desc">While you were editing, another user saved changes to this row.
            Review the differences below and choose which values to keep.</p>
          <div class="conflict-table-wrap">
            <table class="conflict-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Original</th>
                  <th>Their Changes</th>
                  <th>Your Changes</th>
                  <th>Keep</th>
                </tr>
              </thead>
              <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text2)">No field differences detected</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="conflict-footer">
          <button class="te-btn te-btn-cancel" onclick="Tasks.resolveConflict('cancel')">Cancel</button>
          <button class="te-btn te-btn-theirs" onclick="Tasks.resolveConflict('theirs')">Keep Their Version</button>
          <button class="te-btn te-btn-merge"  onclick="Tasks.resolveConflict('merge')">Apply Selection</button>
          <button class="te-btn te-btn-save"   onclick="Tasks.resolveConflict('mine')">Keep My Version</button>
        </div>
      </div>`;
    document.body.appendChild(div);
  }

  // ── Save rows to Drive ────────────────────────────────
  async function _saveRowsToDrive() {
    const folderId = _getFolderId();
    if (!folderId) throw new Error('No Drive folder configured');
    if (typeof GoogleDriveStorage === 'undefined' || !GoogleDriveStorage.isAuthorized()) {
      throw new Error('Not connected to Google Drive');
    }
    const payload = JSON.stringify({
      savedAt:  new Date().toISOString(),
      rowCount: _allRows.length,
      rows:     _allRows
    });
    await GoogleDriveStorage.save(folderId, 'tasks.json', payload);
  }

  function _getFolderId() {
    try {
      const s = JSON.parse(localStorage.getItem('TTIS_CONFIG') || '{}').gdsync?.folderId || '';
      if (s) return s;
      return (typeof DEFAULT_CONFIG !== 'undefined' ? DEFAULT_CONFIG.driveFolderId : '') || '';
    } catch { return ''; }
  }

  function _snapshotRow(r) {
    const snap = {};
    EDITABLE_FIELDS.forEach(f => { snap[f.key] = r[f.key] != null ? String(r[f.key]) : ''; });
    snap.updated_at = r.updated_at || null;
    return snap;
  }

  // ── Expose ────────────────────────────────────────────
  return { init, applyFilters, clearFilters, sortBy, openEdit, cancelEdit, saveEdit, breakLock, resolveConflict, _onDateYearChange, _onDateMonthChange };
})();

// ── Shared helpers ────────────────────────────────────────
function _statusBadge(s, raw) {
  if (!s) return '<span class="badge badge-pending">—</span>';
  const tip = (raw && raw !== s) ? ` title="${_esc(raw)}"` : '';
  if (s === 'Done')        return `<span class="badge badge-done"${tip}>${_esc(s)}</span>`;
  if (s === 'Cancelled')   return `<span class="badge badge-cancel"${tip}>${_esc(s)}</span>`;
  if (s === 'In Progress') return `<span class="badge badge-pending"${tip}>${_esc(s)}</span>`;
  const lc = s.toLowerCase();
  if (lc === 'done')      return `<span class="badge badge-done"${tip}>${_esc(s)}</span>`;
  if (/cancel/.test(lc)) return `<span class="badge badge-cancel"${tip}>${_esc(s)}</span>`;
  if (lc === 'assigned')  return `<span class="badge badge-assigned"${tip}>${_esc(s)}</span>`;
  return `<span class="badge badge-pending"${tip}>${_esc(s)}</span>`;
}

function _acceptBadge(s) {
  if (!s) return '<span class="badge badge-pending">—</span>';
  const cls = s === 'FAC' ? 'badge-fac' : s === 'TOC' ? 'badge-toc' : s === 'PAC' ? 'badge-pac' : 'badge-pending';
  return `<span class="badge ${cls}">${_esc(s)}</span>`;
}

function _poBadge(s) {
  if (!s) return '<span class="badge badge-pending">Pending</span>';
  if (/received/i.test(s) && !/partial/i.test(s)) return `<span class="badge badge-recv">${_esc(s)}</span>`;
  if (/partial/i.test(s)) return `<span class="badge badge-partial">${_esc(s)}</span>`;
  return `<span class="badge badge-pending">${_esc(s)}</span>`;
}

function _priceBadge(r) {
  if (r.price_unmatched)
    return `<span class="badge badge-price-warn" title="${_esc(r.line_item_raw || r.line_item || '')}">&#9888; Unmatched</span>`;
  if (r.line_item_code)
    return `<span class="badge badge-price-ok">${_esc(r.line_item_code)}</span>`;
  return '';
}

function _totalPriceCell(r) {
  if (!r.total_price) return '<span style="color:var(--text-dim)">—</span>';
  const stale   = typeof PriceList !== 'undefined' && PriceList.isPriceStale(r);
  const tooltip = typeof PriceList !== 'undefined' ? PriceList.getTooltipText(r) : '';
  const staleBadge = stale ? ' <span class="badge-price-stale" title="Price list has been updated since this was calculated">&#128176;</span>' : '';
  return tooltip
    ? `<span style="color:var(--text);cursor:help;border-bottom:1px dotted var(--border)" title="${_esc(tooltip)}">${fmtEGP(r.total_price)}</span>${staleBadge}`
    : `<span style="color:var(--text)">${fmtEGP(r.total_price)}</span>${staleBadge}`;
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _auditTitle(r) {
  const parts = [];
  if (r.created_by) parts.push(`Created by ${r.created_by}${r.created_at ? ' · ' + new Date(r.created_at).toLocaleString() : ''}`);
  if (r.updated_by) parts.push(`Updated by ${r.updated_by}${r.updated_at ? ' · ' + new Date(r.updated_at).toLocaleString() : ''}`);
  if (!parts.length) return '';
  return ` class="row-audited" title="${_esc(parts.join('\n'))}"`;
}

function _renderPagination(id, cur, total, cb) {
  const el = document.getElementById(id);
  if (!el) return;
  if (total <= 1) { el.innerHTML = ''; return; }

  const pages = [];
  if (cur > 1) pages.push({ label: '‹', pg: cur - 1, active: false });

  const start = Math.max(1, cur - 2);
  const end   = Math.min(total, cur + 2);
  if (start > 1) { pages.push({ label: '1', pg: 1 }); if (start > 2) pages.push({ label: '…', pg: null }); }
  for (let i = start; i <= end; i++) pages.push({ label: i, pg: i, active: i === cur });
  if (end < total) { if (end < total - 1) pages.push({ label: '…', pg: null }); pages.push({ label: total, pg: total }); }
  if (cur < total) pages.push({ label: '›', pg: cur + 1, active: false });

  el.innerHTML = pages.map(({ label, pg, active }) => {
    const dis = !pg || active;
    return `<button class="page-btn${active ? ' active' : ''}" ${dis ? 'disabled' : ''} ${pg ? `data-pg="${pg}"` : ''}>${label}</button>`;
  }).join('');

  el.onclick = e => {
    const btn = e.target.closest('.page-btn');
    if (!btn || btn.disabled) return;
    const pg = Number(btn.dataset.pg);
    if (pg) cb(pg);
  };
}

function _updateSortHeaders(tableId, col, dir) {
  const table = document.getElementById(tableId);
  if (!table) return;
  table.querySelectorAll('th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    const fn = th.getAttribute('onclick') || '';
    if (fn.includes(`'${col}'`)) {
      th.classList.add(dir === 1 ? 'sort-asc' : 'sort-desc');
    }
  });
}
