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

// Aktueller Status des Tickets hinter einem Block — aus refs (dort stehen
// genau die geplanten Keys) mit Rueckfall auf die Ticketliste der Person.
function jiraStatusForBlock(block) {
  if (!jiraSyncData || !block || !block.jiraRef) return null;
  const key = block.jiraRef.trim().toUpperCase();
  const refs = jiraSyncData.refs || {};
  for (const raw of Object.keys(refs)) {
    if (raw.trim().toUpperCase() === key) return refs[raw];
  }
  const person = data.persons.find(p => p.id === block.personId);
  const tickets = person ? jiraTicketsForPerson(person) : null;
  const hit = (tickets || []).find(t => String(t.key || '').toUpperCase() === key);
  return hit ? { status: hit.status, statusCategory: hit.statusCategory } : null;
}

// Blockiert der Block noch den Entwickler? Offene Bloecke, deren Ticket in
// einem Uebergabe-Status haengt, zaehlen als "wartet woanders".
function jiraHandoverBlocks(personId) {
  if (!jiraSyncData) return [];
  const today = todayStr();
  return (data.blocks || []).filter(b => {
    if (personId && b.personId !== personId) return false;
    if (b.done || !b.jiraRef) return false;
    if ((b.end || b.start || '') < today) return false;
    const ref = jiraStatusForBlock(b);
    return !!(ref && isJiraHandoverStatus(ref.status));
  });
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

// --- Ticket-Gruppierung ---------------------------------------------
// Entwickler legen sich unter ihrem Auftragsticket Subtasks an, dadurch steht
// in der Liste der Auftrag *und* jeder Subtask. Zusammengefasst wird rein
// strukturell: ein Ticket rutscht unter ein anderes, wenn dessen Key sein
// Parent ist *und* der Parent in derselben Liste steht, also derselben Person
// gehoert. Haengt der Parent woanders — allen voran das Sammel-Epic
// "Tagesgeschaeft", das niemandem zugewiesen ist — bleiben die Tickets flach:
// die haben inhaltlich nichts miteinander zu tun. Bewusst ohne Sonderfall auf
// Ticket-Typ oder Key, das waere Policy in einer Anzeigefunktion.
//
// Ergebnis ist ein Baum aus { ticket, children }; die Reihenfolge der
// uebergebenen Liste bleibt auf jeder Ebene erhalten.
function groupJiraTickets(tickets) {
  const list = Array.isArray(tickets) ? tickets : [];
  const nodes = new Map();
  for (const t of list) {
    const key = String(t.key || '').trim().toUpperCase();
    if (key && !nodes.has(key)) nodes.set(key, { ticket: t, children: [] });
  }
  const roots = [];
  for (const t of list) {
    const key = String(t.key || '').trim().toUpperCase();
    const node = nodes.get(key);
    if (!node || node.ticket !== t) continue;
    const parentKey = String(t.parentKey || '').trim().toUpperCase();
    const parent = parentKey && parentKey !== key ? nodes.get(parentKey) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

// Alles unterhalb eines Knotens, ueber alle Ebenen — das ist die Zahl, die am
// zugeklappten Kopf steht.
function jiraGroupSize(node) {
  return node.children.reduce((sum, child) => sum + 1 + jiraGroupSize(child), 0);
}

// Aufgeklappte Gruppen. Modulweit wie expandedPastMonths in meetings.js: der
// Zustand soll einen Ausflug in eine andere View ueberleben. Default ist zu —
// dichter geht es nicht, und genau darum ging es bei der Gruppierung.
const expandedJiraGroups = new Set();

function isJiraGroupOpen(key) {
  return expandedJiraGroups.has(String(key || '').toUpperCase());
}

// Klappt ohne render(): die Liste steckt einmal im Team-Tab und einmal im
// Drift-Modal, und ein render() wuerde das Modal nicht mit aufbauen. Die Menge
// wird trotzdem gepflegt, damit ein spaeterer Neuaufbau den Stand kennt.
function toggleJiraGroup(el, key) {
  const name = String(key || '').toUpperCase();
  const group = el.closest('.jira-ticket-group');
  if (!group) return;
  const open = !group.classList.contains('is-open');
  group.classList.toggle('is-open', open);
  el.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) expandedJiraGroups.add(name);
  else expandedJiraGroups.delete(name);
}

// Der Klapp-Chip am Kopf einer Gruppe: Caret plus Anzahl darunter.
function jiraGroupToggle(node) {
  const key = String(node.ticket.key || '').toUpperCase();
  const count = jiraGroupSize(node);
  return `<button class="jira-group-toggle" type="button" aria-expanded="${isJiraGroupOpen(key) ? 'true' : 'false'}"
    title="${count} untergeordnete${count === 1 ? 's' : ''} Ticket${count === 1 ? '' : 's'}"
    onclick="event.stopPropagation(); toggleJiraGroup(this, '${esc(key)}')"><span class="jira-group-caret" aria-hidden="true"></span>${count}</button>`;
}

// Alle Tickets aus dem Snapshot als flache Liste (key + summary), fuer die
// Vorschlagsliste im Block-Formular. Dedupliziert, weil ein Ticket sowohl in
// assignees als auch in refs stecken kann.
function jiraTicketPool() {
  if (!jiraSyncData) return [];
  const byKey = {};
  for (const list of Object.values(jiraSyncData.assignees || {})) {
    if (!Array.isArray(list)) continue;
    for (const t of list) {
      const key = String(t.key || '').trim().toUpperCase();
      if (key && !byKey[key]) byKey[key] = { key, summary: String(t.summary || '') };
    }
  }
  const refs = jiraSyncData.refs || {};
  for (const raw of Object.keys(refs)) {
    const key = raw.trim().toUpperCase();
    if (key && !byKey[key]) byKey[key] = { key, summary: String(refs[raw].summary || '') };
  }
  return Object.values(byKey).sort((a, b) => a.key.localeCompare(b.key));
}

// Titel eines Keys, egal aus welcher Ecke des Snapshots er kommt.
function jiraSummaryForKey(ref) {
  const key = String(ref || '').trim().toUpperCase();
  if (!key) return '';
  const hit = jiraTicketPool().find(t => t.key === key);
  return hit ? hit.summary : '';
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
  const today = todayStr();
  const refKeys = (data.blocks || [])
    .filter(b => !b.done && b.jiraRef && (b.end || b.start || '') >= today)
    .map(b => b.jiraRef.trim().toUpperCase())
    .filter((key, i, all) => all.indexOf(key) === i);
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
  }
  if (refKeys.length) {
    const byKey = `key in (${quoted(refKeys)})`;
    jql = jql ? `(${jql}) OR ${byKey}` : byKey;
  }
  jql += ' ORDER BY updated DESC';

  const params = new URLSearchParams({
    jql,
    fields: 'summary,status,priority,issuetype,updated,assignee,resolution,parent',
    maxResults: String(JIRA_QUERY_MAX_RESULTS),
  });
  return `${base}/rest/api/3/search/jql?${params}`;
}

// Drift zwischen Jira und Planung, über jiraRef-Key-Matching (nicht Anzahl):
// unplanned = assigned Tickets ohne laufenden/zukünftigen Block,
// stale = Blöcke, deren Ticket laut Sync erledigt oder umassigned ist.
// Blöcke ohne jiraRef bleiben bewusst außen vor.
function jiraDriftForPerson(person) {
  const tickets = jiraTicketsForPerson(person);
  if (tickets === null) return null;
  const today = todayStr();
  const activeBlocks = (data.blocks || []).filter(b =>
    b.personId === person.id && !b.done && b.jiraRef && (b.end || b.start || '') >= today);
  const plannedKeys = new Set(activeBlocks.map(b => b.jiraRef.trim().toUpperCase()));
  const openKeys = new Set(tickets.map(t => String(t.key || '').toUpperCase()));
  const unplanned = tickets.filter(t => !plannedKeys.has(String(t.key || '').toUpperCase()));
  const refs = (jiraSyncData && jiraSyncData.refs) || {};
  const refByKey = {};
  for (const k of Object.keys(refs)) refByKey[k.trim().toUpperCase()] = refs[k];
  const stale = activeBlocks.filter(b => {
    const key = b.jiraRef.trim().toUpperCase();
    if (openKeys.has(key)) return false;
    const ref = refByKey[key];
    if (!ref) return false; // unbekannter Key (Epic, fremdes Projekt) -> kein Urteil
    if (ref.statusCategory === 'done') return true;
    if (isJiraStatusExcluded(ref.status)) return true;
    return !!(ref.assignee && person.jiraAccountId
      && ref.assignee.trim() !== person.jiraAccountId.trim());
  });
  // Titel-Drift nur fuer Bloecke, deren Label aus Jira stammt und seither
  // nicht von Hand geaendert wurde (label === jiraSummary). Handgeschriebene
  // Labels sollen nicht dauerhaft als "veraltet" gemeldet werden.
  const staleIds = new Set(stale.map(b => b.id));
  const ticketByKey = {};
  for (const t of tickets) ticketByKey[String(t.key || '').toUpperCase()] = t;
  const renamed = activeBlocks.filter(b => {
    if (staleIds.has(b.id)) return false;
    if (!b.jiraSummary || b.label !== b.jiraSummary) return false;
    const current = jiraCurrentSummary(b.jiraRef, ticketByKey, refByKey);
    return !!current && current !== b.jiraSummary;
  });
  return {
    unplanned,
    stale,
    renamed,
    hasDrift: unplanned.length > 0 || stale.length > 0 || renamed.length > 0,
  };
}

// Aktueller Ticket-Titel aus dem Snapshot: erst die offene Ticketliste der
// Person, sonst der mitgelieferte Status geplanter Keys (refs).
function jiraCurrentSummary(ref, ticketByKey, refByKey) {
  const key = String(ref || '').trim().toUpperCase();
  if (!key) return '';
  const fromTicket = ticketByKey && ticketByKey[key];
  if (fromTicket && fromTicket.summary) return fromTicket.summary;
  const fromRef = refByKey && refByKey[key];
  return (fromRef && fromRef.summary) || '';
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
