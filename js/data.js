/* ══════════════════════════════════════════════════════
   TTIS — data.js  |  SheetJS parsing + column mapping
   ══════════════════════════════════════════════════════ */

'use strict';

// Column name → internal key mapping
const COL_MAP = {
  'ID#':                  'id',
  'Job Code':             'job_code',
  'TX/RF':                'tx_rf',
  'Vendor':               'vendor',
  'Physical Site ID':     'physical_site_id',
  'Logical Site ID':      'logical_site_id',
  'Site Option':          'site_option',
  'Region':               'region',
  'Sub Region':           'sub_region',
  'Distance':             'distance',
  'Absolute Quantity':    'abs_qty',
  'Actual Quantity':      'act_qty',
  'General Stream':       'stream',
  'Task Name':            'task_name',
  'Contractor':           'contractor',
  "Engineer's Name":      'engineer',
  'Line Item':            'line_item',
  'New Price':            'new_price',
  'New Total Price':      'total_price',
  'Comments':             'comments',
  'Status':               'status',
  'Task Date':            'task_date',
  'VF Task owner':        'vf_owner',
  'Coordinator':          'coordinator',
  'Acceptance Status':    'acceptance_status',
  'FAC Date':             'fac_date',
  'Certificate #':        'certificate',
  'TSR Sub#':             'tsr_sub',
  'PO status':            'po_status',
  'PO number':            'po_number',
  'VF Invoice #':         'vf_invoice',
  '1st Receiving Date':   'recv1_date',
  '1st Receiving Amount': 'recv1_amount',
  '1st Receiving Qnt':    'recv1_qty',
  '2nd Receiving Date':   'recv2_date',
  '2nd Receiving Amount': 'recv2_amount',
  '2nd Receiving Qnt':    'recv2_qty',
  'Remaining Amounts':    'remaining',
  'LMP Portion':          'lmp_portion',
  'Contractor Portion':   'contractor_portion'
};

// Columns that should be treated as numbers
const NUMERIC_KEYS = new Set([
  'new_price','total_price','recv1_amount','recv2_amount',
  'remaining','lmp_portion','contractor_portion',
  'abs_qty','act_qty','recv1_qty','recv2_qty','distance'
]);

// Columns that should be formatted as dates
const DATE_KEYS = new Set([
  'task_date','fac_date','recv1_date','recv2_date'
]);

// The target sheet name
const SHEET_NAME = 'Invoicing Track';
// Headers are on row 4 (1-based), so index 3 (0-based)
const HEADER_ROW = 3;
// Data starts on row 5 (1-based), so index 4 (0-based)
const DATA_START  = 4;

/**
 * Parse an uploaded File object using SheetJS.
 * Returns { rows, fileName, fileSize, rowCount, sheetFound }
 */
function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data   = new Uint8Array(e.target.result);
        const wb     = XLSX.read(data, { type: 'array', cellDates: true, raw: false });

        // Find the target sheet (case-insensitive fallback)
        let sheetName = wb.SheetNames.find(n => n === SHEET_NAME);
        const sheetFound = !!sheetName;
        if (!sheetName) {
          // Try case-insensitive
          sheetName = wb.SheetNames.find(n => n.toLowerCase() === SHEET_NAME.toLowerCase());
        }
        if (!sheetName) {
          // Fall back to first sheet but warn
          sheetName = wb.SheetNames[0];
        }

        const ws = wb.Sheets[sheetName];
        if (!ws) {
          reject(new Error(`Sheet "${SHEET_NAME}" not found in workbook.`));
          return;
        }

        // Read all rows as arrays (raw strings for flexibility)
        const rawRows = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: false,
          dateNF: 'DD/MM/YYYY',
          defval: ''
        });

        if (rawRows.length <= HEADER_ROW) {
          reject(new Error('Sheet appears to be empty or has no data rows.'));
          return;
        }

        // Extract header row and build column index map
        const headers = rawRows[HEADER_ROW];
        const colIndex = {}; // internal key → column array index
        headers.forEach((h, i) => {
          const key = COL_MAP[String(h).trim()];
          if (key) colIndex[key] = i;
        });

        // Parse data rows
        const rows = [];
        for (let ri = DATA_START; ri < rawRows.length; ri++) {
          const raw = rawRows[ri];
          // Skip completely empty rows
          if (!raw || raw.every(cell => cell === '' || cell == null)) continue;

          const row = {};
          for (const [key, idx] of Object.entries(colIndex)) {
            let val = raw[idx];
            if (val === '' || val == null) {
              row[key] = null;
              continue;
            }
            val = String(val).trim();
            if (val === '') { row[key] = null; continue; }

            if (NUMERIC_KEYS.has(key)) {
              const n = parseFloat(val.replace(/,/g, ''));
              row[key] = isNaN(n) ? null : n;
            } else {
              row[key] = val;
            }
          }

          // Need at least an id or site id to be a valid row
          if (!row.id && !row.logical_site_id && !row.job_code) continue;

          // Normalise status
          const { status, status_raw } = normalizeStatus(row.status);
          row.status     = status;
          row.status_raw = status_raw;

          rows.push(row);
        }

        resolve({
          rows,
          fileName:   file.name,
          fileSize:   file.size,
          rowCount:   rows.length,
          sheetFound,
          sheetUsed:  sheetName,
          allSheets:  wb.SheetNames
        });
      } catch (err) {
        reject(new Error('Failed to parse file: ' + err.message));
      }
    };

    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsArrayBuffer(file);
  });
}

/** Format bytes to human-readable */
function fmtBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/** Count distinct values for a field */
function countBy(rows, field) {
  return rows.reduce((acc, r) => {
    const v = r[field];
    if (v) acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
}

/** Format number to compact string (1.2M, 450K, etc.) */
function fmtCompact(n) {
  if (!n && n !== 0) return '—';
  if (Math.abs(n) >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6)  return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3)  return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Format as Egyptian Pounds */
function fmtEGP(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' EGP';
}

/** Integer percentage, guarded against divide-by-zero */
function pct(a, b) {
  return b ? Math.round((a / b) * 100) : 0;
}

/** Format integer with locale separator */
function fmt(n) {
  return typeof n === 'number' ? n.toLocaleString() : (n || '—');
}

/**
 * Normalise a raw Status cell value.
 * Returns { status, status_raw } where status is one of:
 *   'Done'        — raw contains: fac, approved, done
 *   'Cancelled'   — raw contains: cancel, duplicat, transfer, wrong
 *   'In Progress' — everything else
 */
function normalizeStatus(raw) {
  if (!raw) return { status: null, status_raw: null };
  const lc = String(raw).toLowerCase();
  let status;
  if (/fac|approved|done/.test(lc))                          status = 'Done';
  else if (/cancel|duplicat|transfer|wrong/.test(lc))        status = 'Cancelled';
  else                                                         status = 'In Progress';
  return { status, status_raw: String(raw).trim() };
}
