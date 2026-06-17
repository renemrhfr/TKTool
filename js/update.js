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

// Holds the downloaded remote HTML once a newer version is found.
let pendingUpdate = null; // { version, html }

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
      pendingUpdate = { version: remoteVersion, html };
      // On a silent (startup) check, respect a prior dismissal of this version.
      let dismissed = null;
      try { dismissed = localStorage.getItem(UPDATE_DISMISS_KEY); } catch {}
      if (silent && dismissed === remoteVersion) return;
      showUpdateBanner(remoteVersion);
    } else if (!silent) {
      toast('TKTool ist aktuell (v' + APP_VERSION + ')');
    }
  } catch (err) {
    if (!silent) toast('Update-Prüfung fehlgeschlagen');
    console.warn('Update check failed:', err);
  }
}

function dismissUpdateBanner() {
  if (pendingUpdate) {
    try { localStorage.setItem(UPDATE_DISMISS_KEY, pendingUpdate.version); } catch {}
  }
  const banner = document.getElementById('updateBanner');
  if (banner) banner.remove();
}

function downloadUpdate() {
  if (!pendingUpdate) return;
  const blob = new Blob([pendingUpdate.html], { type: 'text/html' });
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
setTimeout(() => { checkForUpdate({ silent: true }); }, 2500);
setInterval(() => { checkForUpdate({ silent: true }); }, UPDATE_INTERVAL_MS);
