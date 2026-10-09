// Erzeugt die Screenshots unter screenshots/ aus erfundenen Daten.
//
//   node scripts/screenshots.js
//
// Braucht Playwright mit Chromium. Der Datenordner wird im Browser durch
// einen In-Memory-Ordner ersetzt, die Daten kommen aus
// scripts/screenshot-mock-data.js, die Uhr steht auf MOCK_TODAY.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { installFakeFs } = require('./mock-fs');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'screenshots');
const TODAY = process.env.MOCK_TODAY || '2026-10-02';
const ONLY = process.argv.slice(2);

const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tktool-mock-'));
execFileSync('node', [path.join(__dirname, 'screenshot-mock-data.js'), mockDir], { env: { ...process.env, MOCK_TODAY: TODAY } });
const files = {
  'tktool-data.json': fs.readFileSync(path.join(mockDir, 'tktool-data.json'), 'utf8'),
  'jira-tickets.json': fs.readFileSync(path.join(mockDir, 'jira-tickets.json'), 'utf8'),
};

// Jeder Screenshot: Theme, Ansicht, optional Vorbereitung im Browser.
const shots = [
  { name: 'dashboard', theme: 'daylight', view: 'reviews' },
  { name: 'planner', theme: 'daylight', view: 'planung', prepare: 'fourWeeks', height: 1020 },
  { name: 'one-on-one', theme: 'daylight', view: 'meetings', prepare: 'openOneOnOne' },
  { name: 'standup', theme: 'daylight', view: 'meetings', prepare: 'openStandup' },
  { name: 'team', theme: 'daylight', view: 'team' },
  { name: 'weekly', theme: 'daylight', view: 'woche' },
];
const THEME_GRID = ['daylight', 'dark', 'rose-pine-dawn', 'nord', 'matrix', 'kodama', 'arrakis', 'spaceship', 'starfox'];

const prepares = {
  fourWeeks: () => setPlanungWeeks(4),
  openOneOnOne: () => {
    const m = data.meetings.find(x => x.type === 'oneOnOne' && x.personId === 'p_david' && x.date === todayStr());
    navigate('meetings:detail', { meetingId: m.id });
  },
  openStandup: () => {
    const m = data.meetings.find(x => x.isStandup && x.date === todayStr());
    navigate('meetings:detail', { meetingId: m.id });
  },
};

async function openApp(browser, theme, height = 900) {
  const context = await browser.newContext({ viewport: { width: 1440, height }, deviceScaleFactor: 2, locale: 'de-AT', timezoneId: 'Europe/Vienna' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T09:30:00+02:00`));
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.addInitScript(installFakeFs, files);
  await page.addInitScript(([t]) => {
    localStorage.setItem('tktool-theme', t);
    localStorage.setItem('tktool-jira-base', 'https://jira.example.com');
    localStorage.setItem('tktool-device-id', 'mock-device');
  }, [theme]);
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.evaluate(() => finishStorageConnection(window.__mockDir));
  await page.waitForTimeout(300);
  return { context, page };
}

async function show(page, shot) {
  await page.evaluate(([view, prep, prepSrc]) => {
    navigate(view);
    if (prep) (0, eval)('(' + prepSrc + ')')();
  }, [shot.view, shot.prepare || null, shot.prepare ? prepares[shot.prepare].toString() : null]);
  await page.waitForTimeout(250);
  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.classList.remove('show'); window.scrollTo(0, 0); });
}

(async () => {
  const browser = await chromium.launch();
  fs.mkdirSync(outDir, { recursive: true });
  for (const shot of shots) {
    if (ONLY.length && !ONLY.includes(shot.name)) continue;
    const { context, page } = await openApp(browser, shot.theme, shot.height);
    await show(page, shot);
    await page.screenshot({ path: path.join(outDir, shot.name + '.png') });
    console.log('screenshots/' + shot.name + '.png');
    await context.close();
  }
  if (!ONLY.length || ONLY.includes('themes')) {
    const tiles = [];
    for (const theme of THEME_GRID) {
      const { context, page } = await openApp(browser, theme);
      await show(page, { view: 'reviews' });
      tiles.push({ theme, label: await page.evaluate(t => THEME_LABELS[t], theme), png: (await page.screenshot()).toString('base64') });
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.setContent(`<!doctype html><style>
      body{margin:0;background:#1b1f24;padding:24px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;font:600 15px system-ui,sans-serif;color:#cfd6de}
      figure{margin:0}img{width:100%;display:block;border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,.45)}
      figcaption{margin-top:6px;letter-spacing:.04em}</style>
      ${tiles.map(t => `<figure><img src="data:image/png;base64,${t.png}"><figcaption>${t.label}</figcaption></figure>`).join('')}`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, 'themes.png'), fullPage: true });
    console.log('screenshots/themes.png');
    await context.close();
  }
  await browser.close();
  fs.rmSync(mockDir, { recursive: true, force: true });
})();
