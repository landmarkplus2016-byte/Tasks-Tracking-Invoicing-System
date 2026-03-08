/* ══════════════════════════════════════════════════════
   TTIS — sync.js  |  Weekly import scheduler + status
   ══════════════════════════════════════════════════════

   Tracks when the last PC_Tracking import was done.
   - Banner appears when > THRESHOLD_DAYS have passed
   - Sync status badge in the header shows elapsed days
   - Force Refresh button triggers ImportManager.open()

   Public API:
     SyncManager.init()            — call from _launchApp()
     SyncManager.markSynced()      — call after successful import
     SyncManager.dismissBanner()   — called by banner × button
     SyncManager.getLastSync()     → ISO string | null
     SyncManager.getDaysAgo()      → integer | null
   ══════════════════════════════════════════════════════ */

'use strict';

const SyncManager = (() => {
  const SYNC_KEY       = 'TTIS_LAST_SYNC';
  const THRESHOLD_DAYS = 7;

  let _lastSync  = null;
  let _dismissed = false;  // banner dismissed this session (resets on markSynced)

  // ── Init (called once per file-load) ─────────────────
  function init() {
    _dismissed = false;
    _load();
    _renderHeaderStatus();
    _checkAndShowBanner();

    // Hourly re-check for long-running sessions
    setInterval(() => {
      _load();
      _renderHeaderStatus();
      if (!_dismissed) _checkAndShowBanner();
    }, 60 * 60 * 1000);
  }

  // ── Mark a successful import ──────────────────────────
  function markSynced() {
    _lastSync  = new Date().toISOString();
    _dismissed = false;
    localStorage.setItem(SYNC_KEY, _lastSync);
    _renderHeaderStatus();
    _hideBanner();
  }

  // ── Dismiss banner for this session ──────────────────
  function dismissBanner() {
    _dismissed = true;
    _hideBanner();
  }

  // ── Accessors ─────────────────────────────────────────
  function getLastSync() { return _lastSync; }

  function getDaysAgo() {
    if (!_lastSync) return null;
    return Math.floor((Date.now() - new Date(_lastSync).getTime()) / 86400000);
  }

  // ── Banner ────────────────────────────────────────────
  function _checkAndShowBanner() {
    const days = getDaysAgo();
    if (days === null || days >= THRESHOLD_DAYS) _showBanner(days);
    else _hideBanner();
  }

  function _showBanner(days) {
    document.getElementById('syncBanner')?.remove();

    const isNever  = days === null;
    const varClass = isNever ? 'sync-banner-info' : 'sync-banner-warn';
    const icon     = isNever ? '&#9432;' : '&#9888;';
    const title    = isNever ? 'No sync yet' : `Sync overdue — ${days} day${days !== 1 ? 's' : ''} since last import`;
    const msg      = isNever
      ? 'No PC Tracking import has been done yet. Upload your file to populate the database.'
      : `Last sync was <strong>${days} day${days !== 1 ? 's' : ''} ago</strong> — it is recommended to import the latest PC_Tracking file.`;

    const banner       = document.createElement('div');
    banner.id          = 'syncBanner';
    banner.className   = `sync-banner ${varClass}`;
    banner.innerHTML   = `
      <div class="sync-banner-inner">
        <span class="sync-banner-icon">${icon}</span>
        <div class="sync-banner-body">
          <span class="sync-banner-title">${title}</span>
          <span class="sync-banner-msg">${msg}</span>
        </div>
        <button class="sync-banner-action" onclick="ImportManager.open()">Import Now</button>
        <button class="sync-banner-close" onclick="SyncManager.dismissBanner()" title="Dismiss">&#10005;</button>
      </div>`;

    const wrap = document.getElementById('syncBannerWrap');
    if (wrap) wrap.appendChild(banner);
  }

  function _hideBanner() {
    document.getElementById('syncBanner')?.remove();
  }

  // ── Header sync status badge ──────────────────────────
  function _renderHeaderStatus() {
    const el = document.getElementById('syncStatus');
    if (!el) return;

    const days = getDaysAgo();

    if (days === null) {
      el.className   = 'sync-status-badge sync-status-never';
      el.textContent = 'Never synced';
      el.title       = 'No PC Tracking import has been completed yet';
      return;
    }

    const ts = new Date(_lastSync).toLocaleString();

    if (days === 0) {
      el.className   = 'sync-status-badge sync-status-ok';
      el.textContent = 'Synced today';
    } else if (days === 1) {
      el.className   = 'sync-status-badge sync-status-ok';
      el.textContent = '1 day ago';
    } else if (days < THRESHOLD_DAYS) {
      el.className   = 'sync-status-badge sync-status-warn';
      el.textContent = `${days} days ago`;
    } else {
      el.className   = 'sync-status-badge sync-status-overdue';
      el.textContent = `${days} days ago`;
    }

    el.title = `Last import: ${ts}`;
  }

  // ── Internal ──────────────────────────────────────────
  function _load() {
    _lastSync = localStorage.getItem(SYNC_KEY) || null;
  }

  // ── Public API ────────────────────────────────────────
  return { init, markSynced, dismissBanner, getLastSync, getDaysAgo };
})();
