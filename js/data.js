// ============================================================
// DATA LAYER — File System Access API
// ============================================================
const APP_VERSION = '1.0.37';
const DATA_FILENAME = 'tktool-data.json';
const JIRA_SYNC_FILENAME = 'jira-tickets.json';
const JIRA_QUERY_MAX_RESULTS = 100;
const IDB_NAME = 'tktool-fs';
const IDB_STORE = 'handles';
const IDB_KEY = 'dataDir';
const IDB_DATA_CACHE_KEY = 'dataCache';
const DEVICE_ID_KEY = 'tktool-device-id';
const THEME_KEY = 'tktool-theme';
const OVERVIEW_LAYOUT_KEY = 'tktool-overview-layout';
const JIRA_BASE_KEY = 'tktool-jira-base';
const JIRA_STATUS_SETTING_ID = 'jira-status';
const BACKUP_SETTING_ID = 'backup';
const PLANUNG_WEEKENDS_KEY = 'tktool-planung-weekends';
// Backups sind Kopien der Datendatei in einem Unterordner des Datenordners —
// kein zweiter Ordner-Picker noetig, nichts landet im Download-Ordner.
const BACKUP_DIRNAME = 'backups';
// Aufgeraeumt wird pro Anlass, weil die drei Sorten verschieden wertvoll
// sind. Ein Backup ist ein Voll-Abzug, kein Delta: einen Monat zurueck
// einzuspielen kostet einen Monat Arbeit, deshalb reicht bei den taeglichen
// ein knappes rollierendes Fenster. Die Cleanup-Backups sind dagegen die
// einzige Kopie der geloeschten Eintraege — die duerfen taegliche Kopien
// nicht verdraengen.
// Bewusst knapp gehalten: jede Kopie ist so gross wie die ganze Datendatei,
// und der Backup-Ordner kostet damit ein Vielfaches dessen, was der Cleanup
// je einspart. Geschrieben wird nur, wenn die App offen war — sieben Stueck
// sind also die letzten sieben aktiven Tage, nicht sieben Kalendertage.
const BACKUP_KEEP = { auto: 7, manuell: 2, cleanup: 5 };
const BACKUP_KEEP_DEFAULT = 3;
const AUTO_BACKUP_INTERVAL_DAYS = 1;
// Ein Loeschmarker darf erst weg, wenn ihn jedes Geraet einmal gesehen hat —
// sonst bringt ein veralteter lokaler Cache den Eintrag zurueck. Statt blind
// zu warten, fuehren wir Buch darueber, wann welches Geraet zuletzt geladen
// hat. Die Frist ist nur die Rueckfallebene fuer Geraete, die nie
// wiederkommen; ein Geraet, das laenger als DEVICE_ACTIVE_DAYS weg ist, gilt
// als ausgemustert und blockiert nicht mehr.
const GRAVE_GRACE_DAYS = 90;
const DEVICE_ACTIVE_DAYS = 90;
const DEVICE_TOUCH_HOURS = 6;
const DEVICES_SETTING_ID = 'devices';
const THEMES = [
  'light',
  'dark',
  'rose-pine-dawn',
  'daylight',
  'bridges',
  'hyrule',
  'starfox',
  'nord',
  'switch',
  'matrix',
  'kodama',
  'arrakis',
];
const THEME_LABELS = {
  light: 'light',
  dark: 'dark',
  'rose-pine-dawn': 'dawn',
  daylight: 'daylight',
  bridges: 'bridges',
  hyrule: 'hyrule',
  starfox: 'starfox',
  nord: 'nord',
  switch: 'switch',
  matrix: 'matrix',
  kodama: 'kodama',
  arrakis: 'arrakis',
};
const THEME_COLORS = {
  light: ['#fdf6e3', '#f57d26'],
  dark: ['#232a2e', '#e69875'],
  'rose-pine-dawn': ['#faf4ed', '#d7827e'],
  daylight: ['#f4f8fc', '#2563a6'],
  bridges: ['#eef2f3', '#b94d1c'],
  hyrule: ['#f4f0df', '#3f7752'],
  starfox: ['#07111d', '#2a7ba2'],
  nord: ['#2e3440', '#88c0d0'],
  switch: ['#ebebeb', '#e60012'],
  matrix: ['#030703', '#38b84a'],
  kodama: ['#092526', '#e3a54b'],
  arrakis: ['#ead4a6', '#c8662d'],
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
  // Geteilte Einstellungen (im Datenordner, nicht pro Gerät). Jede Einstellung
  // ist ein Record mit fester id, damit sie durch denselben Merge läuft.
  settings: [],
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
  const foreign = mergedExternal ? newestForeignChange(snapshot, disk) : null;
  const mergedFrom = foreign ? deviceLabelFor(foreign.deviceId, payload.settings) : '';
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
  return { payload, mergedExternal, mergedFrom, mergedAt: foreign?.changedAt || '' };
}

