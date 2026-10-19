// ============================================================
// GITLAB MERGE REQUESTS (Snapshot gitlab-mrs.json)
// ============================================================
// Gleiches Prinzip wie der Jira-Import: unter file:// blockt CORS jeden
// Request an GitLab, also oeffnet man die Abfrage im angemeldeten Browser-Tab
// und fuegt die JSON-Antwort hier ein. GraphQL statt REST, weil die REST-Liste
// keine Approvals kennt (das waere ein Request pro MR). GitLab erlaubt GET auf
// /api/graphql fuer reine Leseabfragen, mit Session-Cookie und ohne
// CSRF-Token.

// Frueher genau eine Gruppen-URL unter tktool-gitlab-group; jetzt eine Liste.
// Der alte Schluessel wird beim ersten Lesen uebernommen.
const GITLAB_GROUPS_KEY = 'tktool-gitlab-groups';
const GITLAB_LEGACY_GROUP_KEY = 'tktool-gitlab-group';
const GITLAB_SYNC_FILENAME = 'gitlab-mrs.json';
const GITLAB_MERGED_DAYS = 7;
// Ab hier wird ein offener MR ohne Approval gelb.
const GITLAB_STALE_DAYS = 5;

let gitlabSyncData = null;

function normalizeGitlabGroupUrl(value) {
  let val = String(value || '').trim().replace(/\/+$/, '');
  if (val && !/^https?:\/\//i.test(val)) val = 'https://' + val;
  return val;
}

function getGitlabGroupUrls() {
  try {
    const stored = localStorage.getItem(GITLAB_GROUPS_KEY);
    if (stored) {
      const list = JSON.parse(stored);
      if (Array.isArray(list)) return list.map(String).filter(Boolean);
    }
    const legacy = localStorage.getItem(GITLAB_LEGACY_GROUP_KEY);
    return legacy ? [legacy] : [];
  } catch { return []; }
}

function setGitlabGroupUrls(values) {
  const list = [...new Set((values || []).map(normalizeGitlabGroupUrl).filter(Boolean))];
  try {
    localStorage.setItem(GITLAB_GROUPS_KEY, JSON.stringify(list));
    localStorage.removeItem(GITLAB_LEGACY_GROUP_KEY);
  } catch {}
  return list;
}

// Aus der kopierten Gruppen-URL Server und Gruppenpfad machen. Akzeptiert
// auch /groups/x und angehaengte Unterseiten wie /-/merge_requests.
function gitlabGroupParts(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const fullPath = parsed.pathname
    .split('/-/')[0]
    .replace(/^\/groups\//, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!fullPath) return null;
  return { origin: parsed.origin, fullPath };
}

// Alle Gruppen landen in einer einzigen GraphQL-Abfrage (Aliase g0, g1, ...),
// damit es bei einem Tab und einem Einfuegen bleibt. Das geht nur auf einem
// Server; Gruppen auf einem anderen Server als der ersten fallen raus.
function gitlabQueryGroups() {
  const parts = getGitlabGroupUrls().map(gitlabGroupParts).filter(Boolean);
  const origin = parts.length ? parts[0].origin : '';
  const seen = new Set();
  return parts.filter(p => p.origin === origin && !seen.has(p.fullPath) && seen.add(p.fullPath));
}

function gitlabQueryUrl() {
  const groups = gitlabQueryGroups();
  if (!groups.length) return '';
  const since = new Date(Date.now() - GITLAB_MERGED_DAYS * 86400000).toISOString().slice(0, 10);
  const fields = 'iid title webUrl draft createdAt mergedAt targetBranch'
    + ' author{username name} mergeUser{username name} approvedBy{nodes{username}}'
    + ' project{path} headPipeline{status}';
  const list = args => `mergeRequests(${args},includeSubgroups:true,first:100){pageInfo{hasNextPage} nodes{${fields}}}`;
  const query = '{' + groups.map((g, i) => `g${i}:group(fullPath:${JSON.stringify(g.fullPath)}){fullPath `
    + `open:${list('state:opened,sort:CREATED_ASC')} `
    + `merged:${list(`state:merged,mergedAfter:${JSON.stringify(since)},sort:MERGED_AT_DESC`)}}`).join(' ') + '}';
  return `${groups[0].origin}/api/graphql?${new URLSearchParams({ query })}`;
}

async function loadGitlabSync() {
  try {
    const dir = await ensureDirHandle();
    const fh = await dir.getFileHandle(GITLAB_SYNC_FILENAME);
    const parsed = JSON.parse(await (await fh.getFile()).text());
    gitlabSyncData = parsed && Array.isArray(parsed.open) ? parsed : null;
  } catch {
    gitlabSyncData = null;
  }
  return gitlabSyncData;
}

function gitlabUser(user) {
  return user ? { username: String(user.username || ''), name: String(user.name || user.username || '') } : null;
}

function gitlabMrFromNode(node) {
  return {
    iid: String(node.iid || ''),
    project: node.project ? String(node.project.path || '') : '',
    title: String(node.title || ''),
    url: String(node.webUrl || ''),
    draft: !!node.draft,
    targetBranch: String(node.targetBranch || ''),
    createdAt: String(node.createdAt || ''),
    mergedAt: node.mergedAt ? String(node.mergedAt) : '',
    author: gitlabUser(node.author),
    mergedBy: gitlabUser(node.mergeUser),
    approvedBy: ((node.approvedBy && node.approvedBy.nodes) || []).map(u => String(u.username || '')),
    pipeline: node.headPipeline ? String(node.headPipeline.status || '').toLowerCase() : '',
  };
}

// Antwort enthaelt je Gruppe einen Alias g0, g1, ...; eine aeltere Abfrage
// liefert noch data.group. Ueberlappen sich Gruppen (Obergruppe plus
// Untergruppe), kommt ein MR doppelt — die URL entscheidet.
function gitlabSnapshotFromResponse(parsed) {
  if (parsed && Array.isArray(parsed.errors) && parsed.errors.length) {
    throw new Error(`GitLab meldet: ${parsed.errors.map(e => e.message).join('; ')}`);
  }
  const payload = parsed && parsed.data;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Das sieht nicht nach der GitLab-Antwort aus (kein data).');
  }
  const keys = Object.keys(payload).filter(key => key === 'group' || /^g\d+$/.test(key));
  if (!keys.length) {
    throw new Error('Das sieht nicht nach der GitLab-Antwort aus (keine Gruppe).');
  }
  const queried = gitlabQueryGroups();
  const missing = keys.filter(key => payload[key] === null)
    .map(key => (key === 'group' ? null : queried[Number(key.slice(1))]))
    .map(g => (g ? g.fullPath : 'Gruppe'));
  if (missing.length) {
    throw new Error(`Nicht gefunden: ${missing.join(', ')} — Pfad prüfen oder in GitLab angemeldet?`);
  }
  const groups = keys.map(key => payload[key]);
  if (groups.some(g => !g.open || !g.merged)) {
    throw new Error('Das sieht nicht nach der GitLab-Antwort aus (keine MR-Listen).');
  }
  const collect = (field, sortKey, dir) => {
    const byUrl = new Map();
    groups.forEach(g => (g[field].nodes || []).map(gitlabMrFromNode)
      .forEach(mr => byUrl.set(mr.url || `${mr.project}!${mr.iid}`, mr)));
    return [...byUrl.values()].sort((a, b) => dir * (Date.parse(a[sortKey]) - Date.parse(b[sortKey])));
  };
  return {
    generatedAt: new Date().toISOString(),
    source: getGitlabGroupUrls().join(', '),
    open: collect('open', 'createdAt', 1),
    merged: collect('merged', 'mergedAt', -1),
    truncated: groups.some(g => g.open.pageInfo?.hasNextPage || g.merged.pageInfo?.hasNextPage),
  };
}

async function importGitlabJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Das ist kein gültiges JSON — beim Kopieren etwas abgeschnitten?');
  }
  const snapshot = gitlabSnapshotFromResponse(parsed);
  const dir = await ensureDirHandle();
  const fh = await dir.getFileHandle(GITLAB_SYNC_FILENAME, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(snapshot, null, 2));
  await writable.close();
  gitlabSyncData = snapshot;
  return snapshot;
}

