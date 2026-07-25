// ============================================================
// THEME
// ============================================================
function getSavedTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return THEMES.includes(t) ? t : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme) {
  const next = THEMES.includes(theme) ? theme : 'light';
  document.body.setAttribute('data-theme', next);
  syncHyruleEasterEggs(next);
  const trigger = document.getElementById('themeTrigger');
  if (trigger) {
    trigger.title = `Einstellungen - Theme: ${THEME_LABELS[next] || next}`;
    trigger.setAttribute('aria-label', `Einstellungen öffnen, aktuelles Theme: ${THEME_LABELS[next] || next}`);
  }
  updateThemeMenuSelection(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {}
}

function toggleTheme() {
  const current = document.body.getAttribute('data-theme');
  const currentIndex = THEMES.indexOf(current);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % THEMES.length;
  applyTheme(THEMES[nextIndex]);
}

function setTheme(theme) {
  applyTheme(theme);
  closeThemeMenu();
}

function renderThemeMenu() {
  const menu = document.getElementById('themeMenu');
  if (!menu) return;
  const themeOptions = THEMES.map(theme => {
    const [bg, accent] = THEME_COLORS[theme] || THEME_COLORS.light;
    const label = THEME_LABELS[theme] || theme;
    return `
      <button class="theme-option" type="button" role="menuitemradio" aria-checked="false" data-theme-option="${theme}" onclick="setTheme('${theme}')" style="--theme-swatch-bg:${bg};--theme-swatch-accent:${accent};">
        <span class="theme-option-swatch" aria-hidden="true"></span>
        <span class="theme-option-label">${label}</span>
      </button>
    `;
  }).join('');
  menu.innerHTML = `
    <div class="theme-menu-section" aria-label="Darstellung">
      <div class="theme-menu-label">darstellung</div>
      ${themeOptions}
    </div>
    <div class="theme-menu-divider" aria-hidden="true"></div>
    <div class="theme-menu-section" aria-label="Daten">
      <div class="theme-menu-label">daten</div>
      <button class="theme-action" type="button" role="menuitem" onclick="exportBackup()">
        backup
        ${backupAgeLabel() ? `<span class="theme-action-note">${backupAgeLabel()}</span>` : ''}
      </button>
      <button class="theme-action" type="button" role="menuitem"
        aria-pressed="${autoBackupEnabled() ? 'true' : 'false'}"
        title="Tägliche Sicherung beim Start – gilt für alle Geräte in diesem Datenordner"
        onclick="toggleAutoBackup()">
        auto-backup
        <span class="theme-action-toggle ${autoBackupEnabled() ? 'is-on' : ''}">${autoBackupEnabled() ? 'täglich' : 'aus'}</span>
      </button>
      <button class="theme-action" type="button" role="menuitem" onclick="importBackup()">import</button>
      <button class="theme-action" type="button" role="menuitem" onclick="openCleanupDialog()">cleanup</button>
      <button class="theme-action" type="button" role="menuitem" onclick="configureJiraBase()">jira-url</button>
      ${renderDeviceList()}
    </div>
    <div class="theme-menu-divider" aria-hidden="true"></div>
    <div class="theme-menu-section" aria-label="App">
      <div class="theme-menu-label">app</div>
      ${window.pendingUpdate ? `
        <button class="theme-action theme-action-update" type="button" role="menuitem" onclick="closeThemeMenu(); downloadUpdate()">
          <span class="theme-action-update-dot" aria-hidden="true"></span>
          update herunterladen
          <span class="theme-action-update-version">v${APP_VERSION} → v${window.pendingUpdate.version}</span>
        </button>
      ` : ''}
      <button class="theme-action" type="button" role="menuitem" onclick="closeThemeMenu(); checkForUpdate({ silent: false })">auf updates prüfen</button>
      <div class="theme-menu-version">v${APP_VERSION}</div>
    </div>
  `;
}

// Menü bleibt offen: man will sehen, dass der Schalter umgesprungen ist.
async function toggleAutoBackup() {
  const enabled = await setAutoBackupEnabled(!autoBackupEnabled());
  renderThemeMenu();
  updateThemeMenuSelection(document.body.getAttribute('data-theme'));
  toast(enabled ? 'Auto-Backup an – täglich beim Start' : 'Auto-Backup aus');
  if (enabled) maybeAutoBackup();
}

// Wer teilt sich diesen Datenordner, und wann war das letzte Mal? Wenn etwas
// nicht ankommt, sieht man hier zuerst, ob die andere Seite ueberhaupt
// synchronisiert hat.
function renderDeviceList() {
  const devices = activeDevices();
  if (devices.length < 2) return '';
  const me = getDeviceId();
  const rows = devices
    .slice()
    .sort((a, b) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || ''))
    .map(device => `
      <div class="theme-menu-device ${device.id === me ? 'is-self' : ''}">
        <span class="theme-menu-device-name">${esc(device.label || device.id.slice(0, 4))}</span>
        <span class="theme-menu-device-seen">${device.id === me ? 'dieses gerät' : esc(agoLabel(device.lastSeenAt))}</span>
      </div>
    `).join('');
  return `<div class="theme-menu-devices" title="Geräte, die diesen Datenordner nutzen">${rows}</div>`;
}

