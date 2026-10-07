// ============================================================
// MEETINGS VIEW
// ============================================================
function meetingDisplayTitle(m) {
  return esc(meetingTitleText(m));
}

function openMeetingDetail(id) {
  navigate('meetings:detail', { meetingId: id });
}

function setMeetingQuery(value) {
  const input = document.getElementById('meetingSearchInput');
  pendingMeetingSearchSelection = input
    ? { start: input.selectionStart, end: input.selectionEnd }
    : { start: value.length, end: value.length };
  viewState.meetingQuery = value;
  render();
}

function setMeetingRangeFilter(value) {
  viewState.meetingRange = value;
  render();
}

function parsePrepBullets(prep) {
  if (!prep) return [];
  const bullets = [];
  let current = null;
  const push = () => { if (current) bullets.push(current); };
  for (const raw of prep.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const mDone = line.match(/^\s*-\s*\[x\](?:\s+(.*))?$/i);
    if (mDone) { push(); current = { text: mDone[1] || '', done: true }; continue; }
    const mOpen = line.match(/^\s*-\s*\[\s?\](?:\s+(.*))?$/);
    if (mOpen) { push(); current = { text: mOpen[1] || '', done: false }; continue; }
    const mDash = line.match(/^\s*[-*](?:\s+(.*))?$/);
    if (mDash) { push(); current = { text: mDash[1] || '', done: false }; continue; }
    if (current) {
      current.text += '\n' + line.replace(/^\s{1,4}/, '');
    } else if (line.trim()) {
      current = { text: line.trim(), done: false };
    }
  }
  push();
  return bullets;
}

// Im Anlege-Formular wird Vorbereitung als Freitext getippt. Damit daraus
// dieselbe Checkliste wird, die das Meeting selbst rendert, zaehlt hier jede
// Zeile als eigener Punkt — sonst klebt parsePrepBullets alle Folgezeilen als
// Fortsetzung an den ersten Punkt. Bereits getippte "- " / "- [x] " bleiben
// erhalten.
function prepFromFormText(text) {
  const bullets = String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => parsePrepBullets(line));
  return bullets.length ? serializePrepBullets(bullets) : '';
}

function serializePrepBullets(bullets) {
  return bullets.map(b => {
    const prefix = b.done ? '- [x] ' : '- ';
    const [first, ...rest] = (b.text || '').split('\n');
    const cont = rest.map(l => '  ' + l).join('\n');
    return prefix + first + (cont ? '\n' + cont : '');
  }).join('\n');
}

function meetingSeriesKey(meeting) {
  if (!meeting) return '';
  if (meeting.type === 'oneOnOne') return meeting.personId ? `oneOnOne:${meeting.personId}` : '';
  const title = String(meeting.title || '').trim().toLocaleLowerCase('de-AT');
  return title ? `meeting:${title}` : '';
}