function writeDataFile(snapshot) {
  // Serialize writes; run regardless of whether the previous one failed.
  writeChain = writeChain.then(
    () => writeDataFileNow(snapshot),
    () => writeDataFileNow(snapshot),
  );
  return writeChain;
}

// --- Jira snapshot (per Copy-Paste-Import geschrieben, siehe unten) ---
// Format: { generatedAt: ISO string, source: base url,
//           assignees: { accountId: [ticket] }, refs: { KEY: {...} } }
// Wird beim Laden gelesen und danach nur auf Anforderung.
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

// --- Jira-Antwort einspielen ---------------------------------------
// Die rohe Antwort von /rest/api/3/search/jql ins Snapshot-Format bringen.
// Zwei Dinge stecken in derselben Antwort und werden hier getrennt:
// offene Tickets pro Teammitglied (assignees) und der Status der in der
// Planung referenzierten Keys (refs) — letztere koennen erledigt oder
// umassigned sein und duerfen deshalb nicht als offene Tickets zaehlen.
function jiraSnapshotFromResponse(parsed) {
  if (!parsed || !Array.isArray(parsed.issues)) {
    throw new Error('Das sieht nicht nach einer Jira-Antwort aus (kein "issues"-Array).');
  }
  const teamIds = data.persons
    .filter(p => p.type !== 'kontakt' && p.jiraAccountId)
    .map(p => p.jiraAccountId.trim());
  const today = todayStr();
  const refKeys = new Set((data.blocks || [])
    .filter(b => !b.done && b.jiraRef && (b.end || b.start || '') >= today)
    .map(b => b.jiraRef.trim().toUpperCase()));

  // Vorbelegen, damit ein Teammitglied ohne Treffer als "keine Tickets"
  // erkannt wird und nicht als "nicht verknuepft".
  const assignees = {};
  for (const id of teamIds) assignees[id] = [];
  const refs = {};
  const seenStatuses = [];

  for (const issue of parsed.issues) {
    const f = issue.fields || {};
    const key = String(issue.key || '');
    const accountId = f.assignee && f.assignee.accountId ? String(f.assignee.accountId) : null;
    const status = String((f.status && f.status.name) || '');
    const statusCategory = String((f.status && f.status.statusCategory && f.status.statusCategory.key) || '');

    if (!f.resolution && accountId && assignees[accountId]) {
      if (status) seenStatuses.push(status);
      assignees[accountId].push({
        key,
        summary: String(f.summary || ''),
        status,
        statusCategory,
        priority: f.priority ? String(f.priority.name || '') : '',
        type: f.issuetype ? String(f.issuetype.name || '') : '',
        updated: String(f.updated || ''),
      });
    }
    if (refKeys.has(key.toUpperCase())) {
      // summary wird fuer den Titel-Abgleich geplanter Bloecke gebraucht
      refs[key.toUpperCase()] = {
        status,
        statusCategory,
        assignee: accountId,
        summary: String(f.summary || ''),
      };
    }
  }

  rememberJiraStatuses(seenStatuses);

  return {
    generatedAt: new Date().toISOString(),
    source: getJiraBaseUrl(),
    assignees,
    refs,
    truncated: !!parsed.nextPageToken,
  };
}

