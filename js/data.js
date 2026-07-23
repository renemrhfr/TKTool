// ============================================================
// DATA LAYER — File System Access API
// ============================================================
const APP_VERSION = '1.0.18';
const DATA_FILENAME = 'tktool-data.json';
const JIRA_SYNC_FILENAME = 'jira-tickets.json';
const IDB_NAME = 'tktool-fs';
const IDB_STORE = 'handles';
const IDB_KEY = 'dataDir';
const IDB_DATA_CACHE_KEY = 'dataCache';
const DEVICE_ID_KEY = 'tktool-device-id';
const THEME_KEY = 'tktool-theme';
const OVERVIEW_LAYOUT_KEY = 'tktool-overview-layout';
const REVIEW_PERIOD_KEY = 'tktool-review-period';
const JIRA_BASE_KEY = 'tktool-jira-base';
const PLANUNG_WEEKENDS_KEY = 'tktool-planung-weekends';
const THEMES = [
  'light',
  'dark',
  'tokyo-night',
  'rose-pine-dawn',
  'daylight',
  'naboo',
  'bridges',
  'hyrule',
  'starfox',
  'nord',
  'switch',
  'matrix',
  'serum',
];
const THEME_LABELS = {
  light: 'light',
  dark: 'dark',
  'tokyo-night': 'tokyo',
  'rose-pine-dawn': 'dawn',
  daylight: 'daylight',
  naboo: 'naboo',
  bridges: 'bridges',
  hyrule: 'hyrule',
  starfox: 'starfox',
  nord: 'nord',
  switch: 'switch',
  matrix: 'matrix',
  serum: 'serum',
};
const THEME_COLORS = {
  light: ['#fdf6e3', '#f57d26'],
  dark: ['#232a2e', '#e69875'],
  'tokyo-night': ['#1a1b26', '#7aa2f7'],
  'rose-pine-dawn': ['#faf4ed', '#d7827e'],
  daylight: ['#f4f8fc', '#2563a6'],
  naboo: ['#f3f5f0', '#2f6f82'],
  bridges: ['#eef2f3', '#b94d1c'],
  hyrule: ['#f4f0df', '#3f7752'],
  starfox: ['#07111d', '#2a7ba2'],
  nord: ['#2e3440', '#88c0d0'],
  switch: ['#ebebeb', '#e60012'],
  matrix: ['#030703', '#38b84a'],
  serum: ['#121820', '#75d64b'],
};

// Surface runtime failures in the app as well as in DevTools. This is
// intentionally installed from the first script so errors in later scripts
// cannot fail silently.
let lastUiError = { message: '', at: 0 };