function configureJiraBase() {
  closeThemeMenu();
  const current = getJiraBaseUrl();
  const input = prompt('Jira Base-URL (z.B. https://jira.firma.at)\nLeer lassen zum Entfernen.', current);
  if (input === null) return;
  let val = input.trim().replace(/\/+$/, '');
  if (val && !/^https?:\/\//i.test(val)) val = 'https://' + val;
  try {
    if (val) localStorage.setItem(JIRA_BASE_KEY, val);
    else localStorage.removeItem(JIRA_BASE_KEY);
  } catch {}
  toast(val ? 'Jira-URL gespeichert' : 'Jira-URL entfernt');
}

function updateThemeMenuSelection(theme) {
  document.querySelectorAll('[data-theme-option]').forEach(option => {
    const active = option.dataset.themeOption === theme;
    option.classList.toggle('active', active);
    option.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

function setThemeMenuOpen(open) {
  const picker = document.getElementById('themePicker');
  const trigger = document.getElementById('themeTrigger');
  if (!picker || !trigger) return;
  // Beim Oeffnen neu bauen: das Backup-Alter steht erst nach dem Laden fest.
  if (open) {
    renderThemeMenu();
    updateThemeMenuSelection(document.body.getAttribute('data-theme'));
  }
  picker.classList.toggle('open', open);
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleThemeMenu(event) {
  if (event) event.stopPropagation();
  const picker = document.getElementById('themePicker');
  setThemeMenuOpen(!picker?.classList.contains('open'));
}

function closeThemeMenu() {
  setThemeMenuOpen(false);
}

function initTheme() {
  initThemeEasterEggs();
  renderThemeMenu();
  applyTheme(getSavedTheme());
}

// ============================================================
// HYRULE EASTER EGGS
// ============================================================
let hyruleNaviTimer = null;
let hyruleNaviHideTimer = null;
let hyruleSlashTimer = null;
let starfoxShotTimer = null;
let themeEasterEggsReady = false;

function hyruleThemeActive() {
  return document.body.getAttribute('data-theme') === 'hyrule';
}

function initThemeEasterEggs() {
  if (themeEasterEggsReady) return;
  themeEasterEggsReady = true;

  const layer = document.createElement('div');
  layer.className = 'hyrule-easter-eggs';
  layer.id = 'hyruleEasterEggs';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `
    <div class="hyrule-field" aria-hidden="true">
      <span class="hyrule-ray hyrule-ray-a"></span>
      <span class="hyrule-ray hyrule-ray-b"></span>
      <span class="hyrule-motes hyrule-motes-far"></span>
      <span class="hyrule-motes hyrule-motes-near"></span>
    </div>
    <div class="hyrule-triforce" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
    <div class="hyrule-navi-orbit" aria-hidden="true">
      <div class="hyrule-navi" id="hyruleNavi">
        <span class="hyrule-navi-core"></span>
        <span class="hyrule-navi-wing hyrule-navi-wing-left"></span>
        <span class="hyrule-navi-wing hyrule-navi-wing-right"></span>
      </div>
    </div>
    <div class="hyrule-slash" id="hyruleSlash">
      <span class="hyrule-slash-arc"></span>
    </div>
  `;
  document.body.appendChild(layer);

  const popLayer = document.createElement('div');
  popLayer.className = 'pop-theme-easter-eggs';
  popLayer.setAttribute('aria-hidden', 'true');
  popLayer.innerHTML = `
    <div class="starfox-space">
      <span class="starfox-stars starfox-stars-far"></span>
      <span class="starfox-stars starfox-stars-near"></span>
    </div>
    <div class="starfox-target-burst" id="starfoxTargetBurst">
      <span class="starfox-target-ring"></span>
    </div>
  `;
  document.body.appendChild(popLayer);

  const atmosphereLayer = document.createElement('div');
  atmosphereLayer.className = 'atmosphere-theme-effects';
  atmosphereLayer.setAttribute('aria-hidden', 'true');
  atmosphereLayer.innerHTML = `
    <div class="kodama-spores">
      <span class="kodama-spores-layer kodama-spores-far"></span>
      <span class="kodama-spores-layer kodama-spores-near"></span>
    </div>
    <div class="arrakis-atmosphere">
      <span class="arrakis-heat"></span>
      <span class="arrakis-sand arrakis-sand-a"></span>
      <span class="arrakis-sand arrakis-sand-b"></span>
    </div>
  `;
  document.body.appendChild(atmosphereLayer);

  document.addEventListener('click', triggerStarfoxTargetShot, true);
  document.addEventListener('click', triggerHyruleSlash, true);
}

function syncHyruleEasterEggs(theme) {
  clearTimeout(hyruleNaviTimer);
  clearTimeout(hyruleNaviHideTimer);
  hyruleNaviTimer = null;
  hyruleNaviHideTimer = null;

  const navi = document.getElementById('hyruleNavi');
  navi?.classList.remove('is-visiting');

  if (theme !== 'hyrule') return;
  scheduleHyruleNavi(16000);
}

function scheduleHyruleNavi(delay = 60000 + Math.random() * 60000) {
  clearTimeout(hyruleNaviTimer);
  if (!hyruleThemeActive()) return;
  hyruleNaviTimer = setTimeout(flyHyruleNavi, delay);
}

function flyHyruleNavi() {
  const navi = document.getElementById('hyruleNavi');
  if (!navi || !hyruleThemeActive()) return;

  navi.classList.remove('is-visiting');
  void navi.offsetWidth;
  navi.classList.add('is-visiting');
  clearTimeout(hyruleNaviHideTimer);
  hyruleNaviHideTimer = setTimeout(() => {
    navi.classList.remove('is-visiting');
    scheduleHyruleNavi();
  }, 12000);
}

function triggerHyruleSlash(event) {
  if (!hyruleThemeActive()) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const button = event.target.closest('button');
  const slash = document.getElementById('hyruleSlash');
  if (!button || button.disabled || !slash) return;

  const rect = button.getBoundingClientRect();
  const x = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : rect.left + rect.width / 2;
  const y = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : rect.top + rect.height / 2;
  slash.style.left = `${x}px`;
  slash.style.top = `${y}px`;
  slash.style.setProperty('--hyrule-slash-angle', `${-70 + Math.random() * 50}deg`);
  slash.classList.remove('is-slashing');
  void slash.offsetWidth;
  slash.classList.add('is-slashing');
  clearTimeout(hyruleSlashTimer);
  hyruleSlashTimer = setTimeout(() => slash.classList.remove('is-slashing'), 560);
}

function triggerStarfoxTargetShot(event) {
  if (document.body.getAttribute('data-theme') !== 'starfox') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const button = event.target.closest('button');
  const burst = document.getElementById('starfoxTargetBurst');
  if (!button || button.disabled || !burst) return;

  const rect = button.getBoundingClientRect();
  const x = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : rect.left + rect.width / 2;
  const y = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : rect.top + rect.height / 2;
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;
  burst.classList.remove('is-firing');
  void burst.offsetWidth;
  burst.classList.add('is-firing');
  clearTimeout(starfoxShotTimer);
  starfoxShotTimer = setTimeout(() => burst.classList.remove('is-firing'), 720);
}

// ============================================================
// QUICKNOTES
// ============================================================
const QUICKNOTES_KEY = 'tktool-quicknotes';
const QUICKNOTES_OPEN_KEY = 'tktool-quicknotes-open';

function updateQuickNotesIndicator(value) {
  const indicator = document.getElementById('quicknotesIndicator');
  if (!indicator) return;
  const hasText = !!value.trim();
  indicator.classList.toggle('has-content', hasText);
  indicator.hidden = !hasText;
  indicator.textContent = hasText ? 'notiz' : '';
}

function toggleQuickNotes() {
  const el = document.getElementById('quicknotes');
  const isOpen = el.classList.toggle('open');
  try { localStorage.setItem(QUICKNOTES_OPEN_KEY, isOpen ? '1' : '0'); } catch {}
  if (isOpen) {
    setTimeout(() => document.getElementById('quicknotesEditor').focus(), 50);
  }
}

function initQuickNotes() {
  const editor = document.getElementById('quicknotesEditor');
  try {
    const saved = localStorage.getItem(QUICKNOTES_KEY);
    if (saved) editor.value = saved;
  } catch {}
  updateQuickNotesIndicator(editor.value);
  editor.addEventListener('input', () => {
    try { localStorage.setItem(QUICKNOTES_KEY, editor.value); } catch {}
    updateQuickNotesIndicator(editor.value);
  });
  try {
    if (localStorage.getItem(QUICKNOTES_OPEN_KEY) === '1') {
      document.getElementById('quicknotes').classList.add('open');
    }
  } catch {}
}

initQuickNotes();

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
initTheme();

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    toggleSudoMode();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCapture(e.shiftKey ? { captureMode: 'teammate' } : {});
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    toggleQuickNotes();
  }
  if (e.key === 'Escape') {
    closeThemeMenu();
    const qn = document.getElementById('quicknotes');
    if (qn.classList.contains('open') && document.activeElement === document.getElementById('quicknotesEditor')) {
      qn.classList.remove('open');
      try { localStorage.setItem(QUICKNOTES_OPEN_KEY, '0'); } catch {}
      document.getElementById('quicknotesEditor').blur();
      return;
    }
    closeOverlay();
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('#themePicker')) closeThemeMenu();
});

// ============================================================
// INIT
// ============================================================
function showSetupScreen(mode = 'pick') {
  const setup = document.getElementById('setupScreen');
  const kicker = document.getElementById('setupKicker');
  const title = document.getElementById('setupTitle');
  const text = document.getElementById('setupText');
  const button = document.getElementById('setupButton');
  const altButton = document.getElementById('setupAltButton');
  const hint = document.getElementById('setupHint');
  const reconnect = mode === 'reconnect';

  if (kicker) kicker.textContent = reconnect ? 'start' : 'setup';
  if (title) title.textContent = reconnect ? 'Zugriff erlauben' : 'Speicherort wählen';
  if (text) {
    text.textContent = reconnect
      ? 'Chrome braucht kurz deine Freigabe, damit TKTool deine lokalen Daten laden kann.'
      : 'Wähle einen Ordner, in dem TKTool deine Daten speichern darf.';
  }
  if (button) button.textContent = reconnect ? 'Zugriff erlauben' : 'Datenordner auswählen';
  if (altButton) altButton.hidden = !reconnect;
  if (hint) {
    hint.textContent = reconnect
      ? 'Deine Daten bleiben lokal.'
      : 'Deine Daten bleiben lokal in deinem Ordner.';
  }
  if (setup) setup.style.display = 'flex';
}

async function finishStorageConnection(handle) {
  dirHandle = handle;
  // Load first: if it fails, the setup screen stays visible instead of
  // leaving a blank app behind.
  await loadData();
  document.getElementById('setupScreen').style.display = 'none';
  render();
  scheduleAutoBackup();
}

// Nicht awaiten: der erste Render darf darauf nicht warten, und Fehler
// melden sich selbst. Erst bestaetigen, dann sichern — so steht die
// Geraete-Bestaetigung schon im Backup.
function scheduleAutoBackup() {
  setTimeout(async () => {
    await ackAndPurgeGraves();
    await maybeAutoBackup();
  }, 1500);
}

async function connectStorage() {
  try {
    const handle = await getSavedDirHandle() || await pickDataDirectory();
    await finishStorageConnection(handle);
  } catch (err) {
    console.error('Directory pick cancelled or failed:', err);
    if (err?.name !== 'AbortError') reportUiError('Datenordner konnte nicht geöffnet werden', err);
  }
}

async function chooseStorageDirectory() {
  try {
    const handle = await pickDataDirectory();
    await finishStorageConnection(handle);
  } catch (err) {
    console.error('Directory pick cancelled or failed:', err);
    if (err?.name !== 'AbortError') reportUiError('Datenordner konnte nicht geöffnet werden', err);
  }
}

(async () => {
  const saved = await getStoredDirHandle();
  if (saved) {
    if (await hasHandlePermission(saved)) {
      dirHandle = saved;
      await loadData();
      render();
      scheduleAutoBackup();
    } else {
      render();
      showSetupScreen('reconnect');
    }
  } else {
    render();
    showSetupScreen('pick');
  }
})();
