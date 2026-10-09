// Baut eine klickbare Demo mit erfundenen Daten als eine HTML-Datei.
//
//   node scripts/build-demo.js [ausgabe.html]   (Standard: TKTool-demo.html)
//
// Basis ist index.html wie beim normalen Packen. Davor kommt ein Skript,
// das den Datenordner durch einen In-Memory-Ordner ersetzt und die Daten aus
// scripts/screenshot-mock-data.js relativ zum echten Heute erzeugt. Was man
// in der Demo aendert, bleibt bis Tagesende im localStorage des Browsers;
// "Demo zuruecksetzen" wirft es weg.
const fs = require('fs');
const path = require('path');
const { buildMockData } = require('./screenshot-mock-data');
const { installFakeFs } = require('./mock-fs');

const root = path.resolve(__dirname, '..');
const outputPath = path.resolve(process.argv[2] || path.join(root, 'TKTool-demo.html'));

const read = rel => fs.readFileSync(path.join(root, rel.replace(/^\.\//, '')), 'utf8');

function demoBoot() {
  const KEY = 'tktool-demo-files';
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  let files = null;
  try {
    const saved = JSON.parse(ls.get(KEY) || 'null');
    if (saved && saved.today === today) files = saved.files;
  } catch {}
  if (!files) {
    const { store, jira } = buildMockData(today);
    files = { 'tktool-data.json': JSON.stringify(store, null, 2), 'jira-tickets.json': JSON.stringify(jira, null, 2) };
  }
  installFakeFs(files);
  window.__mockOnWrite = dir => {
    if (dir !== window.__mockDir) return; // backups/ nicht mitspeichern
    ls.set(KEY, JSON.stringify({ today, files: Object.fromEntries(dir.files) }));
  };
  window.resetDemo = () => { ls.del(KEY); location.reload(); };
  if (!ls.get('tktool-theme')) ls.set('tktool-theme', 'daylight');
  if (!ls.get('tktool-jira-base')) ls.set('tktool-jira-base', 'https://jira.example.com');
  if (!ls.get('tktool-device-id')) ls.set('tktool-device-id', 'demo-device');
  // Kein Update-Check gegen GitHub aus der Demo heraus.
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, opts) => String(url).includes('raw.githubusercontent.com')
    ? Promise.reject(new Error('Demo: kein Update-Check'))
    : realFetch(url, opts);
}

// Nach data.js: Ordner-Handle immer der In-Memory-Ordner, ohne IndexedDB,
// und kein Auto-Backup-Toast beim Start.
function demoHandles() {
  maybeAutoBackup = async () => null;
  getStoredDirHandle = async () => window.__mockDir;
  getSavedDirHandle = async () => window.__mockDir;
  pickDataDirectory = async () => window.__mockDir;
}

const banner = `
<div id="demoBanner" style="position:fixed;right:12px;bottom:12px;z-index:9999;display:flex;gap:10px;align-items:center;
  padding:6px 10px;border-radius:6px;font:12px/1.3 system-ui,sans-serif;background:rgba(20,24,30,.82);color:#e8edf2;
  box-shadow:0 2px 10px rgba(0,0,0,.25)">
  <span>Demo &middot; erfundene Daten</span>
  <button type="button" onclick="resetDemo()" style="font:inherit;color:inherit;background:transparent;border:1px solid rgba(255,255,255,.35);
    border-radius:4px;padding:2px 8px;cursor:pointer">zur&uuml;cksetzen</button>
</div>`;

let html = read('index.html');
html = html.replace(/<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']\s*>/g,
  (_, href) => `<style data-source="${href}">\n${read(href)}\n</style>`);

let first = true;
html = html.replace(/<script\s+src=["']([^"']+)["']>\s*<\/script>/g, (_, src) => {
  let out = '';
  if (first) {
    first = false;
    out += `<script data-source="demo">\n${buildMockData}\n${installFakeFs}\n(${demoBoot})();\n</script>\n`;
  }
  out += `<script data-source="${src}">\n${read(src)}\n</script>`;
  if (/js\/data\.js$/.test(src)) out += `\n<script data-source="demo">(${demoHandles})();</script>`;
  return out;
});
html = html.replace('<title>TKTool</title>', '<title>TKTool Demo</title>').replace(/<\/body>/, `${banner}\n</body>`);

fs.writeFileSync(outputPath, html);
console.log(`Demo nach ${path.relative(process.cwd(), outputPath)} geschrieben`);
