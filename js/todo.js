// ============================================================
// OVERVIEW
// ============================================================
function renderOverview() {
  const month = viewState.month || currentMonth();
  const query = (viewState.overviewQuery || '').trim().toLocaleLowerCase('de-AT');
  const layout = overviewLayout();
  const review = monthReview(month);
  const pastOpenWarning = renderPastOpenItemsWarning();
  const items = data.items
    .filter(i => !isGrowthEntry(i))
    .filter(i => i.month === month)
    .filter(i => !query || itemMatchesQuery(i, query));

  const todos = items.filter(i => i.status === 'todo').sort(compareByDueDate);
  const backlog = items.filter(i => i.status === 'backlog').sort(compareByDueDate);
  const waiting = items
    .filter(i => i.status === 'waiting')
    .sort(compareByDueDate);
  const done = items.filter(i => i.status === 'done');

  return `
    <div class="section-header">
      <div class="overview-toolbar">
        <div class="overview-toolbar-main">
          <div class="overview-toolbar-start">
            <div class="month-selector">
              <button onclick="changeMonth(-1)">&#8592;</button>
              <span class="month-label">${formatMonth(month)}</span>
              <button onclick="changeMonth(1)">&#8594;</button>
            </div>
          </div>
          <div class="view-search overview-search-row">
            <input
              id="overviewSearchInput"
              type="search"
              placeholder="monat filtern..."
              value="${esc(viewState.overviewQuery || '')}"
              oninput="setOverviewQuery(this.value)"
            >
            <button
              class="btn btn-primary btn-sm overview-add-todo-btn"
              type="button"
              onclick="openCapture({ type: 'todo', status: 'todo', month: '${month}' })"
              title="Todo hinzufügen"
              aria-label="Todo hinzufügen"
            >+</button>
            ${query ? `<button class="btn btn-secondary btn-sm" onclick="clearOverviewQuery()">Reset</button>` : ''}
          </div>
          <div class="view-toggle overview-search-toggle" role="tablist" aria-label="Todo Ansicht">
            <button class="view-toggle-btn ${layout === 'board' ? 'active' : ''}" onclick="setOverviewLayout('board')" role="tab" aria-selected="${layout === 'board'}">board</button>
            <button class="view-toggle-btn ${layout === 'list' ? 'active' : ''}" onclick="setOverviewLayout('list')" role="tab" aria-selected="${layout === 'list'}">list</button>
          </div>
          <details class="overview-actions-menu">
            <summary>monat</summary>
            <div class="overview-actions-menu-panel">
              <button class="btn btn-secondary btn-sm" onclick="openMonthCarryover('${month}')">monat abschliessen</button>
              <button class="btn btn-secondary btn-sm" onclick="exportMonth('${month}')">export .md</button>
            </div>
          </details>
        </div>
        ${review ? `<div class="overview-toolbar-secondary">${renderMonthReflectionCard(month)}</div>` : ''}
        ${pastOpenWarning}
      </div>
    </div>

    ${layout === 'list'
      ? renderTaskTable(items)
      : `
        <div class="overview-board">
          ${renderItemSection('backlog', backlog, 'backlog')}
          ${renderItemSection('todo', todos, 'todo')}
          ${renderItemSection('warte auf...', waiting, 'waiting')}
          ${renderItemSection('erledigt', done, 'done')}
        </div>
      `}
  `;
}

function pastOpenItemsByMonth() {
  const current = currentMonth();
  return data.items
    .filter(item => !isGrowthEntry(item))
    .filter(item => item.status !== 'done')
    .filter(item => item.month && item.month < current)
    .reduce((groups, item) => {
      groups[item.month] = groups[item.month] || [];
      groups[item.month].push(item);
      return groups;
    }, {});
}

function renderPastOpenItemsWarning() {
  const groups = pastOpenItemsByMonth();
  const months = Object.keys(groups).sort();
  if (!months.length) return '';
  const count = months.reduce((sum, month) => sum + groups[month].length, 0);
  const oldest = months[0];
  const newest = months[months.length - 1];
  const rangeLabel = oldest === newest ? formatMonth(oldest) : `${formatMonth(oldest)} - ${formatMonth(newest)}`;
  return `
    <button class="overview-lost-items-warning" type="button" onclick="navigate('overview', {month:'${oldest}', overviewLayout:'list'})">
      <span class="overview-lost-items-mark">!</span>
      <span>${count} offene Item${count === 1 ? '' : 's'} in Vormonat${months.length === 1 ? '' : 'en'}</span>
      <span class="overview-lost-items-month">${esc(rangeLabel)}</span>
    </button>
  `;
}

