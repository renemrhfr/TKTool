// ============================================================
// HELPERS — dates, formatting, lookups
// ============================================================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function formatMonth(m) {
  const [y, mo] = m.split('-');
  const months = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  return months[parseInt(mo) - 1] + ' ' + y;
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateShort(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
}

function formatWeekdayShort(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '');
}

function getJiraBaseUrl() {
  try { return localStorage.getItem(JIRA_BASE_KEY) || ''; } catch { return ''; }
}

function jiraUrl(ref) {
  const base = getJiraBaseUrl().replace(/\/+$/, '');
  if (!base || !ref) return null;
  return (/\/browse$/.test(base) ? base : base + '/browse') + '/' + encodeURIComponent(ref);
}

// Ticket-Key als Chip — verlinkt, sobald eine Base-URL konfiguriert ist.
// stopPropagation, weil die Chips in klickbaren Zeilen sitzen.
function jiraKeyLink(ref) {
  const key = String(ref || '').trim();
  if (!key) return '';
  const url = jiraUrl(key);
  return url
    ? `<a class="jira-ticket-key" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(key)} in Jira öffnen" onclick="event.stopPropagation()">${esc(key)}</a>`
    : `<span class="jira-ticket-key">${esc(key)}</span>`;
}

function jiraMd(ref) {
  const url = jiraUrl(ref);
  return url ? `[${ref}](${url})` : ref;
}

// --- Status-Filter -------------------------------------------------
// Jira meldet auch Tickets, die zwar unresolved sind, aber niemanden mehr
// beschaeftigen ("Storniert", "Geschlossen"). Welche Status nicht zaehlen,
// steht als Setting-Record in der Datendatei — also fuer alle gleich, die
// denselben Datenordner nutzen, nicht pro Geraet.
function jiraStatusSetting() {
  return (data.settings || []).find(s => s.id === JIRA_STATUS_SETTING_ID) || null;
}

function normalizeStatusList(list) {
  return (Array.isArray(list) ? list : [])
    .map(s => String(s || '').trim()).filter(Boolean)
    .filter((s, i, all) => all.findIndex(o => o.toLowerCase() === s.toLowerCase()) === i)
    .sort((a, b) => a.localeCompare(b, 'de-AT'));
}

// Schreibt excluded/seen und speichert. Fehlt der Record, wird er angelegt.
function updateJiraStatusSetting(patch) {
  const current = jiraStatusSetting();
  const next = {
    id: JIRA_STATUS_SETTING_ID,
    excluded: normalizeStatusList(patch.excluded ?? (current && current.excluded)),
    seen: normalizeStatusList(patch.seen ?? (current && current.seen)),
    // Status, bei denen das Ticket nicht mehr beim Entwickler liegt (QA,
    // Review, Abnahme). Kapazitaets-Signal, kein Ausschluss.
    handover: normalizeStatusList(patch.handover ?? (current && current.handover)),
  };
  if (current) Object.assign(current, next);
  else (data.settings = data.settings || []).push(next);
  saveData(data);
}

function jiraExcludedStatuses() {
  const setting = jiraStatusSetting();
  return normalizeStatusList(setting && setting.excluded);
}

function isJiraStatusExcluded(status) {
  const name = String(status || '').trim().toLowerCase();
  if (!name) return false;
  return jiraExcludedStatuses().some(s => s.toLowerCase() === name);
}

function toggleJiraStatusExcluded(status) {
  const name = String(status || '').trim();
  if (!name) return;
  const current = jiraExcludedStatuses();
  updateJiraStatusSetting({
    excluded: isJiraStatusExcluded(name)
      ? current.filter(s => s.toLowerCase() !== name.toLowerCase())
      : current.concat(name),
  });
}

// --- Uebergabe-Status (QA/Review): Ticket laeuft, aber nicht mehr beim
// Entwickler. Fuer die Planung heisst das: fast frei, Puffer lassen, falls
// es zurueckkommt.
function jiraHandoverStatuses() {
  const setting = jiraStatusSetting();
  return normalizeStatusList(setting && setting.handover);
}

function isJiraHandoverStatus(status) {
  const name = String(status || '').trim().toLowerCase();
  if (!name) return false;
  return jiraHandoverStatuses().some(s => s.toLowerCase() === name);
}