async function refreshGitlabSync() {
  await loadGitlabSync();
  render();
  toast(gitlabSyncData ? 'GitLab-MRs neu eingelesen' : 'Keine gitlab-mrs.json im Datenordner gefunden');
}

// Approvals vom Autor selbst zaehlen nicht.
function gitlabApprovalCount(mr) {
  const author = mr.author ? mr.author.username : '';
  return mr.approvedBy.filter(u => u && u !== author).length;
}

// ------------------------------------------------------------
// Filter: welche Ziel-Branches und Projekte zaehlen
// ------------------------------------------------------------
// Liegt in data.settings statt im localStorage, damit es auf allen Geraeten
// mit demselben Datenordner gilt. Gefiltert wird beim Anzeigen, nicht beim
// Import: eine Aenderung wirkt sofort auf den aktuellen Stand.
const GITLAB_FILTER_SETTING_ID = 'gitlab-filter';
const GITLAB_DEFAULT_BRANCHES = ['develop'];

function gitlabFilterSetting() {
  return (data.settings || []).find(s => s.id === GITLAB_FILTER_SETTING_ID) || null;
}

function updateGitlabFilterSetting(patch) {
  const current = gitlabFilterSetting();
  const next = {
    id: GITLAB_FILTER_SETTING_ID,
    targetBranches: patch.targetBranches ?? gitlabTargetBranches(),
    excludedProjects: patch.excludedProjects ?? gitlabExcludedProjects(),
  };
  if (current) Object.assign(current, next);
  else (data.settings = data.settings || []).push(next);
  saveData(data);
}