function uiToast(message, duration = 2000, kind = 'info') {
  if (typeof window.toast === 'function') {
    window.toast(message, duration, kind);
    return;
  }
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('toast-error', kind === 'error');
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

function errorMessage(error) {
  if (error && typeof error.message === 'string' && error.message) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function reportUiError(context, error) {
  const detail = errorMessage(error) || 'Unbekannter Fehler';
  const message = `⚠ ${context}: ${detail}`.slice(0, 320);
  const now = Date.now();
  if (lastUiError.message === message && now - lastUiError.at < 2000) return;
  lastUiError = { message, at: now };
  uiToast(message, 8000, 'error');
}

window.addEventListener('error', event => {
  reportUiError('JavaScript-Fehler', event.error || event.message);
});

window.addEventListener('unhandledrejection', event => {
  reportUiError('Unbehandelter Fehler', event.reason);
});

const defaultData = () => ({
  items: [],
  persons: [],
  meetings: [],
  notes: [],
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
    return normalizeData(d);
  } catch (error) {
    if (error?.name === 'NotFoundError') return defaultData();
    throw error;
  }
}

// --- Concurrency-safe persistence ---------------------------------
// Every record carries per-field version stamps in `_syncFields`
// ({ rev, changedAt, changeId } per field name). Merging is field-wise
// last-writer-wins on a Lamport counter, so concurrent edits to different
// fields of the same record both survive. Deletion is a versioned
// `deleted` flag on the record (soft delete) and merges like any other
// field edit; the UI never sees soft-deleted records.
const COLLECTION_KEYS = Object.keys(defaultData());
const RECORD_SYNC_FIELDS = new Set(['_syncFields']);
let deviceChangeSequence = 0;
const fallbackDeviceId = `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
// Clone of the UI-visible data at the last sync point; diff basis for saveData.
let localSnapshot = null;
// Soft-deleted records, kept out of the UI's `data`.
let deletedRecords = defaultData();
let pendingWrites = 0;
let saveGeneration = 0;
// Serializes writes within this instance so two saves never run
// createWritable() concurrently.
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
    if (pendingWrites) return;
    const el = document.activeElement;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    try {
      await loadData();
      if (typeof render === 'function') render();
    } catch (error) {
      console.error('Reload after external save failed:', error);
      reportUiError('Synchronisierung fehlgeschlagen', error);
    }
  };
} catch {
  syncChannel = null;
}

function cloneData(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeRecord(raw) {
  const record = { ...(raw || {}) };
  if (record._syncFields && typeof record._syncFields === 'object') {
    record._syncFields = { ...record._syncFields };
  } else {
    delete record._syncFields;
  }
  return record;
}

function normalizeData(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const merged = { ...defaultData(), ...source };
  for (const key of COLLECTION_KEYS) {
    merged[key] = (Array.isArray(merged[key]) ? merged[key] : []).map(normalizeRecord);
  }
  merged.persons = merged.persons.map(p => ({ ...p, supportMonate: p.supportMonate || [] }));
  merged.meetings = merged.meetings.map(meeting => ({
    ...meeting,
    participants: Array.isArray(meeting.participants) ? meeting.participants.filter(Boolean) : [],
  }));
  merged.notes = merged.notes.map(note => ({
    ...note,
    title: note.title || 'Unbenannte Notiz',
    text: note.text || '',
    createdAt: note.createdAt || todayStr(),
    updatedAt: note.updatedAt || note.createdAt || todayStr(),
  }));
  merged.monthReviews = merged.monthReviews.map(review => ({
    ...review,
    id: review.id || uid(),
    month: review.month,
    summary: review.summary || '',
    createdAt: review.createdAt || todayStr(),
    updatedAt: review.updatedAt || review.createdAt || todayStr(),
  }));
  merged.blocks = merged.blocks.map(({ status, ...block }) => block);
  return stripDeletedRecords(merged);
}

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return fallbackDeviceId;
  }
}

function versionOf(value) {
  if (!value) return { rev: 0, changedAt: '', changeId: '' };
  return {
    rev: Number(value.rev) || 0,
    changedAt: value.changedAt || '',
    changeId: value.changeId || '',
  };
}

function compareVersions(a, b) {
  if (a.rev !== b.rev) return a.rev - b.rev;
  if (a.changedAt !== b.changedAt) return a.changedAt.localeCompare(b.changedAt);
  return a.changeId.localeCompare(b.changeId);
}

function nextVersion(previousVersion) {
  const rev = versionOf(previousVersion).rev + 1;
  const changedAt = new Date().toISOString();
  const changeId = `${getDeviceId()}:${Date.now()}:${++deviceChangeSequence}`;
  return { rev, changedAt, changeId };
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`);
  return `{${entries.join(',')}}`;
}

function contentFields(record) {
  return Object.keys(record || {}).filter(key => !RECORD_SYNC_FIELDS.has(key));
}

function fieldVersion(record, field) {
  return versionOf(record?._syncFields?.[field]);
}

function stampChangedFields(record, previousRecord) {
  const previousFields = previousRecord?._syncFields || {};
  const ownFields = record._syncFields || {};
  // Base: the newer stamp per field, so a stale caller state can never
  // roll a field's version backwards.
  record._syncFields = { ...previousFields };
  for (const [field, version] of Object.entries(ownFields)) {
    if (compareVersions(versionOf(version), versionOf(previousFields[field])) > 0) {
      record._syncFields[field] = version;
    }
  }
  const fields = new Set([...contentFields(record), ...contentFields(previousRecord)]);
  for (const field of fields) {
    if (previousRecord && stableJson(record[field]) === stableJson(previousRecord[field])) continue;
    record._syncFields[field] = nextVersion(record._syncFields[field]);
  }
  // mergeRecords omits an empty _syncFields; keep the shapes identical so the
  // external-change comparison doesn't fire on legacy records without stamps.
  if (!Object.keys(record._syncFields).length) delete record._syncFields;
}

