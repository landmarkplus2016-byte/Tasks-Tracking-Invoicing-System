/* ══════════════════════════════════════════════════════
   TTIS — users.js  |  User identity, access control,
                       presence heartbeat, audit trail
   ══════════════════════════════════════════════════════ */

'use strict';

const UserManager = (() => {

  const USER_KEY        = 'TTIS_USER';
  const ALL_USERS_KEY   = 'TTIS_ALL_USERS';
  const HEARTBEAT_MS    = 5 * 60 * 1000;   // write own entry every 5 minutes
  const REFRESH_MS      = 2 * 60 * 1000;   // read others' entries every 2 minutes
  const ACTIVE_WINDOW   = 30 * 60 * 1000;  // 30 minutes active window for avatar row
  const ACTIVE_FILE     = 'active_users.json';

  const AVATAR_COLORS = [
    '#1a56db','#7c3aed','#db2777','#d97706',
    '#059669','#dc2626','#0891b2','#7d6608'
  ];

  // ── Default permissions by role ────────────────────────
  function _defaultPerms(role) {
    const admin  = role === 'Admin';
    const editor = role === 'Editor';
    return {
      tabs: {
        dashboard: true,
        tasks:     true,
        invoicing: true,
        readiness: true,
        settings:  admin
      },
      fields: {
        taskInfo:   admin || editor,
        financial:  admin,
        acceptance: admin || editor,
        invoicing:  admin || editor,
        allFields:  admin
      }
    };
  }

  let _user       = null;
  let _allUsers   = [];
  let _hbTimer    = null;
  let _lastAct    = 0;
  let _readyCb    = null;   // called when identity is confirmed

  // ── Unique ID generator ────────────────────────────────
  function _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── Init ───────────────────────────────────────────────
  function init(onReady) {
    _readyCb = typeof onReady === 'function' ? onReady : null;

    try { const s = localStorage.getItem(USER_KEY);      if (s) _user     = JSON.parse(s); } catch(e) {}
    try { const s = localStorage.getItem(ALL_USERS_KEY); if (s) _allUsers = JSON.parse(s); } catch(e) {}

    // Back-fill id for users who registered before this field existed
    if (_user && !_user.id) {
      _user.id = _generateId();
      localStorage.setItem(USER_KEY, JSON.stringify(_user));
    }

    if (!_user || !_user.name || !_user.role) {
      _showWelcomeModal();
    } else {
      _updateLastActive();
      _startHeartbeat();
      // Identity already known — notify after a tick so DOM is fully ready
      if (_readyCb) setTimeout(_readyCb, 0);
    }
  }

  // ── Getters ────────────────────────────────────────────
  function getUser()   { return _user; }
  function isAdmin()   { return _user?.role === 'Admin'; }
  function isEditor()  { return _user?.role === 'Editor'; }
  function isViewer()  { return _user?.role === 'Viewer'; }
  function getName()   { return _user?.name  || 'Unknown'; }
  function nowIso()    { return new Date().toISOString(); }

  // ── Access control ─────────────────────────────────────
  // Roles:   Admin  — full access
  //          Editor — Force Refresh + edit tasks; no Settings/Import/Load
  //          Viewer — read-only
  function applyAccess() {
    const role   = _user?.role || 'Viewer';
    const admin  = role === 'Admin';
    const editor = role === 'Editor';
    const perms  = _user?.permissions || _defaultPerms(role);

    // perm-admin: Admin only
    document.querySelectorAll('.perm-admin').forEach(el => {
      el.style.display = admin ? '' : 'none';
    });
    // perm-editor: Admin + Editor
    document.querySelectorAll('.perm-editor').forEach(el => {
      el.style.display = (admin || editor) ? '' : 'none';
    });
    // Legacy class still supported
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = admin ? '' : 'none';
    });

    // Granular tab access (dashboard / tasks / invoicing / readiness)
    ['dashboard', 'tasks', 'invoicing', 'readiness'].forEach(tabId => {
      const allowed = perms.tabs?.[tabId] !== false;
      document.querySelectorAll(`.tab-btn[data-tab="${tabId}"]`).forEach(btn => {
        btn.style.display = allowed ? '' : 'none';
      });
    });
    // Settings tab is governed by perm-admin class above
  }

  // ── canEdit — field-group permission check ─────────────
  function canEdit(group) {
    if (!_user) return false;
    const perms = _user.permissions || _defaultPerms(_user.role || 'Viewer');
    if (perms.fields.allFields) return true;
    return !!perms.fields[group];
  }

  // ── Welcome modal ──────────────────────────────────────
  function _showWelcomeModal() {
    document.getElementById('userWelcomeModal').style.display = 'flex';
    setTimeout(() => document.getElementById('uwName')?.focus(), 50);
  }

  function submitWelcome() {
    const nameEl  = document.getElementById('uwName');
    const roleEl  = document.getElementById('uwRole');
    const nameErr = document.getElementById('uwNameErr');
    const roleErr = document.getElementById('uwRoleErr');

    nameErr.style.display = 'none';
    roleErr.style.display = 'none';

    const name = (nameEl?.value || '').trim();
    if (!name) { nameErr.style.display = 'block'; return; }

    // Check for pre-assigned invite (overrides dropdown selection)
    const invite = _findInvite(name);
    const role   = invite ? invite.role : (roleEl?.value || '');
    if (!role) { roleErr.style.display = 'block'; return; }

    // Clear the invite flag so it's not matched again
    if (invite) _clearInviteFlag(name);

    _setUser(name, role);
    document.getElementById('userWelcomeModal').style.display = 'none';
    _startHeartbeat();
    showToast(invite
      ? `Welcome, ${name}! Your role (${role}) was pre-assigned by an Admin.`
      : `Welcome, ${name}!`, 'success');
    if (_readyCb) _readyCb();
  }

  // Checks name input live — pre-fills role if an invite exists
  function checkWelcomeInvite() {
    const name    = (document.getElementById('uwName')?.value || '').trim();
    const roleEl  = document.getElementById('uwRole');
    const hintEl  = document.getElementById('uwInviteHint');
    const roleErr = document.getElementById('uwRoleErr');
    if (!roleEl) return;

    const invite = name ? _findInvite(name) : null;
    if (invite) {
      roleEl.value    = invite.role;
      roleEl.disabled = true;
      if (hintEl)  hintEl.style.display  = 'block';
      if (roleErr) roleErr.style.display = 'none';
    } else {
      roleEl.disabled = false;
      if (hintEl) hintEl.style.display = 'none';
    }
  }

  function _setUser(name, role) {
    // Preserve existing id so the same person doesn't get a new id on identity change
    const id = _user?.id || _generateId();
    _user = {
      id,
      name,
      role,
      initials:   _initials(name),
      lastActive: nowIso()
    };
    localStorage.setItem(USER_KEY, JSON.stringify(_user));
    _upsertAllUsers(_user);
  }

  // ── Change identity modal ──────────────────────────────
  function showChangeIdentityModal() {
    const modal = document.getElementById('userChangeModal');
    if (!modal) return;
    document.getElementById('ciName').value = _user?.name || '';
    document.getElementById('ciRole').value = _user?.role || 'Viewer';
    document.getElementById('ciNameErr').style.display = 'none';
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('ciName')?.focus(), 50);
  }

  function hideChangeIdentityModal() {
    document.getElementById('userChangeModal').style.display = 'none';
  }

  function submitChangeIdentity() {
    const name = (document.getElementById('ciName')?.value || '').trim();
    const role = document.getElementById('ciRole')?.value || '';
    const err  = document.getElementById('ciNameErr');
    err.style.display = 'none';
    if (!name) { err.style.display = 'block'; return; }
    _setUser(name, role);
    hideChangeIdentityModal();
    applyAccess();
    _renderAvatarRow([_user]);
    showToast(`Identity updated: ${name} (${role})`, 'success');
  }

  // ── Heartbeat + presence ───────────────────────────────
  function _startHeartbeat() {
    _sendHeartbeat();                                      // immediate write + read
    _hbTimer = setInterval(_sendHeartbeat, HEARTBEAT_MS); // write own entry every 5 min
    setInterval(_refreshPresence, REFRESH_MS);            // read-only poll every 2 min
    document.addEventListener('click',   _onActivity, { passive: true });
    document.addEventListener('keydown', _onActivity, { passive: true });
  }

  function _onActivity() {
    const now = Date.now();
    if (now - _lastAct > 60000) {
      _lastAct = now;
      _updateLastActive();
    }
  }

  function _updateLastActive() {
    if (!_user) return;
    _user.lastActive = nowIso();
    localStorage.setItem(USER_KEY, JSON.stringify(_user));
    _upsertAllUsers(_user);
  }

  async function _sendHeartbeat() {
    _updateLastActive();
    _renderAvatarRow([_user]);

    if (typeof GoogleDriveStorage === 'undefined' || !GoogleDriveStorage.isAuthorized()) return;

    const folderId = _getFolderId();
    if (!folderId) return;

    try {
      // Load the full historical list (never truncate — we keep all entries permanently)
      let active = [];
      try {
        const raw = await GoogleDriveStorage.load(folderId, ACTIVE_FILE);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) active = parsed;
        }
      } catch(e) { /* file may not exist yet */ }

      // Upsert self — match by id (primary key) with name fallback for legacy entries
      const entry = {
        id:         _user.id,
        name:       _user.name,
        initials:   _user.initials,
        role:       _user.role,
        lastActive: _user.lastActive
      };
      const idx = _user.id
        ? active.findIndex(u => u.id === _user.id)
        : active.findIndex(u => !u.id && u.name === _user.name);

      if (idx >= 0) active[idx] = { ...active[idx], ...entry };
      else          active.push(entry);

      await GoogleDriveStorage.save(folderId, ACTIVE_FILE, JSON.stringify(active));

      // Avatar row: show only users active in the last 30 min
      const cutoff = Date.now() - ACTIVE_WINDOW;
      _renderAvatarRow(active.filter(u => new Date(u.lastActive).getTime() > cutoff));

      // Merge full list into local all-users cache
      active.forEach(u => _upsertAllUsers(u));
    } catch(e) {
      console.warn('[TTIS] Heartbeat error:', e);
    }
  }

  // ── Read-only presence refresh (every 2 min) ──────────
  // Reads active_users.json and updates the avatar row WITHOUT writing.
  // This is what keeps the header current for all users who are online.
  async function _refreshPresence() {
    if (typeof GoogleDriveStorage === 'undefined' || !GoogleDriveStorage.isAuthorized()) return;
    const folderId = _getFolderId();
    if (!folderId) return;
    try {
      const raw = await GoogleDriveStorage.load(folderId, ACTIVE_FILE);
      if (!raw) return;
      const active = JSON.parse(raw);
      if (!Array.isArray(active)) return;
      // Update avatar row with all users active in the last 30 min
      const cutoff = Date.now() - ACTIVE_WINDOW;
      _renderAvatarRow(active.filter(u => new Date(u.lastActive).getTime() > cutoff));
      // Also sync into the local all-users cache for Settings table
      active.forEach(u => _upsertAllUsers(u));
    } catch(e) {
      console.warn('[TTIS] Presence refresh error:', e.message);
    }
  }

  // ── writePresence — immediate Drive write (call from _launchApp) ──
  // Ensures new users appear in the users list right away instead of
  // waiting up to 5 minutes for the next heartbeat interval.
  async function writePresence() {
    await _sendHeartbeat();
  }

  function _getFolderId() {
    try {
      const saved = JSON.parse(localStorage.getItem('TTIS_CONFIG') || '{}').gdsync?.folderId || '';
      if (saved) return saved;
      return (typeof DEFAULT_CONFIG !== 'undefined' ? DEFAULT_CONFIG.driveFolderId : '') || '';
    } catch(e) { return ''; }
  }

  // ── Avatar row ─────────────────────────────────────────
  function _renderAvatarRow(users) {
    const el = document.getElementById('activeUserAvatars');
    if (!el || !users.length) return;

    const sorted = [...users].sort((a, b) => {
      if (_isSelf(a)) return -1;
      if (_isSelf(b)) return 1;
      return new Date(b.lastActive) - new Date(a.lastActive);
    });

    el.innerHTML = sorted.slice(0, 6).map(u => {
      const isSelf = _isSelf(u);
      const role   = u.role || '';
      const tip    = `${u.name} · ${role}${isSelf ? ' (You)' : ''}`;
      const color  = _colorFor(u.initials || u.name?.slice(0,2) || '?');
      const inits  = _esc(u.initials || (u.name || '').slice(0,2).toUpperCase() || '?');
      return `<div class="user-avatar${isSelf ? ' user-avatar-self' : ''}" data-role="${_esc(role)}" style="background:${color}" title="${_esc(tip)}">${inits}</div>`;
    }).join('');

    if (sorted.length > 6) {
      el.innerHTML += `<div class="user-avatar user-avatar-more" title="${sorted.length - 6} more active">+${sorted.length - 6}</div>`;
    }
  }

  // Returns true if entry u belongs to the current local user
  function _isSelf(u) {
    if (!_user) return false;
    if (u.id && _user.id) return u.id === _user.id;
    return u.name === _user.name;
  }

  // ── Invite system ─────────────────────────────────────
  function _findInvite(name) {
    const norm = name.toLowerCase().trim();
    return _allUsers.find(u => u._invited && u.name.toLowerCase().trim() === norm) || null;
  }

  function _clearInviteFlag(name) {
    const norm = name.toLowerCase().trim();
    const u    = _allUsers.find(x => x._invited && x.name.toLowerCase().trim() === norm);
    if (u) { delete u._invited; localStorage.setItem(ALL_USERS_KEY, JSON.stringify(_allUsers)); }
  }

  async function createInvite(name, role) {
    if (!name || !role) return null;
    // Don't overwrite an existing active user — just update their role
    const existing = _allUsers.find(u => u.name.toLowerCase().trim() === name.toLowerCase().trim() && !u._invited);
    if (existing) {
      await updateUserRole(existing.id || existing.name, role);
      return existing;
    }
    const entry = { name, role, initials: _initials(name), _invited: true, lastActive: null };
    _upsertAllUsers(entry);
    if (typeof GoogleDriveStorage !== 'undefined' && GoogleDriveStorage.isAuthorized()) {
      const folderId = _getFolderId();
      if (folderId) {
        try { await GoogleDriveStorage.save(folderId, ACTIVE_FILE, JSON.stringify(_allUsers)); } catch(e) {}
      }
    }
    return entry;
  }

  async function revokeInvite(name) {
    const idx = _allUsers.findIndex(u => u.name === name && u._invited);
    if (idx >= 0) {
      _allUsers.splice(idx, 1);
      localStorage.setItem(ALL_USERS_KEY, JSON.stringify(_allUsers));
      if (typeof GoogleDriveStorage !== 'undefined' && GoogleDriveStorage.isAuthorized()) {
        const folderId = _getFolderId();
        if (folderId) {
          try { await GoogleDriveStorage.save(folderId, ACTIVE_FILE, JSON.stringify(_allUsers)); } catch(e) {}
        }
      }
    }
  }

  // ── Delete user ────────────────────────────────────────
  // idOrName: pass user.id (preferred) or user.name (fallback)
  async function deleteUser(idOrName) {
    const idx = _allUsers.findIndex(u =>
      (u.id && u.id === idOrName) || u.name === idOrName
    );
    if (idx < 0) return;
    _allUsers.splice(idx, 1);
    localStorage.setItem(ALL_USERS_KEY, JSON.stringify(_allUsers));
    if (typeof GoogleDriveStorage !== 'undefined' && GoogleDriveStorage.isAuthorized()) {
      const folderId = _getFolderId();
      if (folderId) {
        try { await GoogleDriveStorage.save(folderId, ACTIVE_FILE, JSON.stringify(_allUsers)); } catch(e) {}
      }
    }
  }

  // ── Save user permissions ──────────────────────────────
  // idOrName: pass user.id (preferred) or user.name (fallback)
  async function saveUserPermissions(idOrName, permissions) {
    const idx = _allUsers.findIndex(u =>
      (u.id && u.id === idOrName) || u.name === idOrName
    );
    if (idx < 0) return;
    _allUsers[idx].permissions = permissions;
    localStorage.setItem(ALL_USERS_KEY, JSON.stringify(_allUsers));

    // If editing self, update live user object and re-apply access
    if (_user && _isSelf(_allUsers[idx])) {
      _user.permissions = permissions;
      localStorage.setItem(USER_KEY, JSON.stringify(_user));
      applyAccess();
    }

    if (typeof GoogleDriveStorage !== 'undefined' && GoogleDriveStorage.isAuthorized()) {
      const folderId = _getFolderId();
      if (folderId) {
        try { await GoogleDriveStorage.save(folderId, ACTIVE_FILE, JSON.stringify(_allUsers)); } catch(e) {}
      }
    }
  }

  // ── All-users cache ────────────────────────────────────
  function _upsertAllUsers(u) {
    let idx = -1;
    // Primary key: id (when both stored entry and incoming entry have one)
    if (u.id) idx = _allUsers.findIndex(x => x.id === u.id);
    // Fallback: name-only match for legacy entries that pre-date the id field
    if (idx < 0) idx = _allUsers.findIndex(x => !x.id && x.name === u.name);
    if (idx >= 0) _allUsers[idx] = { ..._allUsers[idx], ...u };
    else          _allUsers.push({ ...u });
    try { localStorage.setItem(ALL_USERS_KEY, JSON.stringify(_allUsers)); } catch(e) {}
  }

  async function getAllUsers() {
    if (typeof GoogleDriveStorage !== 'undefined' && GoogleDriveStorage.isAuthorized()) {
      const folderId = _getFolderId();
      if (folderId) {
        try {
          const raw  = await GoogleDriveStorage.load(folderId, ACTIVE_FILE);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) list.forEach(u => _upsertAllUsers(u));
          }
        } catch(e) {}
      }
    }
    return _allUsers;
  }

  async function updateUserRole(idOrName, newRole) {
    const idx = _allUsers.findIndex(u =>
      (u.id && u.id === idOrName) || u.name === idOrName
    );
    if (idx < 0) return;
    _allUsers[idx].role = newRole;
    localStorage.setItem(ALL_USERS_KEY, JSON.stringify(_allUsers));

    if (_user && _isSelf(_allUsers[idx])) {
      _user.role = newRole;
      localStorage.setItem(USER_KEY, JSON.stringify(_user));
      applyAccess();
    }

    if (typeof GoogleDriveStorage !== 'undefined' && GoogleDriveStorage.isAuthorized()) {
      const folderId = _getFolderId();
      if (folderId) {
        try { await GoogleDriveStorage.save(folderId, ACTIVE_FILE, JSON.stringify(_allUsers)); } catch(e) {}
      }
    }
  }

  // ── Audit trail helpers ────────────────────────────────
  function stampCreated(row) {
    if (!row.created_by) {
      row.created_by = getName();
      row.created_at = nowIso();
    }
    row.updated_by = getName();
    row.updated_at = nowIso();
  }

  function stampUpdated(row) {
    if (!row.created_by) {
      row.created_by = getName();
      row.created_at = nowIso();
    }
    row.updated_by = getName();
    row.updated_at = nowIso();
  }

  // ── Utility ────────────────────────────────────────────
  function _initials(name) {
    return (name || '').trim().split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
  }

  function _colorFor(str) {
    let h = 0;
    for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  // ── Public API ─────────────────────────────────────────
  return {
    init,
    getUser, isAdmin, isEditor, isViewer, getName,
    applyAccess, canEdit,
    submitWelcome, checkWelcomeInvite,
    showChangeIdentityModal, hideChangeIdentityModal, submitChangeIdentity,
    getAllUsers, updateUserRole,
    createInvite, revokeInvite,
    deleteUser, saveUserPermissions,
    stampCreated, stampUpdated,
    writePresence,
    renderAvatarRow: _renderAvatarRow
  };

})();
