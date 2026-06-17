// Auto-increments the patch component of APP_VERSION in js/data.js.
// Run by the pre-commit hook before packing, so every commit ships a
// new version that the in-app update check can detect.
//
// Manual minor/major bumps: just edit APP_VERSION in js/data.js by hand
// (e.g. '1.0.7' -> '1.1.0'); the next commit's auto-bump continues from
// there ('1.1.1').
const fs = require('fs');
const path = require('path');

const dataPath = path.resolve(__dirname, '..', 'js', 'data.js');
const src = fs.readFileSync(dataPath, 'utf8');

const re = /(const APP_VERSION = ['"])(\d+)\.(\d+)\.(\d+)(['"];)/;
const m = src.match(re);
if (!m) {
  console.error('bump-version: APP_VERSION not found in js/data.js');
  process.exit(1);
}

const [, prefix, major, minor, patch, suffix] = m;
const next = `${prefix}${major}.${minor}.${Number(patch) + 1}${suffix}`;
const updated = src.replace(re, next);
fs.writeFileSync(dataPath, updated);

console.log(`Bumped APP_VERSION -> ${major}.${minor}.${Number(patch) + 1}`);
