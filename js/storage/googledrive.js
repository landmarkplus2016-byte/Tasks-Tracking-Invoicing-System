/* ══════════════════════════════════════════════════════
   TTIS — storage/googledrive.js
   Google Drive API v3 storage layer — OAuth2 via GIS
   ══════════════════════════════════════════════════════

   Requires the Google Identity Services script in index.html:
   <script src="https://accounts.google.com/gsi/client" async defer></script>

   Auth: token model (implicit/popup).  Requires a Google Cloud OAuth2
   Client ID with the authorised origin set to the app's domain.
   The scope 'drive.file' restricts access to files TTIS itself creates —
   it cannot read or modify any other files on the user's Drive.

   Public API:
     GoogleDriveStorage.init(clientId)
     GoogleDriveStorage.isReady()        → bool
     GoogleDriveStorage.isAuthorized()   → bool
     GoogleDriveStorage.authorize()      → Promise<void>
     GoogleDriveStorage.testConnection(folderId) → Promise<{id, name}>
     GoogleDriveStorage.save(folderId, filename, content) → Promise<void>
     GoogleDriveStorage.load(folderId, filename) → Promise<string|null>
   ══════════════════════════════════════════════════════ */

'use strict';

const GoogleDriveStorage = (() => {
  const DRIVE_API  = 'https://www.googleapis.com/drive/v3';
  const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
  // drive.file: access only to files created by this app
  const SCOPE      = 'https://www.googleapis.com/auth/drive.file';

  let _clientId    = '';
  let _token       = null;
  let _tokenClient = null;

  // ── Init ──────────────────────────────────────────────
  function init(clientId) {
    _clientId    = (clientId || '').trim();
    _token       = null;     // reset on every (re)init
    _tokenClient = null;

    if (!_clientId) return;
    if (!_gisReady()) return;

    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: _clientId,
      scope:     SCOPE,
      callback:  ''   // assigned per-request in authorize()
    });
  }

  // ── Status ────────────────────────────────────────────
  function isReady()      { return !!_clientId && _gisReady() && !!_tokenClient; }
  function isAuthorized() { return !!_token; }

  // ── OAuth2 authorize (opens Google popup) ─────────────
  function authorize() {
    return new Promise((resolve, reject) => {
      if (!_clientId) return reject(new Error('Client ID is not set'));
      if (!_gisReady()) return reject(new Error('Google Identity Services is not yet loaded — please wait a moment and try again'));
      if (!_tokenClient) init(_clientId);
      if (!_tokenClient) return reject(new Error('Could not initialise token client — check your Client ID'));

      _tokenClient.callback = resp => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error));
        } else {
          _token = resp.access_token;
          resolve();
        }
      };

      // prompt:'' = silent refresh if already consented; 'consent' forces dialog
      _tokenClient.requestAccessToken({ prompt: _token ? '' : 'consent' });
    });
  }

  // ── Test folder access ────────────────────────────────
  async function testConnection(folderId) {
    _assertAuth();
    if (!folderId) throw new Error('Folder ID is required');

    const res = await _fetch(
      `${DRIVE_API}/files/${folderId}?fields=id,name,mimeType`
    );
    if (!res.ok) throw new Error(await _errMsg(res));
    const meta = await res.json();
    if (!meta.mimeType?.includes('folder'))
      throw new Error(`"${meta.name}" is not a folder — check the Folder ID`);
    return meta;
  }

  // ── Save file to folder ───────────────────────────────
  async function save(folderId, filename, content) {
    _assertAuth();
    const blob       = new Blob([content], { type: 'application/json' });
    const existingId = await _findFile(folderId, filename);

    if (existingId) {
      await _updateFile(existingId, blob);
    } else {
      await _createFile(folderId, filename, blob);
    }
  }

  // ── Load file from folder ─────────────────────────────
  async function load(folderId, filename) {
    _assertAuth();
    const id = await _findFile(folderId, filename);
    if (!id) return null;

    const res = await _fetch(`${DRIVE_API}/files/${id}?alt=media`);
    if (!res.ok) throw new Error(await _errMsg(res));
    return await res.text();
  }

  // ── Internal: find file by name in folder ─────────────
  async function _findFile(folderId, filename) {
    const q   = `'${folderId}' in parents and name='${filename}' and trashed=false`;
    const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;
    const res = await _fetch(url);
    if (!res.ok) throw new Error(await _errMsg(res));
    const data = await res.json();
    return data.files?.[0]?.id || null;
  }

  // ── Internal: create new file (multipart upload) ──────
  async function _createFile(folderId, filename, blob) {
    const meta = JSON.stringify({
      name:     filename,
      mimeType: 'application/json',
      parents:  [folderId]
    });
    const form = new FormData();
    form.append('metadata', new Blob([meta], { type: 'application/json' }));
    form.append('file', blob);

    const res = await _fetch(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id`,
      { method: 'POST', body: form }
    );
    if (!res.ok) throw new Error(await _errMsg(res));
    return (await res.json()).id;
  }

  // ── Internal: update existing file content ────────────
  async function _updateFile(fileId, blob) {
    const res = await _fetch(
      `${UPLOAD_API}/files/${fileId}?uploadType=media`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    blob
      }
    );
    if (!res.ok) throw new Error(await _errMsg(res));
  }

  // ── Internal: fetch with Bearer token ─────────────────
  async function _fetch(url, opts = {}) {
    return fetch(url, {
      ...opts,
      headers: { ...opts.headers, 'Authorization': `Bearer ${_token}` }
    });
  }

  function _assertAuth() {
    if (!_token) throw new Error('Not authorized — click Authorize first');
  }

  function _gisReady() {
    return typeof google !== 'undefined' && !!google?.accounts?.oauth2;
  }

  async function _errMsg(res) {
    try {
      const j = await res.json();
      return j?.error?.message || `HTTP ${res.status}`;
    } catch { return `HTTP ${res.status}`; }
  }

  // ── Public API ────────────────────────────────────────
  return { init, isReady, isAuthorized, authorize, testConnection, save, load };
})();