function renderMonthlyFocusPanel(month) {
  const focuses = data.focuses.filter(f => f.month === month);
  return `
    <div class="dashboard-focus card">
      <div class="dashboard-focus-head">
        <div>
          <div class="dashboard-focus-kicker">${formatMonth(month)}</div>
          <div class="dashboard-focus-title">Monthly Focus</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="openFocusForm('${month}')">+ Focus</button>
      </div>
      <div class="dashboard-focus-list">
        ${focuses.length ? focuses.map(f => `
          <div class="dashboard-focus-item">
            <div class="dashboard-focus-copy">
              <div class="focus-title">${esc(f.title)}</div>
              ${f.description ? `<div class="focus-desc">${esc(f.description)}</div>` : ''}
            </div>
            <button class="overview-focus-delete" onclick="deleteFocus('${f.id}')" title="Löschen">&#x2715;</button>
          </div>
        `).join('') : '<div class="overview-focus-empty">Noch kein Focus gesetzt</div>'}
      </div>
    </div>
  `;
}

function renderTeamGrowthPersonChips(perPerson, emptyText, options = {}) {
  const extraClass = options.extraClass ? ` ${options.extraClass}` : '';
  const onClick = personId => options.closeOverlay
    ? `closeOverlay();navigate('team', {personId:'${personId}'})`
    : `navigate('team', {personId:'${personId}'})`;
  return `
    <div class="impact-person-strip${extraClass}">
      ${perPerson.length ? perPerson.map(entry => `
        <button class="impact-person-chip" onclick="${onClick(entry.personId)}">
          ${personAvatar(personById(entry.personId), 'sm')}
          <span class="impact-person-copy">
            <span class="impact-person-name">${esc(personName(entry.personId))}</span>
            <span class="impact-person-metrics">
              <span class="impact-metric-positive">+${entry.highlights}</span>
              <span class="impact-metric-sep">/</span>
              <span class="impact-metric-negative">-${entry.concerns}</span>
            </span>
          </span>
        </button>
      `).join('') : `<div class="team-empty-copy">${emptyText}</div>`}
    </div>
  `;
}

function renderMonthImpactPanel(month) {
  const progress = monthProgress(month);
  const personalWins = monthItems(data.items.filter(isPersonalWin), month).sort(compareItemsByDateDesc);
  const teamGrowth = monthItems(data.items.filter(isGrowthEntry), month).sort(compareItemsByDateDesc);
  const highlights = teamGrowth.filter(item => item.type === 'highlight');
  const concerns = teamGrowth.filter(item => item.type === 'concern');
  const perPerson = currentMonthTeamGrowthSummary(month);
  return `
    <div class="impact-month card">
      <div class="impact-month-header">
        <div>
          <div class="impact-month-kicker">${formatMonth(month)} · Tag ${progress.elapsedDays} von ${progress.totalDays}</div>
          <div class="impact-month-title">Was ich diesen Monat bewegt habe</div>
        </div>
        <div class="impact-month-summary">${personalWins.length} Wins · ${highlights.length} Highlights · ${concerns.length} Concerns</div>
      </div>
      <div class="impact-month-progress" aria-hidden="true">
        <div class="impact-month-progress-bar" style="width:${progress.percent}%"></div>
      </div>

      <div class="impact-month-grid">
        <div class="impact-month-column">
          <div class="impact-month-column-head">mein impact diesen monat</div>
          ${personalWins.length ? `
            <div class="impact-stream">
              ${personalWins.slice(0, 8).map(item => `
                <button class="impact-entry impact-entry-personal" onclick="openEditItem('${item.id}')">
                  <span class="impact-entry-date">${formatDateShort(item.date) || '&ndash;'}</span>
                  <span class="badge badge-win">${itemTypeLabel(item.type)}</span>
                  <span class="impact-entry-text">${esc(item.text)}</span>
                  <span class="impact-entry-pulse" aria-hidden="true"></span>
                </button>
              `).join('')}
            </div>
          ` : '<div class="team-empty-copy">Noch keine persönlichen Wins in diesem Monat</div>'}
        </div>
        <div class="impact-month-column">
          <div class="impact-month-column-head">teamentwicklung diesen monat</div>
          ${renderTeamGrowthPersonChips(perPerson, 'Noch kein Teamwachstum in diesem Monat erfasst', { extraClass: 'impact-person-strip-panel' })}
        </div>
      </div>
    </div>
  `;
}

