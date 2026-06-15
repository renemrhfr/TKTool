// ============================================================
// DATA LAYER — File System Access API
// ============================================================
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
    return defaultData();
  }
}

async function writeDataFile(data) {
  const dir = await ensureDirHandle();
  const fh = await dir.getFileHandle(DATA_FILENAME, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
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
  writeDataFile(d).catch(err => {
    console.error('Save failed:', err);
    toast('Speichern fehlgeschlagen!');
  });
}