async function writeJiraSync(snapshot) {
  const dir = await ensureDirHandle();
  const fh = await dir.getFileHandle(JIRA_SYNC_FILENAME, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(snapshot, null, 2));
  await writable.close();
}

// Nimmt den kopierten JSON-Text, schreibt den Snapshot in den Datenordner
// und laedt ihn direkt wieder ein. Wirft mit lesbarer Meldung, der Aufrufer
// zeigt sie an.
async function importJiraJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Das ist kein gültiges JSON — beim Kopieren etwas abgeschnitten?');
  }
  const snapshot = jiraSnapshotFromResponse(parsed);
  await writeJiraSync(snapshot);
  jiraSyncData = snapshot;
  return snapshot;
}

// Liest jira-tickets.json neu ein (z.B. nachdem ein anderes Geraet den
// Snapshot geschrieben hat). Der Browser holt die Daten nicht selbst von
// Jira — das erledigt der Import ueber Copy-Paste.
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
  // Loeschmarker, die ein anderes Geraet schon weggeraeumt hat, stecken hier
  // noch im lokalen Cache. Ohne diesen Filter traegt der Merge sie wieder in
  // die Datei ein — unsichtbar, aber ein staendiges Hin und Her.
  const cachedRaw = await getCachedData();
  const cached = cachedRaw ? compactGraves(cachedRaw, gravePurgeBefore(disk.settings)) : null;
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

// --- Backups -------------------------------------------------------
// Ein Backup ist eine wortgleiche Kopie von tktool-data.json in
// <Datenordner>/backups/. Kopiert wird der Dateiinhalt, nicht der
// Speicher-Zustand: so steckt im Backup genau das, was auch die anderen
// Instanzen sehen — inklusive der Loesch-Marker.
async function getBackupDirHandle(create = true) {
  const dir = await ensureDirHandle();
  return dir.getDirectoryHandle(BACKUP_DIRNAME, { create });
}

function backupStamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

async function readDataFileText() {
  const dir = await ensureDirHandle();
  try {
    const fh = await dir.getFileHandle(DATA_FILENAME);
    return await (await fh.getFile()).text();
  } catch (error) {
    if (error?.name === 'NotFoundError') return null;
    throw error;
  }
}

// tktool-backup-<YYYY-MM-DD-HHMM>-<anlass>.json
const BACKUP_NAME_PATTERN = /^tktool-backup-\d{4}-\d{2}-\d{2}-\d{4}-([a-z]+)\.json$/;

// Aeltere Backups wegraeumen, damit der Ordner nicht unbegrenzt waechst —
// getrennt je Anlass, damit die taeglichen Kopien die Cleanup-Backups nicht
// hinausdraengen. Der Dateiname ist so gebaut, dass alphabetisch =
// chronologisch gilt.
async function pruneBackups(backupDir) {
  const byReason = {};
  for await (const [name, handle] of backupDir.entries()) {
    const match = handle.kind === 'file' && BACKUP_NAME_PATTERN.exec(name);
    if (!match) continue;
    (byReason[match[1]] = byReason[match[1]] || []).push(name);
  }
  for (const [reason, names] of Object.entries(byReason)) {
    const keep = BACKUP_KEEP[reason] ?? BACKUP_KEEP_DEFAULT;
    names.sort();
    for (const name of names.slice(0, Math.max(0, names.length - keep))) {
      try { await backupDir.removeEntry(name); } catch {}
    }
  }
}