function earlierMeetingsInSeries(meeting) {
  const key = meetingSeriesKey(meeting);
  if (!key) return [];
  const referenceDate = meeting.date || todayStr();
  return data.meetings
    .filter(candidate => candidate.id !== meeting.id && candidate.date && candidate.date < referenceDate && meetingSeriesKey(candidate) === key)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function openPrepCarryovers(meeting) {
  return earlierMeetingsInSeries(meeting).flatMap(sourceMeeting =>
    parsePrepBullets(sourceMeeting.prep)
      .map((bullet, index) => ({ ...bullet, index, sourceMeeting }))
      .filter(bullet => !bullet.done && bullet.text.trim())
  );
}

// Reguläre Serien haben keine Person als Anker — offene Punkte kommen deshalb
// über die Follow-ups der früheren Termine derselben Serie (gleicher Titel).
function seriesCarryover(meeting) {
  const empty = { openFollowUps: [], lastMeeting: null, sourceCount: 0 };
  if (!meeting || meeting.type === 'oneOnOne') return empty;
  const earlier = earlierMeetingsInSeries(meeting);
  if (!earlier.length) return empty;
  const byId = new Map(earlier.map(entry => [entry.id, entry]));
  const openFollowUps = data.items
    .filter(item => item.meetingId && byId.has(item.meetingId) && item.status !== 'done')
    .sort(compareByDueDate);
  const sourceCount = new Set(openFollowUps.map(item => item.meetingId)).size;
  return { openFollowUps, lastMeeting: earlier[0], sourceCount };
}

function meetingRelativeDate(d) {
  if (!d) return '';
  const today = todayStr();
  if (d === today) return 'heute';
  if (d === dateShift(today, 1)) return 'morgen';
  if (d === dateShift(today, -1)) return 'gestern';
  const diff = Math.round((parseISO(d) - parseISO(today)) / 86400000);
  if (diff > 1 && diff <= 7) return `in ${diff} Tagen`;
  if (diff < -1 && diff >= -7) return `vor ${-diff} Tagen`;
  return formatDate(d);
}

function meetingFollowupCounts(id) {
  const items = meetingItems(id);
  const counts = { todo: 0, waiting: 0, done: 0, backlog: 0, total: items.length };
  items.forEach(i => { if (counts[i.status] !== undefined) counts[i.status]++; });
  return counts;
}

function meetingMonthKey(meeting) {
  return meeting.date ? meeting.date.slice(0, 7) : 'ohne-datum';
}

function meetingMonthLabel(key) {
  return key === 'ohne-datum' ? 'ohne datum' : formatMonth(key).toLocaleLowerCase('de-AT');
}

function meetingListExcerpt(m, query) {
  const linkedItems = data.items
    .filter(item => item.meetingId === m.id)
    .flatMap(item => [item.text, item.notes]);
  const source = [m.notes, m.prep, ...linkedItems].filter(Boolean).join(' ');
  if (!source) return '';
  const compact = String(source).replace(/\s+/g, ' ').trim();
  if (!query) return previewText(compact, 110);
  const idx = compact.toLocaleLowerCase('de-AT').indexOf(query);
  if (idx < 0) return previewText(compact, 110);
  const start = Math.max(0, idx - 36);
  const end = Math.min(compact.length, idx + query.length + 74);
  return `${start ? '...' : ''}${compact.slice(start, end).trim()}${end < compact.length ? '...' : ''}`;
}

function meetingHasOpenFollowups(meeting) {
  const counts = meetingFollowupCounts(meeting.id);
  return counts.todo + counts.waiting + counts.backlog > 0;
}

function meetingMatchesRange(meeting, range, today) {
  if (range === 'upcoming') return !meeting.date || meeting.date >= today;
  if (range === 'past') return meeting.date && meeting.date < today;
  if (range === 'open') return meetingHasOpenFollowups(meeting);
  if (range === 'undated') return !meeting.date;
  return true;
}

// Kommende Meetings bleiben eine flache, chronologische Liste. Unscharfe Koerbe
// ("naechste 7 tage") sind zum Scannen schlechter als das Datum selbst — die
// Datebox links sagt ohnehin schon Tag und Wochentag. Struktur kommt nur noch
// aus echten Kalendergrenzen: Monatstrenner vorne, Monatsgruppen in der Historie.
function groupMeetingsByTimeline(meetings, today) {
  const groups = { kommend: [], ohneDatum: [], vergangen: {} };
  meetings.forEach(m => {
    if (!m.date) { groups.ohneDatum.push(m); return; }
    if (m.date >= today) { groups.kommend.push(m); return; }
    const key = meetingMonthKey(m);
    if (!groups.vergangen[key]) groups.vergangen[key] = [];
    groups.vergangen[key].push(m);
  });
  groups.kommend.sort((a, b) => a.date.localeCompare(b.date)
    || meetingTitleText(a).localeCompare(meetingTitleText(b), 'de-AT'));
  groups.ohneDatum.sort((a, b) => meetingTitleText(a).localeCompare(meetingTitleText(b), 'de-AT'));
  Object.values(groups.vergangen).forEach(entries => entries.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
  return groups;
}

function pastMonthKeys(groups) {
  return Object.keys(groups.vergangen).sort((a, b) => b.localeCompare(a));
}

function flattenMeetingGroups(groups) {
  return [
    ...groups.kommend,
    ...groups.ohneDatum,
    ...pastMonthKeys(groups).flatMap(key => groups.vergangen[key]),
  ];
}

function renderMeetingListRow(m, isActive, query = '', isToday = false) {
  const counts = meetingFollowupCounts(m.id);
  const person = m.personId ? data.persons.find(p => p.id === m.personId) : null;
  const participants = meetingParticipants(m);
  const openTodos = counts.todo + counts.waiting;
  const teamMeeting = isTeamMeeting(m);
  // Ohne Suche ist der Auszug nur Rauschen und kostet jede Zeile eine Zeile mehr;
  // fuer den Blick zwischendurch reicht der Hover-Peek.
  const excerpt = query ? meetingListExcerpt(m, query) : '';
  const date = m.date ? new Date(`${m.date}T12:00:00`) : null;
  const day = date ? String(date.getDate()).padStart(2, '0') : '--';
  const weekday = date ? date.toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '') : '';
  const peekBits = [];
  if (participants.length) peekBits.push(participants.map(p => p.name).join(', '));
  if (m.notes) peekBits.push(previewText(m.notes));
  const peek = peekBits.join('\n\n');
  return `
    <div class="meeting-list-row ${isActive ? 'active' : ''} ${isToday ? 'is-today' : ''}"
         onclick="openMeetingDetail('${m.id}')"
         role="button" tabindex="0"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMeetingDetail('${m.id}')}"
         ${peek ? `data-peek="${esc(peek)}"` : ''}>
      <div class="meeting-list-datebox">
        <span class="meeting-list-datebox-day">${day}</span>
        <span class="meeting-list-datebox-weekday">${weekday ? esc(weekday) : '--'}</span>
      </div>
      <div class="meeting-list-main">
        <div class="meeting-list-head">
          <span class="meeting-list-type">${meetingFormatLabel(m)}</span>
          <span class="meeting-list-title">${meetingDisplayTitle(m)}</span>
          ${(openTodos || counts.done) ? `<span class="meeting-list-followups">
            ${openTodos ? `<span class="badge badge-todo">${openTodos}</span>` : ''}
            ${counts.done ? `<span class="badge badge-done">${counts.done}</span>` : ''}
          </span>` : ''}
        </div>
        <div class="meeting-list-meta">
          ${person && m.type !== 'oneOnOne' ? `<span class="meeting-list-person">@${esc(person.name)}</span>` : ''}
          ${participants.length && !person && teamMeeting ? `<span class="meeting-list-count">${participants.length}p</span>` : ''}
        </div>
        ${excerpt ? `<div class="meeting-list-excerpt">${esc(excerpt)}</div>` : ''}
      </div>
    </div>
  `;
}

function renderMeetingListGroup(label, meetings, selectedId, query = '') {
  if (!meetings.length) return '';
  return `
    <div class="meeting-list-group">
      <div class="meeting-list-group-label">${label} <span class="meeting-list-group-count">${meetings.length}</span></div>
      ${meetings.map(m => renderMeetingListRow(m, m.id === selectedId, query)).join('')}
    </div>
  `;
}

// Zugeklappte Monate der Vergangenheit. Bewusst modulweit statt in viewState:
// der Zustand soll einen Ausflug in eine andere View ueberleben.
const expandedPastMonths = new Set();
let seededSelectionId = null;

function togglePastMonth(key) {
  const sidebar = document.querySelector('.meetings-sidebar');
  const scrollTop = sidebar ? sidebar.scrollTop : 0;
  if (expandedPastMonths.has(key)) expandedPastMonths.delete(key);
  else expandedPastMonths.add(key);
  render();
  const renderedSidebar = document.querySelector('.meetings-sidebar');
  if (renderedSidebar) renderedSidebar.scrollTop = scrollTop;
}

function renderUpcomingMeetingRows(meetings, selectedId, query, today) {
  let lastMonth = '';
  return meetings.map(m => {
    const key = meetingMonthKey(m);
    const divider = key === lastMonth ? '' : `<div class="meeting-list-month">${meetingMonthLabel(key)}</div>`;
    lastMonth = key;
    return divider + renderMeetingListRow(m, m.id === selectedId, query, m.date === today);
  }).join('');
}

function renderPastMeetingGroup(key, meetings, selectedId, query, open) {
  return `
    <div class="meeting-list-group">
      <button class="meeting-list-group-label meeting-list-group-toggle ${open ? 'is-open' : ''}"
        onclick="togglePastMonth('${key}')" aria-expanded="${open ? 'true' : 'false'}">
        <span class="meeting-list-group-toggle-label">
          <span class="meeting-list-group-caret" aria-hidden="true">${open ? '&#9662;' : '&#9656;'}</span>
          ${meetingMonthLabel(key)}
        </span>
        <span class="meeting-list-group-count">${meetings.length}</span>
      </button>
      ${open ? meetings.map(m => renderMeetingListRow(m, m.id === selectedId, query)).join('') : ''}
    </div>
  `;
}

// Rechte Spalte ohne Auswahl. Statt eines leeren Kastens die naechsten Termine
// als Sprungziele — damit bleibt das Layout stehen und der erste Klick ist kurz.
function renderMeetingsDetailPlaceholder(upcoming) {
  const next = upcoming.slice(0, 4);
  return `
    <div class="meetings-empty-panel">
      <div class="meetings-empty-title">Kein Meeting ausgewählt</div>
      <div class="meetings-empty-sub">links wählen &mdash; oder direkt weiter:</div>
      <div class="meetings-empty-quickcards">
        ${next.map(m => `
          <button class="meetings-empty-card" onclick="openMeetingDetail('${m.id}')">
            <span class="meetings-empty-card-label">${meetingFormatLabel(m)}</span>
            <span class="meetings-empty-card-title">${meetingDisplayTitle(m)}</span>
            <span class="meetings-empty-card-date">${meetingRelativeDate(m.date)}</span>
          </button>
        `).join('')}
        <button class="meetings-empty-card meetings-empty-card-new" onclick="openTodayStandup()">
          <span class="meetings-empty-card-label">neu</span>
          <span class="meetings-empty-card-title">+ Standup</span>
          <span class="meetings-empty-card-date">Datum wählen, alle Anwesenden</span>
        </button>
        <button class="meetings-empty-card meetings-empty-card-new" onclick="openMeetingForm('meeting')">
          <span class="meetings-empty-card-label">neu</span>
          <span class="meetings-empty-card-title">+ Meeting</span>
          <span class="meetings-empty-card-date">ad hoc erfassen</span>
        </button>
        <button class="meetings-empty-card meetings-empty-card-new" onclick="openMeetingForm('oneOnOne')">
          <span class="meetings-empty-card-label">neu</span>
          <span class="meetings-empty-card-title">+ 1:1</span>
          <span class="meetings-empty-card-date">mit einer Person</span>
        </button>
      </div>
    </div>
  `;
}

function renderMeetings() {
  const filter = viewState.meetingFilter || 'all';
  const range = viewState.meetingRange || 'all';
  const rawQuery = viewState.meetingQuery || '';
  const query = rawQuery.trim().toLocaleLowerCase('de-AT');
  const today = todayStr();

  let meetings = [...data.meetings];
  if (filter === 'oneOnOne') meetings = meetings.filter(m => m.type === 'oneOnOne');
  else if (filter === 'team') meetings = meetings.filter(m => isTeamMeeting(m));
  else if (filter === 'other') meetings = meetings.filter(m => m.type !== 'oneOnOne' && !isTeamMeeting(m));
  if (range !== 'all') meetings = meetings.filter(m => meetingMatchesRange(m, range, today));
  if (query) meetings = meetings.filter(m => meetingMatchesQuery(m, query));

  const groups = groupMeetingsByTimeline(meetings, today);
  const ordered = flattenMeetingGroups(groups);

  const selectedId = currentView === 'meetings:detail' && ordered.some(m => m.id === viewState.meetingId)
    ? viewState.meetingId
    : null;
  const selected = selectedId ? data.meetings.find(m => m.id === selectedId) : null;

  const totalCount = data.meetings.length;
  const oneOnOneCount = data.meetings.filter(m => m.type === 'oneOnOne').length;
  const teamCount = data.meetings.filter(m => isTeamMeeting(m)).length;
  const openFollowupCount = data.meetings.filter(meetingHasOpenFollowups).length;
  const pastKeys = pastMonthKeys(groups);
  const pastCount = pastKeys.reduce((sum, key) => sum + groups.vergangen[key].length, 0);
  // Historie ist standardmaessig zu. Sie geht auf, wenn man sie ausdruecklich
  // sucht (Suchbegriff, Range-Tab) oder das offene Meeting drin liegt.
  const pastAlwaysOpen = !!query || range === 'past';
  // Ein ausgewaehltes Meeting klappt seinen Monat auf — aber nur einmal beim
  // Wechsel der Auswahl, sonst liesse er sich danach nicht mehr zuklappen.
  if (selectedId && seededSelectionId !== selectedId) {
    seededSelectionId = selectedId;
    pastKeys.forEach(key => {
      if (groups.vergangen[key].some(m => m.id === selectedId)) expandedPastMonths.add(key);
    });
  }
  const isPastMonthOpen = key => pastAlwaysOpen || expandedPastMonths.has(key);
  const meetingListContent = `
    <div class="meetings-sidebar-controls">
      <div class="meetings-sidebar-head">
        <div class="meetings-result-line">
          <span>${ordered.length}</span>
          <strong>/ ${totalCount}</strong>
          <em>${query ? 'treffer' : 'sichtbar'}</em>
        </div>
        <div class="meetings-sidebar-stats">
          <span>${oneOnOneCount} 1:1</span>
          <span>${teamCount} team</span>
          <span>${openFollowupCount} offen</span>
        </div>
      </div>
      <div class="meeting-range-tabs">
        <button class="${range === 'all' ? 'active' : ''}" onclick="setMeetingRangeFilter('all')">alle</button>
        <button class="${range === 'upcoming' ? 'active' : ''}" onclick="setMeetingRangeFilter('upcoming')">kommend</button>
        <button class="${range === 'past' ? 'active' : ''}" onclick="setMeetingRangeFilter('past')">historie</button>
        <button class="${range === 'open' ? 'active' : ''}" onclick="setMeetingRangeFilter('open')">offen</button>
        <button class="${range === 'undated' ? 'active' : ''}" onclick="setMeetingRangeFilter('undated')">ohne datum</button>
      </div>
    </div>
    ${ordered.length ? `
      ${renderUpcomingMeetingRows(groups.kommend, selectedId, query, today)}
      ${renderMeetingListGroup('ohne datum', groups.ohneDatum, selectedId, query)}
      ${pastCount ? `
        <div class="meeting-list-divider">historie <span>${pastCount}</span></div>
        ${pastKeys.map(key => renderPastMeetingGroup(key, groups.vergangen[key], selectedId, query, isPastMonthOpen(key))).join('')}
      ` : ''}
    ` : `<div class="meetings-sidebar-empty">${query ? 'keine treffer' : 'keine meetings'}</div>`}
  `;

  return `
    <div class="section-header meetings-toolbar">
      <div class="filters">
        <button class="filter-btn ${filter === 'all' ? 'active' : ''}" onclick="setMeetingTypeFilter('all')">alle</button>
        <button class="filter-btn ${filter === 'oneOnOne' ? 'active' : ''}" onclick="setMeetingTypeFilter('oneOnOne')">1:1s</button>
        <button class="filter-btn ${filter === 'team' ? 'active' : ''}" onclick="setMeetingTypeFilter('team')">team</button>
        <button class="filter-btn ${filter === 'other' ? 'active' : ''}" onclick="setMeetingTypeFilter('other')">sonstige</button>
      </div>
      <div class="view-search">
        <input
          id="meetingSearchInput"
          type="search"
          placeholder="Meetings durchsuchen – Titel, Notizen, Prep, Personen…"
          value="${esc(rawQuery)}"
          oninput="setMeetingQuery(this.value)"
        >
      </div>
    </div>

    ${totalCount ? `
      <div class="meetings-layout">
        <aside class="meetings-sidebar card">
          ${meetingListContent}
        </aside>
        ${selected ? `
          <section class="meetings-detail-panel card">
            <div class="meetings-detail-header">
              <div class="meetings-detail-title-row">
                <span class="section-title">${meetingDisplayTitle(selected)}</span>
                <button class="meetings-detail-date" title="Datum ändern" onclick="openScheduleMeetingDate('${selected.id}')">${selected.date ? meetingRelativeDate(selected.date) : 'ohne Datum'}</button>
              </div>
              <div class="meetings-detail-actions">
                ${selected.personId ? `<button class="btn btn-secondary btn-sm" onclick="openPersonById('${selected.personId}')">@${esc(personName(selected.personId))}</button>` : ''}
                ${selected.type !== 'oneOnOne' ? renderMeetingFormatPicker(`setMeetingFormat('${selected.id}','%')`, meetingFormat(selected)) : ''}
                ${selected.type !== 'oneOnOne' ? `<button class="btn btn-secondary btn-sm" onclick="openMeetingTitleForm('${selected.id}')">Titel bearbeiten</button>` : ''}
                ${selected.type === 'oneOnOne' && !selected.date ? `<button class="btn btn-secondary btn-sm" onclick="openScheduleMeetingDate('${selected.id}')">Einplanen</button>` : ''}
                <button class="btn btn-primary btn-sm" onclick="openMeetingFollowUp('${selected.id}')">+ Follow-up</button>
                <button class="btn btn-secondary btn-sm" onclick="exportMeeting('${selected.id}')">Export .md</button>
                <button class="btn btn-secondary btn-sm" onclick="deleteMeeting('${selected.id}')">Löschen</button>
              </div>
            </div>
            ${renderMeetingDetailBody(selected)}
          </section>
        ` : `
          <section class="meetings-detail-panel card">
            ${renderMeetingsDetailPlaceholder(groups.kommend)}
          </section>
        `}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-state-icon">&#128197;</div>
        <div class="empty-state-text">Noch keine Meetings</div>
      </div>
    `}
  `;
}

function setMeetingTypeFilter(value) {
  viewState.meetingFilter = value;
  render();
}

// ============================================================
// MEETING DETAIL
// ============================================================
function renderMeetingDetail() {
  const m = data.meetings.find(m => m.id === viewState.meetingId);
  if (!m) return '<div>Meeting nicht gefunden</div>';
  return `
    <button class="back-btn" onclick="navigate('meetings')">&#8592; Zurück</button>

    <div class="section-header">
      <span class="section-title">${meetingDisplayTitle(m)}</span>
      <div style="display:flex;gap:8px">
        ${m.personId ? `<button class="btn btn-secondary btn-sm" onclick="openPersonById('${m.personId}')">@${esc(personName(m.personId))}</button>` : ''}
        ${m.type !== 'oneOnOne' ? renderMeetingFormatPicker(`setMeetingFormat('${m.id}','%')`, meetingFormat(m)) : ''}
        ${m.type !== 'oneOnOne' ? `<button class="btn btn-secondary btn-sm" onclick="openMeetingTitleForm('${m.id}')">Titel bearbeiten</button>` : ''}
        <button class="btn btn-primary btn-sm" onclick="openMeetingFollowUp('${m.id}')">+ Follow-up</button>
        <span style="color:var(--text-muted);font-size:14px;line-height:32px">${m.date ? formatDate(m.date) : 'ohne Datum'}</span>
        ${m.type === 'oneOnOne' && !m.date ? `<button class="btn btn-secondary btn-sm" onclick="openScheduleMeetingDate('${m.id}')">Einplanen</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="exportMeeting('${m.id}')">Export .md</button>
        <button class="btn btn-secondary btn-sm" onclick="deleteMeeting('${m.id}')">Löschen</button>
      </div>
    </div>
    ${renderMeetingDetailBody(m)}
  `;
}

function meetingStatusExpanded() {
  return viewState.meetingStatusCollapsed === false;
}

function toggleMeetingStatusSection() {
  viewState.meetingStatusCollapsed = meetingStatusExpanded() ? true : false;
  render();
}

function renderMeetingStatusSection(m) {
  if (!isTeamMeeting(m) && m.type !== 'oneOnOne') return '';
  const content = renderMeetingTeamStatus(m);
  if (!content) return '';
  const expanded = meetingStatusExpanded();
  return `
    <div class="meeting-section-card ${expanded ? 'is-expanded' : 'is-collapsed'}">
      <button class="meeting-section-toggle" onclick="toggleMeetingStatusSection()" aria-expanded="${expanded ? 'true' : 'false'}">
        <span>Planung / Status</span>
        <span class="meeting-section-toggle-icon" aria-hidden="true">${expanded ? '&#8722;' : '+'}</span>
      </button>
      ${expanded ? `<div class="meeting-section-content">${content}</div>` : ''}
    </div>
  `;
}

// ============================================================
// STANDUP-RUNDE
// ============================================================
// Im Standup sagt jeder, woran er sitzt und wo es haengt. Woran jemand sitzt,
// weiss die App schon (Planung + Jira) — getippt wird nur der Stand. Der
// landet am Block, nicht am Termin: dann steht er in der Planung und beim
// naechsten Standup wieder da. Was an keinem Auftrag haengt ("krank",
// "wartet auf VPN"), bleibt als Notiz pro Person am Meeting.
function standupBlocksFor(personId, meeting) {
  const date = meeting.date || todayStr();
  return (data.blocks || [])
    .filter(b => b.personId === personId && !isAbsenceBlock(b) && !isBlockParked(b))
    .map(blockView)
    .filter(b => b.state !== 'done' && (
      (b.start <= date && b.end >= date)
      || isBlockBlocked(b)
      || blockUpdates(b).some(u => u.meetingId === meeting.id)))
    .sort((a, b) => (isBlockBlocked(b) - isBlockBlocked(a))
      || (b.overrun - a.overrun)
      || (a.state === 'waiting') - (b.state === 'waiting')
      || a.end.localeCompare(b.end));
}

function standupPersonNote(meeting, personId) {
  return (meeting.standup && meeting.standup[personId]) || '';
}

function renderStandupBlock(meeting, b) {
  const key = blockAuftragKey(b);
  const previous = blockLatestUpdate(b, meeting.id);
  const own = blockUpdates(b).filter(u => u.meetingId === meeting.id);
  const waiting = b.state === 'waiting' ? String(blockOpenTickets(b)[0]?.status || 'wartet') : '';
  const chips = [
    isBlockBlocked(b) ? `<span class="standup-chip standup-chip-blocked">${esc(blockBlockedLabel(b))}</span>` : '',
    b.overrun ? `<span class="standup-chip standup-chip-overrun">über seit ${formatDateShort(b.plannedEnd)}</span>` : '',
    waiting ? `<span class="standup-chip">${esc(waiting.toLowerCase())}</span>` : '',
    !b.overrun && !waiting ? `<span class="standup-chip standup-chip-muted">bis ${formatDateShort(b.end)}</span>` : '',
  ].join('');
  return `
    <div class="standup-block ${isBlockBlocked(b) ? 'is-blocked' : ''}">
      <div class="standup-block-head">
        <button class="standup-block-title" type="button" onclick="openBlockForm('${b.id}')" title="Block öffnen">${esc(blockDisplayLabel(b))}</button>
        ${key ? jiraKeyLink(key) : ''}
        ${chips}
      </div>
      ${previous ? `<div class="standup-previous">zuletzt ${formatDateShort(previous.date)}: ${esc(previous.text)}</div>` : ''}
      ${own.map(u => `
        <div class="standup-own">
          <span>${esc(u.text)}</span>
          <button class="standup-icon-btn" type="button" title="Als Follow-up übernehmen" onclick="standupFollowUp('${meeting.id}','${b.personId}','${esc(key)}','${u.id}','${b.id}')">→ follow-up</button>
          <button class="standup-icon-btn" type="button" title="Update löschen" onclick="removeBlockUpdate('${b.id}','${u.id}')">&#x2715;</button>
        </div>`).join('')}
      <div class="standup-input-row">
        <input class="form-input standup-input" id="su-${meeting.id}-${b.id}" type="text" autocomplete="off"
          placeholder="Stand / hängt an … (Enter speichert, springt weiter)"
          onkeydown="onStandupKey(event,'${meeting.id}','block','${b.id}')">
        <button class="btn btn-sm ${isBlockBlocked(b) ? 'btn-danger' : 'btn-secondary'}" type="button"
          onclick="setBlockBlocked('${b.id}', ${!isBlockBlocked(b)}, '${meeting.date || todayStr()}')"
          title="${isBlockBlocked(b) ? 'Blocker gelöst' : 'Als blockiert markieren'}">${isBlockBlocked(b) ? 'gelöst' : 'blockiert'}</button>
      </div>
    </div>`;
}

function renderStandupRound(m) {
  if (!isStandupMeeting(m)) return '';
  const date = m.date || todayStr();
  const people = meetingParticipants(m).filter(p => p.type !== 'kontakt');
  if (!people.length) {
    return `<div class="meeting-detail-section meeting-detail-section-emphasis standup-round">
      <h3>Runde</h3><div class="oneonone-carryover-empty">Teilnehmer wählen, dann erscheint hier die Runde.</div></div>`;
  }
  const rows = people.map(person => {
    const absence = personAbsenceOnDate(person.id, date);
    const blocks = absence ? [] : standupBlocksFor(person.id, m);
    const unplanned = absence ? [] : (jiraUnplannedAuftraege(person) || []);
    const note = standupPersonNote(m, person.id);
    return `
      <div class="standup-person ${absence ? 'is-absent' : ''}">
        <div class="standup-person-head">
          ${personAvatar(person, 'sm')}
          <strong>${esc(person.name)}</strong>
          ${absence
            ? `<span class="standup-chip standup-chip-muted">${esc((absence.label || 'abwesend').toLowerCase())} bis ${formatDateShort(absence.end)}</span>`
            : `<span class="standup-chip standup-chip-muted">${esc(freeFromLabel(personFreeFrom(person.id)))}</span>`}
        </div>
        ${absence ? '' : `
          <div class="standup-person-body">
            ${blocks.map(b => renderStandupBlock(m, b)).join('') || '<div class="standup-previous">Nichts geplant für diesen Tag.</div>'}
            ${unplanned.length ? `<div class="standup-unplanned">ohne Block: ${unplanned.map(a => `
              <span class="standup-unplanned-item">${jiraKeyLink(a.key)} ${esc(a.summary)}
                <button class="standup-icon-btn" type="button" title="Hinten anstellen, 1 Woche" onclick="planAuftrag('${person.id}','${esc(a.key)}',1)">+1 W</button></span>`).join('')}</div>` : ''}
            <div class="standup-input-row">
              <input class="form-input standup-input standup-input-person" id="su-${m.id}-p-${person.id}" type="text" autocomplete="off"
                value="${esc(note)}" placeholder="Sonstiges (ohne Ticket) …"
                onchange="setStandupPersonNote('${m.id}','${person.id}',this.value)"
                onkeydown="onStandupKey(event,'${m.id}','person','${person.id}')">
            </div>
          </div>`}
      </div>`;
  }).join('');
  const blockedCount = people.reduce((n, p) => n + standupBlocksFor(p.id, m).filter(isBlockBlocked).length, 0);
  return `
    <div class="meeting-detail-section meeting-detail-section-emphasis standup-round">
      <h3>Runde <span class="oneonone-carryover-count">${people.length} Personen${blockedCount ? ` · ${blockedCount} blockiert` : ''} · Stand ${esc(jiraSyncAgeLabel() || 'ohne Jira')}</span></h3>
      ${rows}
    </div>`;
}

function setStandupPersonNote(meetingId, personId, value) {
  const m = data.meetings.find(x => x.id === meetingId);
  if (!m) return;
  const next = { ...(m.standup || {}) };
  const clean = String(value || '').trim();
  if (clean) next[personId] = clean;
  else delete next[personId];
  m.standup = next;
  saveData(data);
}

// Enter speichert und springt ins naechste Feld — die Runde laeuft so ohne
// Maus durch. Weil render() das DOM neu baut, wird der Fokus ueber die id
// wiederhergestellt.
function onStandupKey(event, meetingId, kind, id) {
  if (event.key !== 'Enter' || event.isComposing) return;
  event.preventDefault();
  const inputs = Array.from(document.querySelectorAll('.standup-input'));
  const next = inputs[inputs.indexOf(event.target) + 1];
  const nextId = next ? next.id : '';
  if (kind === 'block') {
    const m = data.meetings.find(x => x.id === meetingId);
    if (addBlockUpdate(id, event.target.value, meetingId, (m && m.date) || todayStr())) render();
  } else {
    setStandupPersonNote(meetingId, id, event.target.value);
  }
  const target = nextId && document.getElementById(nextId);
  if (target) target.focus();
}

function standupFollowUp(meetingId, personId, key, updateId, blockId) {
  const meeting = data.meetings.find(entry => entry.id === meetingId);
  const block = data.blocks.find(b => b.id === blockId);
  const update = block && blockUpdates(block).find(u => u.id === updateId);
  if (!meeting || !update) return;
  openCapture({
    meetingId: meeting.id,
    personId,
    month: meeting.date ? meeting.date.slice(0, 7) : currentMonth(),
    date: meeting.date || todayStr(),
    status: 'todo',
    type: 'todo',
    text: key ? `${key}: ${update.text}` : update.text,
  });
}

function renderCarryoverSignal(item) {
  const tone = item.type === 'concern' ? 'concern' : 'highlight';
  const label = item.type === 'concern' ? 'concern' : 'win';
  return `
    <button class="oneonone-carryover-signal oneonone-carryover-signal-${tone}" onclick="openEditItem('${item.id}')">
      <span class="oneonone-carryover-date">${formatDateShort(item.date) || '&ndash;'}</span>
      <span class="badge badge-${item.type}">${label}</span>
      <span class="oneonone-carryover-text">${esc(item.text)}</span>
    </button>
  `;
}

function renderOneOnOneCarryover(m) {
  const person = m.personId ? data.persons.find(p => p.id === m.personId) : null;
  if (m.type !== 'oneOnOne' || !person) return '';
  const carryover = oneOnOneCarryover(m);
  const total = carryoverCount(carryover);
  const empty = '<div class="oneonone-carryover-empty">Nichts offen</div>';
  return `
    <details class="meeting-detail-section meeting-detail-section-emphasis oneonone-carryover" open>
      <summary class="oneonone-carryover-head">
        <h3>Übernahme</h3>
        <span class="oneonone-carryover-count">${total} Signale</span>
      </summary>
      <div class="oneonone-carryover-grid">
        <div class="oneonone-carryover-column oneonone-carryover-column-followups">
          <div class="oneonone-carryover-title">Offene Follow-ups</div>
          ${carryover.openFollowUps.length
            ? `<ul class="item-list oneonone-carryover-list">${carryover.openFollowUps.map(item => renderItem(item, false, { compact: true })).join('')}</ul>`
            : empty}
        </div>
        <div class="oneonone-carryover-column oneonone-carryover-column-todos">
          <div class="oneonone-carryover-title">Todos</div>
          ${carryover.openTodos.length
            ? `<ul class="item-list oneonone-carryover-list">${carryover.openTodos.map(item => renderItem(item, false, { compact: true })).join('')}</ul>`
            : empty}
        </div>
        <div class="oneonone-carryover-column oneonone-carryover-column-signals">
          <div class="oneonone-carryover-title">Concerns / Wins seit letztem 1:1</div>
          ${!isSudoMode()
            ? sudoLockedPlaceholder('Concerns / Wins')
            : carryover.recentSignals.length
              ? `<div class="oneonone-carryover-signals">${carryover.recentSignals.map(renderCarryoverSignal).join('')}</div>`
              : '<div class="oneonone-carryover-empty">Noch keine Signale</div>'}
        </div>
      </div>
    </details>
  `;
}

function renderSeriesCarryover(m) {
  if (!m || m.type === 'oneOnOne') return '';
  const carryover = seriesCarryover(m);
  if (!carryover.lastMeeting) return '';
  const count = carryover.openFollowUps.length;
  const label = count
    ? `${count} offen aus ${carryover.sourceCount} ${carryover.sourceCount === 1 ? 'Termin' : 'Terminen'}`
    : 'nichts offen';
  return `
    <details class="meeting-detail-section meeting-detail-section-emphasis oneonone-carryover" ${count ? 'open' : ''}>
      <summary class="oneonone-carryover-head">
        <h3>Übernahme</h3>
        <span class="oneonone-carryover-count">${label}</span>
      </summary>
      <div class="oneonone-carryover-grid oneonone-carryover-grid-single">
        <div class="oneonone-carryover-column oneonone-carryover-column-followups">
          <div class="oneonone-carryover-title">
            Offene Follow-ups aus früheren Terminen &middot;
            <button class="prep-carryover-source" onclick="openMeetingDetail('${carryover.lastMeeting.id}')">zuletzt ${formatDate(carryover.lastMeeting.date)}</button>
          </div>
          ${count
            ? `<ul class="item-list oneonone-carryover-list">${carryover.openFollowUps.map(item => renderItem(item, false, { compact: true })).join('')}</ul>`
            : '<div class="oneonone-carryover-empty">Nichts offen</div>'}
        </div>
      </div>
    </details>
  `;
}

function renderMeetingDetailBody(m) {
  const linkedItems = meetingItems(m.id);
  const person = m.personId ? data.persons.find(p => p.id === m.personId) : null;
  const participants = meetingParticipants(m);
  const teamMeeting = isTeamMeeting(m);
  const participantCard = !teamMeeting ? '' : `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Teilnehmer (${participants.length})</span>
      </div>
      <div class="participant-list">
        ${data.persons
          .filter(person => person.type !== 'kontakt')
          .slice()
          .sort(comparePersonsByName)
          .map(member => {
          const active = meetingParticipantIds(m).includes(member.id);
          const locked = m.type === 'oneOnOne' && m.personId === member.id;
          return `
            <button class="participant-pill ${active ? 'active' : ''}" onclick="toggleMeetingParticipant('${m.id}', '${member.id}')" ${locked ? 'disabled' : ''}>
              ${personAvatar(member, 'sm')}
              <span>${esc(member.name)}</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
  return `
    ${renderMeetingInsights(m)}

    ${participantCard}

    ${renderStandupRound(m)}

    ${renderMeetingStatusSection(m)}

    ${renderOneOnOneCarryover(m)}

    ${renderSeriesCarryover(m)}

    <div class="meeting-detail-section meeting-detail-section-emphasis">
      <h3>Vorbereitung</h3>
      ${renderPrepCarryovers(m)}
      <div id="prepBullets" class="prep-bullets">${renderPrepBullets(m.id)}</div>
      <button class="btn btn-sm btn-secondary" onclick="addPrepBullet('${m.id}')">+ punkt</button>
    </div>

    <div class="meeting-detail-section meeting-detail-section-emphasis">
      <h3>Mitschrift</h3>
      <textarea class="form-textarea" style="min-height:400px" placeholder="Notizen..."
        onchange="updateMeetingField('${m.id}','notes',this.value)">${esc(m.notes || '')}</textarea>
    </div>

    <div class="card meeting-detail-section-emphasis">
      <div class="card-header">
        <span class="card-title">Follow-ups (${linkedItems.length})</span>
        <button class="btn btn-sm btn-secondary" onclick="openMeetingFollowUp('${m.id}')">+ Follow-up</button>
      </div>
      ${linkedItems.length ? `<ul class="item-list">${linkedItems.map(item => renderItem(item)).join('')}</ul>` : '<div style="color:var(--text-muted);font-size:14px">Noch keine Follow-ups</div>'}
    </div>
  `;
}

function openMeetingFollowUp(meetingId) {
  const meeting = data.meetings.find(entry => entry.id === meetingId);
  if (!meeting) return;
  openCapture({
    meetingId: meeting.id,
    personId: meeting.personId || null,
    month: meeting.date ? meeting.date.slice(0, 7) : currentMonth(),
    date: meeting.date || todayStr(),
    status: 'todo',
    type: 'todo',
  });
}

function updateMeetingField(id, field, value) {
  const m = data.meetings.find(m => m.id === id);
  if (m) { m[field] = value; saveData(data); }
}

function openMeetingTitleForm(id) {
  const meeting = data.meetings.find(m => m.id === id);
  if (!meeting || meeting.type === 'oneOnOne') return;
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Meeting-Titel bearbeiten</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Titel</label>
        <input
          class="form-input"
          id="editMeetingTitle"
          value="${esc(meeting.title || '')}"
          placeholder="z.B. Standup, TK-Meeting, Retro..."
          autofocus
          onkeydown="if(event.key==='Enter'){saveMeetingTitle('${meeting.id}')}"
        >
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="saveMeetingTitle('${meeting.id}')">Speichern</button>
    </div>
  `;
  openOverlay();
  setTimeout(() => {
    const input = document.getElementById('editMeetingTitle');
    input?.focus();
    input?.select();
  }, 100);
}

function saveMeetingTitle(id) {
  const meeting = data.meetings.find(m => m.id === id);
  if (!meeting || meeting.type === 'oneOnOne') return;
  const title = document.getElementById('editMeetingTitle')?.value.trim();
  if (!title) { toast('Titel nötig'); return; }
  meeting.title = title;
  saveData(data);
  closeOverlay();
  toast('Titel aktualisiert');
  render();
}

function openScheduleMeetingDate(id) {
  const meeting = data.meetings.find(m => m.id === id);
  if (!meeting) return;
  const isReschedule = !!meeting.date;
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">${isReschedule ? 'Datum ändern' : (meeting.type === 'oneOnOne' ? '1:1 einplanen' : 'Meeting einplanen')}</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Datum</label>
        <input type="date" class="form-input" id="scheduleMeetingDate" value="${meeting.date || todayStr()}" autofocus
          onkeydown="if(event.key==='Enter'){saveScheduledMeetingDate('${meeting.id}')}">
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="saveScheduledMeetingDate('${meeting.id}')">${isReschedule ? 'Speichern' : 'Einplanen'}</button>
    </div>
  `;
  openOverlay();
  setTimeout(() => document.getElementById('scheduleMeetingDate')?.focus(), 100);
}

function saveScheduledMeetingDate(id) {
  const meeting = data.meetings.find(m => m.id === id);
  const date = document.getElementById('scheduleMeetingDate')?.value || '';
  if (!meeting) return;
  if (!date) { toast('Datum nötig'); return; }
  const wasScheduled = !!meeting.date;
  meeting.date = date;
  saveData(data);
  closeOverlay();
  toast(wasScheduled ? 'Datum aktualisiert' : (meeting.type === 'oneOnOne' ? '1:1 eingeplant' : 'Meeting eingeplant'));
  render();
}

function toggleMeetingParticipant(meetingId, personId) {
  const meeting = data.meetings.find(entry => entry.id === meetingId);
  if (!meeting) return;
  if (meeting.type === 'oneOnOne' && meeting.personId === personId) return;
  const participants = meetingParticipantIds(meeting).filter(id => id !== meeting.personId);
  const next = participants.includes(personId)
    ? participants.filter(id => id !== personId)
    : [...participants, personId];
  meeting.participants = next;
  saveData(data);
  render();
}

function setMeetingFormat(meetingId, format) {
  const meeting = data.meetings.find(entry => entry.id === meetingId);
  if (!meeting || meeting.type === 'oneOnOne') return;
  meeting.isTeamMeeting = format !== 'meeting';
  meeting.isStandup = format === 'standup';
  if (format === 'meeting') meeting.participants = [];
  else if (format === 'standup' && !meetingParticipantIds(meeting).length) {
    meeting.participants = defaultStandupParticipants(meeting.date);
  }
  saveData(data);
  render();
}

// Der Standup kommt jeden Tag: ein Klick, und er ist offen — gibt es fuer
// heute schon einen, wird der geoeffnet statt ein zweiter angelegt. Der Titel
// kommt vom letzten Standup, damit die Serie (Uebernahme) zusammenhaengt.
// "+ Standup" fragt kurz nach dem Tag (vorbelegt mit heute, Enter reicht) —
// so laesst sich auch ein vergessener oder kommender Standup anlegen.
function openTodayStandup() {
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Standup</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body" onkeydown="if(event.key==='Enter'){event.preventDefault();confirmStandupDate()}">
      <div class="form-group">
        <label class="form-label">Datum</label>
        <input type="date" class="form-input" id="standupDate" value="${todayStr()}">
        <div class="form-hint">Gibt es an dem Tag schon einen Standup, wird der geöffnet.</div>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="confirmStandupDate()">Öffnen</button>
    </div>
  `;
  openOverlay();
  setTimeout(() => document.getElementById('standupDate')?.focus(), 100);
}

function confirmStandupDate() {
  const date = document.getElementById('standupDate')?.value;
  if (!date) {
    toast('Datum wählen');
    return;
  }
  closeOverlay();
  openStandupOn(date);
}

function openStandupOn(date) {
  const existing = data.meetings.find(m => m.date === date && isStandupMeeting(m));
  if (existing) { navigate('meetings:detail', { meetingId: existing.id }); return; }
  const last = data.meetings
    .filter(m => isStandupMeeting(m) && m.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const meeting = {
    id: uid(),
    type: 'meeting',
    isTeamMeeting: true,
    isStandup: true,
    title: (last && last.title) || 'Standup',
    date,
    personId: null,
    participants: defaultStandupParticipants(date),
    prep: '',
    notes: '',
  };
  data.meetings.push(meeting);
  saveData(data);
  navigate('meetings:detail', { meetingId: meeting.id });
}

// ---- Prep bullet editor ----
let draggedPrepBulletIndex = null;

function autoResizePrepBullet(el) {
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 2) + 'px';
}

function renderPrepBulletList(meetingId, bullets) {
  if (!bullets.length) return `<div class="prep-empty">Noch keine Punkte</div>`;
  return bullets.map((b, idx) => `
    <div class="prep-bullet ${b.done ? 'prep-bullet-done' : ''}" data-prep-index="${idx}"
      ondragover="prepBulletDragOver(event)" ondragleave="prepBulletDragLeave(event)"
      ondrop="dropPrepBullet(event, '${meetingId}', ${idx})">
      <button class="prep-bullet-drag" draggable="true"
        title="Ziehen zum Verschieben · Alt+Pfeiltasten"
        aria-label="Punkt ${idx + 1} verschieben"
        ondragstart="startPrepBulletDrag(event, ${idx})"
        ondragend="endPrepBulletDrag(event)"
        onkeydown="prepBulletMoveKey(event, '${meetingId}', ${idx})">&#8942;&#8942;</button>
      <input type="checkbox" ${b.done ? 'checked' : ''} onchange="togglePrepBullet('${meetingId}', ${idx})">
      <textarea class="prep-bullet-input" rows="1"
        placeholder="Gedanke, Frage, Info... (Shift+Enter für Zeilenumbruch)"
        oninput="autoResizePrepBullet(this)"
        onchange="editPrepBullet('${meetingId}', ${idx}, this.value)"
        onkeydown="prepBulletKey(event, '${meetingId}', ${idx})">${esc(b.text)}</textarea>
      <button class="prep-bullet-delete" onclick="deletePrepBullet('${meetingId}', ${idx})" title="Löschen">&#x2715;</button>
    </div>
  `).join('');
}

function renderPrepCarryovers(meeting) {
  const carryovers = openPrepCarryovers(meeting);
  if (!carryovers.length) return '';
  return `
    <div class="prep-carryover">
      <div class="prep-carryover-head">offen aus früheren meetings <span>${carryovers.length}</span></div>
      ${carryovers.map(item => `
        <div class="prep-carryover-row">
          <input type="checkbox" onchange="toggleCarriedPrepBullet('${item.sourceMeeting.id}', ${item.index})">
          <span class="prep-carryover-text">${esc(item.text)}</span>
          <button class="prep-carryover-source" onclick="openMeetingDetail('${item.sourceMeeting.id}')">${formatDate(item.sourceMeeting.date)}</button>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPrepBullets(meetingId) {
  const m = data.meetings.find(x => x.id === meetingId);
  return renderPrepBulletList(meetingId, m ? parsePrepBullets(m.prep) : []);
}

function readPrepBulletsFromDOM() {
  const section = document.getElementById('prepBullets');
  if (!section) return [];
  const rows = section.querySelectorAll('.prep-bullet');
  return Array.from(rows).map(row => ({
    text: row.querySelector('.prep-bullet-input').value,
    done: row.querySelector('input[type=checkbox]').checked,
  }));
}

function commitPrepBullets(meetingId, bullets) {
  const m = data.meetings.find(x => x.id === meetingId);
  if (!m) return;
  m.prep = serializePrepBullets(bullets);
  saveData(data);
}

function toggleCarriedPrepBullet(sourceMeetingId, idx) {
  const source = data.meetings.find(meeting => meeting.id === sourceMeetingId);
  if (!source) return;
  const bullets = parsePrepBullets(source.prep);
  if (!bullets[idx]) return;
  bullets[idx].done = !bullets[idx].done;
  source.prep = serializePrepBullets(bullets);
  saveData(data);
  render();
}

function startPrepBulletDrag(event, idx) {
  draggedPrepBulletIndex = idx;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(idx));
  event.currentTarget.closest('.prep-bullet')?.classList.add('prep-bullet-dragging');
}

function endPrepBulletDrag() {
  draggedPrepBulletIndex = null;
  document.querySelectorAll('.prep-bullet').forEach(row => row.classList.remove('prep-bullet-dragging', 'prep-bullet-drop-before', 'prep-bullet-drop-after'));
}

function prepBulletDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const row = event.currentTarget;
  const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
  row.classList.toggle('prep-bullet-drop-before', !after);
  row.classList.toggle('prep-bullet-drop-after', after);
}

function prepBulletDragLeave(event) {
  event.currentTarget.classList.remove('prep-bullet-drop-before', 'prep-bullet-drop-after');
}

function movePrepBullet(meetingId, fromIdx, toIdx) {
  const bullets = readPrepBulletsFromDOM();
  if (!bullets[fromIdx] || fromIdx === toIdx) return;
  const [moved] = bullets.splice(fromIdx, 1);
  bullets.splice(toIdx, 0, moved);
  commitPrepBullets(meetingId, bullets);
  renderPrepBulletsWith(meetingId, bullets, toIdx);
}

function dropPrepBullet(event, meetingId, targetIdx) {
  event.preventDefault();
  const fromIdx = Number(event.dataTransfer.getData('text/plain') || draggedPrepBulletIndex);
  const after = event.clientY > event.currentTarget.getBoundingClientRect().top + event.currentTarget.offsetHeight / 2;
  let toIdx = targetIdx + (after ? 1 : 0);
  if (fromIdx < toIdx) toIdx--;
  movePrepBullet(meetingId, fromIdx, toIdx);
  endPrepBulletDrag();
}

function prepBulletMoveKey(event, meetingId, idx) {
  if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const target = idx + (event.key === 'ArrowUp' ? -1 : 1);
  const bullets = readPrepBulletsFromDOM();
  if (target < 0 || target >= bullets.length) return;
  movePrepBullet(meetingId, idx, target);
}

function renderPrepBulletsWith(meetingId, bullets, focusIdx) {
  const section = document.getElementById('prepBullets');
  if (!section) return;
  section.innerHTML = renderPrepBulletList(meetingId, bullets);
  section.querySelectorAll('.prep-bullet-input').forEach(autoResizePrepBullet);
  if (focusIdx !== undefined && focusIdx !== null) {
    const inputs = section.querySelectorAll('.prep-bullet-input');
    const target = inputs[focusIdx];
    if (target) {
      target.focus();
      const v = target.value;
      target.setSelectionRange(v.length, v.length);
    }
  }
}

function togglePrepBullet(meetingId, idx) {
  const bullets = readPrepBulletsFromDOM();
  if (!bullets[idx]) return;
  commitPrepBullets(meetingId, bullets);
  renderPrepBulletsWith(meetingId, bullets);
}

function editPrepBullet(meetingId, idx, value) {
  const bullets = readPrepBulletsFromDOM();
  if (!bullets[idx]) return;
  bullets[idx].text = value;
  commitPrepBullets(meetingId, bullets);
}

function deletePrepBullet(meetingId, idx) {
  const bullets = readPrepBulletsFromDOM();
  bullets.splice(idx, 1);
  commitPrepBullets(meetingId, bullets);
  renderPrepBulletsWith(meetingId, bullets, Math.max(0, idx - 1));
}

function addPrepBullet(meetingId) {
  const bullets = readPrepBulletsFromDOM();
  bullets.push({ text: '', done: false });
  commitPrepBullets(meetingId, bullets);
  renderPrepBulletsWith(meetingId, bullets, bullets.length - 1);
}

function prepBulletKey(event, meetingId, idx) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    const bullets = readPrepBulletsFromDOM();
    bullets.splice(idx + 1, 0, { text: '', done: false });
    commitPrepBullets(meetingId, bullets);
    renderPrepBulletsWith(meetingId, bullets, idx + 1);
  } else if (event.key === 'Backspace' && !event.target.value) {
    event.preventDefault();
    const bullets = readPrepBulletsFromDOM();
    if (bullets.length <= 1 && !bullets[0]?.text) return;
    bullets.splice(idx, 1);
    commitPrepBullets(meetingId, bullets);
    renderPrepBulletsWith(meetingId, bullets, Math.max(0, idx - 1));
  }
}

function initPrepBulletsAutoResize() {
  const section = document.getElementById('prepBullets');
  if (!section) return;
  section.querySelectorAll('.prep-bullet-input').forEach(autoResizePrepBullet);
}

// ---- Insights ----
function renderMeetingInsights(m) {
  const today = todayStr();
  const referenceDate = m.date || today;
  const parts = [];

  const items = meetingItems(m.id);
  if (items.length) {
    const done = items.filter(i => i.status === 'done').length;
    const open = items.length - done;
    const pct = Math.round((done / items.length) * 100);
    parts.push(`<div class="insight-row"><span class="insight-label">Follow-ups</span><span class="insight-value">${done}/${items.length} erledigt (${pct}%)${open ? ` · ${open} offen` : ''}</span></div>`);
  }

  if (m.type !== 'oneOnOne' && m.title) {
    const sameTitle = data.meetings
      .filter(x => x.title === m.title && x.id !== m.id);
    if (sameTitle.length) {
      const prior = sameTitle
        .filter(x => x.date && m.date && x.date < m.date)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const total = sameTitle.length + 1;
      parts.push(`<div class="insight-row"><span class="insight-label">serie</span><span class="insight-value">${total}× insgesamt${prior ? ` · <a href="#" onclick="event.preventDefault();navigate('meetings:detail', {meetingId:'${prior.id}'})">vorheriges am ${formatDate(prior.date)}</a>` : ''}</span></div>`);
    }
  }

  if (m.type === 'oneOnOne' && m.personId) {
    const person = data.persons.find(p => p.id === m.personId);
    if (person?.pushDirection) {
      parts.push(`<div class="insight-row insight-row-push"><span class="insight-label">Push</span><span class="insight-value">${esc(person.pushDirection)}</span></div>`);
    }

    const prior = data.meetings
      .filter(x => x.type === 'oneOnOne' && x.personId === m.personId && x.id !== m.id && x.date && x.date < referenceDate)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (prior) {
      const gap = Math.round((parseISO(referenceDate) - parseISO(prior.date)) / 86400000);
      parts.push(`<div class="insight-row"><span class="insight-label">seit letztem 1:1</span><span class="insight-value">${gap} Tage · <a href="#" onclick="event.preventDefault();navigate('meetings:detail', {meetingId:'${prior.id}'})">${formatDate(prior.date)}</a></span></div>`);
    }
  }

  if (!parts.length) return '';
  return `
    <div class="meeting-detail-section">
      <h3>Insights</h3>
      <div class="insights-list">${parts.join('')}</div>
    </div>
  `;
}

const personFieldSaveTimers = {};

function updatePersonFieldDebounced(id, field, value) {
  const p = data.persons.find(p => p.id === id);
  if (!p) return;
  p[field] = value;
  const timerKey = `${id}:${field}`;
  clearTimeout(personFieldSaveTimers[timerKey]);
  personFieldSaveTimers[timerKey] = setTimeout(() => {
    saveData(data);
  }, 250);
}

// ============================================================
// REVIEWS VIEW
// ============================================================
// Bei woechentlichem Rhythmus ist "wann war das letzte 1:1" kein Signal mehr —
// die Antwort ist immer "diese Woche". Interessant ist die Gegenrichtung: steht
// das naechste schon, und was ist bis dahin liegengeblieben.
function personNextOneOnOne(personId) {
  const today = todayStr();
  return data.meetings
    .filter(meeting => meeting.type === 'oneOnOne'
      && meeting.personId === personId
      && meeting.date
      && meeting.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

// Ein angelegtes, aber noch nicht terminiertes 1:1. Zaehlt nicht als geplant,
// darf aber auch kein zweites nach sich ziehen.
function personUnscheduledOneOnOne(personId) {
  return data.meetings.find(meeting =>
    meeting.type === 'oneOnOne' && meeting.personId === personId && !meeting.date) || null;
}

// Ein Klick, egal in welchem Zustand das naechste Gespraech steckt: geplantes
// oeffnen, undatiertes einplanen, sonst gleich ein neues anlegen.
function openNextOneOnOne(personId) {
  const next = personNextOneOnOne(personId);
  if (next) { openMeetingDetail(next.id); return; }
  const draft = personUnscheduledOneOnOne(personId);
  if (draft) { openScheduleMeetingDate(draft.id); return; }
  openMeetingForm('oneOnOne', personId);
}

// ============================================================
// PUNKT FUERS 1:1
// ============================================================
// Was man nicht sofort ansprechen will (ein schlecht reviewter PR, eine
// Beobachtung), soll trotzdem nicht verloren gehen. Der Punkt landet in der
// Vorbereitung des naechsten 1:1 — gibt es keins, entsteht ein undatiertes,
// das der Teamfokus dann als "nicht terminiert" zeigt.
function oneOnOnePointTarget(personId) {
  return personNextOneOnOne(personId) || personUnscheduledOneOnOne(personId);
}

function oneOnOneOpenPrepCount(meeting) {
  return meeting ? parsePrepBullets(meeting.prep).filter(bullet => !bullet.done && bullet.text.trim()).length : 0;
}

function openOneOnOnePointForm(personId) {
  const person = data.persons.find(p => p.id === personId);
  if (!person) return;
  const target = oneOnOnePointTarget(personId);
  const where = !target
    ? 'Noch kein 1:1 geplant — es wird ein 1:1 ohne Datum angelegt.'
    : target.date
      ? `Kommt ins 1:1 am ${formatDate(target.date)} (${oneOnOneDueLabel(target.date)}).`
      : 'Kommt ins 1:1 ohne Datum — noch einplanen.';
  const open = oneOnOneOpenPrepCount(target);
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Punkt fürs 1:1 mit ${esc(person.name)}</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body" onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey||event.target.id==='oneOnOnePointLink')){event.preventDefault();saveOneOnOnePoint('${personId}')}">
      <div class="form-group">
        <label class="form-label" for="oneOnOnePointText">Was willst du ansprechen?</label>
        <textarea class="form-textarea" id="oneOnOnePointText" rows="3"
          placeholder="z.B. Review von PR #412 war sehr knapp — Erwartungen an Reviews klären"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label" for="oneOnOnePointLink">Link (optional)</label>
        <input class="form-input" id="oneOnOnePointLink" placeholder="PR, Ticket, Doku…">
      </div>
      <div class="one-on-one-point-hint">${esc(where)}${open ? ` Dort stehen schon ${open} offene ${open === 1 ? 'Punkt' : 'Punkte'}.` : ''}</div>
      <button class="btn btn-primary" style="width:100%" onclick="saveOneOnOnePoint('${personId}')">Zum 1:1 hinzufügen</button>
    </div>
  `;
  openOverlay();
  setTimeout(() => document.getElementById('oneOnOnePointText')?.focus(), 0);
}

function saveOneOnOnePoint(personId) {
  const text = document.getElementById('oneOnOnePointText').value.trim();
  if (!text) { document.getElementById('oneOnOnePointText').focus(); return; }
  const link = normalizeExternalUrl(document.getElementById('oneOnOnePointLink').value);
  let meeting = oneOnOnePointTarget(personId);
  if (!meeting) {
    meeting = {
      id: uid(), type: 'oneOnOne', title: '', date: '', personId,
      participants: [], isTeamMeeting: false, prep: '', notes: '',
    };
    data.meetings.push(meeting);
  }
  // Das Datum steht im Punkt selbst: im Gespraech zaehlt, wie frisch die
  // Beobachtung ist — Feedback nach zwei Wochen landet schwaecher.
  const line = `${text}${link ? ` — ${link}` : ''} (notiert ${formatDateShort(todayStr())})`;
  meeting.prep = serializePrepBullets([...parsePrepBullets(meeting.prep), { text: line, done: false }]);
  saveData(data);
  closeOverlay();
  toast(meeting.date ? `Punkt fürs 1:1 am ${formatDateShort(meeting.date)} notiert` : 'Punkt notiert — 1:1 noch ohne Datum');
  render();
}

function oneOnOneDueLabel(dateISO) {
  if (!dateISO) return 'ohne datum';
  const days = Math.round((parseISO(dateISO) - parseISO(todayStr())) / 86400000);
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days <= 7) {
    const weekday = new Date(`${dateISO}T12:00:00`).toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '');
    return `${weekday.toLowerCase()} · in ${days} tagen`;
  }
  return `in ${days} tagen`;
}

function personAbsenceOnDate(personId, date) {
  return data.blocks.find(block =>
    block.personId === personId &&
    block.typ === 'abwesenheit' &&
    block.start <= date &&
    block.end >= date
  ) || null;
}

// Sortierung der Karten. Bewusst nur aus dem, was die Karte selbst zeigt —
// eine unsichtbare Rangfolge waere nicht nachvollziehbar. Freie Werktage und
// Todo-Zahlen fehlen: die stehen in Planung und Todos.
// "Nichts geplant" greift erst, wenn wirklich nichts da ist: wer Montag
// anfaengt, hat einen kommenden Block und stand sonst trotzdem ganz oben,
// waehrend die Karte darunter brav "ab 03.08." anzeigte.
function teamFocusScore(entry) {
  const nothingPlanned = !entry.activeBlocks.length
    && !entry.upcomingBlocks.length;
  return (nothingPlanned && !entry.absenceToday ? 30 : 0)
    + (entry.oneOnOneMissing ? 24 : 0)
    + (entry.drift ? entry.drift.unplanned.length * 6 : 0);
}
