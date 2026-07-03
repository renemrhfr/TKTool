// ============================================================
// DATA LAYER — File System Access API
// ============================================================
const APP_VERSION = '1.0.7';
const DATA_FILENAME = 'tktool-data.json';
const IDB_NAME = 'tktool-fs';
const IDB_STORE = 'handles';
const IDB_KEY = 'dataDir';
const THEME_KEY = 'tktool-theme';
const OVERVIEW_LAYOUT_KEY = 'tktool-overview-layout';
const REVIEW_PERIOD_KEY = 'tktool-review-period';
const THEMES = [
  'light',
  'dark',
  'gruvbox-dark',
  'catppuccin-mocha',
  'tokyo-night',
  'rose-pine-dawn',
  'paper',
  'nord',
  'switch',
  'matrix',
  'serum',
];
const THEME_LABELS = {
  light: 'light',
  dark: 'dark',
  'gruvbox-dark': 'gruvbox',
  'catppuccin-mocha': 'mocha',
  'tokyo-night': 'tokyo',
  'rose-pine-dawn': 'dawn',
  paper: 'paper',
  nord: 'nord',
  switch: 'switch',
  matrix: 'matrix',
  serum: 'serum',
};
const THEME_COLORS = {
  light: ['#fdf6e3', '#f57d26'],
  dark: ['#232a2e', '#e69875'],
  'gruvbox-dark': ['#282828', '#fe8019'],
  'catppuccin-mocha': ['#1e1e2e', '#cba6f7'],
  'tokyo-night': ['#1a1b26', '#7aa2f7'],
  'rose-pine-dawn': ['#faf4ed', '#d7827e'],
  paper: ['#f7f7f4', '#111111'],
  nord: ['#2e3440', '#88c0d0'],
  switch: ['#ebebeb', '#e60012'],
  matrix: ['#030703', '#38b84a'],
  serum: ['#121820', '#75d64b'],
};

const defaultData = () => ({
  items: [],
  persons: [],
  meetings: [],
  focuses: [],
  dashboardLinks: [],
  monthReviews: [],
  blocks: [],
  markers: [],
});

// --- IndexedDB helpers (persist directory handle across sessions) ---
function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- File handle management ---
let dirHandle = null;

async function getStoredHandle(key) {
  try {
    return await idbGet(key);
  } catch {
    return null;
  }
}

async function ensureHandlePermission(handle) {
  if (!handle) return null;
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return handle;
    if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') return handle;
    return null;
  } catch {
    return null;
  }
}

async function hasHandlePermission(handle) {
  if (!handle) return false;
  try {
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

async function getSavedHandle(key) {
  return ensureHandlePermission(await getStoredHandle(key));
}

async function getStoredDirHandle() {
  return getStoredHandle(IDB_KEY);
}

async function getSavedDirHandle() {
  return getSavedHandle(IDB_KEY);
}

async function pickDirectory(key, pickerId) {
  const h = await window.showDirectoryPicker({ id: pickerId, startIn: 'documents', mode: 'readwrite' });
  await idbSet(key, h);
  return h;
}

async function pickDataDirectory() {
  return pickDirectory(IDB_KEY, 'tktool-data');
}

async function ensureDirHandle() {
  if (dirHandle) return dirHandle;
  dirHandle = await getSavedDirHandle();
  if (!dirHandle) dirHandle = await pickDataDirectory();
  return dirHandle;
}

async function readDataFile() {
  const dir = await ensureDirHandle();
  try {
    const fh = await dir.getFileHandle(DATA_FILENAME);
    const file = await fh.getFile();
    lastMtime = file.lastModified;
    const text = await file.text();
    const d = JSON.parse(text);
    const merged = { ...defaultData(), ...d };
    merged.persons = (merged.persons || []).map(p => ({ ...p, supportMonate: p.supportMonate || [] }));
    merged.monthReviews = (merged.monthReviews || []).map(review => ({
      id: review.id || uid(),
      month: review.month,
      summary: review.summary || '',
      createdAt: review.createdAt || todayStr(),
      updatedAt: review.updatedAt || review.createdAt || todayStr(),
    }));
    merged.blocks = (merged.blocks || []).map(({ status, ...block }) => block);
    return merged;
  } catch {
    lastMtime = 0;
    return defaultData();
  }
}

// --- Concurrency-safe persistence ---------------------------------
// lastMtime: lastModified of the data file as we last read/wrote it.
// Used to detect when another instance (other tab/window/browser)
// wrote the file behind our back, so we merge instead of clobbering.
let lastMtime = 0;
// writeChain serializes writes within this instance so two saves never
// run createWritable() concurrently.
let writeChain = Promise.resolve();
// syncChannel notifies other instances in the same browser to reload.
let syncChannel = null;
try {
  syncChannel = new BroadcastChannel('tktool-sync');
  syncChannel.onmessage = async e => {
    if (!e.data || e.data.t !== 'saved') return;
    // Don't yank the view out from under someone who is typing — the
    // merge-on-write guard protects the data either way. Reload on the
    // next save/render cycle instead.
    const el = document.activeElement;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    try {
      await loadData();
      if (typeof render === 'function') render();
    } catch {}
  };
} catch {
  syncChannel = null;
}

async function getFileMtime(dir) {
  try {
    const fh = await dir.getFileHandle(DATA_FILENAME);
    return (await fh.getFile()).lastModified;
  } catch {
    return 0; // file does not exist yet
  }
}

// Union two collections by id. Base = theirs (on disk); our entries win
// on shared ids, disk-only entries are kept. Guarantees no capture is
// lost on either side (edit conflicts resolve to our version).
function mergeById(mine, theirs) {
  if (!Array.isArray(theirs)) return Array.isArray(mine) ? mine : [];
  if (!Array.isArray(mine)) return theirs;
  const byId = new Map();
  for (const t of theirs) byId.set(t.id, t);
  for (const m of mine) byId.set(m.id, m);
  return [...byId.values()];
}

function mergeData(mine, theirs) {
  const out = defaultData();
  for (const key of Object.keys(out)) out[key] = mergeById(mine[key], theirs[key]);
  return out;
}

async function writeDataFileNow() {
  const dir = await ensureDirHandle();
  let payload = data;
  const current = await getFileMtime(dir);
  // The file changed since we last synced -> another instance wrote it.
  if (lastMtime && current && current !== lastMtime) {
    let disk = null;
    try { disk = await readDataFile(); } catch { disk = null; }
    if (disk) {
      payload = mergeData(data, disk);
      data = payload;
      toast('Externe Änderung erkannt – zusammengeführt');
      if (typeof render === 'function') { try { render(); } catch {} }
    }
  }
  const fh = await dir.getFileHandle(DATA_FILENAME, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
  lastMtime = await getFileMtime(dir);
  if (syncChannel) { try { syncChannel.postMessage({ t: 'saved' }); } catch {} }
}

function writeDataFile() {
  // Serialize writes; run regardless of whether the previous one failed.
  writeChain = writeChain.then(writeDataFileNow, writeDataFileNow);
  return writeChain;
}

// --- Public API (same interface as before) ---
let data = defaultData();

async function loadData() {
  try {
    data = await readDataFile();
  } catch {
    data = defaultData();
  }
  data.meetings = (data.meetings || []).map(meeting => ({
    ...meeting,
    participants: Array.isArray(meeting.participants) ? meeting.participants.filter(Boolean) : [],
  }));
  return data;
}

function saveData(d) {
  data = d;
  writeDataFile().catch(err => {
    console.error('Save failed:', err);
    toast('⚠ Speichern fehlgeschlagen – Änderung NICHT gesichert!', 5000);
  });
}
