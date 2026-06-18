// ============================================================
// UPDATE CHECK
// ------------------------------------------------------------
// Compares the local APP_VERSION against the version baked into
// the TKTool.html on GitHub (raw). The running file:// page cannot
// rewrite itself on disk (no path -> writable handle bridge in the
// File System Access API), so a newer version is offered as a
// download. We know our own location via location.pathname, so the
// banner shows exactly where the downloaded file has to go.
// ============================================================
const UPDATE_RAW_URL = 'https://raw.githubusercontent.com/renemrhfr/TKTool/main/TKTool.html';
const UPDATE_DISMISS_KEY = 'tktool-update-dismissed';
// The newest version known to be available remotely. Persisted so the gear
// indicator and in-menu offer survive a reload without re-fetching (works
// offline too). Only ever holds the latest known version, so skipping several
// releases still points at the newest one.
const UPDATE_AVAILABLE_KEY = 'tktool-update-available';

function parseVersion(v) {
  return String(v || '').split('.').map(n => parseInt(n, 10) || 0);
}

// True if `remote` is strictly newer than `local` (semver-ish, dot-separated).
function isNewerVersion(remote, local) {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  const len = Math.max(r.length, l.length);
  for (let i = 0; i < len; i++) {
    const a = r[i] || 0;
    const b = l[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

function extractRemoteVersion(html) {
  const m = html.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

async function fetchRemoteHtml() {
  const res = await fetch(UPDATE_RAW_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

// Holds the downloaded remote HTML once a newer version is found. On window so
// renderThemeMenu (which runs at init, before this file's body executes) can
// safely read it as a property without a temporal-dead-zone ReferenceError.
window.pendingUpdate = null; // { version, html }

function currentFilePath() {
  try {
    return decodeURIComponent(location.pathname);
  } catch {
    return location.pathname;
  }
}

async function checkForUpdate({ silent = true } = {}) {
  try {
    const html = await fetchRemoteHtml();
    const remoteVersion = extractRemoteVersion(html);
    if (!remoteVersion) {
      if (!silent) toast('Versionsinfo nicht gefunden');
      return;
    }
    if (isNewerVersion(remoteVersion, APP_VERSION)) {
      window.pendingUpdate = { version: remoteVersion, html };
      // Persist so the indicator/offer come back instantly on the next reload.
      try { localStorage.setItem(UPDATE_AVAILABLE_KEY, remoteVersion); } catch {}
      // The settings-menu indicator and in-menu offer stay regardless of the
      // banner, so a dismissed (or never-shown) banner is not the only path.
      refreshUpdateIndicator();
      // On a silent (startup) check, respect a prior dismissal of this version.
      let dismissed = null;
      try { dismissed = localStorage.getItem(UPDATE_DISMISS_KEY); } catch {}
      if (silent && dismissed === remoteVersion) return;
      showUpdateBanner(remoteVersion);
    } else {
      // We are on (or past) the remote version: clear any stale "available"
      // and "dismissed" markers and drop the indicator.
      clearUpdateState();
      if (!silent) toast('TKTool ist aktuell (v' + APP_VERSION + ')');
    }
  } catch (err) {
    if (!silent) toast('Update-Prüfung fehlgeschlagen');
    console.warn('Update check failed:', err);
  }
}

// Drops all persisted update markers and the in-memory state, then refreshes
// the UI. Used once the running app has caught up to the remote version.
function clearUpdateState() {
  window.pendingUpdate = null;
  try { localStorage.removeItem(UPDATE_AVAILABLE_KEY); } catch {}
  try { localStorage.removeItem(UPDATE_DISMISS_KEY); } catch {}
  refreshUpdateIndicator();
}

// Restores the indicator from persisted state at startup, before (and without
// needing) any network call. The downloaded HTML is not persisted, so the
// offer carries only the version; downloadUpdate() fetches the HTML on demand.
function initUpdateIndicator() {
  let stored = null;
  try { stored = localStorage.getItem(UPDATE_AVAILABLE_KEY); } catch {}
  if (stored && isNewerVersion(stored, APP_VERSION)) {
    window.pendingUpdate = { version: stored, html: null };
    refreshUpdateIndicator();
    let dismissed = null;
    try { dismissed = localStorage.getItem(UPDATE_DISMISS_KEY); } catch {}
    if (dismissed !== stored) showUpdateBanner(stored);
  } else if (stored) {
    // App version moved to/past the stored one — stale marker, clean it up.
    clearUpdateState();
  }
}

// Lights up the gear-button badge and re-renders the settings menu so the
// in-menu "update herunterladen" offer is present. Kept in sync with
// `pendingUpdate` and unaffected by dismissing the banner.
function refreshUpdateIndicator() {
  const badge = document.getElementById('themeTriggerBadge');
  if (badge) badge.hidden = !window.pendingUpdate;
  if (typeof renderThemeMenu === 'function') {
    renderThemeMenu();
    const active = document.body.getAttribute('data-theme');
    if (active && typeof updateThemeMenuSelection === 'function') updateThemeMenuSelection(active);
  }
}

function dismissUpdateBanner() {
  if (window.pendingUpdate) {
    try { localStorage.setItem(UPDATE_DISMISS_KEY, window.pendingUpdate.version); } catch {}
  }
  const banner = document.getElementById('updateBanner');
  if (banner) banner.remove();
}

async function downloadUpdate() {
  if (!window.pendingUpdate) return;
  // When the offer was restored from storage on reload we hold only the
  // version, not the HTML — fetch it now.
  let html = window.pendingUpdate.html;
  if (!html) {
    toast('Update wird geladen …');
    try {
      html = await fetchRemoteHtml();
      window.pendingUpdate.html = html;
    } catch (err) {
      toast('Download fehlgeschlagen');
      console.warn('Update download failed:', err);
      return;
    }
  }
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'TKTool.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const path = currentFilePath();
  toast('Heruntergeladen – ersetze damit: ' + path);
}

function showUpdateBanner(version) {
  const existing = document.getElementById('updateBanner');
  if (existing) existing.remove();

  const path = currentFilePath();
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.id = 'updateBanner';
  banner.innerHTML = `
    <span class="update-banner-dot" aria-hidden="true"></span>
    <div class="update-banner-body">
      <span class="update-banner-title">update verfügbar
        <span class="update-banner-version">v${APP_VERSION} → v${version}</span>
      </span>
      <span class="update-banner-path" title="${path}">ersetze: ${path}</span>
    </div>
    <button class="update-banner-action" type="button" onclick="downloadUpdate()">herunterladen</button>
    <button class="update-banner-close" type="button" onclick="dismissUpdateBanner()" aria-label="schließen" title="für diese version nicht mehr anzeigen">&times;</button>
  `;
  document.body.appendChild(banner);
}

// Silent check shortly after startup so it never blocks rendering,
// then every 8h to catch instances that stay open for days. The
// persistent banner (not a toast) survives until dismissed, so a
// long-running tab still sees the notice.
const UPDATE_INTERVAL_MS = 8 * 60 * 60 * 1000;
// Restore the indicator from persisted state immediately (no network), then do
// the live check shortly after to refresh/clear it.
initUpdateIndicator();
setTimeout(() => { checkForUpdate({ silent: true }); }, 2500);
setInterval(() => { checkForUpdate({ silent: true }); }, UPDATE_INTERVAL_MS);
