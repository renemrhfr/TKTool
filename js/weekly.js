// ============================================================
// WOCHENABSCHLUSS
// ============================================================
// Freitags-Ritual: was diese Woche fertig wurde, was liegen geblieben ist und
// was naechste Woche ansteht. Nichts davon wird gepflegt — alles ist aus
// Items, Meetings, Bloecken und dem Jira-Snapshot abgeleitet.

// Nur Freitag bis Sonntag in der Navigation: das Ritual soll auffallen, wenn
// es dran ist, und sonst keinen Platz kosten.
function isWeekReviewDay(date = new Date()) {
  return [5, 6, 0].includes(date.getDay());
}

function weekRange(today = todayStr()) {
  const start = startOfWeek(parseISO(today));
  return { start: toISO(start), end: toISO(addDays(start, 6)) };
}

function isoWeekNumber(iso) {
  const d = parseISO(iso);
  const thursday = addDays(d, 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  return 1 + Math.round(((thursday - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

// Wann ein Feld zuletzt geaendert wurde, als lokales Datum. Die Sync-Schicht
// stempelt jedes Feld; ein eigenes "erledigt am" gibt es nicht.
function fieldChangedOn(record, field) {
  const at = record && record._syncFields && record._syncFields[field] && record._syncFields[field].changedAt;
  return at ? toISO(new Date(at)) : '';
}

function inDateRange(iso, range) {
  return !!iso && iso >= range.start && iso <= range.end;
}

function daysSince(iso, today = todayStr()) {
  return Math.round((parseISO(today) - parseISO(iso)) / 86400000);
}

function lastOneOnOneDate(personId, today = todayStr()) {
  return data.meetings
    .filter(m => m.type === 'oneOnOne' && m.personId === personId && m.date && m.date <= today)
    .map(m => m.date)
    .sort()
    .pop() || '';
}

function weeklyReviewData() {
  const today = todayStr();
  const week = weekRange(today);
  const next = { start: toISO(addDays(parseISO(week.start), 7)), end: toISO(addDays(parseISO(week.start), 13)) };
  const team = data.persons.filter(p => p.type !== 'kontakt').sort(comparePersonsByName);

  // Erledigt: Statuswechsel auf "done" in dieser Woche. Alte Eintraege ohne
  // Stempel fallen auf ihr Datum zurueck.
  const doneTodos = data.items
    .filter(i => i.type === 'todo' && i.status === 'done')
    .filter(i => inDateRange(fieldChangedOn(i, 'status') || i.date, week))
    .sort((a, b) => (fieldChangedOn(b, 'status') || b.date || '').localeCompare(fieldChangedOn(a, 'status') || a.date || ''));
  const wins = data.items
    .filter(i => (i.type === 'win' || i.type === 'highlight') && inDateRange(i.date, week))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Jira: abgeschlossene Auftraege aus dem Snapshot, ergaenzt um Bloecke, die
  // diese Woche als erledigt markiert wurden (auch ohne Jira-Anbindung).
  const byAccount = new Map(team.filter(p => p.jiraAccountId).map(p => [p.jiraAccountId.trim(), p]));
  const jiraResolved = jiraSyncData && Array.isArray(jiraSyncData.resolved)
    ? jiraSyncData.resolved
      .filter(t => inDateRange(toISO(new Date(t.resolvedAt)), week))
      .map(t => ({ key: t.key, title: t.summary || t.key, person: byAccount.get(t.accountId) || null, on: toISO(new Date(t.resolvedAt)) }))
    : null;
  const seenKeys = new Set((jiraResolved || []).map(t => jiraAuftragKey(t.key)));
  const doneBlocks = (data.blocks || [])
    .filter(b => b.done && !isAbsenceBlock(b) && inDateRange(fieldChangedOn(b, 'done'), week))
    .filter(b => !b.jiraRef || !seenKeys.has(jiraAuftragKey(b.jiraRef)))
    .map(b => ({ key: b.jiraRef ? jiraAuftragKey(b.jiraRef) : '', title: blockDisplayLabel(b), person: data.persons.find(p => p.id === b.personId) || null, on: fieldChangedOn(b, 'done') }));
  const finished = [...(jiraResolved || []), ...doneBlocks].sort((a, b) => b.on.localeCompare(a.on));

  const meetingsHeld = data.meetings
    .filter(m => inDateRange(m.date, week) && m.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Braucht Aufmerksamkeit
  const overdue = data.items
    .filter(i => i.type === 'todo' && i.status !== 'done' && i.status !== 'backlog' && i.date && i.date < today)
    .sort(compareByDueDate);
  const overdueIds = new Set(overdue.map(i => i.id));
  const waitingLong = data.items
    .filter(i => i.status === 'waiting' && !overdueIds.has(i.id))
    .map(i => ({ item: i, since: fieldChangedOn(i, 'status') || i.date || '' }))
    .filter(w => w.since && daysSince(w.since, today) >= 7)
    .sort((a, b) => a.since.localeCompare(b.since));

  const people = team.map(person => {
    const signals = [];
    const last = lastOneOnOneDate(person.id, today);
    const upcoming = personNextOneOnOne(person.id);
    const soon = upcoming && daysSince(today, upcoming.date) <= 7;
    if (!soon && (!last || daysSince(last, today) > 14)) {
      signals.push({ tone: 'warn', text: last ? `Kein 1:1 seit ${daysSince(last, today)} Tagen` : 'Noch nie ein 1:1', action: `openNextOneOnOne('${person.id}')` });
    }
    const parallel = personActiveBlocks(person.id, today).length;
    if (parallel >= 3) {
      signals.push({ tone: 'warn', text: `${parallel} Tickets parallel`, action: `navigate('planung',{planungPerson:'${person.id}'})` });
    }
    const since30 = toISO(addDays(parseISO(today), -30));
    const journal = data.items.filter(i => i.personId === person.id && (i.type === 'highlight' || i.type === 'concern') && i.date && i.date >= since30);
    if (!journal.length) {
      signals.push({ tone: 'muted', text: 'Kein Journal-Eintrag in 30 Tagen', action: `openCapture({ captureMode: 'teammate' })` });
    }
    const unplanned = jiraSyncData ? (jiraUnplannedAuftraege(person) || []).length : 0;
    if (unplanned) {
      signals.push({ tone: 'warn', text: `${unplanned} ${unplanned === 1 ? 'Auftrag' : 'Aufträge'} ohne Block`, action: `navigate('planung',{planungPerson:'${person.id}',planungShowInbox:true})` });
    }
    return { person, signals };
  }).filter(entry => entry.signals.length);

  // Naechste Woche
  const nextMeetings = data.meetings
    .filter(m => inDateRange(m.date, next))
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextAbsences = (data.blocks || [])
    .filter(b => isAbsenceBlock(b) && b.start <= next.end && b.end >= next.start)
    .sort((a, b) => a.start.localeCompare(b.start));
  const nextStarts = (data.blocks || [])
    .filter(b => !isAbsenceBlock(b) && !b.done && inDateRange(b.start, next))
    .sort((a, b) => a.start.localeCompare(b.start));

  return { today, week, next, doneTodos, wins, finished, jiraResolved, meetingsHeld, overdue, waitingLong, people, nextMeetings, nextAbsences, nextStarts };
}

function weeklyPersonChip(person) {
  return person ? `<span class="week-person">${personAvatar(person, 'sm')}<span>${esc(person.name)}</span></span>` : '';
}

function weeklyRow({ title, meta = '', side = '', onclick = '' }) {
  return `
    <li class="week-row${onclick ? ' is-clickable' : ''}"${onclick ? ` onclick="${onclick}"` : ''}>
      <div class="week-row-main">
        <div class="week-row-title">${title}</div>
        ${meta ? `<div class="week-row-meta">${meta}</div>` : ''}
      </div>
      ${side ? `<div class="week-row-side">${side}</div>` : ''}
    </li>`;
}

function weeklySection(title, count, rows, empty) {
  return `
    <section class="card week-card">
      <div class="card-header">
        <span class="card-title">${title}</span>
        ${count !== null ? `<span class="week-count">${count}</span>` : ''}
      </div>
      ${rows.length ? `<ul class="week-list">${rows.join('')}</ul>` : `<div class="week-empty">${empty}</div>`}
    </section>`;
}

function renderWeeklyReviewStats() {
  const r = weeklyReviewData();
  const stat = (value, label) => `<span class="page-stat"><strong>${value}</strong>${label}</span>`;
  return `
    <div class="page-head-stats">
      ${stat(r.doneTodos.length, r.doneTodos.length === 1 ? 'Todo erledigt' : 'Todos erledigt')}
      ${stat(r.finished.length, r.finished.length === 1 ? 'Ticket fertig' : 'Tickets fertig')}
      ${stat(r.meetingsHeld.length, r.meetingsHeld.length === 1 ? 'Meeting' : 'Meetings')}
      ${stat(r.wins.length, r.wins.length === 1 ? 'Win' : 'Wins')}
    </div>`;
}

function renderWeeklyReview() {
  const r = weeklyReviewData();
  const personById = id => data.persons.find(p => p.id === id) || null;

  const jiraHint = !jiraSyncData
    ? 'Kein Jira-Stand — abgeschlossene Tickets erscheinen nach dem ersten Import.'
    : !r.jiraResolved
      ? 'Jira-Stand ist älter als diese Funktion — einmal neu einspielen, dann erscheinen abgeschlossene Tickets.'
      : `Jira-Stand: ${esc(jiraSyncAgeLabel() || 'unbekannt')}`;

  const finishedRows = r.finished.map(t => weeklyRow({
    title: `${t.key ? `<span class="week-key">${esc(t.key)}</span>` : ''}${esc(t.title)}`,
    meta: weeklyPersonChip(t.person),
    side: formatDateShort(t.on),
  }));
  const todoRows = r.doneTodos.map(i => weeklyRow({
    title: esc(i.text),
    meta: weeklyPersonChip(personById(i.personId)),
    side: formatDateShort(fieldChangedOn(i, 'status') || i.date),
    onclick: `openEditItem('${i.id}')`,
  }));
  const winRows = r.wins.map(i => weeklyRow({
    title: `<span class="badge badge-${i.type}">${itemTypeLabel(i.type)}</span> ${esc(i.text)}`,
    meta: weeklyPersonChip(personById(i.personId)),
    side: formatDateShort(i.date),
    onclick: `openEditItem('${i.id}')`,
  }));
  const meetingRows = r.meetingsHeld.map(m => {
    const counts = meetingFollowupCounts(m.id);
    const open = counts.todo + counts.waiting;
    return weeklyRow({
      title: meetingDisplayTitle(m),
      meta: formatDate(m.date),
      side: open ? `<span class="week-flag">${open} offen</span>` : '',
      onclick: `navigate('meetings:detail',{meetingId:'${m.id}'})`,
    });
  });

  const attentionRows = [
    ...r.overdue.map(i => weeklyRow({
      title: esc(i.text),
      meta: [weeklyPersonChip(personById(i.personId)), `<span class="week-danger">fällig ${formatDateShort(i.date)}</span>`].filter(Boolean).join(''),
      side: '<span class="week-flag week-flag-danger">überfällig</span>',
      onclick: `openEditItem('${i.id}')`,
    })),
    ...r.waitingLong.map(w => weeklyRow({
      title: esc(w.item.text),
      meta: weeklyPersonChip(personById(w.item.personId)),
      side: `<span class="week-flag">wartet seit ${daysSince(w.since)} Tagen</span>`,
      onclick: `openEditItem('${w.item.id}')`,
    })),
  ];
  const peopleRows = r.people.map(({ person, signals }) => `
    <li class="week-person-row">
      ${weeklyPersonChip(person)}
      <div class="week-signals">
        ${signals.map(s => `<button type="button" class="week-signal week-signal-${s.tone}" onclick="${s.action}">${esc(s.text)}</button>`).join('')}
      </div>
    </li>`);

  const nextRows = [
    ...r.nextMeetings.map(m => weeklyRow({
      title: meetingDisplayTitle(m),
      meta: formatDate(m.date),
      onclick: `navigate('meetings:detail',{meetingId:'${m.id}'})`,
    })),
    ...r.nextAbsences.map(b => weeklyRow({
      title: `${esc(personName(b.personId))}: ${esc(b.label || 'Abwesend')}`,
      meta: `${formatDateShort(b.start)} – ${formatDateShort(b.end)}`,
      side: '<span class="week-flag">abwesend</span>',
    })),
    ...r.nextStarts.map(b => weeklyRow({
      title: esc(blockDisplayLabel(b)),
      meta: weeklyPersonChip(personById(b.personId)),
      side: `startet ${formatDateShort(b.start)}`,
      onclick: `navigateToPlanungBlock('${b.id}')`,
    })),
  ];

  return `
    <div class="week-grid">
      <div class="week-col">
        <div class="week-col-title">Geschafft</div>
        ${weeklySection('Tickets abgeschlossen', r.finished.length, finishedRows, 'Keine abgeschlossenen Tickets diese Woche.')}
        <div class="week-source">${jiraHint}</div>
        ${weeklySection('Todos erledigt', r.doneTodos.length, todoRows, 'Keine Todos diese Woche erledigt.')}
        ${weeklySection('Wins & Highlights', r.wins.length, winRows, 'Nichts notiert — gab es wirklich nichts?')}
        ${weeklySection('Meetings', r.meetingsHeld.length, meetingRows, 'Keine Meetings diese Woche.')}
      </div>
      <div class="week-col">
        <div class="week-col-title">Braucht Aufmerksamkeit</div>
        ${weeklySection('Liegen geblieben', attentionRows.length, attentionRows, 'Nichts überfällig, nichts hängt länger als eine Woche.')}
        ${weeklySection('Team', r.people.length, peopleRows, 'Bei allen ist das 1:1 aktuell und das Journal gepflegt.')}
        <div class="week-col-title">Nächste Woche</div>
        ${weeklySection(`KW ${isoWeekNumber(r.next.start)} · ${formatDateShort(r.next.start)}–${formatDateShort(r.next.end)}`, null, nextRows, 'Noch nichts geplant.')}
      </div>
    </div>
  `;
}

// Markdown fuer den eigenen Report nach oben oder ins Wiki.
function exportWeeklyReview() {
  const r = weeklyReviewData();
  const kw = isoWeekNumber(r.week.start);
  const name = id => (data.persons.find(p => p.id === id) || {}).name || '';
  const list = (rows, empty) => rows.length ? rows.map(x => `- ${x}`).join('\n') + '\n' : `_${empty}_\n`;
  let md = `# Wochenabschluss KW ${kw} (${formatDate(r.week.start)} – ${formatDate(r.week.end)})\n\n`;
  md += `## Tickets abgeschlossen\n` + list(r.finished.map(t => `${t.key ? `**${t.key}** ` : ''}${t.title}${t.person ? ` — ${t.person.name}` : ''}`), 'keine') + '\n';
  md += `## Todos erledigt\n` + list(r.doneTodos.map(i => `${i.text}${i.personId ? ` — ${name(i.personId)}` : ''}`), 'keine') + '\n';
  md += `## Wins & Highlights\n` + list(r.wins.map(i => `${itemTypeLabel(i.type)}: ${i.text}${i.personId ? ` — ${name(i.personId)}` : ''}`), 'keine') + '\n';
  md += `## Meetings\n` + list(r.meetingsHeld.map(m => `${formatDate(m.date)} ${meetingTitleText(m)}`), 'keine') + '\n';
  md += `## Liegen geblieben\n` + list([
    ...r.overdue.map(i => `Überfällig seit ${formatDateShort(i.date)}: ${i.text}`),
    ...r.waitingLong.map(w => `Wartet seit ${daysSince(w.since)} Tagen: ${w.item.text}`),
  ], 'nichts') + '\n';
  md += `## Team\n` + list(r.people.map(({ person, signals }) => `${person.name}: ${signals.map(s => s.text).join(', ')}`), 'alles aktuell');
  downloadFile(`wochenabschluss-kw${String(kw).padStart(2, '0')}-${r.week.start.slice(0, 4)}.md`, md);
}
