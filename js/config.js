/* ══════════════════════════════════════════════════════
   TTIS — config.js  |  Hardcoded defaults for Google Drive
   ══════════════════════════════════════════════════════
   New users who have no TTIS_CONFIG in localStorage will
   automatically use these values to connect to Drive.
   Admins can override these from the Settings tab — saved
   values are stored in localStorage and take precedence.
   ══════════════════════════════════════════════════════ */

'use strict';

const DEFAULT_CONFIG = {
  oauthClientId: '47695653389-06p2ukv7qsevge0givsdlkbn87bo5if2.apps.googleusercontent.com',
  driveFolderId: '1A4vBy6B-78FX9voZsu4bYGEPaBpKpLDu'
};
