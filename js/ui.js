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
      <button class="theme-action" type="button" role="menuitem" onclick="exportBackup()">backup</button>
      <button class="theme-action" type="button" role="menuitem" onclick="importBackup()">import</button>
    </div>
  `;
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
  renderThemeMenu();
  applyTheme(getSavedTheme());
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
  document.getElementById('setupScreen').style.display = 'none';
  await loadData();
  render();
}

async function connectStorage() {
  try {
    const handle = await getSavedDirHandle() || await pickDataDirectory();
    await finishStorageConnection(handle);
  } catch (err) {
    console.error('Directory pick cancelled or failed:', err);
  }
}

async function chooseStorageDirectory() {
  try {
    const handle = await pickDataDirectory();
    await finishStorageConnection(handle);
  } catch (err) {
    console.error('Directory pick cancelled or failed:', err);
  }
}

(async () => {
  const saved = await getStoredDirHandle();
  if (saved) {
    if (await hasHandlePermission(saved)) {
      dirHandle = saved;
      await loadData();
      render();
    } else {
      render();
      showSetupScreen('reconnect');
    }
  } else {
    render();
    showSetupScreen('pick');
  }
})();
