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

function personAvatar(person, size = 'md', options = {}) {
  if (!person) return '';
  const { absent = false } = options;
  return `
    <span class="person-avatar-badge person-avatar-${size} ${absent ? 'is-absent' : ''}" style="--person-accent:${personAccentColor(person)}" aria-hidden="true">
      ${esc(personInitials(person))}
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
  return meeting.isTeamMeeting === true;
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
    month: currentMonth(),
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

function carryoverCount(carryover) {
  return carryover.openFollowUps.length + carryover.openTodos.length + carryover.recentSignals.length;
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


