/* ══════════════════════════════════════════════════════
   TTIS — pricing.js  |  Versioned Price List System
   ══════════════════════════════════════════════════════ */

'use strict';

const PriceList = (() => {
  const STORAGE_KEY = 'TTIS_PRICE_LIST';

  // ── Embedded baseline (admin replaces via upload) ──────
  const BASELINE = {
    version: 1,
    effectiveDate: '01/07/2025',
    uploadDate: '01/07/2025',
    items: [
      { code: 'RF01', description: 'RF Drive Test - Urban Area',              unitPrice: 15000,  unit: 'Task'  },
      { code: 'RF02', description: 'RF Drive Test - Rural Area',              unitPrice: 18000,  unit: 'Task'  },
      { code: 'RF03', description: 'RF Site Survey',                          unitPrice: 8000,   unit: 'Task'  },
      { code: 'RF04', description: 'RF Optimization',                         unitPrice: 12000,  unit: 'Task'  },
      { code: 'RF05', description: 'RF Antenna Swap',                         unitPrice: 7500,   unit: 'Task'  },
      { code: 'RF06', description: 'RF Feeder Replacement',                   unitPrice: 9500,   unit: 'Task'  },
      { code: 'TX01', description: 'TX Link Installation',                    unitPrice: 25000,  unit: 'Task'  },
      { code: 'TX02', description: 'TX Link Commissioning',                   unitPrice: 10000,  unit: 'Task'  },
      { code: 'TX03', description: 'TX Link Survey',                          unitPrice: 6000,   unit: 'Task'  },
      { code: 'TX04', description: 'TX Equipment Upgrade',                    unitPrice: 30000,  unit: 'Task'  },
      { code: 'TX05', description: 'TX Fiber Splicing',                       unitPrice: 4500,   unit: 'Joint' },
      { code: 'DS01', description: 'Data Service Configuration',              unitPrice: 8000,   unit: 'Task'  },
      { code: 'DS02', description: 'Data Service Troubleshooting',            unitPrice: 5000,   unit: 'Task'  },
      { code: 'DS03', description: 'Data Service Upgrade',                    unitPrice: 11000,  unit: 'Task'  },
      { code: 'CI01', description: 'Civil Works - Tower Foundation',          unitPrice: 45000,  unit: 'Task'  },
      { code: 'CI02', description: 'Civil Works - Shelter Installation',      unitPrice: 35000,  unit: 'Task'  },
      { code: 'IN01', description: 'Integration & Acceptance Testing',        unitPrice: 9000,   unit: 'Task'  },
      { code: 'IN02', description: 'Integration - Multi-vendor',              unitPrice: 14000,  unit: 'Task'  },
      { code: 'SW01', description: 'Software Upgrade',                        unitPrice: 6500,   unit: 'Task'  },
      { code: 'SW02', description: 'Software Troubleshooting',                unitPrice: 4000,   unit: 'Task'  },
      { code: 'AC01', description: 'Access Equipment Installation',           unitPrice: 20000,  unit: 'Task'  },
    ]
  };

  let _versions = [];   // sorted ascending by effectiveDate

  // ── Init ──────────────────────────────────────────────
  function init() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { _versions = JSON.parse(stored); } catch { _versions = []; }
    }
    // Ensure baseline v1 always present
    if (!_versions.find(v => v.version === 1)) {
      _versions.unshift(BASELINE);
      _save();
    }
    _versions.sort((a, b) => _parseDate(a.effectiveDate) - _parseDate(b.effectiveDate));
  }

  // ── Storage ───────────────────────────────────────────
  function _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_versions));
  }

  // ── Version accessors ─────────────────────────────────
  function getVersions() { return [..._versions]; }

  function getLatestVersion() {
    return _versions[_versions.length - 1] || BASELINE;
  }

  function getVersionForDate(dateStr) {
    if (!dateStr) return getLatestVersion();
    const d = _parseDate(dateStr);
    if (!d) return getLatestVersion();
    // All versions with effectiveDate <= taskDate, take the latest
    const eligible = _versions.filter(v => _parseDate(v.effectiveDate) <= d);
    return eligible.length ? eligible[eligible.length - 1] : _versions[0];
  }

  // ── Row calculation ───────────────────────────────────
  function calculateForRow(row) {
    const ver = getVersionForDate(row.task_date);
    if (!ver) return;

    const item = _findItem(ver, row);
    if (!item) return;

    const qty = (row.act_qty != null && row.act_qty !== '') ? Number(row.act_qty) : 1;
    const mult = _distanceMultiplier(row.distance_km);
    const total = item.unitPrice * qty * mult;

    row.price_code    = item.code;
    row.price_unit    = item.unit;
    row.price_version = ver.version;
    row.new_price     = item.unitPrice;
    row.total_price   = total;
  }

  function _distanceMultiplier(km) {
    const d = Number(km) || 0;
    if (d <= 100)  return 1.0;
    if (d <= 400)  return 1.1;
    if (d <= 800)  return 1.2;
    return 1.25;
  }

  // ── Stale detection ───────────────────────────────────
  function isPriceStale(row) {
    if (!row.price_version || !row.line_item_code) return false;
    const latestVer = getVersionForDate(row.task_date);
    if (!latestVer) return false;
    if (latestVer.version === row.price_version) return false;
    // Price changed between stored version and current applicable version?
    const storedVer = _versions.find(v => v.version === row.price_version);
    if (!storedVer) return true;
    const storedItem  = _findItem(storedVer, row);
    const currentItem = _findItem(latestVer, row);
    if (!storedItem || !currentItem) return true;
    return storedItem.unitPrice !== currentItem.unitPrice;
  }

  // ── Tooltip text ──────────────────────────────────────
  function getTooltipText(row) {
    if (!row.price_version) return '';
    const ver = _versions.find(v => v.version === row.price_version);
    if (!ver) return '';
    const item = _findItem(ver, row);
    if (!item) return '';
    const qty  = (row.act_qty != null && row.act_qty !== '') ? Number(row.act_qty) : 1;
    const mult = _distanceMultiplier(row.distance_km);
    const multStr = mult !== 1.0 ? ` × ${mult} (distance)` : '';
    return `v${ver.version} (eff. ${ver.effectiveDate}) — ${item.code} @ EGP ${item.unitPrice.toLocaleString()} × ${qty}${multStr} = EGP ${(row.total_price || 0).toLocaleString()}`;
  }

  // ── Preview new version vs current latest ─────────────
  function getPricePreview(newItems) {
    const latest = getLatestVersion();
    const currentMap = {};
    latest.items.forEach(i => { currentMap[i.code] = i; });

    const newMap = {};
    newItems.forEach(i => { newMap[i.code] = i; });

    const allCodes = new Set([...Object.keys(currentMap), ...Object.keys(newMap)]);
    return [...allCodes].sort().map(code => {
      const cur = currentMap[code];
      const nw  = newMap[code];
      if (!cur) return { code, description: nw.description, unitPrice: nw.unitPrice, unit: nw.unit, status: 'new', oldPrice: null, change: null };
      if (!nw)  return { code, description: cur.description, unitPrice: cur.unitPrice, unit: cur.unit, status: 'removed', oldPrice: null, change: null };
      if (nw.unitPrice === cur.unitPrice) return { code, description: nw.description, unitPrice: nw.unitPrice, unit: nw.unit, status: 'unchanged', oldPrice: cur.unitPrice, change: 0 };
      const status = nw.unitPrice > cur.unitPrice ? 'increase' : 'decrease';
      return { code, description: nw.description, unitPrice: nw.unitPrice, unit: nw.unit, status, oldPrice: cur.unitPrice, change: nw.unitPrice - cur.unitPrice };
    });
  }

  // ── Add version ───────────────────────────────────────
  function addVersion(items, effectiveDate) {
    const next = Math.max(..._versions.map(v => v.version)) + 1;
    const today = _todayStr();
    _versions.push({ version: next, effectiveDate, uploadDate: today, items });
    _versions.sort((a, b) => _parseDate(a.effectiveDate) - _parseDate(b.effectiveDate));
    _save();
    return next;
  }

  // ── Parse uploaded Excel ──────────────────────────────
  async function parseUploadedFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const ws   = wb.Sheets[wb.SheetNames[0]];
          const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

          // Detect header row by looking for Activity/Code/Price columns
          let hdrIdx = -1, codeCol = -1, descCol = -1, priceCol = -1, unitCol = -1;
          for (let i = 0; i < Math.min(15, raw.length); i++) {
            const row = raw[i].map(c => String(c).toLowerCase().trim());
            let score = 0, ci = -1, di = -1, pi = -1, ui = -1;
            row.forEach((cell, j) => {
              if (/\bcode\b/.test(cell))                       { ci = j; score++; }
              if (/desc|activity|item|name/.test(cell))        { di = j; score++; }
              if (/price|rate|unit.?price|cost/.test(cell))    { pi = j; score++; }
              if (/\bunit\b/.test(cell))                       { ui = j; score++; }
            });
            if (score >= 2 && pi !== -1) {
              hdrIdx = i; codeCol = ci; descCol = di; priceCol = pi; unitCol = ui;
              break;
            }
          }
          if (hdrIdx === -1) return reject(new Error('Could not detect header row. Expected columns: Code, Description, Price, Unit'));

          const items = [];
          for (let i = hdrIdx + 1; i < raw.length; i++) {
            const row  = raw[i];
            const code = codeCol >= 0 ? String(row[codeCol] || '').trim() : '';
            const desc = descCol >= 0 ? String(row[descCol] || '').trim() : '';
            const price = priceCol >= 0 ? Number(row[priceCol]) : 0;
            const unit  = unitCol >= 0 ? String(row[unitCol] || '').trim() || 'Task' : 'Task';
            if (!code && !desc) continue;
            if (!price || isNaN(price)) continue;
            items.push({ code, description: desc, unitPrice: price, unit });
          }
          if (!items.length) return reject(new Error('No valid price items found in file'));
          resolve(items);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Recalculate tasks ─────────────────────────────────
  function recalculateTasks(rows, mode) {
    // mode: 'new' = only rows without a price_version, 'all' = all rows
    const latestVer = getLatestVersion();
    if (!latestVer) return { rows, updatedCount: 0 };
    let updatedCount = 0;
    rows.forEach(row => {
      const shouldUpdate = mode === 'all' || !row.price_version;
      if (!shouldUpdate) return;
      const before = row.total_price;
      calculateForRow(row);
      if (row.total_price !== before) updatedCount++;
    });
    return { rows, updatedCount };
  }

  // ── Helpers ───────────────────────────────────────────
  function _parseDate(str) {
    if (!str) return null;
    str = String(str).trim();
    // DD/MM/YYYY
    const dm = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dm) return new Date(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1]));
    // YYYY-MM-DD
    const ym = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ym) return new Date(Number(ym[1]), Number(ym[2]) - 1, Number(ym[3]));
    // Excel serial or other date string
    const d = new Date(str);
    return isNaN(d) ? null : d;
  }

  function _findItem(version, row) {
    const code = row.line_item_code || row.price_code || '';
    const desc = String(row.line_item || row.task_name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');

    if (!version || !version.items) return null;

    // Exact code match
    if (code) {
      const exact = version.items.find(i => i.code.toUpperCase() === code.toUpperCase());
      if (exact) return exact;
    }

    // Fuzzy description match
    if (desc) {
      const fuzzy = version.items.find(i => {
        const iDesc = i.description.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
        return iDesc.includes(desc) || desc.includes(iDesc);
      });
      if (fuzzy) return fuzzy;
    }

    return null;
  }

  function _todayStr() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  // ── Public API ────────────────────────────────────────
  return {
    init,
    getVersions,
    getLatestVersion,
    getVersionForDate,
    calculateForRow,
    isPriceStale,
    getTooltipText,
    getPricePreview,
    addVersion,
    parseUploadedFile,
    recalculateTasks,
  };
})();
