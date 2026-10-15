// ============================================================
// GITLAB MERGE REQUESTS (Snapshot gitlab-mrs.json)
// ============================================================
// Gleiches Prinzip wie der Jira-Import: unter file:// blockt CORS jeden
// Request an GitLab, also oeffnet man die Abfrage im angemeldeten Browser-Tab
// und fuegt die JSON-Antwort hier ein. GraphQL statt REST, weil die REST-Liste
// keine Approvals kennt (das waere ein Request pro MR). GitLab erlaubt GET auf
// /api/graphql fuer reine Leseabfragen, mit Session-Cookie und ohne
// CSRF-Token.

const GITLAB_GROUP_KEY = 'tktool-gitlab-group';
const GITLAB_SYNC_FILENAME = 'gitlab-mrs.json';
const GITLAB_MERGED_DAYS = 7;
// Ab hier wird ein offener MR ohne Approval gelb.
const GITLAB_STALE_DAYS = 5;

let gitlabSyncData = null;

function getGitlabGroupUrl() {
  try { return localStorage.getItem(GITLAB_GROUP_KEY) || ''; } catch { return ''; }
}

function setGitlabGroupUrl(value) {
  let val = String(value || '').trim().replace(/\/+$/, '');
  if (val && !/^https?:\/\//i.test(val)) val = 'https://' + val;
  try {
    if (val) localStorage.setItem(GITLAB_GROUP_KEY, val);
    else localStorage.removeItem(GITLAB_GROUP_KEY);
  } catch {}
  return val;
}

// Aus der kopierten Gruppen-URL Server und Gruppenpfad machen. Akzeptiert
// auch /groups/x und angehaengte Unterseiten wie /-/merge_requests.
function gitlabGroupParts(url = getGitlabGroupUrl()) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const fullPath = parsed.pathname
    .split('/-/')[0]
    .replace(/^\/groups\//, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!fullPath) return null;
  return { origin: parsed.origin, fullPath };
}

function gitlabQueryUrl() {
  const parts = gitlabGroupParts();
  if (!parts) return '';
  const since = new Date(Date.now() - GITLAB_MERGED_DAYS * 86400000).toISOString().slice(0, 10);
  const fields = 'iid title webUrl draft createdAt mergedAt targetBranch'
    + ' author{username name} mergeUser{username name} approvedBy{nodes{username}}'
    + ' project{path} headPipeline{status}';
  const list = args => `mergeRequests(${args},includeSubgroups:true,first:100){pageInfo{hasNextPage} nodes{${fields}}}`;
  const query = `{group(fullPath:${JSON.stringify(parts.fullPath)}){`
    + `open:${list('state:opened,sort:CREATED_ASC')} `
    + `merged:${list(`state:merged,mergedAfter:${JSON.stringify(since)},sort:MERGED_AT_DESC`)}}}`;
  return `${parts.origin}/api/graphql?${new URLSearchParams({ query })}`;
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

function gitlabSnapshotFromResponse(parsed) {
  if (parsed && Array.isArray(parsed.errors) && parsed.errors.length) {
    throw new Error(`GitLab meldet: ${parsed.errors.map(e => e.message).join('; ')}`);
  }
  const group = parsed && parsed.data && parsed.data.group;
  if (parsed && parsed.data && parsed.data.group === null) {
    throw new Error('Gruppe nicht gefunden — Pfad prüfen oder in GitLab angemeldet?');
  }
  if (!group || !group.open || !group.merged) {
    throw new Error('Das sieht nicht nach der GitLab-Antwort aus (kein data.group).');
  }
  return {
    generatedAt: new Date().toISOString(),
    source: getGitlabGroupUrl(),
    open: (group.open.nodes || []).map(gitlabMrFromNode),
    merged: (group.merged.nodes || []).map(gitlabMrFromNode),
    truncated: !!(group.open.pageInfo?.hasNextPage || group.merged.pageInfo?.hasNextPage),
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

function gitlabMergedRecently() {
  if (!gitlabSyncData) return [];
  const cutoff = Date.now() - GITLAB_MERGED_DAYS * 86400000;
  return (gitlabSyncData.merged || []).filter(mr => Date.parse(mr.mergedAt) >= cutoff);
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

function gitlabSyncAgeLabel() {
  return gitlabSyncData ? agoLabel(gitlabSyncData.generatedAt) : '';
}

// ------------------------------------------------------------
// Karte auf der Übersicht
// ------------------------------------------------------------
function renderGitlabMergeRequests() {
  if (!gitlabSyncData && !getGitlabGroupUrl()) return '';
  const stamp = `<button class="jira-sync-stamp" type="button" onclick="openGitlabImport()" title="GitLab-Abfrage öffnen und Antwort einspielen">stand: ${esc(gitlabSyncAgeLabel() || 'unbekannt')} &#8635;</button>`;
  if (!gitlabSyncData) {
    return `
      <div class="card gitlab-card">
        <div class="card-header"><span class="card-title">Merge Requests</span>${stamp}</div>
        <div class="review-due-empty">Noch nichts eingespielt. Klick auf den Stand öffnet die Abfrage.</div>
      </div>`;
  }
  const open = gitlabSyncData.open || [];
  const merged = gitlabMergedRecently();
  const unapproved = merged.filter(mr => !gitlabApprovalCount(mr)).length;
  return `
    <div class="card gitlab-card">
      <div class="card-header"><span class="card-title">Merge Requests</span>${stamp}</div>
      <div class="review-due-panel">
        <div class="review-due-sections">
          <div class="review-due-section review-due-section-warning">
            <div class="review-due-section-head">
              <div>
                <div class="review-due-section-title">Offen</div>
                <div class="review-due-section-hint">Älteste zuerst</div>
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
                <div class="review-due-section-hint">Letzte ${GITLAB_MERGED_DAYS} Tage</div>
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
  const group = getGitlabGroupUrl();
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">GitLab-MRs einspielen</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">GitLab-Gruppe</label>
        <input class="form-input" id="gitlabGroupInput" placeholder="https://gitlab.firma.at/meine-gruppe" value="${esc(group).replace(/"/g, '&quot;')}" onchange="saveGitlabGroupFromInput()">
        <div class="form-hint">URL der Gruppe aus dem Browser. Alle Projekte darunter, inklusive Untergruppen, werden abgefragt.</div>
      </div>
      <div class="form-group">
        ${url
          ? `<a class="btn btn-primary" style="display:block;text-align:center" href="${esc(url)}" target="_blank" rel="noopener">1 &middot; Abfrage in GitLab öffnen</a>
             <div class="form-hint">Öffnet einen Tab mit der JSON-Antwort: offene MRs und was in den letzten ${GITLAB_MERGED_DAYS} Tagen gemerged wurde. Dort alles markieren und kopieren.</div>`
          : `<div class="team-empty-copy">${group ? 'Aus dieser URL lässt sich keine Gruppe lesen.' : 'Erst die Gruppen-URL eintragen.'}</div>`}
      </div>
      <div class="form-group">
        <label class="form-label">2 &middot; Antwort hier einfügen</label>
        <textarea class="form-textarea" id="gitlabImportText" rows="8" placeholder='{"data":{"group":{...}}}'></textarea>
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

// Neue Gruppe sofort speichern und den Dialog mit dem neuen Abfrage-Link
// neu bauen, ohne eingefuegten Text zu verlieren.
function saveGitlabGroupFromInput() {
  const input = document.getElementById('gitlabGroupInput');
  const field = document.getElementById('gitlabImportText');
  const draft = field ? field.value : '';
  setGitlabGroupUrl(input ? input.value : '');
  render();
  openGitlabImport();
  const restored = document.getElementById('gitlabImportText');
  if (restored && draft) restored.value = draft;
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
    toast(`${snapshot.open.length} offen, ${gitlabMergedRecently().length} gemerged`
      + (unapproved ? ` · ${unapproved} ohne Approval` : ''));
  } catch (error) {
    toast(error.message || 'Einspielen fehlgeschlagen');
  }
}
