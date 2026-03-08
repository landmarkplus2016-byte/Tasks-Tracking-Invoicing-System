/* ══════════════════════════════════════════════════════
   TTIS — locks.js  |  Row-level locking via locks.json
   ══════════════════════════════════════════════════════

   Manages a shared locks.json file in the Drive folder.
   Lock entries expire after EXPIRY_MS (5 minutes).
   Roles are read from active_users.json on Drive — never
   from localStorage — so Admins cannot self-promote.

   Public API:
     LockManager.init()
     LockManager.refresh()              → Promise<void>
     LockManager.acquireLock(taskId)    → Promise<{ acquired, lock? }>
     LockManager.releaseLock(taskId)    → Promise<void>
     LockManager.breakLock(taskId)      → Promise<void>  (Admin only)
     LockManager.isLocked(taskId)       → bool
     LockManager.isLockedByMe(taskId)   → bool
     LockManager.isImportLocked()       → bool
     LockManager.getLock(taskId)        → lock | null
     LockManager.getAllLocks()          → { [id]: lock }
     LockManager.IMPORT_KEY             → '__IMPORT__'
   ══════════════════════════════════════════════════════ */

'use strict';

const LockManager = (() => {
  const LOCK_FILE  = 'locks.json';
  const EXPIRY_MS  = 5 * 60 * 1000;   // lock expires after 5 min
  const REFRESH_MS = 30 * 1000;        // poll Drive every 30 s
  const ROLE_TTL   = 60 * 1000;        // cache role lookup for 1 min
  const IMPORT_KEY = '__IMPORT__';

  let _locks     = {};                  // { [taskId]: lockEntry }
  let _folderId  = null;
  let _roleCache = { role: null, at: 0 };

  // ── Init ──────────────────────────────────────────────
  function init() {
    _folderId = _getFolderId();
    if (!_folderId) return;
    refresh();
    setInterval(refresh, REFRESH_MS);
  }

  // ── Refresh — read-only poll ───────────────────────────
  async function refresh() {
    if (!_canDrive()) return;
    try {
      const raw = await GoogleDriveStorage.load(_folderId, LOCK_FILE);
      if (!raw) { _locks = {}; return; }
      const data = JSON.parse(raw);
      _locks = data.locks || {};
      _expireOld();
    } catch(e) {
      console.warn('[TTIS] LockManager refresh:', e.message);
    }
  }

  // ── Acquire lock ──────────────────────────────────────
  // Returns { acquired: true } if lock was obtained,
  //         { acquired: false, lock } if held by someone else.
  async function acquireLock(taskId) {
    if (!_canDrive()) return { acquired: true };   // offline — allow edits
    await refresh();

    const me    = _getMe();
    const myKey = me.id || me.name || 'unknown';
    const now   = Date.now();
    const ex    = _locks[taskId];

    // Held by someone else and not yet expired → blocked
    if (ex && new Date(ex.expiresAt).getTime() > now && ex.lockedBy !== myKey) {
      return { acquired: false, lock: ex };
    }

    const role = await _myRole();
    _locks[taskId] = {
      lockedBy:     myKey,
      lockedByName: me.name || 'Unknown',
      lockedByRole: role,
      lockedAt:     new Date().toISOString(),
      expiresAt:    new Date(now + EXPIRY_MS).toISOString()
    };

    try { await _save(); } catch(e) {
      console.warn('[TTIS] LockManager save:', e.message);
    }
    return { acquired: true };
  }

  // ── Release lock ──────────────────────────────────────
  async function releaseLock(taskId) {
    const lock = _locks[taskId];
    if (!lock) return;
    const me    = _getMe();
    const myKey = me.id || me.name || 'unknown';
    if (lock.lockedBy !== myKey) {
      const role = await _myRole();
      if (role !== 'Admin') return;   // only Admin can release others' locks
    }
    delete _locks[taskId];
    try { await _save(); } catch(e) {
      console.warn('[TTIS] LockManager release:', e.message);
    }
  }

  // ── Break any lock (Admin only) ────────────────────────
  async function breakLock(taskId) {
    const role = await _myRole();
    if (role !== 'Admin') throw new Error('Only Admins can break locks');
    delete _locks[taskId];
    await _save();
  }

  // ── Status queries (synchronous, use cached _locks) ────
  function isLocked(taskId) {
    const lock = _locks[taskId];
    if (!lock) return false;
    if (new Date(lock.expiresAt).getTime() < Date.now()) return false;
    const me = _getMe();
    return lock.lockedBy !== (me.id || me.name || 'unknown');
  }

  function isLockedByMe(taskId) {
    const lock = _locks[taskId];
    if (!lock) return false;
    if (new Date(lock.expiresAt).getTime() < Date.now()) return false;
    const me = _getMe();
    return lock.lockedBy === (me.id || me.name || 'unknown');
  }

  function isImportLocked() { return isLocked(IMPORT_KEY); }
  function getImportLock()  { return getLock(IMPORT_KEY); }

  function getLock(taskId) { return _locks[taskId] || null; }
  function getAllLocks()   { return _locks; }

  // ── Internal ──────────────────────────────────────────
  function _expireOld() {
    const now = Date.now();
    for (const id of Object.keys(_locks)) {
      if (new Date(_locks[id].expiresAt).getTime() < now) delete _locks[id];
    }
  }

  async function _save() {
    if (!_canDrive()) return;
    _expireOld();
    await GoogleDriveStorage.save(
      _folderId, LOCK_FILE,
      JSON.stringify({ locks: _locks, updatedAt: new Date().toISOString() }, null, 2)
    );
  }

  // Read role from active_users.json on Drive (not localStorage)
  async function _myRole() {
    if (_roleCache.role && Date.now() - _roleCache.at < ROLE_TTL) return _roleCache.role;
    let role = _getMe().role || 'Viewer';
    if (_canDrive()) {
      try {
        const raw = await GoogleDriveStorage.load(_folderId, 'active_users.json');
        if (raw) {
          const users = JSON.parse(raw);
          const me    = _getMe();
          const entry = Array.isArray(users)
            ? users.find(u => (me.id && u.id === me.id) || u.name === me.name)
            : null;
          if (entry?.role) role = entry.role;
        }
      } catch(e) { /* fall back to localStorage role */ }
    }
    _roleCache = { role, at: Date.now() };
    return role;
  }

  function _getMe() {
    try { return JSON.parse(localStorage.getItem('TTIS_USER') || '{}'); } catch { return {}; }
  }

  function _getFolderId() {
    try {
      const s = JSON.parse(localStorage.getItem('TTIS_CONFIG') || '{}').gdsync?.folderId || '';
      if (s) return s;
      return (typeof DEFAULT_CONFIG !== 'undefined' ? DEFAULT_CONFIG.driveFolderId : '') || '';
    } catch { return ''; }
  }

  function _canDrive() {
    return typeof GoogleDriveStorage !== 'undefined'
        && GoogleDriveStorage.isAuthorized()
        && !!_folderId;
  }

  // ── Public API ────────────────────────────────────────
  return {
    init, refresh,
    acquireLock, releaseLock, breakLock,
    isLocked, isLockedByMe, isImportLocked, getImportLock,
    getLock, getAllLocks,
    IMPORT_KEY
  };
})();