// Leere Liste heisst "alle Branches"; ohne Einstellung gilt develop.
function gitlabTargetBranches() {
  const setting = gitlabFilterSetting();
  return setting && Array.isArray(setting.targetBranches) ? setting.targetBranches : GITLAB_DEFAULT_BRANCHES;
}

function gitlabExcludedProjects() {
  const setting = gitlabFilterSetting();
  return setting && Array.isArray(setting.excludedProjects) ? setting.excludedProjects : [];
}

// "release/*" passt auf release/1.0 — Stern als Platzhalter, sonst exakt.
function gitlabBranchMatches(branch, pattern) {
  const re = new RegExp('^' + pattern.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(branch);
}

function gitlabMrVisible(mr) {
  if (gitlabExcludedProjects().includes(mr.project)) return false;
  const branches = gitlabTargetBranches();
  return !branches.length || branches.some(pattern => gitlabBranchMatches(mr.targetBranch, pattern));
}

function gitlabOpenVisible() {
  return gitlabSyncData ? (gitlabSyncData.open || []).filter(gitlabMrVisible) : [];
}

function gitlabMergedRecently() {
  if (!gitlabSyncData) return [];
  const cutoff = Date.now() - GITLAB_MERGED_DAYS * 86400000;
  return (gitlabSyncData.merged || []).filter(mr => Date.parse(mr.mergedAt) >= cutoff && gitlabMrVisible(mr));
}

// Alle Projekte aus dem Stand plus die ausgeblendeten — ein ausgeblendetes
// soll in der Auswahl bleiben, auch wenn es gerade keine MRs hat.
function gitlabKnownProjects() {
  const seen = gitlabSyncData ? [...(gitlabSyncData.open || []), ...(gitlabSyncData.merged || [])].map(mr => mr.project) : [];
  return [...new Set([...seen, ...gitlabExcludedProjects()].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'de-AT'));
}

function saveGitlabBranchesFromInput() {
  const input = document.getElementById('gitlabBranchesInput');
  const branches = String(input ? input.value : '').split(',').map(b => b.trim()).filter(Boolean);
  updateGitlabFilterSetting({ targetBranches: [...new Set(branches)] });
  reopenGitlabImportKeepingDraft();
}

function toggleGitlabProject(project) {
  const excluded = gitlabExcludedProjects();
  updateGitlabFilterSetting({
    excludedProjects: excluded.includes(project) ? excluded.filter(p => p !== project) : excluded.concat(project),
  });
  reopenGitlabImportKeepingDraft();
}

function renderGitlabFilter() {
  const branches = gitlabTargetBranches();
  const projects = gitlabKnownProjects();
  const excluded = gitlabExcludedProjects();
  return `
    <div class="form-group">
      <label class="form-label">Ziel-Branches</label>
      <input class="form-input" id="gitlabBranchesInput" value="${esc(branches.join(', ')).replace(/"/g, '&quot;')}" placeholder="leer = alle" onchange="saveGitlabBranchesFromInput()">
      <div class="form-hint">Nur MRs in diese Branches erscheinen, mit Komma getrennt. <span class="form-hint-code">release/*</span> passt auf alle Release-Branches.</div>
    </div>
    <div class="form-group">
      <label class="form-label">Projekte &mdash; welche zählen</label>
      ${projects.length ? `
        <div class="jira-status-filter">
          ${projects.map(project => `
            <button type="button" class="jira-status-chip ${excluded.includes(project) ? 'off' : 'on'}"
              data-project="${esc(project).replace(/"/g, '&quot;')}" onclick="toggleGitlabProject(this.dataset.project)">${esc(project)}</button>
          `).join('')}
        </div>
        <div class="form-hint">${excluded.length
          ? `${excluded.length} ${excluded.length === 1 ? 'Projekt wird' : 'Projekte werden'} ausgeblendet — wirkt sofort, auch auf den aktuellen Stand.`
          : 'Alle Projekte zählen. Klick blendet ein Projekt aus.'}</div>`
        : '<div class="form-hint">Nach dem ersten Einspielen lässt sich hier wählen, welche Projekte zählen.</div>'}
    </div>`;
}

function reopenGitlabImportKeepingDraft() {
  const field = document.getElementById('gitlabImportText');
  const draft = field ? field.value : '';
  render();
  openGitlabImport();
  const restored = document.getElementById('gitlabImportText');
  if (restored && draft) restored.value = draft;
}

function gitlabAgeLabel(iso, prefix) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const hours = Math.max(1, Math.floor(ms / 3600000));
  if (hours < 24) return `${prefix} ${hours} Std`;
  const days = Math.floor(hours / 24);
  if (days === 1) return prefix === 'seit' ? 'seit gestern' : 'gestern';
  return `${prefix} ${days} Tagen`;
}