// reason landet im Dateinamen ('auto', 'cleanup', 'manuell'), damit im Ordner
// sichtbar ist, warum ein Backup entstanden ist.
async function writeBackupFile(reason = 'manuell') {
  const content = await readDataFileText() ?? JSON.stringify(data, null, 2);
  const backupDir = await getBackupDirHandle(true);
  const name = `tktool-backup-${backupStamp()}-${reason}.json`;
  const fh = await backupDir.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (error) {
    try { await writable.abort(); } catch {}
    throw error;
  }
  await pruneBackups(backupDir);
  return { name, path: `${BACKUP_DIRNAME}/${name}`, bytes: content.length };
}

function backupSetting() {
  return (data.settings || []).find(s => s.id === BACKUP_SETTING_ID) || null;
}

function updateBackupSetting(patch) {
  const current = backupSetting();
  if (current) Object.assign(current, patch);
  else (data.settings = data.settings || []).push({ id: BACKUP_SETTING_ID, ...patch });
  return saveData(data);
}

// Wann lief das letzte Auto-Backup? Steht in der Datendatei, nicht pro Geraet —
// sonst legt jede Instanz ihr eigenes an. Frisch von der Platte gelesen, damit
// eine parallel laufende Instanz kein zweites Backup derselben Woche ausloest.
async function lastAutoBackupAt() {
  try {
    const disk = await readDataFile();
    const fromDisk = (disk.settings || []).find(s => s.id === BACKUP_SETTING_ID);
    const stamps = [fromDisk?.lastBackupAt, backupSetting()?.lastBackupAt].filter(Boolean);
    return stamps.sort().pop() || '';
  } catch {
    return backupSetting()?.lastBackupAt || '';
  }
}

function agoLabel(iso) {
  if (!iso) return 'nie';
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return 'unbekannt';
  if (minutes < 1) return 'gerade';
  if (minutes < 60) return `vor ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} std`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'gestern' : `vor ${days} tagen`;
}

function backupAgeLabel() {
  const at = backupSetting()?.lastBackupAt;
  return at ? agoLabel(at) : '';
}

// Laeuft einmal beim Start. Schlaegt es fehl, ist das kein Grund, die App
// anzuhalten — die Meldung reicht.
// Nach dem Laden: "war hier" eintragen und Marker wegraeumen, die dadurch
// bei allen Geraeten angekommen sind. Ohne sichtbare Folge — geloescht ist
// geloescht, hier faellt nur der Restmuell weg.
async function ackAndPurgeGraves() {
  try {
    await touchDevice();
    const purged = await purgeGraves();
    if (purged) console.info(`Cleanup: ${purged} Löschmarker entfernt (von allen Geräten bestätigt).`);
    return purged;
  } catch (error) {
    console.error('Grave purge failed:', error);
    return 0;
  }
}

// An/aus liegt bei den uebrigen Backup-Einstellungen in der Datendatei, nicht
// pro Geraet: es ist eine Eigenschaft des Datenordners ("hier wird gesichert")
// und muesste sonst auf jedem Geraet einzeln abgeschaltet werden.
function autoBackupEnabled() {
  return backupSetting()?.autoBackup !== false;
}

async function setAutoBackupEnabled(enabled) {
  await updateBackupSetting({ autoBackup: !!enabled });
  return autoBackupEnabled();
}

// Laeuft einmal beim Start. Schlaegt es fehl, ist das kein Grund, die App
// anzuhalten — die Meldung reicht.
async function maybeAutoBackup() {
  if (!autoBackupEnabled()) return null;
  try {
    const last = await lastAutoBackupAt();
    const dueAt = last ? Date.parse(last) + AUTO_BACKUP_INTERVAL_DAYS * 86400000 : 0;
    if (last && Number.isFinite(dueAt) && Date.now() < dueAt) return null;
    const info = await writeBackupFile('auto');
    await updateBackupSetting({ lastBackupAt: new Date().toISOString() });
    uiToast(`Auto-Backup angelegt: ${info.path}`, 5000);
    return info;
  } catch (error) {
    console.error('Auto backup failed:', error);
    reportUiError('Auto-Backup fehlgeschlagen', error);
    return null;
  }
}

