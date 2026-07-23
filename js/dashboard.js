// ============================================================
// DASHBOARD / REVIEWS
// ============================================================
function reviewPeriod() {
  if (viewState.reviewPeriod === 'month' || viewState.reviewPeriod === 'week') {
    return viewState.reviewPeriod;
  }
  try {
    const saved = localStorage.getItem(REVIEW_PERIOD_KEY);
    return saved === 'month' ? 'month' : 'week';
  } catch {
    return 'week';
  }
}

function setReviewPeriod(period) {
  const next = period === 'month' ? 'month' : 'week';
  viewState.reviewPeriod = next;
  try {
    localStorage.setItem(REVIEW_PERIOD_KEY, next);
  } catch {}
  render();
}

function renderReviewItemList(items, emptyText) {
  if (!items.length) return `<div style="color:var(--text-muted);font-size:14px">${emptyText}</div>`;
  return `<ul class="item-list">${items.map(item => renderItem(item)).join('')}</ul>`;
}

function renderReviewMeetingList(meetings, emptyText) {
  if (!meetings.length) return `<div style="color:var(--text-muted);font-size:14px">${emptyText}</div>`;
  return meetings.map(meeting => {
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
  }).join('');
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
  if (!markers.length) return `<div style="color:var(--text-muted);font-size:14px">${emptyText}</div>`;
  return markers.map(marker => {
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
  }).join('');
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

function renderReviews() {
  const period = reviewPeriod();
  const currentMonthLabel = currentMonth();
  const dueItems = data.items
    .filter(item => item.status !== 'done' && item.status !== 'backlog' && item.date && item.date <= todayStr())
    .sort(compareByDueDate);
  const upcomingOneOnOnes = data.meetings
    .filter(meeting => meeting.type === 'oneOnOne' && (!meeting.date || meeting.date >= todayStr()))
    .sort(compareUpcomingMeetingDate)
    .slice(0, 6);
  const upcomingMeetings = data.meetings
    .filter(meeting => meeting.type !== 'oneOnOne' && meeting.date && meeting.date >= todayStr())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);
  const upcomingMarkers = (data.markers || [])
    .filter(marker => marker.date && marker.date >= todayStr())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const periodDays = period === 'month' ? 30 : 7;
  const planStart = todayStr();
  const planEnd = dateShift(planStart, periodDays - 1);
  const today = todayStr();
  const todoMonth = currentMonth();
  const peopleAttention = data.persons
    .filter(person => person.type !== 'kontakt')
    .map(person => {
      const openItems = data.items.filter(item => item.personId === person.id && item.month === todoMonth && item.status !== 'done');
      const waitingItems = openItems.filter(item => item.status === 'waiting');
      const dueWaiting = waitingItems.filter(item => item.date && item.date <= today);
      const dueTodos = openItems.filter(item => item.status === 'todo' && item.date && item.date <= today);
      const lastOneOnOne = personLastOneOnOneDate(person.id);
      const absenceToday = personAbsenceOnDate(person.id, today);
      const cap = personCapacity(person.id, planStart, planEnd);
      const daysSinceOneOnOne = lastOneOnOne ? Math.round((parseISO(today) - parseISO(lastOneOnOne)) / 86400000) : null;
      const utilization = cap.werktage > 0 ? Math.round((cap.allokiert / cap.werktage) * 100) : 0;
      const overPlanned = cap.frei < 0;
      const underPlanned = !overPlanned && cap.werktage > 0 && utilization < 60;
      const oneOnOneStale = daysSinceOneOnOne !== null && daysSinceOneOnOne > 7;
      const oneOnOneVeryStale = daysSinceOneOnOne !== null && daysSinceOneOnOne > 21;
      const attentionScore =
        (dueWaiting.length * 20) +
        (dueTodos.length * 12) +
        (waitingItems.length * 10) +
        (openItems.length * 4) +
        (overPlanned ? 45 + Math.abs(cap.frei) * 3 : 0) +
        (underPlanned ? 34 : 0) +
        (oneOnOneVeryStale ? 20 : oneOnOneStale ? 12 : 0) +
        (!lastOneOnOne ? 18 : 0);
      const attentionLevel = attentionScore >= 50 ? 'high' : attentionScore >= 20 ? 'medium' : 'low';
      const workloadHint = cap.werktage > 0
        ? `${cap.allokiert}/${cap.werktage} WT belegt · ${utilization}%`
        : '0/0 WT belegt · 0%';
      let planningState;
      let planningHint;
      if (cap.werktage === 0) {
        planningState = 'kein Plan';
        planningHint = 'kein Planfenster';
      } else if (overPlanned) {
        planningState = 'entlasten';
        planningHint = `${Math.abs(cap.frei)} WT überplant`;
      } else if (underPlanned) {
        planningState = 'unterplant';
        planningHint = `${cap.frei} WT frei`;
      } else {
        planningState = 'ausgeglichen';
        planningHint = cap.frei === 0 ? 'voll belegt' : `${cap.frei} WT frei`;
      }
      return {
        person, openItems, waitingItems, dueWaiting, dueTodos,
        absenceToday,
        lastOneOnOne, daysSinceOneOnOne, oneOnOneStale, oneOnOneVeryStale,
        attentionScore, attentionLevel, cap, utilization, workloadHint, planningState, planningHint,
        overPlanned, underPlanned,
      };
    })
    .sort((a, b) => {
      if (!!a.absenceToday !== !!b.absenceToday) return a.absenceToday ? 1 : -1;
      if (b.attentionScore !== a.attentionScore) return b.attentionScore - a.attentionScore;
      return a.person.name.localeCompare(b.person.name, 'de-AT');
    });

  return `
    <div class="section-header">
      ${renderDashboardLinks()}
      ${renderDashboardReviewAction()}
    </div>

    <div class="review-grid">
      <div class="card review-team-focus-card">
        <div class="card-header">
          <span class="card-title">Teamfokus <span class="tf-period-hint">&middot; nächste ${periodDays} Tage</span></span>
          <div class="team-focus-tools">
            <div class="filters">
              <button class="filter-btn ${period === 'week' ? 'active' : ''}" onclick="setReviewPeriod('week')">7 Tage</button>
              <button class="filter-btn ${period === 'month' ? 'active' : ''}" onclick="setReviewPeriod('month')">30 Tage</button>
            </div>
            <span
              class="info-chip"
              title="Ranking nach Aufmerksamkeitsbedarf. Signale: offene Items im aktuellen Todo-Monat, Planungsauslastung (nächste ${periodDays} Tage), 1:1-Abstand (>7d markiert, >21d stark). Abwesenheit heute wird grau markiert."
              aria-label="Erklärung zum Teamfokus-Ranking"
            >?</span>
          </div>
        </div>
        <div class="review-team-focus-list">
        ${peopleAttention.length ? peopleAttention.map(entry => {
          const oneOnOneLabel = entry.daysSinceOneOnOne === null
            ? 'nie'
            : entry.daysSinceOneOnOne < -1 ? `in ${Math.abs(entry.daysSinceOneOnOne)} Tagen`
            : entry.daysSinceOneOnOne === -1 ? 'morgen'
            : entry.daysSinceOneOnOne === 0 ? 'heute'
            : entry.daysSinceOneOnOne === 1 ? 'gestern'
            : `vor ${entry.daysSinceOneOnOne} Tagen`;
          const attentionLabel = teamFocusStatusReason(entry);
          const rowStateClass = entry.absenceToday ? 'absent' : entry.attentionLevel;
          const absenceLabel = entry.absenceToday ? (entry.absenceToday.label || 'Abwesenheit') : '';
          const lastOneOnOneMeeting = personLastOneOnOneMeeting(entry.person.id);
          const itemLabel = entry.dueWaiting.length
            ? `${entry.openItems.length} offen · ${entry.dueWaiting.length} fällig wartet`
            : entry.waitingItems.length
              ? `${entry.openItems.length} offen · ${entry.waitingItems.length} wartet`
            : entry.openItems.length
              ? `${entry.openItems.length} offen`
              : 'keine offenen Items';
          const supportItems = entry.openItems.filter(item => item.status !== 'waiting');
          const supportThisMonth = personSupportInMonth(entry.person, currentMonthLabel);
          const detailTitle = `${attentionLabel} | ${itemLabel} | ${entry.workloadHint} | 1:1 ${oneOnOneLabel}${supportThisMonth ? ` | Support ${formatMonth(currentMonthLabel)}` : ''}${absenceLabel ? ' | heute: ' + absenceLabel : ''}`;
          return `
          <details class="review-row review-row-${rowStateClass}" title="${esc(detailTitle)}">
            <summary>
              <button class="tf-person-link" type="button" onclick="event.preventDefault(); event.stopPropagation(); openPersonById('${entry.person.id}')" title="Teammitglied öffnen">
                ${personAvatar(entry.person, 'md', { absent: !!entry.absenceToday })}
              </button>
              <div class="tf-main">
                <div class="tf-name-line">
                  <button class="review-row-title tf-name-link" type="button" onclick="event.preventDefault(); event.stopPropagation(); openPersonById('${entry.person.id}')" title="Teammitglied öffnen">${esc(entry.person.name)}</button>
                  ${supportThisMonth ? `<span class="tl-sup-badge" title="Support ${esc(formatMonth(currentMonthLabel))}">sup</span>` : ''}
                </div>
                <div class="tf-expanded-subline">
                  <span class="tf-subline-label">Planung</span>
                  <span class="tf-subline-value">${entry.planningState}</span>
                  <span class="tf-subline-sep">·</span>
                  <span>${entry.planningHint}</span>
                </div>
              </div>
              <div class="review-row-side">
                ${attentionLabel ? `<div class="tf-state tf-state-${rowStateClass}">${esc(attentionLabel)}</div>` : ''}
                <div class="tf-util">${entry.openItems.length} offen</div>
              </div>
              <span class="tf-expand" aria-hidden="true"></span>
            </summary>
            <div class="tf-mini-dashboard">
              ${jiraSyncData ? (() => {
                const personJiraTickets = jiraTicketsForPerson(entry.person);
                if (personJiraTickets === null) {
                  return `
                    <button class="tf-metric tf-metric-action" type="button" onclick="event.preventDefault(); event.stopPropagation(); openPersonForm('${entry.person.id}')" title="jira-user im Profil ergänzen">
                      <span class="tf-metric-label">Jira</span>
                      <span class="tf-metric-value">&ndash;</span>
                      <span class="tf-metric-note">kein jira-user</span>
                    </button>`;
                }
                const drift = jiraDriftForPerson(entry.person);
                const driftParts = [];
                if (drift.unplanned.length) driftParts.push(`${drift.unplanned.length} nicht eingeplant`);
                if (drift.stale.length) driftParts.push(`${drift.stale.length} ${drift.stale.length === 1 ? 'block' : 'blocks'} veraltet`);
                const driftDetail = [
                  drift.unplanned.length ? `Ohne Block: ${drift.unplanned.map(t => t.key).join(', ')}` : '',
                  drift.stale.length ? `Veraltet: ${drift.stale.map(b => `${b.label || b.jiraRef} (${b.jiraRef})`).join(', ')}` : '',
                ].filter(Boolean).join('\n');
                const jiraSig = driftParts.length ? 'tf-sig-warn' : 'tf-sig-ok';
                return `
                  <button class="tf-metric tf-metric-action ${jiraSig}" type="button" onclick="event.preventDefault(); event.stopPropagation(); openPersonById('${entry.person.id}')" title="${esc(`Jira-Tickets von ${entry.person.name} ansehen (Stand: ${jiraSyncAgeLabel() || 'unbekannt'})${driftDetail ? '\n' + driftDetail : ''}`)}">
                    <span class="tf-metric-label">Jira</span>
                    <span class="tf-metric-value">${personJiraTickets.length ? `${personJiraTickets.length} tickets` : 'keine tickets'}</span>
                    ${driftParts.length ? `<span class="tf-metric-note">${driftParts.join(' · ')}</span>` : ''}
                  </button>`;
              })() : ''}
              <button class="tf-metric tf-metric-action ${entry.overPlanned ? 'tf-sig-bad' : entry.underPlanned ? 'tf-sig-warn' : 'tf-sig-ok'}" type="button" onclick="event.preventDefault(); event.stopPropagation(); openPersonById('${entry.person.id}')" title="Teammitglied öffnen">
                <span class="tf-metric-label">Workload</span>
                <span class="tf-metric-value">${entry.workloadHint}</span>
                <span class="tf-metric-note">${entry.planningState}</span>
              </button>
              <button class="tf-metric tf-metric-action ${entry.daysSinceOneOnOne === null || entry.oneOnOneVeryStale ? 'tf-sig-bad' : entry.oneOnOneStale ? 'tf-sig-warn' : 'tf-sig-ok'}" type="button" onclick="event.preventDefault(); event.stopPropagation(); ${lastOneOnOneMeeting ? `openMeetingDetail('${lastOneOnOneMeeting.id}')` : `openPersonById('${entry.person.id}')`}" title="${lastOneOnOneMeeting ? 'Letztes 1:1 öffnen' : 'Kein 1:1 vorhanden'}">
                <span class="tf-metric-label">Letztes 1:1</span>
                <span class="tf-metric-value">${entry.lastOneOnOne ? oneOnOneLabel : 'noch keines'}</span>
              </button>
              <button class="tf-metric tf-metric-action ${entry.dueWaiting.length ? 'tf-sig-bad' : (supportItems.length || entry.waitingItems.length) ? 'tf-sig-warn' : 'tf-sig-ok'}" type="button" onclick="event.preventDefault(); event.stopPropagation(); openPersonTodos('${entry.person.id}')" title="Todo-Liste nach ${esc(entry.person.name)} filtern">
                <span class="tf-metric-label">Items</span>
                <span class="tf-metric-value">${itemLabel}</span>
                <span class="tf-metric-note">${entry.dueWaiting.length ? 'nachfassen' : supportItems.length ? 'unterstützen' : entry.waitingItems.length ? 'warten auf' : 'alles erledigt'}</span>
              </button>
            </div>
          </details>`;
        }).join('') : '<div style="color:var(--text-muted);font-size:14px">Keine Teammitglieder vorhanden</div>'}
              </div>
            </div>

      <div class="review-meeting-stack">
        <div class="card">
          <div class="card-header"><span class="card-title">Nächste Meetings</span></div>
          ${renderReviewMeetingList(upcomingMeetings, 'Keine kommenden Meetings')}
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Nächste 1:1</span></div>
          ${renderReviewMeetingList(upcomingOneOnOnes, 'Keine kommenden 1:1s')}
        </div>
      </div>

      <div class="card review-events-card">
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
