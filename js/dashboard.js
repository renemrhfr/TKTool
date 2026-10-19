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
      title: 'Heute',
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
      <span>Monatsrückblicke</span>
      <span class="dashboard-review-count">${count}</span>
    </button>
  `;
}

// Wie alt sind Jira- und GitLab-Stand? Steht oben rechts, damit man vor dem
// Lesen der Karten weiss, ob sie noch stimmen. Klick oeffnet den Import.
// Ab einem Tag wird der Knopf gelb: dann zeigen die Karten gestern.
const SYNC_STALE_HOURS = 24;

const SYNC_ICONS = {
  // Jira: zwei verschraenkte Rauten, angelehnt ans Logo
  jira: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 14.5 8 8 14.5 1.5 8z" opacity=".45"/><path d="M8 4.5 11.5 8 8 11.5 4.5 8z"/></svg>',
  // GitLab: Merge-Symbol, zwei Zweige laufen zusammen
  gitlab: '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="4" cy="3.5" r="1.8"/><circle cx="4" cy="12.5" r="1.8"/><circle cx="12" cy="12.5" r="1.8"/><path d="M4 5.3v5.4M5.6 4.4c4 0 6.4 2 6.4 6.3"/></svg>',
};

function renderDashboardSyncButton(kind, label, generatedAt, onclick) {
  const ageHours = generatedAt ? (Date.now() - Date.parse(generatedAt)) / 3600000 : Infinity;
  const stale = !(ageHours < SYNC_STALE_HOURS);
  return `
    <button class="btn btn-secondary btn-sm dashboard-review-action dashboard-sync dashboard-sync-${kind} ${stale ? 'dashboard-sync-stale' : ''}" onclick="${onclick}" title="${label}-Stand aktualisieren${stale ? ' (älter als ein Tag)' : ''}">
      <span class="dashboard-sync-icon">${SYNC_ICONS[kind]}</span>
      <span>${label}</span>
      <span class="dashboard-sync-age">${esc(generatedAt ? agoLabel(generatedAt) : 'nie')}</span>
      <span aria-hidden="true">&#8635;</span>
    </button>`;
}

function renderDashboardSyncButtons() {
  const jira = jiraSyncData || getJiraBaseUrl()
    ? renderDashboardSyncButton('jira', 'Jira', jiraSyncData && jiraSyncData.generatedAt, 'openJiraImport()')
    : '';
  const gitlab = gitlabSyncData || getGitlabGroupUrls().length
    ? renderDashboardSyncButton('gitlab', 'GitLab', gitlabSyncData && gitlabSyncData.generatedAt, 'openGitlabImport()')
    : '';
  return jira + gitlab;
}

// Muss zur max-height von .tf-blocks-list passen: so viele Zeilen stehen ohne
// Scrollen da, der Rest wird als "+n" angekuendigt.
const TF_VISIBLE_BLOCKS = 10;
let openTeamFocusPersonId = null;

// Die Zahl am Avatar zaehlt nicht die Arbeit, sondern den Handlungsbedarf:
// Jira-Auftraege, an denen die Person arbeitet, die aber noch keinen Block
// haben. Zehn saubere Tickets sind kein Signal — und nur ein Signal gehoert
// an den Avatar, der aus drei Metern Abstand noch lesbar ist.
function teamFocusAttentionBadge(entry) {
  const count = entry.drift?.unplanned.length || 0;
  // Nichts offen heisst kein Badge: eine 0 waere nur Rauschen, und der ruhige
  // Avatar ist selbst die Aussage.
  if (!count) return {};
  return {
    count,
    countTone: 'warn',
    countTitle: `${count} ${count === 1 ? 'Auftrag' : 'Aufträge'} ohne Block`,
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

// Dasselbe Stoppzeichen wie in der Planung, damit ein festhaengender Block
// auf der Uebersicht genauso auffaellt wie dort.
function isBlockStuck(block) {
  return isBlockBlocked(block) && block.state !== 'done';
}

function blockStuckMark(block) {
  return isBlockStuck(block)
    ? `<span class="blocked-mark" title="${esc(blockBlockedLabel(block))}" aria-label="blockiert">⛔</span>`
    : '';
}

function teamFocusWorkingBlocks(entry) {
  return entry.activeBlocks.map(block => ({ block, kind: 'active' }));
}

function teamFocusBlocks(entry) {
  return [...teamFocusWorkingBlocks(entry),
    ...entry.upcomingBlocks.map(block => ({ block, kind: 'upcoming' }))];
}

function toggleTeamFocusCard(personId) {
  openTeamFocusPersonId = openTeamFocusPersonId === personId ? null : personId;
  document.querySelectorAll('.tf-card[data-person-id]').forEach(card => {
    const open = card.dataset.personId === openTeamFocusPersonId;
    const personName = card.dataset.personName || 'Teammitglied';
    card.classList.toggle('tf-card-open', open);
    const toggle = card.querySelector('.tf-card-toggle');
    const detail = card.querySelector('.tf-card-detail');
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', `Tickets von ${personName} ${open ? 'einklappen' : 'ausklappen'}`);
      toggle.title = `Tickets ${open ? 'einklappen' : 'ausklappen'}`;
    }
    if (detail) detail.hidden = !open;
  });
}

// Woran die Person arbeitet und was als naechstes kommt. Ein Klick fuehrt in
// die Planung.
function renderTeamFocusBlockRow(block, kind) {
  const handover = kind === 'active' ? teamFocusBlockHandoverStatus(block) : '';
  const canOpenJira = !!jiraUrl(blockAuftragKey(block));
  const label = blockDisplayLabel(block);
  const ref = blockAuftragKey(block);
  const stuck = kind === 'active' && isBlockStuck(block);
  const timing = kind === 'upcoming' ? `ab ${formatDateShort(block.start)}`
    : stuck ? blockBlockedLabel(block)
    : handover ? 'wartet'
    : block.overrun ? `über seit ${formatDateShort(block.plannedEnd)}`
    : `noch ${workdaysBetween(todayStr(), block.end)} wt`;
  const state = stuck ? blockBlockedLabel(block)
    : handover ? `wartet auf ${handover}`
    : block.overrun ? 'läuft über — laut Jira noch offen'
    : '';
  const title = [
    `${label} · ${formatDate(block.start)} – ${formatDate(block.plannedEnd || block.end)}`,
    state,
    canOpenJira ? `Jira: ${ref} (Cmd/Strg-Klick öffnet)` : '',
  ].filter(Boolean).join('\n');
  return `
    <button class="tf-block tf-block-${kind} ${handover ? 'tf-block-handover' : ''} ${block.overrun ? 'tf-block-overrun' : ''} ${stuck ? 'tf-block-blocked' : ''}" type="button" onclick="if((event.metaKey||event.ctrlKey)&&openBlockJira('${block.id}'))return;navigateToPlanungBlock('${block.id}')" title="${esc(title)}">
      <span class="tf-block-mark"></span>
      <span class="tf-block-body">
        ${stuck ? blockStuckMark(block) : ''}<span class="tf-block-title">${esc(label)}</span>
        ${ref ? `<span class="tf-block-ref">${esc(ref)}</span>` : ''}
      </span>
      <span class="tf-block-timing">${esc(timing)}</span>
    </button>
  `;
}

// Alle Bloecke der aufgeklappten Person. Bis zu zehn bleiben direkt sichtbar;
// darueber scrollt nur die Liste. Laufende stehen vor kommenden.
function renderTeamFocusBlocks(entry) {
  const blocks = teamFocusBlocks(entry);
  const empty = entry.absenceToday
    ? `${esc(teamFocusAbsenceLabel(entry.absenceToday))} · nichts geplant`
    : 'nichts geplant';
  // Dass unter den ersten zehn noch etwas liegt, sieht man sonst erst beim
  // Scrollen — der Hinweis steht deshalb unten am Schnitt.
  const hidden = Math.max(0, blocks.length - TF_VISIBLE_BLOCKS);
  return `
    <div class="tf-blocks${hidden ? ' tf-blocks-more' : ''}">
      <div class="tf-blocks-head">
        <span>Geplante Arbeit${blocks.length ? ` <span class="tf-blocks-count">${blocks.length}</span>` : ''}</span>
        <button class="tf-blocks-link" type="button" onclick="navigate('planung',{planungPerson:'${entry.person.id}'})">Planung von ${esc(entry.person.name)} öffnen →</button>
      </div>
      <div class="tf-blocks-scroll">
        <div class="tf-blocks-list">
          ${blocks.length
            ? ['active', 'upcoming'].map(kind => {
                const rows = blocks.filter(entry => entry.kind === kind);
                const title = { active: 'Aktuell eingeplant', upcoming: 'Danach geplant' }[kind];
                const description = { active: 'Der geplante Zeitraum umfasst heute', upcoming: 'Nach geplantem Startdatum' }[kind];
                return rows.length ? `<section class="tf-plan-group tf-plan-group-${kind}"><div class="tf-context-heading"><strong>${title} <span class="tf-blocks-count">${rows.length}</span></strong><span>${description}</span></div><div class="tf-plan-group-rows">${rows.map(({block}) => renderTeamFocusBlockRow(block, kind)).join('')}</div></section>` : '';
              }).join('')
            : `<div class="tf-blocks-empty">${empty}</div>`}
        </div>
      </div>
      ${hidden ? `<div class="tf-blocks-hint">+${hidden} ${hidden === 1 ? 'weiterer' : 'weitere'} ↓</div>` : ''}
    </div>
  `;
}

// Vorschau statt Rueckschau: bei woechentlichem Rhythmus ist "wann war das
// letzte" immer dieselbe Antwort. Der Klick fuehrt in jedem Zustand ans Ziel —
// notfalls legt er das Gespraech gleich an.
function renderTeamFocusOneOnOneMetric(entry) {
  const meeting = entry.nextOneOnOne || entry.unscheduledOneOnOne
    || { id: '', type: 'oneOnOne', personId: entry.person.id, date: todayStr() };
  const carryover = carryoverCount(oneOnOneCarryover(meeting));
  const points = oneOnOneOpenPrepCount(entry.nextOneOnOne || entry.unscheduledOneOnOne);
  const value = entry.nextOneOnOne
    ? oneOnOneDueLabel(entry.nextOneOnOne.date)
    : entry.unscheduledOneOnOne ? 'nicht terminiert' : 'keines geplant';
  const noteParts = [
    points ? `${points} ${points === 1 ? 'Punkt' : 'Punkte'}` : '',
    carryover ? `${carryover} mitzunehmen` : '',
  ].filter(Boolean);
  const note = noteParts.length
    ? noteParts.join(' · ')
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

// Statt "Jetzt 1 · Als Nächstes 0" steht da, woran die Person gerade
// arbeitet — die Zahl allein zwingt zum Aufklappen.
function renderTeamFocusNow(entry, workingBlocks) {
  // Ein blockierter Block steht vorne: er ist das, was man aus dem
  // eingeklappten Teamfokus heraus sehen muss.
  const current = (workingBlocks.find(({ block }) => isBlockStuck(block)) || workingBlocks[0])?.block;
  const next = entry.upcomingBlocks[0];
  if (current) {
    // Bei mehreren parallelen steht das zuerst endende da. Die Anzahl gehoert
    // in die Label-Zeile: viel Parallelarbeit ist selbst das Signal.
    const count = workingBlocks.length;
    const all = workingBlocks.map(({ block }) => `${isBlockStuck(block) ? '⛔ ' : ''}${blockDisplayLabel(block)}`).join('\n');
    return `
      <span class="tf-now"${count > 1 ? ` title="${esc(all)}"` : ''}>
        <span class="tf-now-label">${count > 1 ? `Arbeitet an <span class="tf-now-count${count >= 3 ? ' is-high' : ''}">${count} parallel</span>` : 'Arbeitet an'}</span>
        <span class="tf-now-title">${blockStuckMark(current)}${esc(blockDisplayLabel(current))}</span>
      </span>`;
  }
  if (next) {
    return `
      <span class="tf-now tf-now-next">
        <span class="tf-now-label">Ab ${esc(formatDateShort(next.start))}</span>
        <span class="tf-now-title">${esc(blockDisplayLabel(next))}</span>
      </span>`;
  }
  return '<span class="tf-now tf-now-empty"><span class="tf-now-label">Nichts eingeplant</span></span>';
}

// ------------------------------------------------------------
// Auftraege: nur was Aufmerksamkeit braucht
// ------------------------------------------------------------
// Bewusst keine Liste aller offenen Tickets — die steht in der Planung.
// Hier landet nur, was laenger braucht als geplant (laut Jira offen, die
// Schaetzung ist vorbei), gruppiert nach Auftrag mit den offenen Subtasks.
// Wartende Tickets (QA, Review) fehlen absichtlich: die liegen bei einem
// anderen Team und stehen schon in der Warteschlange.
function jiraOverrunGroups() {
  const today = todayStr();
  const groups = new Map();
  for (const block of (data.blocks || []).map(blockView)) {
    if (!block.overrun || isAbsenceBlock(block)) continue;
    const key = blockAuftragKey(block);
    if (!key) continue;
    const person = data.persons.find(p => p.id === block.personId) || null;
    const days = workdaysBetween(toISO(addDays(parseISO(block.plannedEnd), 1)), today);
    const subtasks = person ? (jiraPersonAuftragTickets(person, key) || []).filter(t => t.key !== key) : [];
    if (!groups.has(key)) groups.set(key, { key, title: blockDisplayLabel(block), rows: [], maxDays: 0 });
    const group = groups.get(key);
    group.rows.push({ block, person, days, subtasks });
    group.maxDays = Math.max(group.maxDays, days);
  }
  return [...groups.values()].sort((a, b) => b.maxDays - a.maxDays);
}

function jiraResolvedLastWeek() {
  if (!jiraSyncData || !Array.isArray(jiraSyncData.resolved)) return [];
  const cutoff = Date.now() - 7 * 86400000;
  const byAccount = new Map(data.persons.filter(p => p.jiraAccountId).map(p => [p.jiraAccountId.trim(), p]));
  return jiraSyncData.resolved
    .filter(t => Date.parse(t.resolvedAt) >= cutoff)
    .sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt))
    .map(t => ({ ...t, person: byAccount.get(t.accountId) || null }));
}

function renderJiraOverrunItem(group) {
  return `
    <li class="review-due-item review-due-item-danger">
      <button class="review-due-item-main" onclick="navigateToPlanungBlock('${group.rows[0].block.id}')" title="In der Planung zeigen">
        <span class="review-due-item-date">
          <span class="review-due-item-day">+${group.maxDays} wt</span>
          <span class="review-due-item-age">über Plan</span>
        </span>
        <span class="review-due-item-body">
          <span class="review-due-item-title"><span class="auftraege-key">${esc(group.key)}</span> ${esc(group.title)}</span>
          ${group.rows.map(row => `
            <span class="auftraege-person-row">
              <span class="auftraege-person">@${esc(row.person ? row.person.name : '?')}</span>
              <span class="auftraege-plan">geplant bis ${formatDateShort(row.block.plannedEnd)}</span>
              ${isBlockStuck(row.block) ? `<span class="auftraege-blocked">${blockStuckMark(row.block)} ${esc(blockBlockedLabel(row.block))}</span>` : ''}
            </span>
            ${row.subtasks.length ? `<span class="auftraege-subtasks">${row.subtasks.map(t => `
              <span class="auftraege-subtask"><span class="auftraege-key">${esc(t.key)}</span> ${esc(t.summary)}
                <span class="badge ${isJiraHandoverStatus(t.status) ? 'badge-waiting' : 'badge-todo'}">${esc(String(t.status || '').toLocaleLowerCase('de-AT'))}</span></span>`).join('')}
            </span>` : ''}
          `).join('')}
        </span>
      </button>
    </li>`;
}

function renderJiraResolvedItem(ticket) {
  const href = jiraUrl(ticket.key);
  return `
    <li class="review-due-item auftraege-item-calm">
      <button class="review-due-item-main" ${href ? `onclick="window.open('${esc(href)}', '_blank', 'noopener')" title="In Jira öffnen"` : ''}>
        <span class="review-due-item-date">
          <span class="review-due-item-day">${formatDateShort(ticket.resolvedAt)}</span>
          <span class="review-due-item-age">${esc(formatWeekdayShort(ticket.resolvedAt))}</span>
        </span>
        <span class="review-due-item-body">
          <span class="review-due-item-title"><span class="auftraege-key">${esc(ticket.key)}</span> ${esc(ticket.summary)}</span>
          <span class="review-due-item-meta">
            <span class="badge badge-done">erledigt</span>
            ${ticket.person ? `<span>@${esc(ticket.person.name)}</span>` : ''}
          </span>
        </span>
      </button>
    </li>`;
}

function renderJiraAuftraegeCard() {
  if (!jiraSyncData) return '';
  const overrun = jiraOverrunGroups();
  const resolved = jiraResolvedLastWeek();
  return `
    <div class="card auftraege-card">
      <div class="card-header"><span class="card-title">Aufträge</span></div>
      <div class="review-due-panel">
        <div class="review-due-sections">
          <div class="review-due-section review-due-section-danger">
            <div class="review-due-section-head">
              <div>
                <div class="review-due-section-title">Läuft über</div>
                <div class="review-due-section-hint">Laut Jira offen, Schätzung vorbei</div>
              </div>
              <span class="review-due-section-count">${overrun.length}</span>
            </div>
            ${overrun.length
              ? `<ul class="review-due-item-list">${overrun.map(renderJiraOverrunItem).join('')}</ul>`
              : '<div class="review-due-empty">Alles im Plan</div>'}
          </div>
          <div class="review-due-section review-due-section-success">
            <div class="review-due-section-head">
              <div>
                <div class="review-due-section-title">Diese Woche erledigt</div>
                <div class="review-due-section-hint">Letzte 7 Tage</div>
              </div>
              <span class="review-due-section-count">${resolved.length}</span>
            </div>
            ${resolved.length
              ? `<ul class="review-due-item-list">${resolved.map(renderJiraResolvedItem).join('')}</ul>`
              : '<div class="review-due-empty">Noch nichts abgeschlossen</div>'}
          </div>
        </div>
      </div>
    </div>`;
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
      // Ohne Fenster: die Liste scrollt ohnehin, und "ab 12.08." sagt mehr
      // als eine Stichtagsgrenze, die man nicht mehr einstellen kann.
      const upcomingBlocks = personUpcomingBlocks(person.id, today);
      const drift = jiraDriftForPerson(person);
      const nextOneOnOne = personNextOneOnOne(person.id);
      const unscheduledOneOnOne = nextOneOnOne ? null : personUnscheduledOneOnOne(person.id);
      const oneOnOneMissing = !nextOneOnOne;
      const entry = {
        person, absenceToday, activeBlocks, upcomingBlocks,
        drift, nextOneOnOne, unscheduledOneOnOne, oneOnOneMissing,
      };
      entry.attentionLevel = 'low';
      return entry;
    })
    .sort((a, b) => comparePersonsByName(a.person, b.person));

  if (openTeamFocusPersonId && !peopleAttention.some(entry => entry.person.id === openTeamFocusPersonId)) {
    openTeamFocusPersonId = null;
  }

  return `
    <div class="section-header">
      ${renderDashboardLinks()}
      <div class="dashboard-header-actions">
        ${renderDashboardSyncButtons()}
        ${renderDashboardReviewAction()}
      </div>
    </div>

    ${jiraWaitingTickets().length ? `<button class="dashboard-waiting" onclick="openWaitingQueue()"><strong>Warteschlange · ${jiraWaitingTickets().length} Tickets</strong><span>${esc(waitingStatusCounts(jiraWaitingTickets()))}</span><span>Teamweit ansehen →</span></button>` : ''}
    ${renderJiraChanges()}
    ${renderJiraAuftraegeCard()}
    ${renderGitlabMergeRequests()}
    <div class="review-grid">
      <div class="card review-due-card">
        <div class="card-header">
          <span class="card-title">Fällig</span>
          <span class="search-summary">${dueItems.length} Items</span>
        </div>
        ${renderReviewDueList(dueItems)}
      </div>
      <div class="card review-team-focus-card">
        <div class="card-header">
          <span class="card-title">Teamfokus</span>
        </div>
        <div class="review-team-focus-list">
        ${peopleAttention.length ? peopleAttention.map(entry => {
          const cardStateClass = entry.absenceToday ? 'absent' : entry.attentionLevel;
          const supportThisMonth = personSupportInMonth(entry.person, currentMonthLabel);
          const workingBlocks = teamFocusWorkingBlocks(entry);
          const open = entry.person.id === openTeamFocusPersonId;
          const detailId = `team-focus-${entry.person.id}`;
          return `
          <div class="tf-card tf-card-${cardStateClass}${open ? ' tf-card-open' : ''}" data-person-id="${esc(entry.person.id)}" data-person-name="${esc(entry.person.name)}">
            <div class="tf-card-summary" onclick="toggleTeamFocusCard('${entry.person.id}')">
              <div class="tf-card-head">
                <button class="tf-person-link" type="button" onclick="event.stopPropagation(); openPersonById('${entry.person.id}')" title="Teammitglied öffnen">
                  ${personAvatar(entry.person, 'md', { absent: !!entry.absenceToday, ...teamFocusAttentionBadge(entry) })}
                </button>
                <div class="tf-name-line">
                  <button class="review-row-title tf-name-link" type="button" onclick="event.stopPropagation(); openPersonById('${entry.person.id}')" title="Teammitglied öffnen">${esc(entry.person.name)}</button>
                  ${supportThisMonth ? `<span class="tl-sup-badge" title="Support ${esc(formatMonth(currentMonthLabel))}">sup</span>` : ''}
                  ${entry.absenceToday ? `<span class="tf-absent-mark" title="${esc(`${entry.absenceToday.label || 'Abwesend'} · ${formatDate(entry.absenceToday.start)} – ${formatDate(entry.absenceToday.end)}`)}">${esc(teamFocusAbsenceLabel(entry.absenceToday))}</span>` : ''}
                </div>
              </div>
              <div class="tf-metric-row">
                ${renderTeamFocusOneOnOneMetric(entry)}
              </div>
              <div class="tf-work-metric">
                ${renderTeamFocusNow(entry, workingBlocks)}
              </div>
              <span class="tf-card-actions">
                <button class="tf-point-add" type="button" onclick="event.stopPropagation(); openOneOnOnePointForm('${entry.person.id}')" title="Punkt fürs nächste 1:1 notieren" aria-label="Punkt fürs 1:1 mit ${esc(entry.person.name)} notieren">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6M9 10h6"/></svg>
                </button>
                <button class="tf-card-toggle" type="button" aria-expanded="${open}" aria-controls="${esc(detailId)}" onclick="event.stopPropagation(); toggleTeamFocusCard('${entry.person.id}')" title="Tickets ${open ? 'einklappen' : 'ausklappen'}" aria-label="Tickets von ${esc(entry.person.name)} ${open ? 'einklappen' : 'ausklappen'}">
                  <span aria-hidden="true">⌄</span>
                </button>
              </span>
            </div>
            <div class="tf-card-detail" id="${esc(detailId)}"${open ? '' : ' hidden'}>
              ${renderTeamFocusBlocks(entry)}
            </div>
          </div>`;
        }).join('') : '<div style="color:var(--text-muted);font-size:14px">Keine Teammitglieder vorhanden</div>'}
        </div>
      </div>

      <div class="review-side-column">
      <div class="card review-schedule-card">
        <div class="card-header"><span class="card-title">Nächste Meetings</span></div>
        ${renderReviewMeetingList(upcomingMeetings, 'Keine kommenden Meetings')}
      </div>

      <div class="card review-schedule-card">
        <div class="card-header"><span class="card-title">Events</span></div>
        ${renderReviewMarkerList(upcomingMarkers, 'Keine kommenden Events')}
      </div>

      </div>
    </div>

    ${renderMonthlyFocusPanel(currentMonthLabel)}
    ${renderMonthImpactPanel(currentMonthLabel)}
  `;
}