// Diff the UI state against the last synced snapshot and produce the full
// store to persist: changed fields get fresh version stamps, records the
// user removed become soft-deleted, already-deleted records are carried over.
function prepareLocalChanges(nextData, previousData, deleted) {
  const next = normalizeData(nextData);
  // Before the first successful loadData there is no diff basis; diffing
  // against the data itself stamps nothing, and the write still merges.
  const previous = previousData ? normalizeData(previousData) : next;
  const store = defaultData();

  for (const key of COLLECTION_KEYS) {
    const previousById = new Map(previous[key].map(record => [record.id, record]));
    const deletedById = new Map((deleted?.[key] || []).map(record => [record.id, record]));
    const nextIds = new Set(next[key].map(record => record.id));

    for (const record of next[key]) {
      const grave = deletedById.get(record.id);
      // Re-added with the id of a soft-deleted record: resurrect explicitly
      // so the deletion gets outvoted.
      if (grave && !record.deleted) record.deleted = false;
      stampChangedFields(record, previousById.get(record.id) ?? grave);
      store[key].push(record);
    }

    for (const previousRecord of previous[key]) {
      if (nextIds.has(previousRecord.id)) continue;
      // Keep only the marker and the version stamps — the content of a
      // deleted record is never shown again, and a re-add brings its own.
      const grave = {
        id: previousRecord.id,
        deleted: true,
        _syncFields: { ...(previousRecord._syncFields || {}) },
      };
      grave._syncFields.deleted = nextVersion(grave._syncFields.deleted);
      store[key].push(grave);
    }

    for (const grave of deletedById.values()) {
      if (!nextIds.has(grave.id)) store[key].push(grave);
    }
  }
  return stripDeletedRecords(store);
}

function mergeRecords(mine, theirs) {
  if (!mine) return theirs;
  if (!theirs) return mine;
  const merged = {};
  const fields = new Set([...contentFields(mine), ...contentFields(theirs)]);
  const syncFields = {};

  for (const field of fields) {
    // The disk value wins a legacy tie. Once a field has metadata, only an
    // actual edit to that field can replace it.
    if (compareVersions(fieldVersion(mine, field), fieldVersion(theirs, field)) > 0) {
      if (Object.hasOwn(mine, field)) merged[field] = mine[field];
      if (mine._syncFields?.[field]) syncFields[field] = mine._syncFields[field];
    } else {
      if (Object.hasOwn(theirs, field)) merged[field] = theirs[field];
      if (theirs._syncFields?.[field]) syncFields[field] = theirs._syncFields[field];
    }
  }

  if (Object.keys(syncFields).length) merged._syncFields = syncFields;
  return merged;
}

function mergeData(mine, theirs) {
  const ours = normalizeData(mine);
  const disk = normalizeData(theirs);
  const out = defaultData();
  for (const key of COLLECTION_KEYS) {
    const mineById = new Map(ours[key].map(record => [record.id, record]));
    const theirById = new Map(disk[key].map(record => [record.id, record]));
    const ids = new Set([...mineById.keys(), ...theirById.keys()]);
    out[key] = [...ids].map(id => mergeRecords(mineById.get(id), theirById.get(id)));
  }
  return stripDeletedRecords(out);
}

// Reduce every soft-deleted record to its bare marker so old content never
// lingers in the file or cache — a stale full copy on another device would
// otherwise re-fill the fields on the next merge (versions tie, disk wins).
// The field stamps are kept: they are small, and a later re-add (e.g. a
// backup restore) needs them to outversion stale copies of the old content.
function stripDeletedRecords(store) {
  for (const key of COLLECTION_KEYS) {
    store[key] = store[key].map(record => (
      record.deleted
        ? { id: record.id, deleted: true, _syncFields: { ...(record._syncFields || {}) } }
        : record
    ));
  }
  return store;
}

function dataJson(value) {
  return stableJson(value);
}

async function cacheData(dataToCache) {
  try {
    await idbSet(IDB_DATA_CACHE_KEY, {
      dirHandle: dirHandle || await ensureDirHandle(),
      data: cloneData(dataToCache),
    });
  } catch (error) {
    console.error('Local recovery cache failed:', error);
    reportUiError('Lokale Sicherung fehlgeschlagen', error);
  }
}

async function getCachedData() {
  try {
    const cached = await idbGet(IDB_DATA_CACHE_KEY);
    if (!cached) return null;
    if (cached.data) {
      if (cached.dirHandle && dirHandle && typeof cached.dirHandle.isSameEntry === 'function') {
        if (!(await cached.dirHandle.isSameEntry(dirHandle))) return null;
      }
      return normalizeData(cached.data);
    }
    // Compatibility with the short-lived unscoped cache format.
    return normalizeData(cached);
  } catch (error) {
    console.error('Reading local recovery cache failed:', error);
    reportUiError('Lokale Sicherung konnte nicht gelesen werden', error);
    return null;
  }
}