function toggleJiraHandoverStatus(status) {
  const name = String(status || '').trim();
  if (!name) return;
  const current = jiraHandoverStatuses();
  updateJiraStatusSetting({
    handover: isJiraHandoverStatus(name)
      ? current.filter(s => s.toLowerCase() !== name.toLowerCase())
      : current.concat(name),
  });
}

// Aktueller Status des Auftrags hinter einem Block.
function jiraStatusForBlock(block) {
  if (!block || !block.jiraRef) return null;
  return jiraTicketInfo(jiraAuftragKey(block.jiraRef));
}

// Blockiert der Block noch den Entwickler? Offene Bloecke, deren Ticket in
// einem Uebergabe-Status haengt, zaehlen als "wartet woanders".
// Waiting is ticket state, independent of the planning calendar.
function jiraHandoverBlocks(personId) {
  return (data.blocks || []).filter(b => (!personId || b.personId === personId)
    && !b.done && b.typ !== 'abwesenheit' && isJiraHandoverStatus(jiraStatusForBlock(b)?.status));
}

function jiraWaitingTickets(personId = null) {
  if (!jiraSyncData) return [];
  const byKey = new Map();
  for (const person of data.persons.filter(p => p.type !== 'kontakt')) {
    for (const ticket of jiraTicketsForPerson(person) || []) {
      if (!isJiraHandoverStatus(ticket.status) || ticket.statusCategory === 'done') continue;
      const key = String(ticket.key).trim().toUpperCase();
      byKey.set(key, { ...ticket, key, personId: person.id });
    }
  }
  for (const block of jiraHandoverBlocks()) {
    const key = jiraAuftragKey(block.jiraRef);
    const state = jiraStatusForBlock(block);
    if (state.statusCategory === 'done') continue;
    const owner = state.assignee && data.persons.find(p => p.jiraAccountId === state.assignee);
    const existing = byKey.get(key);
    if (existing) { existing.blockId = existing.blockId || block.id; continue; }
    byKey.set(key, { key, summary: state.summary || block.label || key,
      status: state.status, personId: owner?.id || block.personId, blockId: block.id });
  }
  return [...byKey.values()].filter(t => !personId || t.personId === personId)
    .sort((a, b) => a.status.localeCompare(b.status, 'de') || a.key.localeCompare(b.key, 'de', { numeric: true }));
}

// Alle je gesehenen Status, damit ausgeschlossene weiterhin waehlbar bleiben —
// die kommen wegen des JQL-Filters in spaeteren Antworten nicht mehr vor.
function jiraKnownStatuses() {
  const setting = jiraStatusSetting();
  const inSnapshot = [];
  for (const list of Object.values((jiraSyncData && jiraSyncData.assignees) || {})) {
    for (const t of list || []) if (t.status) inSnapshot.push(t.status);
  }
  return normalizeStatusList([...(setting ? setting.seen || [] : []), ...jiraExcludedStatuses(), ...inSnapshot]);
}

// Beim Import gesehene Status merken — aber nur speichern, wenn wirklich ein
// neuer dabei ist, sonst schreibt jeder Sync die Datei ohne Aenderung.
function rememberJiraStatuses(names) {
  const known = jiraKnownStatuses();
  const merged = normalizeStatusList([...known, ...names]);
  if (merged.length === known.length) return;
  updateJiraStatusSetting({ seen: merged });
}

function comparePersonsByName(a, b) {
  return (a?.name || '').localeCompare(b?.name || '', 'de-AT', { sensitivity: 'base' });
}