function renderSearch() {
  const rawQuery = (viewState.query || '').trim();
  const query = rawQuery.toLocaleLowerCase('de-AT');

  if (!query) {
    return `
      <div class="section-header">
        <span class="section-title">Suche</span>
      </div>
      <div class="empty-state">
        <div class="empty-state-icon">&#128269;</div>
        <div class="empty-state-text">Oben im Header einen Suchbegriff eingeben</div>
      </div>
    `;
  }

  const itemResults = data.items
    .filter(item => itemMatchesQuery(item, query))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const personResults = data.persons
    .filter(person => personMatchesQuery(person, query))
    .sort((a, b) => a.name.localeCompare(b.name, 'de-AT'));
  const meetingResults = data.meetings
    .filter(meeting => meetingMatchesQuery(meeting, query))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const focusResults = data.focuses
    .filter(focus => focusMatchesQuery(focus, query))
    .sort((a, b) => (b.month || '').localeCompare(a.month || ''));
  const noteResults = (data.notes || [])
    .filter(note => [note.title, note.text].some(value => includesQuery(value, query)))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const resultCount = itemResults.length + personResults.length + meetingResults.length + focusResults.length + noteResults.length;

  return `
    <div class="section-header">
      <span class="section-title">Suche</span>
      <div class="search-summary">${resultCount} Treffer für "${esc(rawQuery)}"</div>
    </div>

    ${renderSearchSection('Items', itemResults, item => `
      <button class="search-result-card" onclick="openEditItem('${item.id}')">
        <div class="search-result-head">
          ${item.status === 'done' ? `<span class="badge badge-${item.type}">${itemTypeLabel(item.type)}</span>` : ''}
          <span class="search-result-date">${item.month ? formatMonth(item.month) : ''}</span>
        </div>
        <div class="search-result-title">${esc(item.text)}</div>
        ${item.notes ? `<div class="search-result-body">${esc(item.notes)}</div>` : ''}
        <div class="search-result-meta">${item.personId ? '@' + esc(personName(item.personId)) + ' · ' : ''}${item.status}${item.date ? ' · ' + formatDate(item.date) : ''}${item.meetingId ? ' · ' + esc(meetingTitleText(data.meetings.find(meeting => meeting.id === item.meetingId))) : ''}</div>
      </button>
    `)}

    ${renderSearchSection('Personen', personResults, person => `
      <button class="search-result-card" onclick="navigate('${person.type === 'kontakt' ? 'kontakte:detail' : 'team:detail'}', {personId:'${person.id}'})">
        <div class="search-result-head">
          <span class="badge ${person.type === 'kontakt' ? 'badge-note' : 'badge-focus'}">${person.type === 'kontakt' ? 'kontakt' : 'team'}</span>
        </div>
        <div class="search-result-title">${esc(person.name)}</div>
        ${person.pushDirection ? `<div class="search-result-body">${esc(person.pushDirection)}</div>` : ''}
      </button>
    `)}

    ${renderSearchSection('Meetings', meetingResults, meeting => `
      <button class="search-result-card" onclick="navigate('meetings:detail', {meetingId:'${meeting.id}'})">
        <div class="search-result-head">
          <span class="badge ${meeting.type === 'oneOnOne' ? 'badge-done' : 'badge-todo'}">${meeting.type === 'oneOnOne' ? '1:1' : (isTeamMeeting(meeting) ? 'team' : 'meeting')}</span>
          <span class="search-result-date">${meeting.date ? formatDate(meeting.date) : ''}</span>
        </div>
        <div class="search-result-title">${meetingDisplayTitle(meeting)}</div>
        ${meeting.prep ? `<div class="search-result-body">${esc(meeting.prep)}</div>` : meeting.notes ? `<div class="search-result-body">${esc(meeting.notes)}</div>` : ''}
      </button>
    `)}

    ${renderSearchSection('Focus', focusResults, focus => `
      <button class="search-result-card" onclick="navigate('overview', {month:'${focus.month}'})">
        <div class="search-result-head">
          <span class="badge badge-focus">focus</span>
          <span class="search-result-date">${formatMonth(focus.month)}</span>
        </div>
        <div class="search-result-title">${esc(focus.title)}</div>
        ${focus.description ? `<div class="search-result-body">${esc(focus.description)}</div>` : ''}
      </button>
    `)}

    ${renderSearchSection('Notizen', noteResults, note => `
      <button class="search-result-card" onclick="navigate('notizen', {focusNoteId:'${note.id}'})">
        <div class="search-result-head">
          <span class="badge badge-note">notiz</span>
          <span class="search-result-date">${formatNoteUpdatedAt(note.updatedAt)}</span>
        </div>
        <div class="search-result-title">${esc(note.title)}</div>
        ${note.text ? `<div class="search-result-body">${esc(previewText(note.text, 180))}</div>` : ''}
      </button>
    `)}

    ${resultCount === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">&#128270;</div>
        <div class="empty-state-text">Keine Treffer gefunden</div>
      </div>
    ` : ''}
  `;
}

function renderSearchSection(title, entries, renderer) {
  if (!entries.length) return '';
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${title} (${entries.length})</span>
      </div>
      <div class="search-results-grid">
        ${entries.map(renderer).join('')}
      </div>
    </div>
  `;
}

