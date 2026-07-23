// ============================================================
// JIRA TICKETS (aus Sync-Snapshot jira-tickets.json)
// ============================================================
// Der Stempel ist zugleich der Sync-Button: Klick liest die vom externen
// Skript geschriebene jira-tickets.json neu ein.
function jiraSyncStamp() {
  const age = jiraSyncAgeLabel();
  return `<button class="jira-sync-stamp" type="button" onclick="event.stopPropagation(); refreshJiraSync()" title="Snapshot neu einlesen (das Sync-Skript selbst läuft per Aufgabenplanung)">stand: ${age || 'unbekannt'} &#8635;</button>`;
}

function renderPersonJiraBlock(person) {
  if (!jiraSyncData) return '';
  const tickets = jiraTicketsForPerson(person);
  if (tickets === null) {
    return `
      <div class="team-section-block">
        <div class="card-header">
          <span class="card-title">jira tickets</span>
          ${jiraSyncStamp()}
        </div>
        <div class="team-empty-copy">Kein jira-user hinterlegt &mdash; im Profil unter &bdquo;Bearbeiten&ldquo; ergänzen.</div>
      </div>
    `;
  }
  return `
    <div class="team-section-block">
      <div class="card-header">
        <span class="card-title">jira tickets (${tickets.length})</span>
        ${jiraSyncStamp()}
      </div>
      ${tickets.length ? `
        <div class="jira-ticket-list">
          ${tickets.map(t => {
            const url = jiraUrl(t.key);
            const keyEl = url
              ? `<a class="jira-ticket-key" href="${esc(url)}" target="_blank" rel="noopener">${esc(t.key)}</a>`
              : `<span class="jira-ticket-key">${esc(t.key)}</span>`;
            return `
              <div class="jira-ticket-row">
                ${keyEl}
                <span class="jira-ticket-summary" title="${esc(t.summary || '')}">${esc(t.summary || '')}</span>
                <span class="jira-status-chip jira-status-${esc(t.statusCategory || 'new')}">${esc((t.status || '').toLowerCase())}</span>
              </div>
            `;
          }).join('')}
        </div>
      ` : '<div class="team-empty-copy">Keine offenen Tickets assigned</div>'}
    </div>
  `;
}