function formatMonthShort(d) {
  if (!d) return '';
  const dt = new Date(d);
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = String(dt.getFullYear()).slice(-2);
  return `${m}/${y}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function dateShift(baseISO, days) {
  const d = new Date(baseISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function compareByDueDate(a, b) {
  if (a.date && b.date) return a.date.localeCompare(b.date);
  if (a.date) return -1;
  if (b.date) return 1;
  return 0;
}

function compareUpcomingMeetingDate(a, b) {
  if (a.date && b.date) return a.date.localeCompare(b.date);
  if (!a.date && !b.date) return meetingTitleText(a).localeCompare(meetingTitleText(b), 'de-AT');
  return a.date ? 1 : -1;
}

function personName(id) {
  const p = data.persons.find(p => p.id === id);
  return p ? p.name : '';
}

function personById(id) {
  return data.persons.find(person => person.id === id) || null;
}

function isTeamMemberId(personId) {
  const person = personById(personId);
  return !!person && person.type !== 'kontakt';
}

function isGrowthType(type) {
  return type === 'highlight' || type === 'concern';
}

function isGrowthEntry(item) {
  return !!item && isGrowthType(item.type) && isTeamMemberId(item.personId);
}

function isPersonalWin(item) {
  return !!item && item.type === 'win';
}

function itemTypeLabel(type) {
  return ({
    todo: 'todo',
    win: 'win',
    highlight: 'highlight',
    concern: 'concern',
    backlog: 'backlog',
    waiting: 'warte auf...',
    done: 'done',
  })[type] || type;
}

function normalizeItemMonth(item) {
  if (!item) return item;
  if (item.date) item.month = item.date.slice(0, 7);
  return item;
}

function compareItemsByDateDesc(a, b) {
  return (b.date || '').localeCompare(a.date || '');
}

function monthProgress(month) {
  const start = monthStart(month);
  const end = monthEnd(month);
  const today = parseISO(todayStr());
  const clamped = today < start ? start : today > end ? end : today;
  const totalDays = daysBetween(toISO(start), toISO(end)) + 1;
  const elapsedDays = daysBetween(toISO(start), toISO(clamped)) + 1;
  return {
    totalDays,
    elapsedDays,
    percent: Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100))),
  };
}

function monthItems(items, month) {
  return items.filter(item => item.month === month);
}

function monthReview(month) {
  return (data.monthReviews || []).find(review => review.month === month) || null;
}

function upsertMonthReview(month, summary) {
  if (!data.monthReviews) data.monthReviews = [];
  const existing = monthReview(month);
  const trimmed = summary.trim();
  if (!trimmed) {
    if (existing) data.monthReviews = data.monthReviews.filter(review => review.month !== month);
    return;
  }
  if (existing) {
    existing.summary = trimmed;
    existing.updatedAt = todayStr();
    return;
  }
  data.monthReviews.push({
    id: uid(),
    month,
    summary: trimmed,
    createdAt: todayStr(),
    updatedAt: todayStr(),
  });
}

function currentMonthTeamGrowthSummary(month) {
  const growth = monthItems(data.items.filter(isGrowthEntry), month);
  const byPerson = {};
  growth.forEach(item => {
    if (!item.personId) return;
    if (!byPerson[item.personId]) byPerson[item.personId] = { highlights: 0, concerns: 0 };
    if (item.type === 'highlight') byPerson[item.personId].highlights += 1;
    if (item.type === 'concern') byPerson[item.personId].concerns += 1;
  });
  return Object.entries(byPerson)
    .map(([personId, counts]) => ({ personId, ...counts }))
    .sort((a, b) => {
      const deltaA = a.highlights - a.concerns;
      const deltaB = b.highlights - b.concerns;
      if (deltaB !== deltaA) return deltaB - deltaA;
      return personName(a.personId).localeCompare(personName(b.personId), 'de-AT');
    });
}

function renderMonthReflectionCard(month, options = {}) {
  const { empty = false } = options;
  const review = monthReview(month);
  if (!review && !empty) return '';
  return `
    <div class="month-reflection-card card ${review ? 'has-review' : 'is-empty'}">
      <div class="month-reflection-header">
        <div>
          <div class="month-reflection-kicker">${formatMonth(month)} · meine monatsspur</div>
          <div class="month-reflection-title">Wie der Monat für mich war</div>
        </div>
        ${review ? '<span class="badge badge-focus">Monatsrückblick</span>' : ''}
      </div>
      <div class="month-reflection-body">
        ${review
          ? `<div class="month-reflection-text">${esc(review.summary).replace(/\n/g, '<br>')}</div>`
          : '<div class="month-reflection-empty">Dein Rückblick erscheint hier, sobald du den Monat abschliesst.</div>'}
      </div>
    </div>
  `;
}

function personGrowthSignal(personId, days = 30) {
  const start = dateShift(todayStr(), -(days - 1));
  const items = data.items
    .filter(item => item.personId === personId && isGrowthEntry(item) && item.date && item.date >= start)
    .sort(compareItemsByDateDesc);
  return {
    items,
    highlights: items.filter(item => item.type === 'highlight').length,
    concerns: items.filter(item => item.type === 'concern').length,
  };
}

function personInitials(person) {
  const parts = String(person?.name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
}

function personAccentColor(person) {
  const palette = ['var(--blue)', 'var(--accent)', 'var(--success)', 'var(--warning)', 'var(--purple)', 'var(--danger)'];
  const source = String(person?.id || person?.name || 'x');
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) hash = ((hash << 5) - hash) + source.charCodeAt(i);
  return palette[Math.abs(hash) % palette.length];
}

// `count` haengt eine kleine Zahl an den Kreis (im Teamfokus: die Punkte, die
// Handlungsbedarf haben). `countTone` faerbt sie nach Schwere, nicht nach
// Menge — Arbeitsmenge ist kein Signal, ein veralteter Block schon.
function personAvatar(person, size = 'md', options = {}) {
  if (!person) return '';
  const { absent = false, count = null, countTone = '', countTitle = '' } = options;
  const avatar = `
    <span class="person-avatar-badge person-avatar-${size} ${absent ? 'is-absent' : ''}" style="--person-accent:${personAccentColor(person)}" aria-hidden="true">
      ${esc(personInitials(person))}
    </span>
  `;
  if (count === null || count === '') return avatar;
  return `
    <span class="person-avatar-stack person-avatar-stack-${size}"${countTitle ? ` title="${esc(countTitle)}"` : ''}>
      ${avatar}
      <span class="person-avatar-count ${countTone ? `person-avatar-count-${countTone}` : ''}">${esc(String(count))}</span>
    </span>
  `;
}

function meetingParticipantIds(meeting) {
  if (!meeting) return [];
  const ids = [];
  if (meeting.personId) ids.push(meeting.personId);
  if (Array.isArray(meeting.participants)) ids.push(...meeting.participants);
  return [...new Set(ids.filter(Boolean))];
}

function isTeamMeeting(meeting) {
  if (!meeting || meeting.type === 'oneOnOne') return false;
  return meeting.isTeamMeeting === true || meeting.isStandup === true;
}

// Ein Standup ist ein Team-Termin mit Runde. Alte Team-Meetings, die
// "Standup"/"Daily" heissen, zaehlen dazu, bis jemand die Art ausdruecklich
// umstellt (isStandup === false).
function isStandupMeeting(meeting) {
  if (!isTeamMeeting(meeting)) return false;
  if (typeof meeting.isStandup === 'boolean') return meeting.isStandup;
  return /stand-?up|daily/i.test(meeting.title || '');
}

// Genau eine Art pro Termin: meeting | team | standup. Zwei Checkboxen
// wuerden "Standup ohne Team" erlauben.
function meetingFormat(meeting) {
  if (!meeting || meeting.type === 'oneOnOne') return 'oneOnOne';
  return isStandupMeeting(meeting) ? 'standup' : isTeamMeeting(meeting) ? 'team' : 'meeting';
}

function meetingFormatLabel(meeting) {
  return { oneOnOne: '1:1', meeting: 'mtg', team: 'team', standup: 'standup' }[meetingFormat(meeting)];
}

// Beim Standup ist anfangs jeder dabei, der an dem Tag nicht abwesend ist —
// abhaken muss man nur, wer fehlt.
function defaultStandupParticipants(dateISO) {
  return data.persons
    .filter(p => p.type !== 'kontakt' && !personAbsenceOnDate(p.id, dateISO || todayStr()))
    .map(p => p.id);
}

function renderMeetingFormatPicker(onchange, current) {
  return `<div class="segmented-toggle meeting-format-picker" role="radiogroup" aria-label="Art">
    ${[['meeting', 'Meeting'], ['team', 'Team'], ['standup', 'Standup']].map(([val, label]) => `
      <button type="button" class="segmented-toggle-btn ${current === val ? 'active' : ''}" role="radio" aria-checked="${current === val}"
        data-format="${val}" onclick="${onchange.replace('%', val)}">${label}</button>`).join('')}
  </div>`;
}

function meetingParticipants(meeting) {
  return meetingParticipantIds(meeting)
    .map(id => data.persons.find(person => person.id === id))
    .filter(Boolean)
    .sort(comparePersonsByName);
}

function renderParticipantStack(meeting, limit = 4) {
  const participants = meetingParticipants(meeting);
  if (!participants.length) return '';
  const visible = participants.slice(0, limit).map(person => `
    <button class="participant-stack-avatar" onclick="event.stopPropagation();openPersonById('${person.id}')" title="${esc(person.name)}">
      ${personAvatar(person, 'sm')}
    </button>
  `).join('');
  const extra = participants.length > limit ? `<span class="participant-stack-more">+${participants.length - limit}</span>` : '';
  return `<div class="participant-stack">${visible}${extra}</div>`;
}

function personRoute(id) {
  const p = data.persons.find(person => person.id === id);
  if (!p) return null;
  return p.type === 'kontakt' ? 'kontakte:detail' : 'team:detail';
}

function openPersonById(id) {
  const route = personRoute(id);
  if (!route) return;
  navigate(route, { personId: id });
}

function openPersonTodos(personId) {
  const person = personById(personId);
  navigate('overview', {
    overviewScope: 'open',
    overviewLayout: 'list',
    overviewQuery: person?.name || personName(personId),
  });
}

function meetingTitleText(meeting) {
  if (!meeting) return '';
  if (meeting.type === 'oneOnOne') return '1:1' + (meeting.personId ? ' mit ' + personName(meeting.personId) : '');
  return meeting.title || 'Meeting';
}

function meetingOptions(selectedId, options = {}) {
  const { includeEmpty = true, personId = null } = options;
  const meetings = data.meetings
    .filter(m => !personId || !m.personId || m.personId === personId)
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  let html = includeEmpty ? '<option value="">—</option>' : '';
  html += meetings.map(m => `
    <option value="${m.id}" ${selectedId === m.id ? 'selected' : ''}>${esc(meetingTitleText(m))}${m.date ? ' · ' + formatDate(m.date) : ''}</option>
  `).join('');
  return html;
}

function meetingItems(id) {
  return data.items
    .filter(item => item.meetingId === id)
    .sort((a, b) => compareByDueDate(a, b));
}

function previousOneOnOneMeeting(meeting) {
  if (!meeting || meeting.type !== 'oneOnOne' || !meeting.personId) return null;
  const referenceDate = meeting.date || todayStr();
  return data.meetings
    .filter(item =>
      item.type === 'oneOnOne' &&
      item.personId === meeting.personId &&
      item.id !== meeting.id &&
      item.date &&
      item.date < referenceDate
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function oneOnOneCarryover(meeting) {
  if (!meeting || meeting.type !== 'oneOnOne' || !meeting.personId) {
    return { openFollowUps: [], openTodos: [], recentSignals: [] };
  }
  const referenceDate = meeting.date || todayStr();
  const previousMeeting = previousOneOnOneMeeting(meeting);
  const personItems = data.items.filter(item => item.personId === meeting.personId);
  const openItems = personItems.filter(item => item.status !== 'done' && item.id && item.meetingId !== meeting.id);
  const openFollowUps = openItems
    .filter(item => item.meetingId)
    .sort(compareByDueDate);
  const openTodos = openItems
    .filter(item => !item.meetingId && item.type === 'todo')
    .sort(compareByDueDate);
  const recentSignals = personItems
    .filter(item =>
      isGrowthType(item.type) &&
      item.date &&
      item.date <= referenceDate &&
      (!previousMeeting || item.date > previousMeeting.date)
    )
    .sort(compareItemsByDateDesc)
    .slice(0, 6);
  return { openFollowUps, openTodos, recentSignals };
}

// Concerns/Wins zaehlen nur im Sudo Mode mit — sonst verraet schon die Zahl was.
function carryoverCount(carryover) {
  return carryover.openFollowUps.length + carryover.openTodos.length + (isSudoMode() ? carryover.recentSignals.length : 0);
}

function personActivitySummary(personId) {
  const month = currentMonth();
  const itemDates = data.items
    .filter(item => item.personId === personId && item.date)
    .map(item => item.date);
  const meetingDates = data.meetings
    .filter(meeting => meetingParticipantIds(meeting).includes(personId) && meeting.date)
    .map(meeting => meeting.date);
  const latestDate = itemDates.concat(meetingDates).sort((a, b) => b.localeCompare(a))[0] || '';
  const monthItems = data.items.filter(item => item.personId === personId && item.month === month);
  const monthMeetings = data.meetings.filter(meeting =>
    meetingParticipantIds(meeting).includes(personId) &&
    meeting.date &&
    meeting.date.slice(0, 7) === month
  );
  const monthSignals = monthItems.filter(isGrowthEntry);
  const parts = [
    monthItems.length ? `${monthItems.length} Items` : '',
    monthMeetings.length ? `${monthMeetings.length} Termine` : '',
    monthSignals.length ? `${monthSignals.length} Signale` : '',
  ].filter(Boolean);
  return {
    latestDate,
    label: latestDate ? formatDateShort(latestDate) : 'keine Aktivität',
    note: parts.length ? parts.join(' · ') : 'aktueller Monat leer',
  };
}

// --- Jira sync snapshot helpers ---
// Gematcht wird über die Jira Account-ID, nicht über die E-Mail: Jira Cloud
// akzeptiert in JQL keine Adressen mehr, und der Snapshot ist damit direkt
// nach accountId aufgeschlüsselt.
// null = kein Mapping möglich (kein Sync-File oder keine Account-ID am Profil),
// [] = Mapping vorhanden, aber keine Tickets assigned.
function jiraTicketsForPerson(person) {
  if (!jiraSyncData || !person || !person.jiraAccountId) return null;
  const assignees = jiraSyncData.assignees || {};
  const tickets = assignees[person.jiraAccountId.trim()];
  // Der Filter greift beim Lesen, nicht beim Import: so wirkt eine geaenderte
  // Status-Auswahl sofort, auch auf einen alten Snapshot.
  return Array.isArray(tickets) ? tickets.filter(t => !isJiraStatusExcluded(t.status)) : [];
}

// --- Jira-Index ------------------------------------------------------
// Ein Snapshot aendert sich nur beim Import (dann ist es ein neues Objekt).
// Der Index haengt deshalb am Snapshot selbst und muss nie invalidiert werden.
const jiraIndexCache = new WeakMap();

function jiraIndex() {
  if (!jiraSyncData) return null;
  const cached = jiraIndexCache.get(jiraSyncData);
  if (cached) return cached;
  const byKey = new Map();
  const parentSummary = new Map();
  const put = (rawKey, info) => {
    const key = String(rawKey || '').trim().toUpperCase();
    if (!key) return;
    byKey.set(key, { ...(byKey.get(key) || {}), ...info, key });
    if (info.parentKey && info.parentSummary && !parentSummary.has(info.parentKey)) {
      parentSummary.set(info.parentKey, info.parentSummary);
    }
  };
  const refs = jiraSyncData.refs || {};
  for (const raw of Object.keys(refs)) put(raw, refs[raw]);
  for (const [accountId, list] of Object.entries(jiraSyncData.assignees || {})) {
    for (const t of list || []) put(t.key, { ...t, assignee: accountId });
  }
  const index = { byKey, parentSummary };
  jiraIndexCache.set(jiraSyncData, index);
  return index;
}

// Alles, was der Snapshot ueber einen Key weiss — egal ob er bei einer Person
// haengt oder nur als referenzierter Key mitgeholt wurde.
function jiraTicketInfo(ref) {
  const index = jiraIndex();
  const key = String(ref || '').trim().toUpperCase();
  return index && key ? index.byKey.get(key) || null : null;
}

// Aeltere Snapshots kennen das Subtask-Flag noch nicht — dort muss der
// Typname reichen, bis zum naechsten Import.
function jiraIsSubtask(ticket) {
  if (!ticket) return false;
  if (typeof ticket.subtask === 'boolean') return ticket.subtask;
  return /sub|unter/i.test(String(ticket.type || ''));
}

// Der Auftrag ist die Planungseinheit: ein Subtask zaehlt zu seinem Parent,
// jedes andere Ticket ist selbst ein Auftrag. Ein Epic ueber dem Auftrag
// spielt bewusst keine Rolle — dort haengen Themen, die nichts miteinander
// zu tun haben (allen voran "Tagesgeschaeft").
function jiraAuftragKey(ref) {
  const key = String(ref || '').trim().toUpperCase();
  if (!key) return '';
  const ticket = jiraTicketInfo(key);
  return ticket && ticket.parentKey && jiraIsSubtask(ticket) ? ticket.parentKey : key;
}

// Titel eines Keys, egal aus welcher Ecke des Snapshots er kommt. Ein Auftrag,
// an dem die Person nur Subtasks hat, steht oft selbst nicht im Snapshot —
// dann kennt ihn nur der Subtask als Parent.
function jiraSummaryForKey(ref) {
  const index = jiraIndex();
  const key = String(ref || '').trim().toUpperCase();
  if (!index || !key) return '';
  const ticket = index.byKey.get(key);
  return (ticket && ticket.summary) || index.parentSummary.get(key) || '';
}

// Alle Auftraege im Snapshot, fuer die Vorschlagsliste im Block-Formular.
function jiraAuftragPool() {
  const index = jiraIndex();
  if (!index) return [];
  const keys = new Set();
  for (const ticket of index.byKey.values()) keys.add(jiraAuftragKey(ticket.key));
  return [...keys]
    .map(key => ({ key, summary: jiraSummaryForKey(key) }))
    .sort((a, b) => a.key.localeCompare(b.key, 'de', { numeric: true }));
}

// Die offenen Tickets einer Person, die zu einem Auftrag gehoeren — der
// Auftrag selbst eingeschlossen, falls er ihr gehoert. null = keine Aussage
// moeglich (kein Snapshot oder Person nicht mit Jira verknuepft).
function jiraPersonAuftragTickets(person, auftragKey) {
  const tickets = jiraTicketsForPerson(person);
  if (tickets === null) return null;
  const key = String(auftragKey || '').trim().toUpperCase();
  return tickets.filter(t => t.statusCategory !== 'done' && jiraAuftragKey(t.key) === key);
}

// Die Abfrage, die der Browser für uns ausführt: alle offenen Tickets des
// Teams plus der Status jedes in der Planung referenzierten Keys. Beides in
// einem Request, damit es bei einem Copy-Paste bleibt.
function jiraQueryUrl() {
  const base = getJiraBaseUrl();
  if (!base) return '';
  const accountIds = data.persons
    .filter(p => p.type !== 'kontakt' && p.jiraAccountId)
    .map(p => p.jiraAccountId.trim())
    .filter((id, i, all) => all.indexOf(id) === i);
  const refKeys = jiraPlannedRefKeys();
  if (!accountIds.length && !refKeys.length) return '';

  const quoted = values => values.map(v => `"${v}"`).join(',');
  const excluded = jiraExcludedStatuses();
  let jql = '';
  if (accountIds.length) {
    jql = `assignee in (${quoted(accountIds)}) AND resolution = Unresolved`;
    // Ausgeschlossene Status gar nicht erst holen — sonst gehen sie vom
    // maxResults-Budget ab. Der refs-Teil unten bleibt bewusst ungefiltert,
    // dort brauchen wir den Status auch von erledigten Tickets.
    if (excluded.length) jql += ` AND status not in (${quoted(excluded)})`;
    // Fuer den Wochenabschluss: was das Team zuletzt abgeschlossen hat. Nur
    // Auftraege, keine Subtasks — die kosten Budget und sagen im Rueckblick
    // nichts, was der Auftrag nicht schon sagt.
    jql = `(${jql}) OR (assignee in (${quoted(accountIds)}) AND resolved >= -7d AND issuetype in standardIssueTypes())`;
  }
  if (refKeys.length) {
    const byKey = `key in (${quoted(refKeys)})`;
    jql = jql ? `(${jql}) OR ${byKey}` : byKey;
  }
  jql += ' ORDER BY updated DESC';

  const params = new URLSearchParams({
    jql,
    fields: 'summary,status,priority,issuetype,updated,assignee,resolution,resolutiondate,parent',
    maxResults: String(JIRA_QUERY_MAX_RESULTS),
  });
  return `${base}/rest/api/3/search/jql?${params}`;
}

// Welche Keys die Abfrage zusaetzlich mitholen muss: die Auftraege offener
// Bloecke — deren Status entscheidet, ob ein Block erledigt ist, auch wenn
// der Auftrag jemand anderem gehoert.
function jiraPlannedRefKeys() {
  return (data.blocks || [])
    .filter(b => !b.done && b.jiraRef && b.typ !== 'abwesenheit')
    .map(b => jiraAuftragKey(b.jiraRef))
    .filter((key, i, all) => key && all.indexOf(key) === i);
}

// Jira gegen Planung: Auftraege, an denen jemand offene Arbeit hat, fuer die
// es aber keinen Block gibt. Mehr gibt es nicht abzugleichen — Titel, Status
// und Erledigt werden aus dem Snapshot abgeleitet statt kopiert.
function jiraUnplannedAuftraege(person) {
  const tickets = jiraTicketsForPerson(person);
  if (tickets === null) return null;
  const planned = new Set((data.blocks || [])
    .filter(b => b.personId === person.id && b.typ !== 'abwesenheit' && !b.done && b.jiraRef)
    .map(b => jiraAuftragKey(b.jiraRef)));
  const byKey = new Map();
  for (const t of tickets) {
    // Was nur noch in Review/QA liegt, braucht keinen Platz im Kalender.
    if (t.statusCategory === 'done' || isJiraHandoverStatus(t.status)) continue;
    const key = jiraAuftragKey(t.key);
    if (planned.has(key)) continue;
    if (!byKey.has(key)) byKey.set(key, { key, summary: jiraSummaryForKey(key) || t.summary || key, tickets: [] });
    byKey.get(key).tickets.push(t);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key, 'de', { numeric: true }));
}

function jiraDriftForPerson(person) {
  const unplanned = jiraUnplannedAuftraege(person);
  if (unplanned === null) return null;
  return { unplanned, hasDrift: unplanned.length > 0 };
}

function jiraSyncAgeLabel() {
  if (!jiraSyncData || !jiraSyncData.generatedAt) return '';
  const ts = new Date(jiraSyncData.generatedAt).getTime();
  if (Number.isNaN(ts)) return '';
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `vor ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `vor ${hours} h`;
  return `vor ${Math.round(hours / 24)} Tagen`;
}