function renderItemSection(title, items, status) {
  return `
    <div class="card drop-target board-${status}"
      ondragover="onItemDragOver(event)"
      ondragleave="onItemDragLeave(event)"
      ondrop="onItemDrop(event, '${status}')">
      <div class="card-header">
        <span class="card-title">${title} (${items.length})</span>
      </div>
      ${items.length ? `
        <ul class="item-list">
          ${items.map(i => renderItem(i, true)).join('')}
        </ul>
      ` : `<div style="color:var(--text-muted);font-size:14px">Keine Einträge</div>`}
    </div>
  `;
}

function compareOverviewTaskRows(a, b) {
  const statusOrder = { todo: 0, waiting: 1, backlog: 2, done: 3 };
  const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
  if (statusDiff !== 0) return statusDiff;
  const dueDiff = compareByDueDate(a, b);
  if (dueDiff !== 0) return dueDiff;
  return (a.text || '').localeCompare(b.text || '', 'de-AT');
}

function renderTaskSections(sections) {
  return `
    <div class="task-sections">
      ${sections.map(([title, items, status]) => renderTaskSection(title, items, status)).join('')}
    </div>
  `;
}

function renderTaskTable(items) {
  const sortedItems = items.slice().sort(compareOverviewTaskRows);
  return `
    <div class="card task-table-card">
      <div class="card-header">
        <span class="card-title">list (${sortedItems.length})</span>
      </div>
      ${sortedItems.length ? `
        <div class="task-table-wrap">
          <table class="task-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Owner</th>
                <th>Datum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${sortedItems.map((item, index) => {
                const previousItem = index > 0 ? sortedItems[index - 1] : null;
                const startsDoneSection = item.status === 'done' && previousItem && previousItem.status !== 'done';
                return renderTaskTableRow(item, { startsDoneSection });
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div style="color:var(--text-muted);font-size:14px">Keine Einträge</div>`}
    </div>
  `;
}

function previewText(text, maxLength = 120) {
  if (!text) return '';
  const singleLine = String(text).replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength).trimEnd()}…`;
}

function renderTaskTableRow(item, options = {}) {
  const isDone = item.status === 'done';
  const isPastDue = !isDone && item.date && item.date < todayStr();
  const person = item.personId ? data.persons.find(entry => entry.id === item.personId) : null;
  const { startsDoneSection = false } = options;
  const notesPreview = previewText(item.notes);
  return `
    <tr class="${isDone ? 'is-done' : ''} ${isPastDue ? 'task-table-row-past-due' : ''} ${startsDoneSection ? 'task-table-done-start' : ''} task-table-row-${item.status}">
      <td class="task-table-task-cell" onclick="openEditItem('${item.id}')">
        <div class="task-table-task"><span class="task-status-dot task-status-dot-${item.status}" aria-hidden="true"></span>${esc(item.text)}</div>
        <div class="task-table-notes ${notesPreview ? '' : 'is-empty'}">${notesPreview ? esc(notesPreview) : ''}</div>
      </td>
      <td class="task-table-link">
        ${person ? `<button class="person-chip-button" onclick="openPersonById('${person.id}')">${personAvatar(person, 'sm')}<span>${esc(person.name)}</span></button>` : '<span class="task-table-muted">Niemand</span>'}
      </td>
      <td><span class="task-table-date ${isPastDue ? 'past-due' : ''}">${item.date ? formatDateShort(item.date) : ''}</span></td>
      <td class="task-table-actions">
        <div class="task-table-action-group">
          <div class="item-check ${isDone ? 'checked' : ''}" onclick="toggleItem('${item.id}')" title="Erledigt"></div>
          <button onclick="openEditItem('${item.id}')" title="Bearbeiten">&#9998;</button>
          <button onclick="deleteItem('${item.id}')" title="Löschen">&#x2715;</button>
        </div>
      </td>
    </tr>
  `;
}

function renderTaskSection(title, items, status) {
  return `
    <div class="card task-section task-${status}">
      <div class="card-header">
        <span class="card-title">${title} (${items.length})</span>
      </div>
      ${items.length ? `
        <ul class="item-list task-list">
          ${items.map(i => renderItem(i, false, { compact: true })).join('')}
        </ul>
      ` : `<div style="color:var(--text-muted);font-size:14px">Keine Einträge</div>`}
    </div>
  `;
}

function renderItem(item, draggable = false, options = {}) {
  const isDone = item.status === 'done';
  const isPastDue = !isDone && item.date && item.date < todayStr();
  const dateLabel = formatDateShort(item.date);
  const linkedMeeting = item.meetingId ? data.meetings.find(meeting => meeting.id === item.meetingId) : null;
  const { showStatus = false, compact = false } = options;
  const notesPreview = previewText(item.notes);
  const dragAttrs = draggable
    ? `draggable="true" ondragstart="onItemDragStart(event, '${item.id}')" ondragend="onItemDragEnd(event)"`
    : '';
  return `
    <li class="item ${isDone ? 'is-done' : ''} ${compact ? 'item-compact' : ''}" ${dragAttrs}>
      <div class="item-content" onclick="openEditItem('${item.id}')" style="cursor:pointer;">
        <div class="item-text ${isDone ? 'done' : ''}">${esc(item.text)}</div>
        ${notesPreview ? `<div class="item-notes">${esc(notesPreview)}</div>` : ''}
        <div class="item-meta">
          ${showStatus ? `<span class="badge badge-${item.status}">${item.status}</span>` : ''}
          ${item.personId ? `<button class="item-link-chip item-person-tag" onclick="event.stopPropagation();openPersonById('${item.personId}')">@${esc(personName(item.personId))}</button>` : ''}
          ${linkedMeeting ? `<button class="item-link-chip" onclick="event.stopPropagation();navigate('meetings:detail', {meetingId:'${linkedMeeting.id}'})">${meetingDisplayTitle(linkedMeeting)}</button>` : ''}
          ${isDone ? `<span class="badge badge-${item.type}">${itemTypeLabel(item.type)}</span>` : ''}
          ${dateLabel && !isDone ? `<span class="item-date ${isPastDue ? 'past-due' : ''}">${dateLabel}</span>` : ''}
        </div>
      </div>
      <div class="item-overlay">
        <div class="item-check ${isDone ? 'checked' : ''}" onclick="event.stopPropagation();toggleItem('${item.id}')" title="Erledigt"></div>
        <div class="item-actions">
          <button onclick="event.stopPropagation();openEditItem('${item.id}')" title="Bearbeiten">&#9998;</button>
          <button onclick="event.stopPropagation();deleteItem('${item.id}')" title="Löschen">&#x2715;</button>
        </div>
      </div>
    </li>
  `;
}

function changeMonth(dir) {
  const month = viewState.month || currentMonth();
  viewState.month = dir < 0 ? prevMonth(month) : nextMonth(month);
  render();
}

function setOverviewQuery(value) {
  const input = document.getElementById('overviewSearchInput');
  pendingOverviewSearchSelection = input
    ? { start: input.selectionStart, end: input.selectionEnd }
    : { start: value.length, end: value.length };
  viewState.overviewQuery = value;
  render();
}

function clearOverviewQuery() {
  viewState.overviewQuery = '';
  pendingOverviewSearchSelection = { start: 0, end: 0 };
  render();
}

function setOverviewLayout(layout) {
  const next = layout === 'board' ? 'board' : 'list';
  viewState.overviewLayout = next;
  try {
    localStorage.setItem(OVERVIEW_LAYOUT_KEY, next);
  } catch {}
  render();
}

function overviewLayout() {
  if (viewState.overviewLayout === 'board' || viewState.overviewLayout === 'list') {
    return viewState.overviewLayout;
  }
  try {
    const saved = localStorage.getItem(OVERVIEW_LAYOUT_KEY);
    return saved === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}