// ------------------------------------------------------------
// Karte auf der Übersicht
// ------------------------------------------------------------
function renderGitlabMergeRequests() {
  if (!gitlabSyncData && !getGitlabGroupUrls().length) return '';
  if (!gitlabSyncData) {
    return `
      <div class="card gitlab-card">
        <div class="card-header"><span class="card-title">Merge Requests</span></div>
        <div class="review-due-empty">Noch nichts eingespielt. Oben rechts auf „GitLab“ klicken.</div>
      </div>`;
  }
  const open = gitlabOpenVisible();
  const merged = gitlabMergedRecently();
  const branches = gitlabTargetBranches();
  const branchNote = branches.length ? ` · nach ${esc(branches.join(', '))}` : '';
  const unapproved = merged.filter(mr => !gitlabApprovalCount(mr)).length;
  return `
    <div class="card gitlab-card">
      <div class="card-header"><span class="card-title">Merge Requests</span></div>
      <div class="review-due-panel">
        <div class="review-due-sections">
          <div class="review-due-section review-due-section-warning">
            <div class="review-due-section-head">
              <div>
                <div class="review-due-section-title">Offen</div>
                <div class="review-due-section-hint">Älteste zuerst${branchNote}</div>
              </div>
              <span class="review-due-section-count">${open.length}</span>
            </div>
            ${open.length
              ? `<ul class="review-due-item-list">${open.map(renderGitlabOpenRow).join('')}</ul>`
              : '<div class="review-due-empty">Keine offenen MRs</div>'}
          </div>
          <div class="review-due-section review-due-section-danger">
            <div class="review-due-section-head">
              <div>
                <div class="review-due-section-title">Zuletzt gemerged</div>
                <div class="review-due-section-hint">Letzte ${GITLAB_MERGED_DAYS} Tage${branchNote}</div>
              </div>
              <span class="review-due-section-count" title="ohne Approval / gemerged">${unapproved}/${merged.length}</span>
            </div>
            ${merged.length
              ? `<ul class="review-due-item-list">${merged.map(renderGitlabMergedRow).join('')}</ul>`
              : '<div class="review-due-empty">Nichts gemerged</div>'}
          </div>
        </div>
      </div>
      ${gitlabSyncData.truncated ? '<div class="form-hint">GitLab hat mehr als 100 MRs geliefert — nur die ersten werden gezeigt.</div>' : ''}
    </div>`;
}