// --- Cleanup -------------------------------------------------------
// Alte Eintraege werden nicht hart entfernt, sondern auf ihren Loesch-Marker
// eingedampft: der Inhalt verschwindet (das spart den Platz), der Marker
// bleibt und ueberstimmt eine veraltete Kopie auf einem anderen Geraet.
// Ein hartes Entfernen wuerde dieselben Eintraege beim naechsten Sync von
// dort wieder einsammeln.
// Ein Loeschmarker, der die Schonfrist ueberstanden hat, faellt ganz weg. Bis
// dahin ist er bei jedem Geraet durch mindestens einen Sync gelaufen und
// steckt dort im lokalen Cache — der Eintrag kann also nicht mehr von einer
// veralteten Kopie zurueckkommen.
function graveDeletedAt(record) {
  return record._syncFields?.deleted?.changedAt || '';
}

// --- Geraete-Register ---------------------------------------------
// Wer laedt hier mit? Steht in der Datendatei, damit jede Instanz die
// anderen kennt. Gebraucht wird davon nur "wann zuletzt geladen": danach
// entscheidet sich, ob ein Loeschmarker schon ueberall angekommen ist.
function deviceRegistry() {
  return (data.settings || []).find(s => s.id === DEVICES_SETTING_ID) || null;
}

function knownDevices(settings = data.settings) {
  const list = (settings || []).find(s => s.id === DEVICES_SETTING_ID)?.list;
  return Array.isArray(list) ? list.filter(d => d && d.id) : [];
}

// In changeId steckt bereits, wer geschrieben hat ("<deviceId>:<ts>:<seq>").
// Damit laesst sich eine fremde Aenderung benennen, ohne irgendwo zusaetzlich
// Buch zu fuehren.
function deviceIdFromChangeId(changeId) {
  return String(changeId || '').split(':')[0];
}

function deviceLabelFor(deviceId, settings = data.settings) {
  if (!deviceId) return '';
  if (deviceId === getDeviceId()) return 'diesem Gerät';
  const known = knownDevices(settings).find(d => d.id === deviceId);
  return known?.label || `gerät ${deviceId.slice(0, 4)}`;
}

// Die juengste Aenderung, die auf der Platte neuer ist als bei uns — also
// das, was die andere Seite beigesteuert hat.
function newestForeignChange(mine, disk) {
  let newest = null;
  for (const key of COLLECTION_KEYS) {
    const mineById = new Map((mine[key] || []).map(record => [record.id, record]));
    for (const theirs of disk[key] || []) {
      const ours = mineById.get(theirs.id);
      for (const [field, version] of Object.entries(theirs._syncFields || {})) {
        const theirVersion = versionOf(version);
        if (compareVersions(theirVersion, fieldVersion(ours, field)) <= 0) continue;
        if (!newest || theirVersion.changedAt > newest.changedAt) {
          newest = { deviceId: deviceIdFromChangeId(theirVersion.changeId), changedAt: theirVersion.changedAt };
        }
      }
    }
  }
  return newest;
}

function deviceLabel() {
  const ua = typeof navigator === 'object' ? (navigator.userAgent || '') : '';
  const platform = /Macintosh|Mac OS/.test(ua) ? 'mac'
    : /Windows/.test(ua) ? 'windows'
    : /Linux|X11/.test(ua) ? 'linux'
    : /iPhone|iPad/.test(ua) ? 'ios'
    : /Android/.test(ua) ? 'android'
    : 'gerät';
  return `${platform} · ${getDeviceId().slice(0, 4)}`;
}