// ============================================================
// TEAM VIEW
// ============================================================
function renderTeam() {
  const sudo = isSudoMode();
  const teamPersons = data.persons
    .filter(p => p.type !== 'kontakt')
    .slice()
    .sort(comparePersonsByName);
  const selectedId = teamPersons.some(person => person.id === viewState.personId)
    ? viewState.personId
    : (teamPersons[0]?.id || null);
  const selectedPerson = selectedId ? data.persons.find(person => person.id === selectedId) : null;
  const selectedItems = selectedPerson ? data.items.filter(item => item.personId === selectedPerson.id) : [];
  const selectedOpenItems = selectedItems.filter(item => item.status !== 'done').sort(compareByDueDate);
  const selectedGrowth = selectedItems
    .filter(isGrowthEntry)
    .sort(compareItemsByDateDesc);
  const growthFilter = viewState.teamGrowthFilter || 'all';
  const selectedGrowthItems = growthFilter === 'all'
    ? selectedGrowth
    : selectedGrowth.filter(item => item.type === growthFilter);
  const selectedGrowthSignal = selectedPerson ? personGrowthSignal(selectedPerson.id, 30) : { highlights: 0, concerns: 0 };
  const selectedMeetings = selectedPerson
    ? data.meetings
      .filter(meeting => meetingParticipantIds(meeting).includes(selectedPerson.id))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    : [];
  return `
    <div class="section-header">
      <span class="section-title">Team</span>
      <button class="btn btn-primary btn-sm" onclick="openPersonForm(null, 'team')">+ Teammitglied</button>
    </div>
    ${teamPersons.length ? `
      <div class="team-layout">
        <aside class="team-sidebar card">
          <div class="card-header">
            <span class="card-title">Team (${teamPersons.length})</span>
          </div>
        ${teamPersons.map(p => {
          const itemCount = data.items.filter(i => i.personId === p.id && i.status !== 'done').length;
          const personJiraTickets = jiraTicketsForPerson(p);
          const isActive = p.id === selectedId;
          return `
            <div class="team-list-row ${isActive ? 'active' : ''}" onclick="navigate('team', {personId:'${p.id}'})" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();navigate('team', {personId:'${p.id}'})}">
              <div class="team-list-main">
                ${personAvatar(p, 'md')}
                <div class="team-list-copy">
	                  <div class="team-list-head">
	                    <div class="team-list-name">
	                      ${esc(p.name)}
	                    </div>
	                  </div>
	                  ${sudo ? `<div class="team-list-push">${p.pushDirection ? esc(p.pushDirection) : '&nbsp;'}</div>` : ''}
	                  <div class="team-list-meta">
	                    <span>${itemCount} offen</span>
	                    ${personJiraTickets !== null ? `<span>&middot; ${personJiraTickets.length} tickets</span>` : ''}
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
        </aside>
        <section class="team-detail-panel card">
          ${selectedPerson ? `
            <div class="team-detail-header">
              <div class="team-detail-topline">
                <div class="team-detail-identity">
                  ${personAvatar(selectedPerson, 'lg')}
                  <div class="team-detail-copy">
	                    <div class="team-detail-name">
	                      ${esc(selectedPerson.name)}
	                    </div>
	                    ${sudo ? `<div class="team-detail-focus-line">
	                      <span class="team-detail-meta-label">Fokus</span>
	                      <strong class="team-detail-focus-value">${selectedPerson.pushDirection ? esc(selectedPerson.pushDirection) : 'Kein Fokus hinterlegt'}</strong>
	                    </div>` : `<div class="team-detail-focus-line">${sudoLockedPlaceholder('Fokus')}</div>`}
	                    <div class="team-detail-links">
	                      ${renderMemberLinkBar(selectedPerson)}
                    </div>
                  </div>
                </div>
                <div class="team-detail-actions">
                  <button class="btn btn-secondary btn-sm" onclick="openMeetingForm('oneOnOne', '${selectedPerson.id}')">+ 1:1</button>
                  <button class="btn btn-secondary btn-sm" onclick="openPersonForm('${selectedPerson.id}')">Bearbeiten</button>
                </div>
              </div>
            </div>

            <div class="team-section-block team-section-planung">
              ${renderPersonPlanungCard(selectedPerson)}
            </div>

            ${renderPersonJiraBlock(selectedPerson)}

            <div class="team-detail-grid">
              <div class="team-section-block">
                <div class="card-header">
                  <span class="card-title">Offene Items (${selectedOpenItems.length})</span>
                </div>
                ${selectedOpenItems.length ? `
                  <ul class="item-list">
                    ${selectedOpenItems.slice(0, 8).map(item => renderItem(item, false, { compact: true })).join('')}
                  </ul>
                ` : '<div class="team-empty-copy">Keine offenen Items</div>'}
              </div>
              <div class="team-section-block">
                <div class="card-header">
                  <span class="card-title">Meetings (${selectedMeetings.length})</span>
                </div>
                ${selectedMeetings.length ? `
                  <div class="team-meeting-list team-meeting-list-scroll">
                    ${selectedMeetings.map(meeting => `
                      <button class="team-meeting-row" onclick="navigate('meetings:detail', {meetingId:'${meeting.id}'})">
                        <span class="team-meeting-title">${meetingDisplayTitle(meeting)}</span>
                        <span class="team-meeting-date">${formatDate(meeting.date)}</span>
                      </button>
                    `).join('')}
                  </div>
                ` : '<div class="team-empty-copy">Noch keine Meetings</div>'}
              </div>
            </div>

	            ${sudo ? `<div class="team-section-block">
                <div class="card-header">
                  <span class="card-title">growth journal</span>
                  <span style="color:var(--text-muted);font-size:12px">30 Tage · +${selectedGrowthSignal.highlights} / -${selectedGrowthSignal.concerns}</span>
                </div>
                <div class="filters">
                  <button class="filter-btn ${growthFilter === 'all' ? 'active' : ''}" onclick="viewState.teamGrowthFilter='all';render()">Alle</button>
                  <button class="filter-btn ${growthFilter === 'highlight' ? 'active' : ''}" onclick="viewState.teamGrowthFilter='highlight';render()">Highlights</button>
                  <button class="filter-btn ${growthFilter === 'concern' ? 'active' : ''}" onclick="viewState.teamGrowthFilter='concern';render()">Concerns</button>
                </div>
	                ${selectedGrowthItems.length ? `
	                  <div class="growth-list">
	                    ${selectedGrowthItems.map(item => `
                      <div class="growth-entry growth-${item.type}" onclick="openEditItem('${item.id}')">
                        <span class="growth-date">${formatDateShort(item.date) || '&ndash;'}</span>
                        <span class="badge badge-${item.type}">${itemTypeLabel(item.type)}</span>
                        <span class="growth-text">${esc(item.text)}</span>
                      </div>
                    `).join('')}
	                  </div>
	                ` : `<div class="team-empty-copy">Noch keine Highlights oder Concerns f&uuml;r ${esc(selectedPerson.name)}.</div>`}
	            </div>` : `<div class="team-section-block">${sudoLockedPlaceholder('growth journal')}</div>`}

	            ${sudo ? `<div class="meeting-detail-section team-section-block">
	              <h3>Notizen</h3>
	              <textarea class="form-textarea" rows="5" placeholder="Interne Notizen..."
	                oninput="updatePersonFieldDebounced('${selectedPerson.id}','notes',this.value)">${esc(selectedPerson.notes || '')}</textarea>
	            </div>` : `<div class="meeting-detail-section team-section-block">${sudoLockedPlaceholder('Notizen')}</div>`}
          ` : `
            <div class="empty-state">
              <div class="empty-state-icon">&#128101;</div>
              <div class="empty-state-text">Teammitglied wählen</div>
            </div>
          `}
        </section>
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-state-icon">&#128101;</div>
        <div class="empty-state-text">Noch keine Teammitglieder angelegt</div>
      </div>
    `}
  `;
}

// ============================================================
// PERSON DETAIL
// ============================================================
function renderPersonDetail() {
  const p = data.persons.find(p => p.id === viewState.personId);
  if (!p) return '<div>Person nicht gefunden</div>';

  const items = data.items.filter(i => i.personId === p.id);
  const openItems = items.filter(i => i.status !== 'done');
  const meetings = data.meetings.filter(m => m.personId === p.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const growth = items
    .filter(isGrowthEntry)
    .sort(compareItemsByDateDesc);
  const growthSignal = personGrowthSignal(p.id, 30);

  return `
    <button class="back-btn" onclick="navigate('team')">&#8592; Zurück</button>

    <div class="person-detail-header">
      <div class="person-avatar">${p.name.charAt(0).toUpperCase()}</div>
      <div>
        <div style="font-size:22px;font-weight:700;display:flex;align-items:center;gap:8px">
          ${esc(p.name)}
        </div>
        ${p.pushDirection ? `<div style="color:var(--text-secondary);font-size:14px;margin-top:2px">Push: ${esc(p.pushDirection)}</div>` : ''}
        ${renderMemberLinkBar(p)}
      </div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="openPersonForm('${p.id}')">Bearbeiten</button>
        <button class="btn btn-secondary btn-sm" onclick="exportPerson('${p.id}')">Export .md</button>
      </div>
    </div>

    ${renderPersonPlanungCard(p)}

    ${jiraSyncData ? `<div class="card">${renderPersonJiraBlock(p)}</div>` : ''}

    <div class="card">
      <div class="card-header"><span class="card-title">Offene Items (${openItems.length})</span></div>
      ${openItems.length ? `<ul class="item-list">${openItems.map(i => renderItem(i)).join('')}</ul>` : '<div style="color:var(--text-muted);font-size:14px">Keine offenen Items</div>'}
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">1:1 Gespräche (${meetings.length})</span>
        <button class="btn btn-sm btn-secondary" onclick="openMeetingForm('oneOnOne', '${p.id}')">+ 1:1</button>
      </div>
      ${meetings.length ? meetings.map(m => `
        <div class="meeting-card" onclick="navigate('meetings:detail', {meetingId:'${m.id}'})">
          <div class="meeting-type-icon" style="background:var(--success-light)">&#128172;</div>
          <div class="meeting-info">
            <div class="meeting-title">1:1 mit ${esc(p.name)}</div>
            <div class="meeting-date">${m.date ? formatDate(m.date) : 'ohne Datum'}${meetingItems(m.id).length ? ' · ' + meetingItems(m.id).length + ' Follow-up' + (meetingItems(m.id).length === 1 ? '' : 's') : ''}</div>
          </div>
        </div>
      `).join('') : '<div style="color:var(--text-muted);font-size:14px">Noch keine Gespräche</div>'}
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">growth journal</span>
        <span style="color:var(--text-muted);font-size:12px">30 Tage · +${growthSignal.highlights} / -${growthSignal.concerns}</span>
      </div>
      ${growth.length ? `
        <div class="growth-list">
          ${growth.map(i => `
            <div class="growth-entry growth-${i.type}" onclick="openEditItem('${i.id}')">
              <span class="growth-date">${formatDateShort(i.date) || '&ndash;'}</span>
              <span class="badge badge-${i.type}">${itemTypeLabel(i.type)}</span>
              <span class="growth-text">${esc(i.text)}</span>
            </div>
          `).join('')}
        </div>
      ` : `<div style="color:var(--text-muted);font-size:14px">Noch keine Highlights oder Concerns f&uuml;r ${esc(p.name)}.</div>`}
    </div>
  `;
}

// ============================================================
// KONTAKTE VIEW
// ============================================================
function renderKontakte() {
  const kontakte = data.persons
    .filter(p => p.type === 'kontakt')
    .slice()
    .sort(comparePersonsByName);
  const selectedId = kontakte.some(person => person.id === viewState.personId)
    ? viewState.personId
    : (kontakte[0]?.id || null);
  const selectedPerson = selectedId ? data.persons.find(person => person.id === selectedId) : null;
  const selectedItems = selectedPerson ? data.items.filter(item => item.personId === selectedPerson.id) : [];
  const selectedOpenItems = selectedItems.filter(item => item.status !== 'done').sort(compareByDueDate);
  return `
    <div class="section-header">
      <span class="section-title">Kontakte</span>
      <button class="btn btn-primary btn-sm" onclick="openPersonForm(null, 'kontakt')">+ Kontakt</button>
    </div>
    ${kontakte.length ? `
      <div class="team-layout">
        <aside class="team-sidebar card">
          <div class="card-header">
            <span class="card-title">Kontakte (${kontakte.length})</span>
          </div>
          ${kontakte.map(p => {
            const itemCount = data.items.filter(i => i.personId === p.id && i.status !== 'done').length;
            const isActive = p.id === selectedId;
            const openLevel = Math.min(4, itemCount);
            return `
              <div class="team-list-row ${isActive ? 'active' : ''}" onclick="navigate('kontakte', {personId:'${p.id}'})" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();navigate('kontakte', {personId:'${p.id}'})}">
              <div class="team-list-main">
                ${personAvatar(p, 'md')}
                <div class="team-list-copy">
                  <div class="team-list-name">${esc(p.name)}</div>
                  <div class="contact-open-indicator" aria-label="${itemCount} offene Items" title="${itemCount} offene Items">
                    ${Array.from({ length: 4 }, (_, idx) => `<span class="contact-open-dot ${idx < openLevel ? 'active' : ''}"></span>`).join('')}
                  </div>
                </div>
              </div>
              </div>
            `;
          }).join('')}
        </aside>
        <section class="team-detail-panel card">
          ${selectedPerson ? `
            <div class="team-detail-header">
              <div class="team-detail-identity">
                ${personAvatar(selectedPerson, 'lg')}
                <div class="team-detail-copy" style="flex:1;min-width:0">
                  <div class="team-detail-topline">
                    <div class="team-detail-name">${esc(selectedPerson.name)}</div>
                    <div class="team-detail-actions">
                      <button class="btn btn-secondary btn-sm" onclick="openPersonForm('${selectedPerson.id}')">Bearbeiten</button>
                    </div>
                  </div>
                  <div class="team-detail-push">Kontakt</div>
                </div>
              </div>
            </div>

	            <div>
	              <div>
	                <div class="card-header">
                  <span class="card-title">Offene Items (${selectedOpenItems.length})</span>
                </div>
                ${selectedOpenItems.length
                  ? `<ul class="item-list">${selectedOpenItems.slice(0, 10).map(item => renderItem(item, false, { compact: true })).join('')}</ul>`
                  : '<div class="team-empty-copy">Keine offenen Items</div>'}
              </div>
	            </div>
          ` : `
            <div class="empty-state">
              <div class="empty-state-icon">&#128101;</div>
              <div class="empty-state-text">Kontakt wählen</div>
            </div>
          `}
        </section>
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-state-icon">&#128101;</div>
        <div class="empty-state-text">Noch keine Kontakte angelegt</div>
      </div>
    `}
  `;
}

// ============================================================
// KONTAKT DETAIL
// ============================================================
function renderKontaktDetail() {
  const p = data.persons.find(p => p.id === viewState.personId);
  if (!p) return '<div>Kontakt nicht gefunden</div>';
  const items = data.items.filter(i => i.personId === p.id);
  const openItems = items.filter(i => i.status !== 'done');

  return `
    <button class="back-btn" onclick="navigate('kontakte')">&#8592; Zurück</button>

    <div class="person-detail-header">
      <div class="person-avatar">${p.name.charAt(0).toUpperCase()}</div>
      <div>
        <div style="font-size:22px;font-weight:700">${esc(p.name)}</div>
        <div style="color:var(--text-muted);font-size:12px">Kontakt</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="openPersonForm('${p.id}')">Bearbeiten</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Offene Items (${openItems.length})</span></div>
      ${openItems.length ? '<ul class="item-list">' + openItems.map(i => renderItem(i)).join('') + '</ul>' : '<div style="color:var(--text-muted);font-size:14px">Keine offenen Items</div>'}
    </div>
	  `;
}