async function writeDataFileNow(snapshot) {
  const dir = await ensureDirHandle();
  // Cache before touching the cloud-backed file. If the file write fails or
  // OneDrive later replaces it with an older version, this device can recover
  // its newer records on the next load.
  await cacheData(snapshot);
  const disk = await readDataFile();
  const payload = mergeData(snapshot, disk);
  const mergedExternal = dataJson(payload) !== dataJson(snapshot);
  const fh = await dir.getFileHandle(DATA_FILENAME, { create: true });
  const writable = await fh.createWritable();
  try {
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
  } catch (error) {
    try { await writable.abort(); } catch {}
    throw error;
  }
  await cacheData(payload);
  if (syncChannel) { try { syncChannel.postMessage({ t: 'saved' }); } catch {} }
  return { payload, mergedExternal };
}

function writeDataFile(snapshot) {
  // Serialize writes; run regardless of whether the previous one failed.
  writeChain = writeChain.then(
    () => writeDataFileNow(snapshot),
    () => writeDataFileNow(snapshot),
  );
  return writeChain;
}

// --- Jira sync snapshot (written by external sync script, read-only) ---
// Format: { generatedAt: ISO string, source: base url, assignees: { email: [ticket] } }
// Wird beim Laden gelesen und danach nur auf Anforderung (Klick auf den
// Stand-Stempel) — das externe Skript laeuft ohnehin nur stuendlich.
let jiraSyncData = null;

async function loadJiraSync() {
  try {
    const dir = await ensureDirHandle();
    const fh = await dir.getFileHandle(JIRA_SYNC_FILENAME);
    const file = await fh.getFile();
    const parsed = JSON.parse(await file.text());
    jiraSyncData = parsed && typeof parsed.assignees === 'object' ? parsed : null;
  } catch {
    jiraSyncData = null;
  }
  return jiraSyncData;
}

// Liest jira-tickets.json neu ein, nachdem das Sync-Skript gelaufen ist.
// Der Browser kann das Skript selbst nicht starten (file://), daher nur
// Neueinlesen des Snapshots.
async function refreshJiraSync() {
  const before = jiraSyncData && jiraSyncData.generatedAt;
  await loadJiraSync();
  if (typeof render === 'function') { try { render(); } catch {} }
  if (typeof uiToast === 'function') {
    if (!jiraSyncData) uiToast('Keine jira-tickets.json im Datenordner gefunden');
    else if (jiraSyncData.generatedAt === before) uiToast('Jira-Stand unverändert (' + (jiraSyncAgeLabel() || 'unbekannt') + ')');
    else uiToast('Jira-Tickets aktualisiert');
  }
}

// --- Public API (same interface as before) ---
let data = defaultData();

// The UI only ever sees live records; soft-deleted ones stay in the
// persistence layer. They are never removed automatically: a device that
// was offline for a long time could otherwise re-introduce the record from
// its stale copy once the marker is gone.
function adoptStore(store) {
  const live = defaultData();
  const deleted = defaultData();
  for (const key of COLLECTION_KEYS) {
    for (const record of store[key]) (record.deleted ? deleted : live)[key].push(record);
  }
  data = live;
  deletedRecords = deleted;
  localSnapshot = cloneData(live);
}

async function loadData() {
  const disk = await readDataFile();
  const cached = await getCachedData();
  const store = cached ? mergeData(cached, disk) : disk;
  adoptStore(store);

  if (cached && dataJson(store) !== dataJson(disk)) {
    try {
      const result = await writeDataFile(cloneData(store));
      adoptStore(result.payload);
      uiToast('Lokale Änderungen wiederhergestellt und synchronisiert', 5000);
    } catch (error) {
      console.error('Writing recovered data failed:', error);
      reportUiError('Lokale Änderungen wiederhergestellt, aber Dateisynchronisierung fehlgeschlagen', error);
    }
  } else {
    await cacheData(store);
  }
  await loadJiraSync();
  return data;
}

function saveData(d) {
  const store = prepareLocalChanges(d, localSnapshot, deletedRecords);
  adoptStore(store);
  const snapshot = cloneData(store);
  const generation = ++saveGeneration;
  pendingWrites++;
  const operation = writeDataFile(snapshot);
  return operation.then(result => {
    pendingWrites--;
    if (generation === saveGeneration) {
      adoptStore(result.payload);
      if (result.mergedExternal && typeof render === 'function') {
        try { render(); } catch (error) { reportUiError('Darstellung fehlgeschlagen', error); }
      }
    }
    if (result.mergedExternal) uiToast('Externe Änderung erkannt – zusammengeführt', 4000);
    return result.payload;
  }, err => {
    pendingWrites--;
    console.error('Save failed:', err);
    reportUiError('Speichern fehlgeschlagen – Änderung NICHT in die Datei geschrieben', err);
    return null;
  });
}
