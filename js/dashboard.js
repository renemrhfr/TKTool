// ============================================================
// DASHBOARD / REVIEWS
// ============================================================
function renderReviewItemList(items, emptyText) {
  if (!items.length) return `<div style="color:var(--text-muted);font-size:14px">${emptyText}</div>`;
  return `<ul class="item-list">${items.map(item => renderItem(item)).join('')}</ul>`;
}

function renderReviewMeetingList(meetings, emptyText) {
  const rows = meetings.map(meeting => {
    const linkedCount = meetingItems(meeting.id).length;
    const date = meeting.date ? new Date(`${meeting.date}T12:00:00`) : null;
    const weekday = date ? date.toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '') : '';
    const day = date ? String(date.getDate()).padStart(2, '0') : '--';
    const metaDate = meeting.date ? formatDate(meeting.date) : 'ohne Datum';
    return `
      <div class="review-meeting-row" onclick="navigate('meetings:detail', {meetingId:'${meeting.id}'})">
        <div class="review-meeting-badge">
          <div class="review-meeting-badge-weekday">${esc(weekday)}</div>
          <div class="review-meeting-badge-day">${day}</div>
        </div>
        <div class="review-meeting-main">
          <div class="review-row-title">${meetingDisplayTitle(meeting)}</div>
          <div class="review-row-meta">
            ${meeting.personId ? '@' + esc(personName(meeting.personId)) + ' · ' : ''}${metaDate}
          </div>
        </div>
        <div class="review-row-side">
          ${meeting.date
            ? `${linkedCount} Follow-up${linkedCount === 1 ? '' : 's'}`
            : `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();openScheduleMeetingDate('${meeting.id}')">Einplanen</button>`}
        </div>
      </div>
    `;
  });
  return renderReviewScheduleList(rows, emptyText);
}

function reviewMarkerRelativeLabel(date) {
  const diff = Math.round((parseISO(date) - parseISO(todayStr())) / 86400000);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff <= 13) return `in ${diff} Tagen`;
  const weeks = Math.round(diff / 7);
  return `in ${weeks} Wochen`;
}

function renderReviewMarkerList(markers, emptyText) {
  const rows = markers.map(marker => {
    const date = marker.date ? new Date(`${marker.date}T12:00:00`) : null;
    const weekday = date ? date.toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '') : '';
    const day = date ? String(date.getDate()).padStart(2, '0') : '--';
    const color = marker.color || 'var(--accent)';
    return `
      <div class="review-meeting-row review-marker-row" onclick="openMarkerForm('${marker.id}')" style="--marker-color:${esc(color)}">
        <div class="review-meeting-badge review-marker-badge">
          <div class="review-meeting-badge-weekday">${esc(weekday)}</div>
          <div class="review-meeting-badge-day">${day}</div>
        </div>
        <div class="review-meeting-main">
          <div class="review-row-title">${esc(marker.label || 'Marker')}</div>
          <div class="review-row-meta">${marker.date ? formatDate(marker.date) : 'ohne Datum'}</div>
        </div>
        <div class="review-row-side review-marker-side">${marker.date ? reviewMarkerRelativeLabel(marker.date) : ''}</div>
      </div>
    `;
  });
  return renderReviewScheduleList(rows, emptyText);
}

function renderReviewScheduleList(rows, emptyText) {
  return `
    <div class="review-schedule-list">
      ${rows.length
        ? rows.join('')
        : `<div class="review-schedule-empty">${emptyText}</div>`}
    </div>
  `;
}

function itemStatusLabel(status) {
  return ({
    todo: 'todo',
    backlog: 'backlog',
    waiting: 'wartet',
    done: 'done',
  })[status] || status;
}

function reviewDueRelativeLabel(itemDate, today) {
  if (!itemDate) return '';
  if (itemDate === today) return 'heute';
  const days = Math.round((parseISO(today) - parseISO(itemDate)) / 86400000);
  if (days === 1) return 'seit gestern';
  return `seit ${days} Tagen`;
}

function renderReviewDueItem(item, tone) {
  const today = todayStr();
  const linkedMeeting = item.meetingId ? data.meetings.find(meeting => meeting.id === item.meetingId) : null;
  const notesPreview = previewText(item.notes);
  return `
    <li class="review-due-item review-due-item-${tone}">
      <button class="review-due-item-main" onclick="openEditItem('${item.id}')">
        <span class="review-due-item-date">
          <span class="review-due-item-day">${formatDateShort(item.date)}</span>
          <span class="review-due-item-age">${reviewDueRelativeLabel(item.date, today)}</span>
        </span>
        <span class="review-due-item-body">
          <span class="review-due-item-title">${esc(item.text)}</span>
          ${notesPreview ? `<span class="review-due-item-notes">${esc(notesPreview)}</span>` : ''}
          <span class="review-due-item-meta">
            <span class="badge badge-${item.status}">${itemStatusLabel(item.status)}</span>
            ${item.personId ? `<span>@${esc(personName(item.personId))}</span>` : ''}
            ${linkedMeeting ? `<span>${meetingDisplayTitle(linkedMeeting)}</span>` : ''}
          </span>
        </span>
      </button>
      <button class="review-due-item-check" onclick="event.stopPropagation();toggleItem('${item.id}')" title="Erledigt">&#10003;</button>
    </li>
  `;
}

function renderReviewDueList(items) {
  if (!items.length) return `<div style="color:var(--text-muted);font-size:14px">Keine fälligen Items</div>`;
  const today = todayStr();
  const overdue = items.filter(item => item.date && item.date < today);
  const todayDue = items.filter(item => item.date === today);
  const sections = [
    {
      key: 'overdue',
      title: 'Überfällig',
      hint: overdue.length ? 'Braucht direkte Aufmerksamkeit' : 'Nichts überfällig',
      items: overdue,
      tone: 'danger',
    },
    {
      key: 'today',
      title: 'Fällig',
      hint: todayDue.length ? 'Heute geplant oder fällig' : 'Heute nichts fällig',
      items: todayDue,
      tone: 'warning',
    },
  ];
  return `
    <div class="review-due-panel">
      <div class="review-due-sections">
        ${sections.map(section => `
          <div class="review-due-section review-due-section-${section.tone}">
            <div class="review-due-section-head">
              <div>
                <div class="review-due-section-title">${section.title}</div>
                <div class="review-due-section-hint">${section.hint}</div>
              </div>
              <span class="review-due-section-count">${section.items.length}</span>
            </div>
            ${section.items.length
              ? `<ul class="review-due-item-list">${section.items.map(item => renderReviewDueItem(item, section.tone)).join('')}</ul>`
              : '<div class="review-due-empty">Keine Items</div>'}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function dashboardLinkKind(link) {
  const value = `${link.kind || ''} ${link.title || ''} ${link.url || ''}`.toLocaleLowerCase('de-AT');
  if (value.includes('jira') || value.includes('atlassian')) return 'jira';
  if (value.includes('gitlab')) return 'gitlab';
  return 'link';
}

function dashboardLinkHost(url) {
  const href = normalizeExternalUrl(url);
  if (!href) return '';
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href.replace(/^https?:\/\//i, '').split('/')[0];
  }
}

function dashboardLinkInitial(link) {
  return (link.title || 'L').trim().slice(0, 1).toUpperCase();
}

function renderDashboardLinkMark(link) {
  const kind = dashboardLinkKind(link);
  if (kind === 'jira' || kind === 'gitlab') return memberLinkIcon(kind);
  return esc(dashboardLinkInitial(link));
}

function renderDashboardLinks() {
  const links = (data.dashboardLinks || []).filter(link => link.title && link.url);
  return `
    <div class="dashboard-links">
      ${links.length ? links.map(link => {
        const href = normalizeExternalUrl(link.url);
        const kind = dashboardLinkKind(link);
        return `
          <div class="dashboard-link dashboard-link-${kind}">
            <a class="dashboard-link-main" href="${esc(href)}" target="_blank" rel="noopener noreferrer">
              <span class="dashboard-link-mark">${renderDashboardLinkMark(link)}</span>
              <span class="dashboard-link-title">${esc(link.title)}</span>
            </a>
            <button class="dashboard-link-edit" type="button" onclick="openDashboardLinkForm('${link.id}')" title="Link bearbeiten">&#9998;</button>
          </div>
        `;
      }).join('') : `
        <button class="dashboard-link-empty" onclick="openDashboardLinkForm()">
          <span class="dashboard-link-mark">+</span>
          <span class="dashboard-link-title">Ersten Link hinzufügen</span>
        </button>
      `}
      <button class="dashboard-link-add" onclick="openDashboardLinkForm()" title="Quick Link hinzufügen">+</button>
    </div>
  `;
}

function renderDashboardReviewAction() {
  const count = monthReviewMonths().length;
  return `
    <button class="btn btn-secondary btn-sm dashboard-review-action" onclick="openMonthReviewsArchive()" title="Frühere Monatsrückblicke ansehen">
      <span>monatsrückblicke</span>
      <span class="dashboard-review-count">${count}</span>
    </button>
  `;
}

// Muss zur max-height von .tf-blocks-list passen: so viele Zeilen stehen ohne
// Scrollen da, der Rest wird als "+n" angekuendigt.
const TF_VISIBLE_BLOCKS = 3;

function ticketCountLabel(count) {
  return `${count} ${count === 1 ? 'ticket' : 'tickets'}`;
}

// Die Zahl am Avatar zaehlt nicht die Arbeit, sondern den Handlungsbedarf:
// ueberfaellige Bloecke plus Jira-Drift. Zehn saubere Tickets sind kein
// Signal, ein ueberfaelliger Block ist eines — und nur das gehoert an den
// Avatar, der aus drei Metern Abstand noch lesbar ist.
function teamFocusAttentionBadge(entry) {
  const drift = entry.drift;
  const parts = [
    entry.overdueBlocks.length ? `${entry.overdueBlocks.length} überfällig` : '',
    drift?.unplanned.length ? `${drift.unplanned.length} ohne block` : '',
    drift?.stale.length ? `${drift.stale.length} ${drift.stale.length === 1 ? 'block' : 'blocks'} veraltet` : '',
  ].filter(Boolean);
  // Nichts offen heisst kein Badge: eine 0 waere nur Rauschen, und der ruhige
  // Avatar ist selbst die Aussage.
  if (!parts.length) return {};
  const count = entry.overdueBlocks.length + (drift?.unplanned.length || 0) + (drift?.stale.length || 0);
  return {
    count,
    // Ueberfaellig und veraltet sind Fehler, ein ungeplantes Ticket ist bloss
    // noch nicht eingeplant — das darf nicht gleich aussehen.
    countTone: entry.overdueBlocks.length || drift?.stale.length ? 'bad' : 'warn',
    countTitle: parts.join(' · '),
  };
}

// "urlaub bis 12.08." — ohne das Enddatum weiss man nur, dass jemand heute
// weg ist, nicht ob man morgen wieder mit ihm rechnen kann.
function teamFocusAbsenceLabel(absence) {
  const label = (absence.label || 'abwesend').toLocaleLowerCase('de-AT');
  return absence.end ? `${label} bis ${formatDateShort(absence.end)}` : label;
}

// Haengt das Ticket hinter dem Block in einem Uebergabe-Status (Review, QA),
// dann ist die Person fertig und wartet auf jemand anderen. Fuer die Frage
// "wen muss ich anstossen" ist das eine andere Antwort als "arbeitet dran".
function teamFocusBlockHandoverStatus(block) {
  if (!block.jiraRef) return '';
  const ref = jiraStatusForBlock(block);
  return ref && isJiraHandoverStatus(ref.status) ? String(ref.status || '') : '';
}

// Woran die Person arbeitet und was als naechstes kommt. Ein Klick fuehrt in
// die Planung.
function renderTeamFocusBlockRow(block, kind) {
  const handover = kind === 'active' ? teamFocusBlockHandoverStatus(block) : '';
  const canOpenJira = !!jiraUrl(block.jiraRef);
  const timing = kind === 'overdue' ? `seit ${formatDateShort(block.end)}`
    : kind === 'upcoming' ? `ab ${formatDateShort(block.start)}`
    : handover ? 'wartet'
    : `noch ${workdaysBetween(todayStr(), block.end)} wt`;
  const state = kind === 'overdue' ? 'überfällig — nicht erledigt'
    : handover ? `wartet auf ${handover}`
    : '';
  const title = [
    `${block.label || 'Block'} · ${formatDate(block.start)} – ${formatDate(block.end)}`,
    state,
    canOpenJira ? `Jira: ${block.jiraRef} (Cmd/Strg-Klick öffnet)` : '',
  ].filter(Boolean).join('\n');
  return `
    <button class="tf-block tf-block-${kind} ${handover ? 'tf-block-handover' : ''}" type="button" onclick="if((event.metaKey||event.ctrlKey)&&openBlockJira('${block.id}'))return;navigate('planung')" title="${esc(title)}">
      <span class="tf-block-mark"></span>
      <span class="tf-block-body">
        <span class="tf-block-title">${esc(block.label || 'Block')}</span>
        ${block.jiraRef ? `<span class="tf-block-ref">${esc(block.jiraRef)}</span>` : ''}
      </span>
      <span class="tf-block-timing">${esc(timing)}</span>
    </button>
  `;
}

// Alle Bloecke, aber ab dem vierten scrollt die Liste in sich. So zieht ein
// Teammitglied mit sieben Bloecken die Nachbarkarte nicht in die Laenge, und
// trotzdem geht nichts verloren. Laufende stehen vor kommenden.
function renderTeamFocusBlocks(entry) {
  // Ueberfaellige zuerst: sie sind das einzige, was hier eine Handlung
  // erzwingt, und wuerden sonst im Scrollbereich verschwinden.
  const blocks = [
    ...entry.overdueBlocks.map(block => ({ block, kind: 'overdue' })),
    ...entry.activeBlocks.map(block => ({ block, kind: 'active' })),
    ...entry.upcomingBlocks.map(block => ({ block, kind: 'upcoming' })),
  ];
  const empty = entry.absenceToday
    ? `${esc(teamFocusAbsenceLabel(entry.absenceToday))} · nichts geplant`
    : 'nichts geplant';
  // Drei Zeilen sind sichtbar. Dass darunter noch etwas liegt, sieht man sonst
  // erst beim Scrollen — der Hinweis steht deshalb unten am Schnitt, wo man
  // hinschaut, nicht oben in der Kopfzeile.
  const hidden = Math.max(0, blocks.length - TF_VISIBLE_BLOCKS);
  return `
    <div class="tf-blocks${hidden ? ' tf-blocks-more' : ''}">
      <div class="tf-blocks-head">
        <span>Arbeitet an${blocks.length > 1 ? ` <span class="tf-blocks-count">${blocks.length}</span>` : ''}</span>
        <button class="tf-blocks-link" type="button" onclick="navigate('planung')">planung öffnen</button>
      </div>
      <div class="tf-blocks-scroll">
        <div class="tf-blocks-list">
          ${blocks.length
            ? blocks.map(({ block, kind }) => renderTeamFocusBlockRow(block, kind)).join('')
            : `<div class="tf-blocks-empty">${empty}</div>`}
        </div>
      </div>
      ${hidden ? `<div class="tf-blocks-hint">+${hidden} ${hidden === 1 ? 'weiterer' : 'weitere'} ↓</div>` : ''}
    </div>
  `;
}

function renderTeamFocusJiraMetric(entry) {
  if (!jiraSyncData) return '';
  if (entry.jiraTickets === null) {
    return `
      <button class="tf-metric tf-metric-action" type="button" onclick="event.preventDefault(); event.stopPropagation(); openPersonForm('${entry.person.id}')" title="jira-user im Profil ergänzen">
        <span class="tf-metric-label">Jira</span>
        <span class="tf-metric-value">&ndash;</span>
        <span class="tf-metric-note">kein jira-user</span>
      </button>`;
  }
  const drift = entry.drift;
  const driftParts = [];
  if (drift.unplanned.length) driftParts.push(`${drift.unplanned.length} nicht eingeplant`);
  if (drift.stale.length) driftParts.push(`${drift.stale.length} ${drift.stale.length === 1 ? 'block' : 'blocks'} veraltet`);
  const driftDetail = [
    drift.unplanned.length ? `Ohne Block: ${drift.unplanned.map(t => t.key).join(', ')}` : '',
    drift.stale.length ? `Veraltet: ${drift.stale.map(b => `${b.label || b.jiraRef} (${b.jiraRef})`).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  const jiraSig = drift.stale.length ? 'tf-sig-bad' : drift.unplanned.length ? 'tf-sig-warn' : 'tf-sig-ok';
  return `
    <button class="tf-metric tf-metric-action ${jiraSig}" type="button" onclick="event.preventDefault(); event.stopPropagation(); openPersonById('${entry.person.id}')" title="${esc(`Jira-Tickets von ${entry.person.name} ansehen (Stand: ${jiraSyncAgeLabel() || 'unbekannt'})${driftDetail ? '\n' + driftDetail : ''}`)}">
      <span class="tf-metric-label">Jira</span>
      <span class="tf-metric-value">${entry.jiraTickets.length ? ticketCountLabel(entry.jiraTickets.length) : 'keine tickets'}</span>
      ${driftParts.length ? `<span class="tf-metric-note">${driftParts.join(' · ')}</span>` : ''}
    </button>`;
}

// Vorschau statt Rueckschau: bei woechentlichem Rhythmus ist "wann war das
// letzte" immer dieselbe Antwort. Der Klick fuehrt in jedem Zustand ans Ziel —
// notfalls legt er das Gespraech gleich an.
function renderTeamFocusOneOnOneMetric(entry) {
  const meeting = entry.nextOneOnOne || entry.unscheduledOneOnOne
    || { id: '', type: 'oneOnOne', personId: entry.person.id, date: todayStr() };
  const carryover = carryoverCount(oneOnOneCarryover(meeting));
  const value = entry.nextOneOnOne
    ? oneOnOneDueLabel(entry.nextOneOnOne.date)
    : entry.unscheduledOneOnOne ? 'nicht terminiert' : 'keines geplant';
  const note = carryover
    ? `${carryover} mitzunehmen`
    : entry.nextOneOnOne ? 'nichts offen' : 'anlegen';
  const title = entry.nextOneOnOne ? 'Nächstes 1:1 öffnen'
    : entry.unscheduledOneOnOne ? '1:1 einplanen'
    : `Neues 1:1 mit ${entry.person.name} anlegen`;
  return `
    <button class="tf-metric tf-metric-action ${entry.nextOneOnOne ? 'tf-sig-ok' : 'tf-sig-warn'}" type="button" onclick="event.preventDefault(); event.stopPropagation(); openNextOneOnOne('${entry.person.id}')" title="${esc(title)}">
      <span class="tf-metric-label">1:1</span>
      <span class="tf-metric-value">${esc(value)}</span>
      <span class="tf-metric-note">${esc(note)}</span>
    </button>`;
}

function renderReviews() {
  const currentMonthLabel = currentMonth();
  const dueItems = data.items
    .filter(item => item.status !== 'done' && item.status !== 'backlog' && item.date && item.date <= todayStr())
    .sort(compareByDueDate);
  const upcomingMeetings = data.meetings
    .filter(meeting => meeting.type !== 'oneOnOne' && meeting.date && meeting.date >= todayStr())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const upcomingMarkers = (data.markers || [])
    .filter(marker => marker.date && marker.date >= todayStr())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const today = todayStr();
  const peopleAttention = data.persons
    .filter(person => person.type !== 'kontakt')
    .map(person => {
      const absenceToday = personAbsenceOnDate(person.id, today);
      const activeBlocks = personActiveBlocks(person.id, today);
      const overdueBlocks = personOverdueBlocks(person.id);
      // Ohne Fenster: die Liste scrollt ohnehin, und "ab 12.08." sagt mehr
      // als eine Stichtagsgrenze, die man nicht mehr einstellen kann.
      const upcomingBlocks = personUpcomingBlocks(person.id, today);
      const jiraTickets = jiraTicketsForPerson(person);
      const drift = jiraDriftForPerson(person);
      const nextOneOnOne = personNextOneOnOne(person.id);
      const unscheduledOneOnOne = nextOneOnOne ? null : personUnscheduledOneOnOne(person.id);
      const oneOnOneMissing = !nextOneOnOne;
      const entry = {
        person, absenceToday, activeBlocks, overdueBlocks, upcomingBlocks,
        jiraTickets, drift, nextOneOnOne, unscheduledOneOnOne, oneOnOneMissing,
      };
      entry.attentionScore = teamFocusScore(entry);
      entry.attentionLevel = entry.attentionScore >= 50 ? 'high' : entry.attentionScore >= 20 ? 'medium' : 'low';
      return entry;
    })
    .sort((a, b) => comparePersonsByName(a.person, b.person));

  return `
    <div class="section-header">
      ${renderDashboardLinks()}
      ${renderDashboardReviewAction()}
    </div>

    <div class="review-grid">
      <div class="card review-team-focus-card">
        <div class="card-header">
          <span class="card-title">Teamfokus</span>
        </div>
        <div class="review-team-focus-list">
        ${peopleAttention.length ? peopleAttention.map(entry => {
          const cardStateClass = entry.absenceToday ? 'absent' : entry.attentionLevel;
          const supportThisMonth = personSupportInMonth(entry.person, currentMonthLabel);
          return `
          <div class="tf-card tf-card-${cardStateClass}">
            <div class="tf-card-head">
              <button class="tf-person-link" type="button" onclick="openPersonById('${entry.person.id}')" title="Teammitglied öffnen">
                ${personAvatar(entry.person, 'md', { absent: !!entry.absenceToday, ...teamFocusAttentionBadge(entry) })}
              </button>
              <div class="tf-name-line">
                <button class="review-row-title tf-name-link" type="button" onclick="openPersonById('${entry.person.id}')" title="Teammitglied öffnen">${esc(entry.person.name)}</button>
                ${supportThisMonth ? `<span class="tl-sup-badge" title="Support ${esc(formatMonth(currentMonthLabel))}">sup</span>` : ''}
                ${entry.absenceToday ? `<span class="tf-absent-mark" title="${esc(`${entry.absenceToday.label || 'Abwesend'} · ${formatDate(entry.absenceToday.start)} – ${formatDate(entry.absenceToday.end)}`)}">${esc(teamFocusAbsenceLabel(entry.absenceToday))}</span>` : ''}
              </div>
            </div>
            <div class="tf-metric-row">
              ${renderTeamFocusJiraMetric(entry)}
              ${renderTeamFocusOneOnOneMetric(entry)}
            </div>
            ${renderTeamFocusBlocks(entry)}
          </div>`;
        }).join('') : '<div style="color:var(--text-muted);font-size:14px">Keine Teammitglieder vorhanden</div>'}
        </div>
      </div>

      <div class="card review-schedule-card">
        <div class="card-header"><span class="card-title">Nächste Meetings</span></div>
        ${renderReviewMeetingList(upcomingMeetings, 'Keine kommenden Meetings')}
      </div>

      <div class="card review-schedule-card">
        <div class="card-header"><span class="card-title">Events</span></div>
        ${renderReviewMarkerList(upcomingMarkers, 'Keine kommenden Events')}
      </div>

      <div class="card review-due-card">
        <div class="card-header">
          <span class="card-title">Fällig</span>
          <span class="search-summary">${dueItems.length} Items</span>
        </div>
        ${renderReviewDueList(dueItems)}
      </div>
    </div>

    ${renderMonthlyFocusPanel(currentMonthLabel)}
    ${renderMonthImpactPanel(currentMonthLabel)}
  `;
}
