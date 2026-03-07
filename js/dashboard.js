/* ══════════════════════════════════════════════════════
   TTIS — dashboard.js  |  KPI cards + charts
   ══════════════════════════════════════════════════════ */

'use strict';

const _charts = {};

function buildDashboard(rows) {
  const el = document.getElementById('sec-dashboard');

  // ── Aggregates ──────────────────────────────────────
  const total    = rows.length;
  const done     = rows.filter(r => (r.status || '').toLowerCase() === 'done').length;
  const assigned = rows.filter(r => (r.status || '').toLowerCase() === 'assigned').length;
  const cancelled = rows.filter(r => /cancel/i.test(r.status || '')).length;

  const fac      = rows.filter(r => r.acceptance_status === 'FAC').length;
  const toc      = rows.filter(r => r.acceptance_status === 'TOC').length;
  const pac      = rows.filter(r => r.acceptance_status === 'PAC').length;
  const noAccept = total - fac - toc - pac;

  const totalVal  = rows.reduce((s, r) => s + (r.total_price  || 0), 0);
  const recv1     = rows.reduce((s, r) => s + (r.recv1_amount || 0), 0);
  const recv2     = rows.reduce((s, r) => s + (r.recv2_amount || 0), 0);
  const received  = recv1 + recv2;
  const remaining = rows.reduce((s, r) => s + (r.remaining   || 0), 0);
  const lmpPortion = rows.reduce((s, r) => s + (r.lmp_portion || 0), 0);

  const poRecv    = rows.filter(r => /received/i.test(r.po_status || '')).length;
  const poPartial = rows.filter(r => /partial/i.test(r.po_status || '')).length;
  const poPending = total - poRecv - poPartial;

  // ── KPI Cards ──────────────────────────────────────
  const kpiHtml = `
    <div class="kpi-grid">
      <div class="kpi-card c-cyan">
        <div class="kpi-label">Total Tasks</div>
        <div class="kpi-value">${fmt(total)}</div>
        <div class="kpi-sub">${fmt(poRecv)} with PO Received</div>
      </div>
      <div class="kpi-card c-green">
        <div class="kpi-label">Completed</div>
        <div class="kpi-value">${fmt(done)}</div>
        <div class="kpi-badge up">▲ ${pct(done, total)}%</div>
      </div>
      <div class="kpi-card c-amber">
        <div class="kpi-label">Assigned / Active</div>
        <div class="kpi-value">${fmt(assigned)}</div>
        <div class="kpi-badge warn">${pct(assigned, total)}% of total</div>
      </div>
      <div class="kpi-card c-blue">
        <div class="kpi-label">FAC Accepted</div>
        <div class="kpi-value">${fmt(fac)}</div>
        <div class="kpi-sub">TOC: ${fmt(toc)} &nbsp;|&nbsp; PAC: ${fmt(pac)}</div>
      </div>
      <div class="kpi-card c-purple">
        <div class="kpi-label">Total Invoice Value</div>
        <div class="kpi-value">${fmtCompact(totalVal)}</div>
        <div class="kpi-sub">EGP · LMP: ${fmtCompact(lmpPortion)}</div>
      </div>
      <div class="kpi-card c-red">
        <div class="kpi-label">Remaining</div>
        <div class="kpi-value">${fmtCompact(remaining)}</div>
        <div class="kpi-badge down">${pct(remaining, totalVal)}% uncollected</div>
      </div>
    </div>`;

  // ── Charts ─────────────────────────────────────────
  const chartsHtml = `
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title">Task Status</div>
        <div class="chart-wrap"><canvas id="chartStatus"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Acceptance Status</div>
        <div class="chart-wrap"><canvas id="chartAcceptance"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Tasks by Region</div>
        <div class="region-rows" id="regionBars"></div>
      </div>
      <div class="chart-card chart-vendor">
        <div class="chart-title">Tasks by Vendor</div>
        <div class="chart-wrap"><canvas id="chartVendor"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">PO Status</div>
        <div class="chart-wrap"><canvas id="chartPO"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Invoice Collection Progress</div>
        <div class="inv-progress-panel" id="invProgress"></div>
      </div>
    </div>`;

  el.innerHTML = kpiHtml + chartsHtml;

  // ── Draw charts ────────────────────────────────────
  _buildDonut('chartStatus',
    ['Done', 'Assigned', 'Cancelled', 'Other'],
    [done, assigned, cancelled, Math.max(0, total - done - assigned - cancelled)],
    ['#16a34a', '#d97706', '#dc2626', '#c4d3e8']
  );

  _buildDonut('chartAcceptance',
    ['FAC', 'TOC', 'PAC', 'Pending'],
    [fac, toc, pac, noAccept],
    ['#2563eb', '#7c3aed', '#1a56db', '#c4d3e8']
  );

  _buildDonut('chartPO',
    ['Received', 'Partial', 'Pending'],
    [poRecv, poPartial, poPending],
    ['#16a34a', '#d97706', '#c4d3e8']
  );

  // Vendor — bar chart for better readability with many vendors
  const vendorCounts = countBy(rows, 'vendor');
  const vendorEntries = Object.entries(vendorCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  _buildBar('chartVendor',
    vendorEntries.map(([k]) => _truncate(k, 14)),
    vendorEntries.map(([, v]) => v),
    '#1a56db'
  );

  // Region bars
  const regCounts = countBy(rows, 'region');
  const regEntries = Object.entries(regCounts).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const maxReg = regEntries[0]?.[1] || 1;
  document.getElementById('regionBars').innerHTML = regEntries.map(([r, c]) => `
    <div class="region-row-item">
      <div class="region-row-label">
        <span class="region-row-name" title="${r}">${r || 'Unknown'}</span>
        <span class="region-row-count">${fmt(c)}</span>
      </div>
      <div class="region-row-bar-bg">
        <div class="region-row-bar-fill" style="width:${pct(c, maxReg)}%"></div>
      </div>
    </div>`).join('');

  // Invoice progress panel
  document.getElementById('invProgress').innerHTML = [
    { label: 'Total Value',    val: totalVal,  pctVal: 100,                   color: 'var(--text2)' },
    { label: 'Total Received', val: received,  pctVal: pct(received, totalVal),  color: 'var(--green)' },
    { label: '1st Receiving',  val: recv1,     pctVal: pct(recv1, totalVal),     color: 'var(--cyan)' },
    { label: '2nd Receiving',  val: recv2,     pctVal: pct(recv2, totalVal),     color: 'var(--purple)' },
    { label: 'Remaining',      val: remaining, pctVal: pct(remaining, totalVal), color: 'var(--amber)' },
  ].map(row => `
    <div class="inv-progress-row">
      <div class="inv-progress-labels">
        <span class="inv-progress-label">${row.label}</span>
        <span class="inv-progress-value" style="color:${row.color}">
          ${fmtEGP(row.val)}
          <span class="inv-progress-pct">${row.pctVal}%</span>
        </span>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width:${row.pctVal}%;background:${row.color}"></div>
      </div>
    </div>`).join('');
}

// ── Chart builders ────────────────────────────────────────
function _buildDonut(id, labels, data, colors) {
  const ctx = document.getElementById(id).getContext('2d');
  if (_charts[id]) _charts[id].destroy();
  _charts[id] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#3a5878',
            font: { size: 11, family: 'Inter' },
            padding: 10,
            boxWidth: 10,
            boxHeight: 10
          }
        },
        tooltip: {
          backgroundColor: '#ffffff',
          borderColor: '#c4d3e8',
          borderWidth: 1,
          titleColor: '#0d1e33',
          bodyColor: '#3a5878',
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()}`
          }
        }
      }
    }
  });
}

function _buildBar(id, labels, data, color) {
  const ctx = document.getElementById(id).getContext('2d');
  if (_charts[id]) _charts[id].destroy();
  _charts[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: color + '33',
        borderColor: color,
        borderWidth: 1,
        borderRadius: 3,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff',
          borderColor: '#c4d3e8',
          borderWidth: 1,
          titleColor: '#0d1e33',
          bodyColor: '#3a5878'
        }
      },
      scales: {
        x: {
          grid: { color: '#dce5f0' },
          ticks: { color: '#3a5878', font: { size: 10 } }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#3a5878', font: { size: 10 } }
        }
      }
    }
  });
}

function _truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}
