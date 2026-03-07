/* ══════════════════════════════════════════════════════
   TTIS — readiness.js  |  Invoice Readiness tab
   ══════════════════════════════════════════════════════
   Ready criteria:  acceptance_status FAC or TOC
                    fac_date present
                    tsr_sub  empty
                    po_status empty
   TSR logic:       groups ready rows by line_item,
                    sums (act_qty × distance multiplier),
                    compares total needed vs TSR remaining
                    → OK / EXCEEDS / NOT_FOUND per line_item
   De-dup:          loads previously exported TTIS file,
                    extracts ID# column, marks matched rows
   Export:          all original tracking columns
   ══════════════════════════════════════════════════════ */

'use strict';

const Readiness = (() => {

  // ── State ─────────────────────────────────────────────
  let _allRows    = [];   // full dataset from main upload
  let _readyRows  = [];   // rows passing ready criteria
  let _tsrMap     = {};   // normalised lineItem → remaining qty
  let _tsrLoaded  = false;
  let _prevIds    = new Set(); // ID# values from previous export
  let _prevLoaded = false;
  let _analysed   = [];   // _readyRows + ._tsrStatus + ._alreadyInvoiced
  let _filtered   = [];
  let _page       = 1;
  let _sortCol    = null;
  let _sortDir    = 1;
  let _selected   = new Set(); // ID# strings checked for export
  const PAGE_SZ   = 100;

  // Export column map: [Excel header, internal field key]
  const EXPORT_COLS = [
    ['ID#',                  'id'],
    ['Job Code',             'job_code'],
    ['TX/RF',                'tx_rf'],
    ['Vendor',               'vendor'],
    ['Physical Site ID',     'physical_site_id'],
    ['Logical Site ID',      'logical_site_id'],
    ['Site Option',          'site_option'],
    ['Region',               'region'],
    ['Sub Region',           'sub_region'],
    ['Distance',             'distance'],
    ['Absolute Quantity',    'abs_qty'],
    ['Actual Quantity',      'act_qty'],
    ['General Stream',       'stream'],
    ['Task Name',            'task_name'],
    ['Contractor',           'contractor'],
    ["Engineer's Name",      'engineer'],
    ['Line Item',            'line_item'],
    ['New Price',            'new_price'],
    ['New Total Price',      'total_price'],
    ['Comments',             'comments'],
    ['Status',               'status'],
    ['Task Date',            'task_date'],
    ['VF Task owner',        'vf_owner'],
    ['Coordinator',          'coordinator'],
    ['Acceptance Status',    'acceptance_status'],
    ['FAC Date',             'fac_date'],
    ['Certificate #',        'certificate'],
    ['TSR Sub#',             'tsr_sub'],
    ['PO status',            'po_status'],
    ['PO number',            'po_number'],
    ['VF Invoice #',         'vf_invoice'],
    ['1st Receiving Date',   'recv1_date'],
    ['1st Receiving Amount', 'recv1_amount'],
    ['1st Receiving Qnt',    'recv1_qty'],
    ['2nd Receiving Date',   'recv2_date'],
    ['2nd Receiving Amount', 'recv2_amount'],
    ['2nd Receiving Qnt',    'recv2_qty'],
    ['Remaining Amounts',    'remaining'],
    ['LMP Portion',          'lmp_portion'],
    ['Contractor Portion',   'contractor_portion'],
  ];

  // ── Public init ───────────────────────────────────────
  function init(rows) {
    _allRows   = rows;
    _readyRows = rows.filter(_isReady);
    _selected.clear();
    _tsrLoaded  = false;
    _prevLoaded = false;
    _tsrMap     = {};
    _prevIds.clear();
    _renderShell();
    _runAnalysis();
    _populateSelects();
    applyFilters_r();
  }

  // ── Ready criteria ────────────────────────────────────
  function _isReady(r) {
    const ac = (r.acceptance_status || '').toUpperCase().trim();
    if (ac !== 'FAC' && ac !== 'TOC') return false;
    if (!r.fac_date) return false;
    if (r.tsr_sub && String(r.tsr_sub).trim() !== '') return false;
    if (r.po_status && String(r.po_status).trim() !== '') return false;
    return true;
  }

  // ── Distance multiplier (matches TSR Check logic) ─────
  function _distMult(r) {
    const raw = String(r.distance || '').toLowerCase().replace(/km/gi, '').trim();
    const d = parseFloat(raw);
    if (isNaN(d))  return 1.0;
    if (d <= 100)  return 1.0;
    if (d <= 400)  return 1.1;
    if (d <= 800)  return 1.2;
    return 1.25;
  }

  function _reqQty(r) {
    const qty = r.act_qty != null ? r.act_qty
              : r.abs_qty != null ? r.abs_qty : 1;
    return qty * _distMult(r);
  }

  function _normItem(s) {
    return String(s || '').toLowerCase().trim();
  }

  // ── Core analysis ─────────────────────────────────────
  // Called after any change to _tsrMap, _prevIds, or _readyRows.
  function _runAnalysis() {
    const isInvoiced = r => _prevLoaded && _prevIds.has(String(r.id || '').trim());

    // 1. Sum needed qty per line_item (non-invoiced rows only)
    const neededPerItem = {};
    for (const r of _readyRows) {
      if (isInvoiced(r)) continue;
      const k = _normItem(r.line_item);
      neededPerItem[k] = (neededPerItem[k] || 0) + _reqQty(r);
    }

    // 2. TSR status per line_item group
    const lineItemStatus = {};
    if (_tsrLoaded) {
      for (const [k, needed] of Object.entries(neededPerItem)) {
        let rem = null;
        // exact match
        if (_tsrMap[k] !== undefined) {
          rem = _tsrMap[k];
        } else {
          // substring fallback (both directions)
          for (const [tk, tv] of Object.entries(_tsrMap)) {
            if (tk.includes(k) || k.includes(tk)) { rem = tv; break; }
          }
        }
        lineItemStatus[k] = rem === null ? 'NOT_FOUND'
                          : rem >= needed ? 'OK' : 'EXCEEDS';
      }
    }

    // 3. Build _analysed rows
    _analysed = _readyRows.map(r => {
      const inv = isInvoiced(r);
      const k   = _normItem(r.line_item);
      const tsr = _tsrLoaded && !inv
                  ? (lineItemStatus[k] || 'NOT_FOUND')
                  : null;
      return { ...r, _alreadyInvoiced: inv, _tsrStatus: tsr };
    });
  }

  // ── Shell HTML ────────────────────────────────────────
  function _renderShell() {
    document.getElementById('sec-readiness').innerHTML = `

      <div id="rKpiGrid" class="kpi-grid"></div>

      <!-- Optional file loaders -->
      <div class="r-upload-row">

        <div class="r-upload-zone" id="rTsrZone">
          <div class="r-upload-zone-icon tsr">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M5 3h9l5 5v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"
                    stroke="var(--cyan)" stroke-width="1.4"/>
              <path d="M14 3v5h5" stroke="var(--cyan)" stroke-width="1.4"/>
              <path d="M8 13 L11 10 L14 13" stroke="var(--cyan)" stroke-width="1.3"
                    stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="11" y1="10" x2="11" y2="17"
                    stroke="var(--cyan)" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="r-upload-text">
            <div class="r-upload-title">
              TSR File
              <span class="r-opt-badge">optional</span>
            </div>
            <div class="r-upload-hint">Checks remaining TSR qty per line item</div>
          </div>
          <div class="r-upload-status" id="rTsrStatus">
            <span class="r-dot neutral"></span>
            <span class="r-dot-label">Not loaded</span>
          </div>
          <button class="r-file-btn" onclick="document.getElementById('rTsrInput').click()">
            Browse
          </button>
          <input type="file" id="rTsrInput" accept=".xlsm,.xlsx,.xls"
                 style="display:none"
                 onchange="Readiness.loadTsrFile(this.files[0])">
        </div>

        <div class="r-upload-zone" id="rPrevZone">
          <div class="r-upload-zone-icon prev">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="8" stroke="var(--amber)" stroke-width="1.4"/>
              <path d="M8 11l2 2 4-4" stroke="var(--amber)" stroke-width="1.4"
                    stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="r-upload-text">
            <div class="r-upload-title">
              Previous Export
              <span class="r-opt-badge">optional</span>
            </div>
            <div class="r-upload-hint">Marks already-invoiced tasks by ID#</div>
          </div>
          <div class="r-upload-status" id="rPrevStatus">
            <span class="r-dot neutral"></span>
            <span class="r-dot-label">Not loaded</span>
          </div>
          <button class="r-file-btn amber"
                  onclick="document.getElementById('rPrevInput').click()">
            Browse
          </button>
          <input type="file" id="rPrevInput" accept=".xlsm,.xlsx,.xls"
                 style="display:none"
                 onchange="Readiness.loadPrevExport(this.files[0])">
        </div>

      </div>

      <!-- Filter bar -->
      <div class="filter-bar">
        <input id="rSearch" type="text"
               placeholder="Search by Site ID, Job Code, Line Item, Coordinator…"
               oninput="Readiness.applyFilters_r()">
        <select id="rFRegion" onchange="Readiness.applyFilters_r()">
          <option value="">All Regions</option>
        </select>
        <select id="rFVendor" onchange="Readiness.applyFilters_r()">
          <option value="">All Vendors</option>
        </select>
        <select id="rFAccept" onchange="Readiness.applyFilters_r()">
          <option value="">FAC &amp; TOC</option>
          <option value="FAC">FAC Only</option>
          <option value="TOC">TOC Only</option>
        </select>
        <select id="rFTsr" onchange="Readiness.applyFilters_r()" style="display:none">
          <option value="">All TSR Status</option>
          <option value="OK">OK</option>
          <option value="EXCEEDS">EXCEEDS</option>
          <option value="NOT_FOUND">NOT FOUND</option>
        </select>
        <select id="rFInvoiced" onchange="Readiness.applyFilters_r()">
          <option value="new">New Only</option>
          <option value="all">Show All</option>
          <option value="invoiced">Already Invoiced</option>
        </select>
        <span class="filter-count" id="rCount">— rows</span>
        <button class="clear-btn" onclick="Readiness.clearFilters_r()">✕ Clear</button>
      </div>

      <!-- Table -->
      <div class="table-wrap">
        <div class="table-scroll">
          <table id="rTable">
            <thead>
              <tr>
                <th style="width:36px;text-align:center;padding:10px 8px">
                  <input type="checkbox" id="rSelectAll"
                         onchange="Readiness.toggleSelectAll(this.checked)"
                         style="cursor:pointer;width:14px;height:14px;accent-color:var(--cyan)">
                </th>
                <th onclick="Readiness.sortBy_r('id')">ID</th>
                <th onclick="Readiness.sortBy_r('job_code')">Job Code</th>
                <th onclick="Readiness.sortBy_r('logical_site_id')">Site ID</th>
                <th onclick="Readiness.sortBy_r('region')">Region</th>
                <th onclick="Readiness.sortBy_r('sub_region')">Sub Region</th>
                <th onclick="Readiness.sortBy_r('vendor')">Vendor</th>
                <th onclick="Readiness.sortBy_r('stream')">Stream</th>
                <th onclick="Readiness.sortBy_r('line_item')">Line Item</th>
                <th onclick="Readiness.sortBy_r('act_qty')">Act. Qty</th>
                <th onclick="Readiness.sortBy_r('total_price')">Total Price</th>
                <th onclick="Readiness.sortBy_r('acceptance_status')">Acceptance</th>
                <th onclick="Readiness.sortBy_r('fac_date')">FAC Date</th>
                <th onclick="Readiness.sortBy_r('coordinator')">Coordinator</th>
                <th id="rThTsr" onclick="Readiness.sortBy_r('_tsrStatus')"
                    style="display:none">TSR Status</th>
                <th id="rThInv">Invoiced?</th>
              </tr>
            </thead>
            <tbody id="rBody"></tbody>
          </table>
        </div>

        <!-- Footer: pagination + export -->
        <div class="r-table-footer">
          <div class="pagination" style="border-top:none;flex:1">
            <span class="page-info" id="rPageInfo"></span>
            <div class="page-btns" id="rPageBtns"></div>
          </div>
          <div class="r-export-area">
            <span class="r-sel-count" id="rSelCount">0 selected</span>
            <button class="r-export-btn" onclick="Readiness.exportExcel()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8M4 6l3 3 3-3"
                      stroke="currentColor" stroke-width="1.5"
                      stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 11h10" stroke="currentColor"
                      stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              Export to Excel
            </button>
          </div>
        </div>
      </div>`;

    _buildKPIs();
  }

  // ── KPI cards ──────────────────────────────────────────
  function _buildKPIs() {
    const totalAccepted = _allRows.filter(r => {
      const ac = (r.acceptance_status || '').toUpperCase().trim();
      return ac === 'FAC' || ac === 'TOC';
    }).length;

    const ready     = _readyRows.length;
    const invoiced  = _prevLoaded
      ? _readyRows.filter(r => _prevIds.has(String(r.id || '').trim())).length
      : null;
    const netNew    = invoiced !== null ? ready - invoiced : ready;

    let canSubmit = null, needPo = null;
    if (_tsrLoaded) {
      canSubmit = _analysed.filter(r => !r._alreadyInvoiced && r._tsrStatus === 'OK').length;
      needPo    = _analysed.filter(r => !r._alreadyInvoiced &&
                    (r._tsrStatus === 'EXCEEDS' || r._tsrStatus === 'NOT_FOUND')).length;
    }

    const valueReady = _analysed
      .filter(r => !r._alreadyInvoiced)
      .reduce((s, r) => s + (r.total_price || 0), 0);

    const el = document.getElementById('rKpiGrid');
    if (!el) return;

    el.innerHTML = `
      <div class="kpi-card c-blue">
        <div class="kpi-label">Total FAC / TOC</div>
        <div class="kpi-value">${fmt(totalAccepted)}</div>
        <div class="kpi-sub">Tasks with accepted status</div>
      </div>
      <div class="kpi-card c-cyan">
        <div class="kpi-label">Ready to Invoice</div>
        <div class="kpi-value">${fmt(ready)}</div>
        <div class="kpi-sub">FAC/TOC · FAC Date · No TSR/PO</div>
      </div>
      ${invoiced !== null ? `
      <div class="kpi-card c-amber">
        <div class="kpi-label">Already Invoiced</div>
        <div class="kpi-value">${fmt(invoiced)}</div>
        <div class="kpi-sub">Matched from previous export</div>
      </div>
      <div class="kpi-card c-green">
        <div class="kpi-label">Net New</div>
        <div class="kpi-value">${fmt(netNew)}</div>
        <div class="kpi-badge up">Ready to submit</div>
      </div>` : ''}
      ${canSubmit !== null ? `
      <div class="kpi-card c-green">
        <div class="kpi-label">Can Submit</div>
        <div class="kpi-value">${fmt(canSubmit)}</div>
        <div class="kpi-sub">TSR qty sufficient</div>
      </div>
      <div class="kpi-card c-red">
        <div class="kpi-label">Need PO</div>
        <div class="kpi-value">${fmt(needPo)}</div>
        <div class="kpi-sub">EXCEEDS or NOT FOUND in TSR</div>
      </div>` : ''}
      <div class="kpi-card c-purple">
        <div class="kpi-label">Value Ready (EGP)</div>
        <div class="kpi-value">${fmtCompact(valueReady)}</div>
        <div class="kpi-sub">New items only</div>
      </div>`;
  }

  // ── Select dropdowns ───────────────────────────────────
  function _populateSelects() {
    _fillSel('rFRegion', [...new Set(_readyRows.map(r => r.region).filter(Boolean))].sort());
    _fillSel('rFVendor', [...new Set(_readyRows.map(r => r.vendor).filter(Boolean))].sort());
  }

  function _fillSel(id, items) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const first = sel.options[0].outerHTML;
    sel.innerHTML = first + items.map(v =>
      `<option value="${_esc(v)}">${_esc(v)}</option>`).join('');
  }

  // ── Filter & sort ──────────────────────────────────────
  function applyFilters_r() {
    const q    = (document.getElementById('rSearch')?.value    || '').toLowerCase().trim();
    const rg   =  document.getElementById('rFRegion')?.value   || '';
    const vn   =  document.getElementById('rFVendor')?.value   || '';
    const ac   =  document.getElementById('rFAccept')?.value   || '';
    const tsrF =  document.getElementById('rFTsr')?.value      || '';
    const invF = (document.getElementById('rFInvoiced')?.value || 'new');

    _filtered = _analysed.filter(r => {
      if (rg   && r.region            !== rg)   return false;
      if (vn   && r.vendor            !== vn)   return false;
      if (ac   && r.acceptance_status !== ac)   return false;
      if (tsrF && r._tsrStatus        !== tsrF) return false;
      if (invF === 'new'      &&  r._alreadyInvoiced) return false;
      if (invF === 'invoiced' && !r._alreadyInvoiced) return false;
      if (q) {
        const hay = [r.id, r.job_code, r.logical_site_id, r.physical_site_id,
                     r.line_item, r.region, r.vendor, r.coordinator, r.engineer,
                     r.task_name, r.contractor].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (_sortCol) _doSort();
    _page = 1;

    const countEl = document.getElementById('rCount');
    if (countEl) countEl.textContent = `${_filtered.length.toLocaleString()} rows`;
    _updateSelCount();
    _renderTable();
  }

  function clearFilters_r() {
    ['rSearch', 'rFRegion', 'rFVendor', 'rFAccept', 'rFTsr']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const inv = document.getElementById('rFInvoiced');
    if (inv) inv.value = 'new';
    applyFilters_r();
  }

  function sortBy_r(col) {
    if (_sortCol === col) _sortDir *= -1;
    else { _sortCol = col; _sortDir = 1; }
    _updateSortHeaders('rTable', col, _sortDir);
    _doSort();
    _page = 1;
    _renderTable();
  }

  function _doSort() {
    _filtered.sort((a, b) => {
      const av = a[_sortCol] ?? '';
      const bv = b[_sortCol] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * _sortDir;
      return String(av).localeCompare(String(bv)) * _sortDir;
    });
  }

  // ── Render table ───────────────────────────────────────
  function _renderTable() {
    const total = _filtered.length;
    const pages = Math.ceil(total / PAGE_SZ) || 1;
    const start = (_page - 1) * PAGE_SZ;
    const slice = _filtered.slice(start, start + PAGE_SZ);

    // Show/hide optional columns
    const showTsr = _tsrLoaded;
    const showInv = _prevLoaded;
    const tsrTh   = document.getElementById('rThTsr');
    const invTh   = document.getElementById('rThInv');
    if (tsrTh) tsrTh.style.display = showTsr ? '' : 'none';
    if (invTh) invTh.style.display = showInv ? '' : 'none';

    // Select-all state
    const allChk = slice.length > 0 && slice.every(r => _selected.has(String(r.id || '')));
    const sa = document.getElementById('rSelectAll');
    if (sa) sa.checked = allChk;

    const tbody = document.getElementById('rBody');
    if (!tbody) return;

    if (slice.length === 0) {
      tbody.innerHTML = `<tr><td colspan="16"
        style="text-align:center;padding:48px;color:var(--text3)">
        No matching records</td></tr>`;
    } else {
      tbody.innerHTML = slice.map(r => {
        const inv  = r._alreadyInvoiced;
        const tsr  = r._tsrStatus;
        const rid  = String(r.id || '');
        const chkd = _selected.has(rid) ? 'checked' : '';

        // Row colour class
        const rowCls = inv ? 'r-row-invoiced'
                     : (tsr === 'EXCEEDS' || tsr === 'NOT_FOUND') ? 'r-row-needpo' : '';

        return `<tr class="${rowCls}">
          <td style="text-align:center;padding:9px 8px">
            <input type="checkbox" class="r-row-chk" ${chkd}
                   onchange="Readiness.toggleRow('${_esc(rid)}', this.checked)"
                   style="cursor:pointer;width:14px;height:14px;accent-color:var(--cyan)">
          </td>
          <td>${_esc(r.id        || '')}</td>
          <td>${_esc(r.job_code  || '')}</td>
          <td>${_esc(r.logical_site_id || '')}</td>
          <td>${_esc(r.region    || '')}</td>
          <td>${_esc(r.sub_region|| '')}</td>
          <td>${_esc(r.vendor    || '')}</td>
          <td>${_esc(r.stream    || '')}</td>
          <td style="max-width:160px" title="${_esc(r.line_item||'')}">${_esc(r.line_item || '')}</td>
          <td style="text-align:right">${r.act_qty != null ? r.act_qty : '—'}</td>
          <td style="text-align:right">${r.total_price ? fmtEGP(r.total_price) : '—'}</td>
          <td>${_acceptBadge(r.acceptance_status)}</td>
          <td>${_esc(r.fac_date  || '—')}</td>
          <td>${_esc(r.coordinator || '')}</td>
          <td style="display:${showTsr ? '' : 'none'}">${_tsrBadge(tsr)}</td>
          <td style="display:${showInv ? '' : 'none'}">
            ${inv
              ? '<span class="badge badge-assigned">Invoiced</span>'
              : '<span class="badge badge-recv">New</span>'}
          </td>
        </tr>`;
      }).join('');
    }

    const infoEl = document.getElementById('rPageInfo');
    if (infoEl) infoEl.textContent =
      `Page ${_page} of ${pages} · ${total.toLocaleString()} records`;

    _renderPagination('rPageBtns', _page, pages, p => { _page = p; _renderTable(); });
  }

  function _tsrBadge(s) {
    if (!s) return '—';
    if (s === 'OK')        return '<span class="badge badge-recv">OK</span>';
    if (s === 'EXCEEDS')   return '<span class="badge badge-assigned">EXCEEDS</span>';
    if (s === 'NOT_FOUND') return '<span class="badge badge-cancel">NOT FOUND</span>';
    return '—';
  }

  // ── Row selection ──────────────────────────────────────
  function toggleRow(id, checked) {
    checked ? _selected.add(id) : _selected.delete(id);
    _updateSelCount();
  }

  function toggleSelectAll(checked) {
    const start = (_page - 1) * PAGE_SZ;
    _filtered.slice(start, start + PAGE_SZ).forEach(r => {
      const id = String(r.id || '');
      checked ? _selected.add(id) : _selected.delete(id);
    });
    _renderTable();
    _updateSelCount();
  }

  function _updateSelCount() {
    const el = document.getElementById('rSelCount');
    if (el) el.textContent = `${_selected.size.toLocaleString()} selected`;
  }

  // ── TSR file loader ────────────────────────────────────
  async function loadTsrFile(file) {
    if (!file) return;
    const statusEl = document.getElementById('rTsrStatus');
    _setDot(statusEl, 'loading', 'Reading…');

    try {
      const wb = await _readWb(file);

      // Find "Request Form - VF" sheet (flexible match)
      const shName = wb.SheetNames.find(n =>
          /request\s*form.*vf/i.test(n) || /vf.*request/i.test(n))
        || wb.SheetNames[0];

      const ws      = wb.Sheets[shName];
      const rawRows = XLSX.utils.sheet_to_json(ws, {
        header: 1, raw: false, defval: ''
      });

      // Dynamic header detection: scan col 6 for "item description"
      let hdrIdx = -1;
      for (let i = 0; i < rawRows.length; i++) {
        if (String(rawRows[i][6] || '').toLowerCase().includes('item description')) {
          hdrIdx = i; break;
        }
      }
      if (hdrIdx === -1)
        throw new Error('Header row not found in TSR file. Expected "Item Description" in column G.');

      _tsrMap = {};
      for (let i = hdrIdx + 1; i < rawRows.length; i++) {
        const row  = rawRows[i];
        const desc = String(row[6]  || '').trim();
        const rem  = parseFloat(String(row[50] || '').replace(/,/g, ''));
        if (!desc || isNaN(rem)) continue;
        _tsrMap[desc.toLowerCase()] = rem;
      }

      const count = Object.keys(_tsrMap).length;
      if (count === 0) throw new Error('No line items found in TSR file (col G + col AY).');

      _tsrLoaded = true;
      _setDot(statusEl, 'ok', `${count} line items`);

      // Reveal TSR filter
      const tsrF = document.getElementById('rFTsr');
      if (tsrF) tsrF.style.display = '';

      _runAnalysis();
      _buildKPIs();
      applyFilters_r();
      showToast(`TSR file loaded — ${count} line items`, 'success');

    } catch (err) {
      _setDot(statusEl, 'error', 'Load failed');
      showToast('TSR file error: ' + err.message, 'error');
    }
  }

  // ── Previous export loader ─────────────────────────────
  async function loadPrevExport(file) {
    if (!file) return;
    const statusEl = document.getElementById('rPrevStatus');
    _setDot(statusEl, 'loading', 'Reading…');

    try {
      const wb = await _readWb(file);

      // Prefer TTIS export sheet, else first sheet
      const shName = wb.SheetNames.find(n =>
          /ttis.*invoice.*export/i.test(n) || /invoice.*export/i.test(n))
        || wb.SheetNames[0];

      const ws      = wb.Sheets[shName];
      const rawRows = XLSX.utils.sheet_to_json(ws, {
        header: 1, raw: false, defval: ''
      });

      if (rawRows.length < 2)
        throw new Error('File appears to be empty.');

      // Find ID# column by scanning first 10 rows
      let idCol = -1, dataStart = 0;
      outer:
      for (let ri = 0; ri < Math.min(10, rawRows.length); ri++) {
        for (let ci = 0; ci < rawRows[ri].length; ci++) {
          if (/^id\s*#?$/i.test(String(rawRows[ri][ci]).trim())) {
            idCol = ci; dataStart = ri + 1; break outer;
          }
        }
      }
      if (idCol === -1)
        throw new Error('Could not find "ID#" column in previous export file.');

      _prevIds.clear();
      for (let ri = dataStart; ri < rawRows.length; ri++) {
        const val = String(rawRows[ri][idCol] || '').trim();
        if (val) _prevIds.add(val);
      }

      if (_prevIds.size === 0)
        throw new Error('No ID values found in the previous export file.');

      _prevLoaded = true;
      _setDot(statusEl, 'ok', `${_prevIds.size} IDs loaded`);

      _runAnalysis();
      _buildKPIs();
      applyFilters_r();
      showToast(`Previous export loaded — ${_prevIds.size} already-invoiced IDs`, 'success');

    } catch (err) {
      _setDot(statusEl, 'error', 'Load failed');
      showToast('Previous export error: ' + err.message, 'error');
    }
  }

  // ── Export to Excel ────────────────────────────────────
  function exportExcel() {
    // If rows are selected → export those; otherwise export all visible new rows
    let rows;
    if (_selected.size > 0) {
      rows = _analysed.filter(r => _selected.has(String(r.id || '')));
    } else {
      rows = _filtered.filter(r => !r._alreadyInvoiced);
    }

    if (rows.length === 0) {
      showToast('No rows to export. Select rows or ensure new items are visible.', 'error');
      return;
    }

    const headers = EXPORT_COLS.map(([h]) => h);
    const data    = rows.map(r => EXPORT_COLS.map(([, k]) => r[k] ?? ''));

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

    // Auto column widths (sample first 100 rows)
    ws['!cols'] = headers.map((h, ci) => {
      const maxData = data.slice(0, 100)
        .reduce((mx, row) => Math.max(mx, String(row[ci] || '').length), 0);
      return { wch: Math.min(Math.max(h.length, maxData) + 2, 45) };
    });

    // Freeze header row
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TTIS Invoice Export');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `TTIS_Invoice_Export_${dateStr}.xlsx`);

    showToast(`Exported ${rows.length.toLocaleString()} rows to Excel`, 'success');
  }

  // ── Shared helpers ─────────────────────────────────────
  function _readWb(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => {
        try {
          resolve(XLSX.read(new Uint8Array(e.target.result),
            { type: 'array', cellDates: true, raw: false }));
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsArrayBuffer(file);
    });
  }

  function _setDot(container, state, text) {
    if (!container) return;
    const dot  = container.querySelector('.r-dot');
    const span = container.querySelector('.r-dot-label');
    if (dot)  dot.className  = `r-dot ${state}`;
    if (span) span.textContent = text;
  }

  // ── Public exports ─────────────────────────────────────
  return {
    init,
    applyFilters_r,
    clearFilters_r,
    sortBy_r,
    toggleRow,
    toggleSelectAll,
    loadTsrFile,
    loadPrevExport,
    exportExcel,
  };
})();
