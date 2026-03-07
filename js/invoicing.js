/* ══════════════════════════════════════════════════════
   TTIS — invoicing.js  |  Financial KPIs + invoicing table
   ══════════════════════════════════════════════════════ */

'use strict';

const Invoicing = (() => {
  let _allRows  = [];
  let _filtered = [];
  let _page     = 1;
  let _sortCol  = null;
  let _sortDir  = 1;
  const PAGE_SZ = 100;

  // ── Public API ────────────────────────────────────────
  function init(rows) {
    _allRows = rows;
    _renderShell();
    _buildKPIs();
    _populateSelects();
    applyFilters();
  }

  // ── Shell HTML ────────────────────────────────────────
  function _renderShell() {
    document.getElementById('sec-invoicing').innerHTML = `
      <div id="invHero" class="invoice-hero"></div>

      <div class="filter-bar">
        <input id="invSearch" type="text"
               placeholder="Search by Site ID, PO#, VF Invoice#, TSR Sub#…"
               oninput="Invoicing.applyFilters()">
        <select id="invFPO" onchange="Invoicing.applyFilters()">
          <option value="">All PO Statuses</option>
        </select>
        <select id="invFAccept" onchange="Invoicing.applyFilters()">
          <option value="">All Acceptance</option>
        </select>
        <select id="invFRegion" onchange="Invoicing.applyFilters()">
          <option value="">All Regions</option>
        </select>
        <select id="invFVendor" onchange="Invoicing.applyFilters()">
          <option value="">All Vendors</option>
        </select>
        <span class="filter-count" id="invCount">— rows</span>
        <button class="clear-btn" onclick="Invoicing.clearFilters()">✕ Clear</button>
      </div>

      <div class="table-wrap">
        <div class="table-scroll">
          <table id="invTable">
            <thead>
              <tr>
                <th onclick="Invoicing.sortBy('id')">ID</th>
                <th onclick="Invoicing.sortBy('logical_site_id')">Site ID</th>
                <th onclick="Invoicing.sortBy('region')">Region</th>
                <th onclick="Invoicing.sortBy('vendor')">Vendor</th>
                <th onclick="Invoicing.sortBy('contractor')">Contractor</th>
                <th onclick="Invoicing.sortBy('line_item')">Line Item</th>
                <th onclick="Invoicing.sortBy('act_qty')">Act. Qty</th>
                <th onclick="Invoicing.sortBy('total_price')">Total Price</th>
                <th onclick="Invoicing.sortBy('acceptance_status')">Acceptance</th>
                <th onclick="Invoicing.sortBy('tsr_sub')">TSR Sub#</th>
                <th onclick="Invoicing.sortBy('po_status')">PO Status</th>
                <th onclick="Invoicing.sortBy('po_number')">PO Number</th>
                <th onclick="Invoicing.sortBy('vf_invoice')">VF Invoice#</th>
                <th onclick="Invoicing.sortBy('recv1_date')">1st Recv Date</th>
                <th onclick="Invoicing.sortBy('recv1_amount')">1st Amount</th>
                <th onclick="Invoicing.sortBy('recv1_qty')">1st Qty</th>
                <th onclick="Invoicing.sortBy('recv2_date')">2nd Recv Date</th>
                <th onclick="Invoicing.sortBy('recv2_amount')">2nd Amount</th>
                <th onclick="Invoicing.sortBy('recv2_qty')">2nd Qty</th>
                <th onclick="Invoicing.sortBy('remaining')">Remaining</th>
                <th onclick="Invoicing.sortBy('lmp_portion')">LMP Portion</th>
                <th onclick="Invoicing.sortBy('contractor_portion')">Contr. Portion</th>
              </tr>
            </thead>
            <tbody id="invBody"></tbody>
          </table>
        </div>
        <div class="pagination">
          <span class="page-info" id="invPageInfo"></span>
          <div class="page-btns" id="invPageBtns"></div>
        </div>
      </div>`;
  }

  // ── KPI cards ─────────────────────────────────────────
  function _buildKPIs() {
    const rows     = _allRows;
    const totalVal  = rows.reduce((s, r) => s + (r.total_price       || 0), 0);
    const recv1     = rows.reduce((s, r) => s + (r.recv1_amount      || 0), 0);
    const recv2     = rows.reduce((s, r) => s + (r.recv2_amount      || 0), 0);
    const received  = recv1 + recv2;
    const remaining = rows.reduce((s, r) => s + (r.remaining         || 0), 0);
    const lmpP      = rows.reduce((s, r) => s + (r.lmp_portion       || 0), 0);
    const contrP    = rows.reduce((s, r) => s + (r.contractor_portion|| 0), 0);

    const withInvoice = rows.filter(r => r.total_price || r.po_status || r.tsr_sub || r.recv1_amount).length;
    const collRate    = pct(received, totalVal);

    document.getElementById('invHero').innerHTML = `
      <div class="inv-card c-cyan">
        <div class="inv-card-label">Total Invoice Value</div>
        <div class="inv-card-amount">${fmtEGP(totalVal)}</div>
        <div class="inv-card-sub">${withInvoice.toLocaleString()} invoiced tasks</div>
      </div>
      <div class="inv-card c-green">
        <div class="inv-card-label">Total Received</div>
        <div class="inv-card-amount" style="color:var(--green)">${fmtEGP(received)}</div>
        <div class="inv-card-sub">${collRate}% collection rate</div>
        <div class="inv-progress">
          <div class="progress-bar-bg" style="margin-top:8px">
            <div class="progress-bar-fill" style="width:${collRate}%;background:var(--green)"></div>
          </div>
        </div>
      </div>
      <div class="inv-card c-amber">
        <div class="inv-card-label">Remaining</div>
        <div class="inv-card-amount" style="color:var(--amber)">${fmtEGP(remaining)}</div>
        <div class="inv-card-sub">${pct(remaining, totalVal)}% uncollected</div>
      </div>
      <div class="inv-card c-blue">
        <div class="inv-card-label">1st Receiving</div>
        <div class="inv-card-amount" style="color:var(--cyan)">${fmtEGP(recv1)}</div>
        <div class="inv-card-sub">2nd: ${fmtEGP(recv2)}</div>
      </div>
      <div class="inv-card c-purple">
        <div class="inv-card-label">LMP Portion</div>
        <div class="inv-card-amount" style="color:var(--purple)">${fmtEGP(lmpP)}</div>
        <div class="inv-card-sub">${pct(lmpP, totalVal)}% of total</div>
      </div>
      <div class="inv-card c-red">
        <div class="inv-card-label">Contractor Portion</div>
        <div class="inv-card-amount">${fmtEGP(contrP)}</div>
        <div class="inv-card-sub">${pct(contrP, totalVal)}% of total</div>
      </div>`;
  }

  // ── Populate selects ─────────────────────────────────
  function _populateSelects() {
    _fillSelect('invFPO',     _unique(_allRows, 'po_status'));
    _fillSelect('invFAccept', _unique(_allRows, 'acceptance_status'));
    _fillSelect('invFRegion', _unique(_allRows, 'region'));
    _fillSelect('invFVendor', _unique(_allRows, 'vendor'));
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
    const q   = (document.getElementById('invSearch')?.value  || '').toLowerCase().trim();
    const po  =  document.getElementById('invFPO')?.value     || '';
    const ac  =  document.getElementById('invFAccept')?.value || '';
    const rg  =  document.getElementById('invFRegion')?.value || '';
    const vn  =  document.getElementById('invFVendor')?.value || '';

    _filtered = _allRows.filter(r => {
      if (po && r.po_status          !== po) return false;
      if (ac && r.acceptance_status  !== ac) return false;
      if (rg && r.region             !== rg) return false;
      if (vn && r.vendor             !== vn) return false;
      if (q) {
        const hay = [
          r.id, r.logical_site_id, r.physical_site_id,
          r.po_number, r.vf_invoice, r.tsr_sub,
          r.contractor, r.line_item, r.certificate
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (_sortCol) _sort();
    _page = 1;
    const countEl = document.getElementById('invCount');
    if (countEl) countEl.textContent = `${_filtered.length.toLocaleString()} rows`;
    _render();
  }

  function clearFilters() {
    ['invSearch','invFPO','invFAccept','invFRegion','invFVendor']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    applyFilters();
  }

  // ── Sort ──────────────────────────────────────────────
  function sortBy(col) {
    if (_sortCol === col) _sortDir *= -1;
    else { _sortCol = col; _sortDir = 1; }
    _updateSortHeaders('invTable', col, _sortDir);
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
    const total = _filtered.length;
    const pages = Math.ceil(total / PAGE_SZ) || 1;
    const start = (_page - 1) * PAGE_SZ;
    const slice = _filtered.slice(start, start + PAGE_SZ);

    const tbody = document.getElementById('invBody');
    if (!tbody) return;

    if (slice.length === 0) {
      tbody.innerHTML = `<tr><td colspan="22" class="empty-state">
        <div class="empty-state-text">No matching records</div></td></tr>`;
    } else {
      tbody.innerHTML = slice.map(r => `
        <tr>
          <td>${_esc(r.id || '')}</td>
          <td>${_esc(r.logical_site_id || '')}</td>
          <td>${_esc(r.region || '')}</td>
          <td>${_esc(r.vendor || '')}</td>
          <td>${_esc(r.contractor || '')}</td>
          <td style="max-width:150px" title="${_esc(r.line_item||'')}">${_esc(r.line_item || '')}</td>
          <td style="text-align:right">${r.act_qty != null ? r.act_qty : '—'}</td>
          <td style="text-align:right;color:var(--text);font-weight:500">${r.total_price ? fmtEGP(r.total_price) : '—'}</td>
          <td>${_acceptBadge(r.acceptance_status)}</td>
          <td>${_esc(r.tsr_sub || '—')}</td>
          <td>${_poBadge(r.po_status)}</td>
          <td>${_esc(r.po_number || '—')}</td>
          <td>${_esc(r.vf_invoice || '—')}</td>
          <td>${_esc(r.recv1_date || '—')}</td>
          <td style="text-align:right;color:var(--cyan)">${r.recv1_amount ? fmtEGP(r.recv1_amount) : '—'}</td>
          <td style="text-align:right">${r.recv1_qty != null ? r.recv1_qty : '—'}</td>
          <td>${_esc(r.recv2_date || '—')}</td>
          <td style="text-align:right;color:var(--purple)">${r.recv2_amount ? fmtEGP(r.recv2_amount) : '—'}</td>
          <td style="text-align:right">${r.recv2_qty != null ? r.recv2_qty : '—'}</td>
          <td style="text-align:right;color:var(--amber)">${r.remaining != null ? fmtEGP(r.remaining) : '—'}</td>
          <td style="text-align:right;color:var(--purple)">${r.lmp_portion ? fmtEGP(r.lmp_portion) : '—'}</td>
          <td style="text-align:right">${r.contractor_portion ? fmtEGP(r.contractor_portion) : '—'}</td>
        </tr>`).join('');
    }

    const infoEl = document.getElementById('invPageInfo');
    if (infoEl) infoEl.textContent = `Page ${_page} of ${pages} · ${total.toLocaleString()} records`;
    _renderPagination('invPageBtns', _page, pages, p => { _page = p; _render(); });
  }

  // ── Expose ────────────────────────────────────────────
  return { init, applyFilters, clearFilters, sortBy };
})();