function includesQuery(value, query) {
  return String(value || '').toLocaleLowerCase('de-AT').includes(query);
}

function itemMatchesQuery(item, query) {
  const linkedMeeting = item.meetingId ? data.meetings.find(m => m.id === item.meetingId) : null;
  return [
    item.text,
    item.notes,
    item.type,
    item.status,
    item.date,
    item.month,
    personName(item.personId),
    meetingTitleText(linkedMeeting),
  ].some(value => includesQuery(value, query));
}

function personMatchesQuery(person, query) {
  return [
    person.name,
    person.pushDirection,
    person.type === 'kontakt' ? '' : person.notes,
    person.jiraUrl,
    person.jiraAccountId,
    person.gitlabMrUrl,
  ].some(value => includesQuery(value, query));
}

function meetingMatchesQuery(meeting, query) {
  const linkedItems = data.items.filter(item => item.meetingId === meeting.id);
  return [
    meeting.title,
    meeting.prep,
    meeting.notes,
    meeting.date,
    personName(meeting.personId),
    ...meetingParticipants(meeting).map(person => person.name),
    ...linkedItems.flatMap(item => [item.text, item.notes, item.status, item.type]),
    meeting.type === 'oneOnOne' ? '1:1' : 'meeting',
    isTeamMeeting(meeting) ? 'team' : 'other',
    isStandupMeeting(meeting) ? 'standup' : '',
  ].some(value => includesQuery(value, query));
}

function focusMatchesQuery(focus, query) {
  return [focus.title, focus.description, focus.month].some(value => includesQuery(value, query));
}

function prevMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  if (mo === 1) return (y - 1) + '-12';
  return y + '-' + String(mo - 1).padStart(2, '0');
}

function nextMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  if (mo === 12) return (y + 1) + '-01';
  return y + '-' + String(mo + 1).padStart(2, '0');
}