// Geraete, die laenger als DEVICE_ACTIVE_DAYS nicht mehr da waren, gelten als
// ausgemustert — sonst blockiert ein altes Notebook die Marker fuer immer.
function activeDevices(settings = data.settings) {
  const limit = new Date(Date.now() - DEVICE_ACTIVE_DAYS * 86400000).toISOString();
  return knownDevices(settings).filter(d => (d.lastSeenAt || '') >= limit);
}

// Aelteste Bestaetigung: alles, was davor geloescht wurde, hat jedes aktive
// Geraet beim Laden gesehen und liegt dort im Cache als geloescht.
function deviceAckCutoff(settings = data.settings) {
  const seen = activeDevices(settings).map(d => d.lastSeenAt || '').filter(Boolean);
  if (!seen.length) return '';
  return seen.sort()[0];
}

// Marker vor diesem Zeitpunkt duerfen weg: entweder haben alle Geraete
// bestaetigt, oder die Frist ist abgelaufen.
function gravePurgeBefore(settings = data.settings) {
  const fallback = new Date(Date.now() - GRAVE_GRACE_DAYS * 86400000).toISOString();
  const ack = deviceAckCutoff(settings);
  return ack > fallback ? ack : fallback;
}

// Geraete, auf deren Bestaetigung noch gewartet wird: sie haben seit dem
// juengsten Loeschmarker nicht mehr geladen.
function devicesPendingAck() {
  const newest = newestGraveDeletedAt();
  if (!newest) return [];
  const me = getDeviceId();
  return activeDevices().filter(d => d.id !== me && (d.lastSeenAt || '') < newest);
}

function newestGraveDeletedAt() {
  let newest = '';
  for (const key of COLLECTION_KEYS) {
    for (const record of deletedRecords[key] || []) {
      const at = graveDeletedAt(record);
      if (at > newest) newest = at;
    }
  }
  return newest;
}

// Traegt "war hier" ein. Geschrieben wird nur, wenn es etwas aendert: alle
// paar Stunden, oder sofort wenn ein Marker auf genau diese Bestaetigung
// wartet. Sonst schreibt jeder App-Start die Datei.
async function touchDevice() {
  const me = getDeviceId();
  const list = knownDevices().slice();
  const mine = list.find(d => d.id === me);
  const now = new Date().toISOString();
  const staleAfter = new Date(Date.now() - DEVICE_TOUCH_HOURS * 3600000).toISOString();
  const newestGrave = newestGraveDeletedAt();
  const ackPending = !!newestGrave && (!mine || (mine.lastSeenAt || '') < newestGrave);
  if (mine && !ackPending && (mine.lastSeenAt || '') > staleAfter) return false;

  if (mine) Object.assign(mine, { label: deviceLabel(), lastSeenAt: now });
  else list.push({ id: me, label: deviceLabel(), lastSeenAt: now });

  const record = deviceRegistry();
  // Ausgemusterte Geraete fallen hier raus, damit die Liste nicht waechst.
  const limit = new Date(Date.now() - DEVICE_ACTIVE_DAYS * 86400000).toISOString();
  const next = list.filter(d => d.id === me || (d.lastSeenAt || '') >= limit);
  if (record) record.list = next;
  else (data.settings = data.settings || []).push({ id: DEVICES_SETTING_ID, list: next });
  await saveData(data);
  return true;
}

function compactGraves(store, dropGravesBeforeISO = null) {
  for (const key of COLLECTION_KEYS) {
    const kept = [];
    for (const record of store[key]) {
      if (!record.deleted) { kept.push(record); continue; }
      const deletedAt = graveDeletedAt(record);
      if (dropGravesBeforeISO && deletedAt && deletedAt < dropGravesBeforeISO) continue;
      const stamp = record._syncFields?.deleted || nextVersion(null);
      kept.push({ id: record.id, deleted: true, _syncFields: { deleted: stamp } });
    }
    store[key] = kept;
  }
  return store;
}

