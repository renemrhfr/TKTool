// ============================================================
// RELEASE-CHECK: was wurde zwischen zwei Daten gemerged?
// ============================================================
// Eigene Abfrage neben dem normalen MR-Import, damit der Snapshot klein
// bleibt: Das Ergebnis lebt nur im Dialog und wird nicht gespeichert.
// Ablauf wie beim Import (CORS unter file://): Abfrage im angemeldeten Tab
// oeffnen, JSON kopieren, hier einfuegen.
//
// GitLab liefert hoechstens 100 MRs pro Liste. Mehr Listen in eine Abfrage
// zu packen scheitert irgendwann an GitLabs Komplexitaetslimit, also wird
// geblaettert: Hat eine Gruppe mehr, bietet der Dialog die naechste Seite
// an, und jede eingefuegte Antwort kommt zum bisherigen Ergebnis dazu.

let releaseCheckFrom = '';
let releaseCheckTo = '';
// { mrs: Map(url -> mr), next: [{ index, cursor }], pages } oder null
let releaseCheckResult = null;

function releaseCheckRangeValid() {
  return !!releaseCheckFrom && !!releaseCheckTo && releaseCheckFrom <= releaseCheckTo;
}

// Von/Bis sind Kalendertage in lokaler Zeit; GitLab rechnet in UTC. Darum
// die lokalen Tagesgrenzen als Zeitpunkte schicken, Bis inklusive.
function releaseCheckBounds() {
  const after = new Date(`${releaseCheckFrom}T00:00:00`);
  const before = new Date(`${releaseCheckTo}T00:00:00`);
  before.setDate(before.getDate() + 1);
  return { after: after.toISOString(), before: before.toISOString() };
}

// pages: [{ index, cursor }] — welche Gruppen ab welchem Cursor. Ohne
// Angabe alle Gruppen ab Anfang.
function releaseCheckQueryUrl(pages) {
  const groups = gitlabQueryGroups();
  if (!groups.length || !releaseCheckRangeValid()) return '';
  const wanted = pages || groups.map((g, index) => ({ index, cursor: null }));
  const { after, before } = releaseCheckBounds();
  const fields = 'iid title webUrl mergedAt targetBranch author{username name} project{path fullPath}';
  const query = '{' + wanted.map(({ index, cursor }) => {
    const args = [
      'state:merged',
      'includeSubgroups:true',
      `mergedAfter:${JSON.stringify(after)}`,
      `mergedBefore:${JSON.stringify(before)}`,
      'sort:MERGED_AT_DESC',
      'first:100',
      cursor ? `after:${JSON.stringify(cursor)}` : '',
    ].filter(Boolean).join(',');
    return `g${index}:group(fullPath:${JSON.stringify(groups[index].fullPath)}){fullPath `
      + `merged:mergeRequests(${args}){pageInfo{hasNextPage endCursor} nodes{${fields}}}}`;
  }).join(' ') + '}';
  return `${groups[0].origin}/api/graphql?${new URLSearchParams({ query })}`;
}

function releaseCheckMrFromNode(node) {
  return {
    iid: String(node.iid || ''),
    project: node.project ? String(node.project.path || '') : '',
    projectPath: node.project ? String(node.project.fullPath || node.project.path || '') : '',
    title: String(node.title || ''),
    url: String(node.webUrl || ''),
    targetBranch: String(node.targetBranch || ''),
    mergedAt: node.mergedAt ? String(node.mergedAt) : '',
    author: gitlabUser(node.author),
  };
}

// Neue Antwort ins bisherige Ergebnis mischen. Doppelte MRs (Obergruppe
// plus Untergruppe, oder dieselbe Seite zweimal eingefuegt) zaehlen einmal.
function releaseCheckMerge(parsed) {
  if (parsed && Array.isArray(parsed.errors) && parsed.errors.length) {
    throw new Error(`GitLab meldet: ${parsed.errors.map(e => e.message).join('; ')}`);
  }
  const payload = parsed && parsed.data;
  const keys = payload && typeof payload === 'object' ? Object.keys(payload).filter(key => /^g\d+$/.test(key)) : [];
  if (!keys.length) throw new Error('Das sieht nicht nach der Release-Check-Antwort aus (keine Gruppe).');
  const queried = gitlabQueryGroups();
  const missing = keys.filter(key => payload[key] === null).map(key => queried[Number(key.slice(1))]?.fullPath || key);
  if (missing.length) throw new Error(`Nicht gefunden: ${missing.join(', ')} — Pfad prüfen oder in GitLab angemeldet?`);
  if (keys.some(key => !payload[key].merged || payload[key].open)) {
    throw new Error('Das ist die Antwort des normalen MR-Imports — bitte die Release-Check-Abfrage öffnen.');
  }
  const result = releaseCheckResult || { mrs: new Map(), next: [], pages: 0 };
  const answered = new Set(keys.map(key => Number(key.slice(1))));
  const next = result.next.filter(p => !answered.has(p.index));
  keys.forEach(key => {
    const list = payload[key].merged;
    (list.nodes || []).map(releaseCheckMrFromNode)
      .forEach(mr => result.mrs.set(mr.url || `${mr.projectPath}!${mr.iid}`, mr));
    if (list.pageInfo?.hasNextPage && list.pageInfo.endCursor) {
      next.push({ index: Number(key.slice(1)), cursor: String(list.pageInfo.endCursor) });
    }
  });
  result.next = next;
  result.pages += 1;
  return result;
}