function gitlabRowAttrs(mr) {
  return mr.url
    ? `data-url="${esc(mr.url).replace(/"/g, '&quot;')}" onclick="openGitlabMr(this)" title="In GitLab öffnen"`
    : '';
}

function openGitlabMr(el) {
  const url = el.dataset.url;
  if (/^https?:\/\//i.test(url || '')) window.open(url, '_blank', 'noopener');
}

function gitlabPipelineDot(status) {
  const map = {
    success: ['ok', 'Pipeline grün'],
    failed: ['fail', 'Pipeline rot'],
    running: ['run', 'Pipeline läuft'],
    pending: ['run', 'Pipeline wartet'],
  };
  const hit = map[status];
  return hit ? `<span class="gitlab-pipe gitlab-pipe-${hit[0]}" title="${hit[1]}">&#9679;</span>` : '';
}

function gitlabApprovalBadge(count, emptyClass) {
  return count
    ? `<span class="badge badge-done">${count} approval${count === 1 ? '' : 's'}</span>`
    : `<span class="badge ${emptyClass}">ohne approval</span>`;
}

function renderGitlabOpenRow(mr) {
  const approvals = gitlabApprovalCount(mr);
  const stale = !approvals && Date.now() - Date.parse(mr.createdAt) >= GITLAB_STALE_DAYS * 86400000;
  return `
    <li class="review-due-item ${stale ? 'review-due-item-warning' : 'gitlab-item-calm'}">
      <button class="review-due-item-main" ${gitlabRowAttrs(mr)}>
        <span class="review-due-item-date">
          <span class="review-due-item-day">${formatDateShort(mr.createdAt)}</span>
          <span class="review-due-item-age">${gitlabAgeLabel(mr.createdAt, 'seit')}</span>
        </span>
        <span class="review-due-item-body">
          <span class="review-due-item-title">${mr.draft ? '<span class="gitlab-draft">Draft</span> ' : ''}${esc(mr.title)}</span>
          <span class="review-due-item-meta">
            ${gitlabApprovalBadge(approvals, 'badge-todo')}
            <span>@${esc(mr.author ? mr.author.name : '?')}</span>
            <span class="gitlab-ref">${esc(mr.project)}!${esc(mr.iid)}</span>
            ${gitlabPipelineDot(mr.pipeline)}
          </span>
        </span>
      </button>
    </li>`;
}

function renderGitlabMergedRow(mr) {
  const approvals = gitlabApprovalCount(mr);
  const author = mr.author ? mr.author.username : '';
  const merger = mr.mergedBy
    ? (mr.mergedBy.username === author ? ' · selbst gemerged' : ` · gemerged von @${esc(mr.mergedBy.name)}`)
    : '';
  return `
    <li class="review-due-item ${approvals ? 'gitlab-item-calm' : 'review-due-item-danger gitlab-item-unapproved'}">
      <button class="review-due-item-main" ${gitlabRowAttrs(mr)}>
        <span class="review-due-item-date">
          <span class="review-due-item-day">${formatDateShort(mr.mergedAt)}</span>
          <span class="review-due-item-age">${gitlabAgeLabel(mr.mergedAt, 'vor')}</span>
        </span>
        <span class="review-due-item-body">
          <span class="review-due-item-title">${esc(mr.title)}</span>
          <span class="review-due-item-meta">
            ${gitlabApprovalBadge(approvals, 'gitlab-badge-unapproved')}
            <span>@${esc(mr.author ? mr.author.name : '?')}${merger}</span>
            <span class="gitlab-ref">${esc(mr.project)}!${esc(mr.iid)}</span>
          </span>
        </span>
      </button>
    </li>`;
}

// ------------------------------------------------------------
// Import-Dialog
// ------------------------------------------------------------
function openGitlabImport() {
  const url = gitlabQueryUrl();
  const groups = getGitlabGroupUrls();
  const queried = gitlabQueryGroups();
  const unreadable = groups.filter(g => !gitlabGroupParts(g));
  const otherServer = groups.filter(g => {
    const parts = gitlabGroupParts(g);
    return parts && queried.length && parts.origin !== queried[0].origin;
  });
  const skipped = [...unreadable, ...otherServer];
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">GitLab-MRs einspielen</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">GitLab-Gruppen</label>
        <textarea class="form-textarea" id="gitlabGroupInput" rows="${Math.max(2, groups.length + 1)}" placeholder="https://gitlab.firma.at/meine-gruppe" onchange="saveGitlabGroupFromInput()">${esc(groups.join('\n'))}</textarea>
        <div class="form-hint">Eine Gruppen-URL pro Zeile, aus dem Browser kopiert. Alle Projekte darunter, inklusive Untergruppen, werden in einer Abfrage geholt.</div>
        ${skipped.length ? `<div class="form-hint">Wird übersprungen (${unreadable.length && !otherServer.length ? 'keine Gruppe lesbar' : 'nur ein GitLab-Server pro Abfrage'}): ${skipped.map(esc).join(', ')}</div>` : ''}
      </div>
      <div class="form-group">
        ${url
          ? `<a class="btn btn-primary" style="display:block;text-align:center" href="${esc(url)}" target="_blank" rel="noopener">1 &middot; Abfrage in GitLab öffnen</a>
             <div class="form-hint">Öffnet einen Tab mit der JSON-Antwort${queried.length > 1 ? ` für alle ${queried.length} Gruppen` : ''}: offene MRs und was in den letzten ${GITLAB_MERGED_DAYS} Tagen gemerged wurde. Dort alles markieren und kopieren.</div>`
          : `<div class="team-empty-copy">${groups.length ? 'Aus diesen URLs lässt sich keine Gruppe lesen.' : 'Erst eine Gruppen-URL eintragen.'}</div>`}
      </div>
      ${renderGitlabFilter()}
      <div class="form-group">
        <label class="form-label">2 &middot; Antwort hier einfügen</label>
        <textarea class="form-textarea" id="gitlabImportText" rows="8" placeholder='{"data":{"g0":{...}}}'></textarea>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="submitGitlabImport()">3 &middot; Einspielen</button>
      <div class="form-hint" style="margin-top:10px;text-align:center">
        Von einem anderen Gerät eingespielt?
        <a href="#" onclick="event.preventDefault(); closeOverlay(); refreshGitlabSync()">Datei neu einlesen</a>
      </div>
    </div>
  `;
  openOverlay();
}

// Gruppen sofort speichern und den Dialog mit dem neuen Abfrage-Link
// neu bauen, ohne eingefuegten Text zu verlieren.
function saveGitlabGroupFromInput() {
  const input = document.getElementById('gitlabGroupInput');
  setGitlabGroupUrls(String(input ? input.value : '').split(/[\n,]+/));
  reopenGitlabImportKeepingDraft();
}

async function submitGitlabImport() {
  const field = document.getElementById('gitlabImportText');
  const text = (field ? field.value : '').trim();
  if (!text) return;
  try {
    const snapshot = await importGitlabJson(text);
    closeOverlay();
    render();
    const unapproved = gitlabMergedRecently().filter(mr => !gitlabApprovalCount(mr)).length;
    toast(`${gitlabOpenVisible().length} offen, ${gitlabMergedRecently().length} gemerged`
      + (unapproved ? ` · ${unapproved} ohne Approval` : ''));
  } catch (error) {
    toast(error.message || 'Einspielen fehlgeschlagen');
  }
}