async function writeCompactedDataFileNow(snapshot, dropGravesBeforeISO = null) {
  const dir = await ensureDirHandle();
  await cacheData(snapshot);
  const disk = await readDataFile();
  // Erst mergen, dann eindampfen: der Merge zieht sonst die Feldstempel der
  // Plattenversion wieder in den Marker hinein.
  const payload = compactGraves(mergeData(snapshot, disk), dropGravesBeforeISO);
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
  return payload;
}

function cleanupCutoffISO(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - Math.max(1, months));
  return toISO(d);
}

// Datum, an dem ein Eintrag haengt. Fehlt es, gilt der Eintrag als undatiert
// und wird nie aufgeraeumt — lieber ein Altlast zu viel als ein Datenverlust.
function cleanupDateOf(key, record) {
  if (key === 'items') return record.date || (record.month ? `${record.month}-01` : '');
  if (key === 'meetings') return record.date || '';
  if (key === 'blocks') return record.end || record.start || '';
  if (key === 'markers') return record.date || '';
  return '';
}

// Was ueberhaupt zur Auswahl steht, mit eigener Aufbewahrung je Rubrik: ein
// erledigtes Todo ist nach ein paar Monaten Altpapier, ein Meeting-Protokoll
// ist Gedaechtnis. Notizen, Personen, Fokusse und Monatsreviews fehlen
// bewusst ganz: klein, langlebig und als Nachschlagewerk gedacht.
const CLEANUP_GROUPS = [
  {
    id: 'todos',
    key: 'items',
    label: 'erledigte todos',
    hint: 'status done, ohne wins',
    defaultMonths: 4,
    // Growth-Eintraege tragen ebenfalls status 'done' — die gehoeren in die
    // wins-Rubrik und duerfen hier nicht mit abgeraeumt werden.
    match: r => r.status === 'done' && r.type !== 'win' && !isGrowthType(r.type),
  },
  {
    id: 'blocks',
    key: 'blocks',
    label: 'planungsblöcke',
    hint: 'nur abgelaufene',
    defaultMonths: 3,
    match: r => !!(r.start && r.end),
  },
  {
    id: 'markers',
    key: 'markers',
    label: 'marker',
    hint: 'release-/freeze-marker',
    defaultMonths: 12,
    match: () => true,
  },
  {
    id: 'meetings',
    key: 'meetings',
    label: 'meetings',
    hint: 'inkl. prep & notizen',
    defaultMonths: 24,
    match: () => true,
  },
  {
    id: 'wins',
    key: 'items',
    label: 'wins & teamnotizen',
    hint: 'impact-summary, reviews & teamfokus',
    defaultMonths: 0,
    match: r => r.type === 'win' || isGrowthType(r.type),
  },
];

// 0 heisst "nie aufraeumen".
function cleanupMonthsFor(groupId, overrides = null) {
  const group = CLEANUP_GROUPS.find(g => g.id === groupId);
  if (!group) return 0;
  if (overrides && Object.hasOwn(overrides, groupId)) return Math.max(0, parseInt(overrides[groupId], 10) || 0);
  const stored = backupSetting()?.cleanupMonths;
  if (stored && Object.hasOwn(stored, groupId)) return Math.max(0, parseInt(stored[groupId], 10) || 0);
  return group.defaultMonths;
}

function cleanupMonthsMap(overrides = null) {
  const map = {};
  for (const group of CLEANUP_GROUPS) map[group.id] = cleanupMonthsFor(group.id, overrides);
  return map;
}

// Pro Rubrik die Treffer, die aelter als ihr eigener Stichtag sind.
function cleanupCandidates(monthsByGroup) {
  const result = {};
  for (const group of CLEANUP_GROUPS) {
    const months = Math.max(0, parseInt(monthsByGroup?.[group.id], 10) || 0);
    if (!months) { result[group.id] = []; continue; }
    const cutoffISO = cleanupCutoffISO(months);
    result[group.id] = (data[group.key] || []).filter(record => {
      if (!group.match(record)) return false;
      const date = cleanupDateOf(group.key, record);
      return !!date && date < cutoffISO;
    });
  }
  return result;
}