// Nach Ziel-Branch filtern wie die Karte (develop). Ausgeblendete Projekte
// zaehlen hier trotzdem: vor einem Release will man alles sehen.
function releaseCheckGroups(result) {
  const all = [...result.mrs.values()];
  const branches = gitlabTargetBranches();
  const shown = all.filter(mr => !branches.length || branches.some(p => gitlabBranchMatches(mr.targetBranch, p)));
  const byProject = new Map();
  shown.forEach(mr => {
    const key = mr.projectPath || mr.project;
    if (!byProject.has(key)) byProject.set(key, { path: key, name: mr.project || key, mrs: [] });
    byProject.get(key).mrs.push(mr);
  });
  const projects = [...byProject.values()];
  projects.forEach(p => p.mrs.sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt)));
  projects.sort((a, b) => b.mrs.length - a.mrs.length || a.name.localeCompare(b.name, 'de'));
  return { projects, shownCount: shown.length, hiddenCount: all.length - shown.length };
}

function formatReleaseCheckDate(iso) {
  return iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}

// ------------------------------------------------------------
// Dialog
// ------------------------------------------------------------
function openReleaseCheck() {
  if (!releaseCheckTo) releaseCheckTo = todayStr();
  renderReleaseCheckModal();
  openOverlay();
}

