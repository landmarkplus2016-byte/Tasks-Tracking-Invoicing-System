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
        <select id="tStatus" onchange="Tasks.applyFilters()">
          <option value="">All Statuses</option>
        </select>
        <select id="tAcceptance" onchange="Tasks.applyFilters()">
          <option value="">All Acceptance</option>
        </select>
        <select id="tRegion" onchange="Tasks.applyFilters()">
          <option value="">All Regions</option>
        </select>
        <select id="tVendor" onchange="Tasks.applyFilters()">
          <option value="">All Vendors</option>
        </select>
        <select id="tStream" onchange="Tasks.applyFilters()">
          <option value="">All Streams</option>
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
                <th onclick="Tasks.sortBy('physical_site_id')">Physical Site ID</th>
                <th onclick="Tasks.sortBy('region')">Region</th>
                <th onclick="Tasks.sortBy('sub_region')">Sub Region</th>
                <th onclick="Tasks.sortBy('vendor')">Vendor</th>
                <th onclick="Tasks.sortBy('tx_rf')">TX/RF</th>
                <th onclick="Tasks.sortBy('stream')">Stream</th>
                <th onclick="Tasks.sortBy('task_name')">Task Name</th>
                <th onclick="Tasks.sortBy('contractor')">Contractor</th>
                <th onclick="Tasks.sortBy('engineer')">Engineer</th>
                <th onclick="Tasks.sortBy('line_item')">Line Item</th>
                <th onclick="Tasks.sortBy('act_qty')">Act. Qty</th>
                <th onclick="Tasks.sortBy('total_price')">Total Price</th>
                <th onclick="Tasks.sortBy('status')">Status</th>
                <th onclick="Tasks.sortBy('task_date')">Task Date</th>
                <th onclick="Tasks.sortBy('acceptance_status')">Acceptance</th>
                <th onclick="Tasks.sortBy('fac_date')">FAC Date</th>
                <th onclick="Tasks.sortBy('tsr_sub')">TSR Sub#</th>
                <th onclick="Tasks.sortBy('po_status')">PO Status</th>
                <th onclick="Tasks.sortBy('coordinator')">Coordinator</th>
                <th onclick="Tasks.sortBy('vf_owner')">VF Owner</th>
                <th>Price</th>
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
    _fillSelect('tStatus',     _unique(_allRows, 'status'));
    _fillSelect('tAcceptance', _unique(_allRows, 'acceptance_status'));
    _fillSelect('tRegion',     _unique(_allRows, 'region'));
    _fillSelect('tVendor',     _unique(_allRows, 'vendor'));
    _fillSelect('tStream',     _unique(_allRows, 'stream'));
  }

  function _unique(rows, field) {
    return [...new Set(rows.map(r => r[field]).filter(Boolean))].sort();
  }

  function _fillSelect(id, items) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const first = sel.options[0].outerHTML;
    sel.innerHTML = first + items.map(v =>
      `<option value="${_esc(v)}">${_esc(v)}</option>`).join('');
  }

  // ── Filter logic ──────────────────────────────────────
  function applyFilters() {
    const q   = (document.getElementById('tSearch')?.value     || '').toLowerCase().trim();
    const st  =  document.getElementById('tStatus')?.value     || '';
    const ac  =  document.getElementById('tAcceptance')?.value || '';
    const rg  =  document.getElementById('tRegion')?.value     || '';
    const vn  =  document.getElementById('tVendor')?.value     || '';
    const sm  =  document.getElementById('tStream')?.value     || '';

    _filtered = _allRows.filter(r => {
      if (st && r.status             !== st) return false;
      if (ac && r.acceptance_status  !== ac) return false;
      if (rg && r.region             !== rg) return false;
      if (vn && r.vendor             !== vn) return false;
      if (sm && r.stream             !== sm) return false;
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
    ['tSearch','tStatus','tAcceptance','tRegion','tVendor','tStream']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
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
      tbody.innerHTML = `<tr><td colspan="24" class="empty-state">
        <div class="empty-state-text">No matching records</div></td></tr>`;
    } else {
      tbody.innerHTML = slice.map(r => `
        <tr>
          <td>${_esc(r.id || '')}</td>
          <td>${_esc(r.job_code || '')}</td>
          <td>${_esc(r.logical_site_id || '')}</td>
          <td>${_esc(r.physical_site_id || '')}</td>
          <td>${_esc(r.region || '')}</td>
          <td>${_esc(r.sub_region || '')}</td>
          <td>${_esc(r.vendor || '')}</td>
          <td>${_esc(r.tx_rf || '')}</td>
          <td>${_esc(r.stream || '')}</td>
          <td style="max-width:160px" title="${_esc(r.task_name || '')}">${_esc(r.task_name || '')}</td>
          <td>${_esc(r.contractor || '')}</td>
          <td>${_esc(r.engineer || '')}</td>
          <td style="max-width:160px" title="${_esc(r.line_item || '')}">${_esc(r.line_item || '')}</td>
          <td style="text-align:right">${r.act_qty != null ? r.act_qty : '—'}</td>
          <td style="text-align:right">${_totalPriceCell(r)}</td>
          <td>${_statusBadge(r.status)}</td>
          <td>${_esc(r.task_date || '—')}</td>
          <td>${_acceptBadge(r.acceptance_status)}</td>
          <td>${_esc(r.fac_date || '—')}</td>
          <td>${_esc(r.tsr_sub || '—')}</td>
          <td>${_poBadge(r.po_status)}</td>
          <td>${_esc(r.coordinator || '')}</td>
          <td>${_esc(r.vf_owner || '')}</td>
          <td>${_priceBadge(r)}</td>
        </tr>`).join('');
    }

    const infoEl = document.getElementById('tPageInfo');
    if (infoEl) infoEl.textContent = `Page ${_page} of ${pages} · ${total.toLocaleString()} records`;

    _renderPagination('tPageBtns', _page, pages, p => { _page = p; _render(); });
  }

  // ── Expose ────────────────────────────────────────────
  return { init, applyFilters, clearFilters, sortBy };
})();

// ── Shared helpers ────────────────────────────────────────
function _statusBadge(s) {
  if (!s) return '<span class="badge badge-pending">—</span>';
  const lc = s.toLowerCase();
  if (lc === 'done') return `<span class="badge badge-done">${_esc(s)}</span>`;
  if (lc === 'assigned') return `<span class="badge badge-assigned">${_esc(s)}</span>`;
  if (/cancel/.test(lc)) return `<span class="badge badge-cancel">${_esc(s)}</span>`;
  return `<span class="badge badge-pending">${_esc(s)}</span>`;
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
    return `<button class="page-btn${active ? ' active' : ''}" ${dis ? 'disabled' : ''}
      onclick="${pg ? `(${cb})(${pg})` : ''}">${label}</button>`;
  }).join('');
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