// Loeschmarker, die dieser Lauf ganz entfernt — also die, die jedes Geraet
// bestaetigt hat oder deren Frist abgelaufen ist.
function countStaleGraves() {
  const cutoff = gravePurgeBefore();
  let n = 0;
  for (const key of COLLECTION_KEYS) {
    for (const record of deletedRecords[key] || []) {
      const deletedAt = graveDeletedAt(record);
      if (deletedAt && deletedAt < cutoff) n++;
    }
  }
  return n;
}

function countGraves() {
  let n = 0;
  for (const key of COLLECTION_KEYS) n += (deletedRecords[key] || []).length;
  return n;
}

// Marker wegraeumen, ohne an den lebenden Daten zu ruehren. Das ist der
// "jetzt aufraeumen"-Knopf, nachdem die zweite Instanz bestaetigt hat.
async function purgeGraves() {
  const before = countStaleGraves();
  if (!before) return 0;
  const store = prepareLocalChanges(data, localSnapshot, deletedRecords);
  adoptStore(store);
  const snapshot = cloneData(store);
  const purgeBefore = gravePurgeBefore();
  writeChain = writeChain.then(
    () => writeCompactedDataFileNow(snapshot, purgeBefore),
    () => writeCompactedDataFileNow(snapshot, purgeBefore),
  );
  adoptStore(await writeChain);
  return before;
}

// Backup, dann entfernen, dann eindampfen. Der Ablauf ist bewusst
// backup-first: schlaegt das Backup fehl, wird nichts geloescht.
async function runCleanup(monthsByGroup) {
  const months = cleanupMonthsMap(monthsByGroup);
  const candidates = cleanupCandidates(months);
  const backup = await writeBackupFile('cleanup');

  const idsByKey = {};
  for (const group of CLEANUP_GROUPS) {
    for (const record of candidates[group.id] || []) {
      (idsByKey[group.key] = idsByKey[group.key] || new Set()).add(record.id);
    }
  }

  // Rueckfallebene: schlaegt das Schreiben fehl, darf die Oberflaeche nicht
  // mit halb geloeschten Daten weiterlaufen.
  const before = { data: cloneData(data), snapshot: cloneData(localSnapshot), deleted: cloneData(deletedRecords) };
  let removed = 0;
  for (const [key, ids] of Object.entries(idsByKey)) {
    const count = data[key].length;
    data[key] = data[key].filter(record => !ids.has(record.id));
    removed += count - data[key].length;
  }

  const staleGraves = countStaleGraves();
  if (removed || staleGraves) {
    try {
      const store = prepareLocalChanges(data, localSnapshot, deletedRecords);
      adoptStore(store);
      const snapshot = cloneData(store);
      const purgeBefore = gravePurgeBefore();
      writeChain = writeChain.then(
        () => writeCompactedDataFileNow(snapshot, purgeBefore),
        () => writeCompactedDataFileNow(snapshot, purgeBefore),
      );
      adoptStore(await writeChain);
    } catch (error) {
      data = before.data;
      localSnapshot = before.snapshot;
      deletedRecords = before.deleted;
      throw error;
    }
  }

  await updateBackupSetting({
    lastBackupAt: new Date().toISOString(),
    lastCleanupAt: new Date().toISOString(),
    cleanupMonths: months,
  });
  return { removed, staleGraves, months, backup };
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
    if (result.mergedExternal) {
      uiToast(result.mergedFrom
        ? `Änderung von ${result.mergedFrom} (${agoLabel(result.mergedAt)}) übernommen`
        : 'Externe Änderung erkannt – zusammengeführt', 4000);
    }
    return result.payload;
  }, err => {
    pendingWrites--;
    console.error('Save failed:', err);
    reportUiError('Speichern fehlgeschlagen – Änderung NICHT in die Datei geschrieben', err);
    return null;
  });
}