function renderReleaseCheckModal() {
  const groups = gitlabQueryGroups();
  const pending = releaseCheckResult ? releaseCheckResult.next : null;
  const url = !releaseCheckRangeValid() ? '' : releaseCheckQueryUrl(pending && pending.length ? pending : null);
  const morePages = !!(pending && pending.length);
  const done = releaseCheckResult && !morePages;
  let step = '';
  if (!groups.length) {
    step = '<div class="team-empty-copy">Erst im GitLab-Import eine Gruppen-URL eintragen.</div>';
  } else if (!releaseCheckFrom) {
    step = '<div class="form-hint">Von-Datum wählen, dann erscheint die Abfrage.</div>';
  } else if (!releaseCheckRangeValid()) {
    step = '<div class="form-hint">Von muss vor oder gleich Bis sein.</div>';
  } else if (!done) {
    step = `
      <div class="form-group">
        ${morePages ? '<div class="release-check-more">GitLab hat mehr als 100 MRs geliefert. Nächste Seite holen und wieder einfügen, das Ergebnis wird ergänzt.</div>' : ''}
        <a class="btn btn-primary" style="display:block;text-align:center" href="${esc(url).replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${morePages ? `1 &middot; Seite ${releaseCheckResult.pages + 1} in GitLab öffnen` : '1 &middot; Abfrage in GitLab öffnen'}</a>
        <div class="form-hint">Öffnet einen Tab mit der JSON-Antwort${groups.length > 1 ? ` für alle ${groups.length} Gruppen` : ''}. Dort alles markieren und kopieren.</div>
      </div>
      <div class="form-group">
        <label class="form-label">2 &middot; Antwort hier einfügen</label>
        <textarea class="form-textarea" id="releaseCheckText" rows="5" placeholder='{"data":{"g0":{...}}}'></textarea>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="submitReleaseCheck()">3 &middot; Auswerten</button>`;
  }
  const modal = document.getElementById('modal');
  modal.className = 'modal modal-release-check';
  modal.innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Release-Check</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-hint" style="margin-top:0">Welche Projekte haben im Zeitraum etwas gemerged? Wird nicht gespeichert.</div>
      <div class="release-check-range">
        <div class="form-group">
          <label class="form-label" for="releaseCheckFromInput">Von</label>
          <input type="date" class="form-input" id="releaseCheckFromInput" value="${esc(releaseCheckFrom)}" onchange="setReleaseCheckRange()">
        </div>
        <div class="form-group">
          <label class="form-label" for="releaseCheckToInput">Bis</label>
          <input type="date" class="form-input" id="releaseCheckToInput" value="${esc(releaseCheckTo)}" onchange="setReleaseCheckRange()">
        </div>
      </div>
      ${step}
      ${releaseCheckResult ? renderReleaseCheckResult(releaseCheckResult) : ''}
    </div>`;
}

// Neuer Zeitraum heisst neue Abfrage: ein altes Ergebnis passt nicht mehr.
function setReleaseCheckRange() {
  const from = document.getElementById('releaseCheckFromInput');
  const to = document.getElementById('releaseCheckToInput');
  releaseCheckFrom = from ? from.value : releaseCheckFrom;
  releaseCheckTo = to ? to.value : releaseCheckTo;
  releaseCheckResult = null;
  renderReleaseCheckModal();
}

function resetReleaseCheck() {
  releaseCheckResult = null;
  renderReleaseCheckModal();
}

function submitReleaseCheck() {
  const field = document.getElementById('releaseCheckText');
  const text = (field ? field.value : '').trim();
  if (!text) return;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    toast('Das ist kein gültiges JSON — beim Kopieren etwas abgeschnitten?');
    return;
  }
  try {
    releaseCheckResult = releaseCheckMerge(parsed);
  } catch (error) {
    toast(error.message || 'Auswerten fehlgeschlagen');
    return;
  }
  renderReleaseCheckModal();
}

function renderReleaseCheckResult(result) {
  const { projects, shownCount, hiddenCount } = releaseCheckGroups(result);
  const branches = gitlabTargetBranches();
  const range = `${formatReleaseCheckDate(releaseCheckFrom)} – ${formatReleaseCheckDate(releaseCheckTo)}`;
  const summary = shownCount
    ? `${shownCount} ${shownCount === 1 ? 'MR' : 'MRs'} in ${projects.length} ${projects.length === 1 ? 'Projekt' : 'Projekten'}`
    : 'Nichts gemerged';
  const notes = [
    range,
    branches.length ? `nach ${branches.join(', ')}` : 'alle Branches',
    hiddenCount ? `${hiddenCount} in andere Branches nicht gezählt` : '',
    result.next.length ? 'unvollständig, weitere Seite offen' : '',
  ].filter(Boolean);
  return `
    <div class="release-check-result">
      <div class="release-check-summary">
        <div>
          <div class="release-check-summary-title">${summary}</div>
          <div class="form-hint" style="margin-top:2px">${notes.map(esc).join(' · ')}</div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="resetReleaseCheck()" title="Ergebnis verwerfen und neu abfragen">Neu</button>
      </div>
      ${projects.length ? `<ul class="release-check-projects">${projects.map(renderReleaseCheckProject).join('')}</ul>` : ''}
    </div>`;
}

function renderReleaseCheckProject(project) {
  const last = project.mrs[0] ? project.mrs[0].mergedAt : '';
  return `
    <li>
      <details class="release-check-project">
        <summary title="${esc(project.path).replace(/"/g, '&quot;')}">
          <span class="release-check-project-name">${esc(project.name)}</span>
          <span class="release-check-project-last">zuletzt ${formatDateShort(last)}</span>
          <span class="release-check-project-count">${project.mrs.length}</span>
        </summary>
        <ul class="review-due-item-list">${project.mrs.map(renderReleaseCheckRow).join('')}</ul>
      </details>
    </li>`;
}

function renderReleaseCheckRow(mr) {
  return `
    <li class="review-due-item gitlab-item-calm">
      <button class="review-due-item-main" ${gitlabRowAttrs(mr)}>
        <span class="review-due-item-date">
          <span class="review-due-item-day">${formatDateShort(mr.mergedAt)}</span>
        </span>
        <span class="review-due-item-body">
          <span class="review-due-item-title">${esc(mr.title)}</span>
          <span class="review-due-item-meta">
            <span>@${esc(mr.author ? mr.author.name : '?')}</span>
            <span class="gitlab-ref">!${esc(mr.iid)}</span>
            ${mr.targetBranch ? `<span class="gitlab-ref">→ ${esc(mr.targetBranch)}</span>` : ''}
          </span>
        </span>
      </button>
    </li>`;
}
