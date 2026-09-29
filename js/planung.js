// ============================================================
// PLANUNG / BLOCKS / TIMELINE
// ============================================================

// Es gibt nur noch zwei Sorten: Arbeit an einem Jira-Auftrag und
// Abwesenheit. Alte Bloecke mit typ projekt/incident zaehlen als Ticket.
const BLOCK_TYPES = [
  { val: 'ticket', label: 'Ticket' },
  { val: 'abwesenheit', label: 'Abwesenheit' },
];
const MARKER_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#10b981', // green
];
// --- Date helpers ---
function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function daysBetween(a, b) {
  const ms = parseISO(b) - parseISO(a);
  return Math.round(ms / 86400000) + 1;
}
function isWeekendDate(d) {
  const w = d.getDay();
  return w === 0 || w === 6;
}
function workdaysBetween(startISO, endISO) {
  if (!startISO || !endISO || endISO < startISO) return 0;
  let n = 0;
  let d = parseISO(startISO);
  const end = parseISO(endISO);
  while (d <= end) {
    if (!isWeekendDate(d)) n++;
    d = addDays(d, 1);
  }
  return n;
}
function monthOfDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function monthStart(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1);
}
function monthEnd(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0);
}
function startOfWeek(d) {
  const r = new Date(d);
  const w = r.getDay();
  const diff = (w + 6) % 7;
  r.setDate(r.getDate() - diff);
  return r;
}
function endOfWeek(d) {
  return addDays(startOfWeek(d), 6);
}
function formatMonthName(m) {
  const months = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const [y, mo] = m.split('-');
  return months[parseInt(mo) - 1] + ' ' + y;
}

function personSupportInMonth(p, month) {
  return (p.supportMonate || []).includes(month);
}

function addWorkdays(startISO, n) {
  let d = parseISO(startISO);
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (!isWeekendDate(d)) left--;
  }
  return toISO(d);
}

function nextWorkdayOnOrAfter(iso) {
  let d = parseISO(iso);
  while (isWeekendDate(d)) d = addDays(d, 1);
  return toISO(d);
}

// ============================================================
// PLANUNGSMODELL
// ============================================================
// Geplant wird pro Person und Auftrag: "X arbeitet an Auftrag A, ungefaehr
// von-bis". Gespeichert sind nur Person, Auftrag (jiraRef), die geschaetzte
// Spanne und ein manuelles Erledigt. Titel, Subtasks, Warten und
// Jira-Erledigt werden aus dem Snapshot abgeleitet — kopierte Zustaende
// muesste man von Hand nachziehen, und genau das war die Arbeit.

// Altlast aus der Zeit vor dem Posteingang: Block ohne Datum.
function isBlockParked(b) {
  return !b.start || !b.end;
}

function isAbsenceBlock(b) {
  return !!b && b.typ === 'abwesenheit';
}

function blockAuftragKey(b) {
  return b && b.jiraRef && !isAbsenceBlock(b) ? jiraAuftragKey(b.jiraRef) : '';
}

// absence | done | waiting | active | planned
//   done     manuell erledigt, oder der Auftrag ist in Jira erledigt
//   active   die Person hat laut Jira offene Arbeit am Auftrag
//   waiting  alles Offene der Person liegt in einem Uebergabe-Status
//   planned  Jira sagt nichts: noch nichts zugewiesen, kein Sync, alter Block
// Manuelles Erledigt ist endgueltig. Kommt danach neue Arbeit, taucht der
// Auftrag wieder im Posteingang auf, statt den alten Block wiederzubeleben.
function blockState(b) {
  if (isAbsenceBlock(b)) return 'absence';
  if (b.done) return 'done';
  const key = blockAuftragKey(b);
  if (!key) return 'planned';
  const auftrag = jiraTicketInfo(key);
  if (auftrag && auftrag.statusCategory === 'done') return 'done';
  const person = data.persons.find(p => p.id === b.personId);
  const open = person ? jiraPersonAuftragTickets(person, key) : null;
  if (!open || !open.length) return 'planned';
  return open.every(t => isJiraHandoverStatus(t.status)) ? 'waiting' : 'active';
}

// Haelt der Block die Person fest? Wartendes und Erledigtes nicht.
function blockStateBinds(state) {
  return state === 'active' || state === 'planned' || state === 'absence';
}

// Block mit angezeigter Spanne. Laeuft ein Auftrag laut Jira noch, obwohl die
// Schaetzung vorbei ist, waechst der Balken bis heute mit: das Ueberziehen ist
// eine Information, keine Aufgabe. Gespeichert bleibt die Schaetzung, damit
// man nach einem verspaeteten Sync einfach zurueckziehen kann.
function blockView(b) {
  const state = blockState(b);
  const today = todayStr();
  const overrun = state === 'active' && !isBlockParked(b) && b.end < today;
  return { ...b, state, plannedEnd: b.end, end: overrun ? today : b.end, overrun };
}

function blockDisplayLabel(b) {
  if (isAbsenceBlock(b)) return b.label || 'Abwesenheit';
  const key = blockAuftragKey(b);
  return (key && jiraSummaryForKey(key)) || b.label || key || 'Ticket';
}

// Die Bloecke, die jemanden tatsaechlich binden, mit angezeigter Spanne.
function workingPlanBlocks() {
  return (data.blocks || []).map(blockView).filter(v => blockStateBinds(v.state));
}

// Woran sitzt jemand heute? Abwesenheiten bleiben aussen vor, die sind ein
// eigener Zustand. Sortiert nach Ende: was zuerst faellig wird, steht vorne.
function personActiveBlocks(personId, date = todayStr()) {
  return workingPlanBlocks()
    .filter(b => b.personId === personId
      && !isAbsenceBlock(b)
      && !isBlockParked(b)
      && b.start <= date
      && b.end >= date)
    .sort((a, b) => a.end.localeCompare(b.end));
}

function personCurrentBlock(personId, date = todayStr()) {
  return personActiveBlocks(personId, date)[0] || null;
}

// Was danach ansteht, bis zum Ende des gewaehlten Fensters.
function personUpcomingBlocks(personId, date = todayStr(), until = null) {
  return workingPlanBlocks()
    .filter(b => b.personId === personId
      && !isAbsenceBlock(b)
      && !isBlockParked(b)
      && b.start > date
      && (!until || b.start <= until))
    .sort((a, b) => a.start.localeCompare(b.start));
}

// Ab wann kann die Person etwas Neues anfangen? Nach dem Ende der letzten
// Arbeit, die sie bindet. Luecken dazwischen zaehlen bewusst nicht: das
// naechste Thema wird hinten angestellt, nicht in eine Woche gequetscht.
// Eine Abwesenheit, die direkt anschliesst, schiebt mit.
function personFreeFrom(personId) {
  const today = todayStr();
  const plan = workingPlanBlocks().filter(b => b.personId === personId && !isBlockParked(b));
  const lastWork = plan.filter(b => !isAbsenceBlock(b)).reduce((max, b) => (b.end > max ? b.end : max), '');
  let iso = lastWork >= today ? toISO(addDays(parseISO(lastWork), 1)) : today;
  const absences = plan.filter(isAbsenceBlock);
  for (let i = 0; i < 400; i++) {
    iso = nextWorkdayOnOrAfter(iso);
    const away = absences.find(a => a.start <= iso && a.end >= iso);
    if (!away) return iso;
    iso = toISO(addDays(parseISO(away.end), 1));
  }
  return iso;
}

function freeFromLabel(iso) {
  return iso <= nextWorkdayOnOrAfter(todayStr()) ? 'frei' : `frei ab ${formatDateShort(iso)}`;
}

// Die offenen Tickets der Person unter dem Auftrag eines Blocks — fuer den
// Zaehler am Balken und den Tooltip.
function blockOpenTickets(b) {
  const key = blockAuftragKey(b);
  if (!key) return [];
  const person = data.persons.find(p => p.id === b.personId);
  return (person && jiraPersonAuftragTickets(person, key)) || [];
}

function renderTimeline({ personIds, startDate, endDate, options = {} }) {
  const {
    weekendsOnly = false,
    showWeekends = true,
    dense = false,
    compact = false,
    idPrefix = 'tl',
    insertLane = false,
    showFreeFrom = true,
    showInbox = false,
    blockQuery = '',
    workOnly = false,
  } = options;
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const totalDays = daysBetween(startDate, endDate);

  // Build day array
  const markerByDate = {};
  (data.markers || []).forEach(m => { markerByDate[m.date] = m; });

  const days = [];
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(start, i);
    const iso = toISO(d);
    const weekend = isWeekendDate(d);
    if (!showWeekends && weekend) continue;
    days.push({ iso, date: d, weekend, marker: markerByDate[iso] || null, idx: days.length });
  }
  const cols = days.length;
  const todayISO = todayStr();
  const todayIdx = days.findIndex(d => d.iso === todayISO);

  // Header: months row + days row
  let monthsRow = '';
  let curMonth = null;
  let spanStart = 0;
  days.forEach((d, i) => {
    const m = monthOfDate(d.date);
    if (m !== curMonth) {
      if (curMonth !== null) {
        monthsRow += `<div class="tl-month-cell" style="grid-column:${spanStart + 1} / ${i + 1}">${formatMonthName(curMonth)}</div>`;
      }
      curMonth = m;
      spanStart = i;
    }
  });
  if (curMonth !== null) {
    monthsRow += `<div class="tl-month-cell" style="grid-column:${spanStart + 1} / ${cols + 1}">${formatMonthName(curMonth)}</div>`;
  }

  const daysRow = days.map((d, i) => {
    const dow = d.date.getDay();
    const weekday = formatWeekdayShort(d.iso);
    const label = String(d.date.getDate());
    const classes = ['tl-day-cell'];
    if (d.weekend) classes.push('tl-weekend');
    if (d.iso === todayISO) classes.push('tl-today');
    if (dow === 1 && i > 0) classes.push('tl-week-start');
    if (d.marker) classes.push('tl-marker-day');
    const style = d.marker ? ` style="background:${d.marker.color}33;box-shadow:inset 0 -2px 0 ${d.marker.color}"` : '';
    return `<div class="${classes.join(' ')}"${style}><span class="tl-day-dow">${esc(weekday)}</span><span class="tl-day-num">${label}</span></div>`;
  }).join('');

  const laneSize = dense ? 22 : 28;
  const laneGap = 4;
  const trackPadding = 4;
  const minLanes = 2;
  // Ab so vielen Lanes wird eine Personenzeile zu hoch fuer den Ueberblick —
  // dann fallen wir aufs dichte Packen zurueck.
  const MAX_STACKED_LANES = 8;
  const syncAge = jiraSyncAgeLabel() || 'unbekannt';

  // Tag -> sichtbarer Spaltenindex. Faellt ein Datum auf einen ausgeblendeten
  // Tag (Wochenende), wird auf den naechsten bzw. vorherigen sichtbaren Tag
  // gesnappt.
  const startIdxOf = iso => {
    const hit = days.findIndex(d => d.iso >= iso);
    return hit;
  };
  const endIdxOf = iso => {
    for (let i = days.length - 1; i >= 0; i--) if (days[i].iso <= iso) return i;
    return -1;
  };

  const rowsHtml = personIds.map(pid => {
    const person = data.persons.find(p => p.id === pid);
    if (!person) return '';
    // Badge, sobald irgendein sichtbarer Tag in einem Support-Monat liegt —
    // nicht nur der Monat in der Fenstermitte. Sonst verschwindet er, wenn
    // zwei Wochen ueber ein Monatsende reichen. Welche Tage es genau sind,
    // zeigt die Zellfarbe im Track.
    const supMonths = (person.supportMonate || []).filter(m => m >= startDate.slice(0, 7) && m <= endDate.slice(0, 7));
    const showSupBadge = supMonths.length > 0;

    // Track cells (weekends + support/markers). Today is shown by the header column and needle.
    const cellsHtml = days.map((d, i) => {
      const classes = ['tl-cell'];
      if (d.weekend) classes.push('tl-weekend');
      if (d.date.getDay() === 1 && i > 0) classes.push('tl-week-start');
      if (personSupportInMonth(person, monthOfDate(d.date))) classes.push('tl-support-cell');
      if (d.marker) classes.push('tl-marker-cell');
      const style = d.marker ? ` style="background:${d.marker.color}26"` : '';
      return `<div class="${classes.join(' ')}"${style} data-day-idx="${i}" data-day-iso="${d.iso}"></div>`;
    }).join('');

    const entries = (data.blocks || [])
      .filter(b => b.personId === pid && !isBlockParked(b))
      .map(blockView)
      .filter(v => v.end >= startDate
        && v.start <= endDate
        && (!workOnly || blockStateBinds(v.state))
        && blockMatchesPlanungQuery(v, blockQuery))
      .map(v => {
        const sIdx = startIdxOf(v.start < startDate ? startDate : v.start);
        const eIdx = endIdxOf(v.end > endDate ? endDate : v.end);
        if (sIdx < 0 || eIdx < 0 || eIdx < sIdx) return null; // liegt komplett auf ausgeblendeten Tagen
        return { b: v, sIdx, eIdx };
      })
      .filter(Boolean);

    // Waehrend eines Block-Drags bleibt die Reihenfolge so, wie sie beim
    // Anfassen war. Sonst schiebt das Kuerzen eines Blocks ihn in der
    // Start-Sortierung nach hinten und er springt mitten im Ziehen die Lane
    // runter — man verliert den Block unter der Maus.
    const frozenLaneKeys = tlFrozenLaneKeysFor(pid);
    const byStart = (a, b) => (a.sIdx - b.sIdx) || ((b.eIdx - b.sIdx) - (a.eIdx - a.sIdx));
    const byFrozen = (a, b) => {
      const ia = frozenLaneKeys.get(a.b.id);
      const ib = frozenLaneKeys.get(b.b.id);
      if (ia === undefined && ib === undefined) return byStart(a, b);
      return (ia === undefined ? Infinity : ia) - (ib === undefined ? Infinity : ib);
    };

    // Drei Baender von oben nach unten: was die Person bindet, was nur noch
    // wartet, was erledigt ist. Kein Band rutscht in eine Luecke darueber.
    const tierOf = e => (blockStateBinds(e.b.state) ? 0 : e.b.state === 'waiting' ? 1 : 2);
    const tiers = [0, 1, 2].map(t => entries.filter(e => tierOf(e) === t)
      .sort(frozenLaneKeys ? byFrozen : byStart));

    const laneEnds = [];
    let laneFloor = 0;
    const firstFreeLane = sIdx => {
      for (let lane = laneFloor; ; lane++) {
        if (laneEnds[lane] === undefined || sIdx > laneEnds[lane]) return lane;
      }
    };
    // Normalfall: jeder Block bekommt seine eigene Zeile, auch wenn daneben
    // Platz waere — das ist ruhiger zu lesen als greedy gepacktes Gedraenge.
    // Erst wenn die Zeile dadurch zu hoch wuerde, wird wieder dicht gepackt.
    const stackEachUnit = entries.length <= MAX_STACKED_LANES;
    const laidOut = [];
    for (const tier of tiers) {
      if (!tier.length) continue;
      laneFloor = laneEnds.length;
      for (const entry of tier) {
        if (stackEachUnit) laneFloor = laneEnds.length;
        const lane = firstFreeLane(entry.sIdx);
        laneEnds[lane] = entry.eIdx;
        laidOut.push({ ...entry, lane });
      }
    }

    const occupiedLaneCount = laneEnds.length;
    const laneCount = insertLane
      ? Math.max(minLanes, occupiedLaneCount + 1)
      : Math.max(minLanes, occupiedLaneCount);
    const trackHeight = laneCount * laneSize + Math.max(0, laneCount - 1) * laneGap + trackPadding * 2;
    const trackMetrics = `data-cols="${cols}" style="--tl-track-height:${trackHeight}px;--tl-lane-size:${laneSize}px;--tl-lane-gap:${laneGap}px"`;

    const blocksHtml = laidOut.map(({ b, sIdx, eIdx, lane }) => {
      const absence = isAbsenceBlock(b);
      const label = blockDisplayLabel(b);
      const key = blockAuftragKey(b);
      const open = absence ? [] : blockOpenTickets(b);
      const waitingStatus = b.state === 'waiting' ? String(open[0]?.status || '') : '';
      const classes = ['tl-block', `tl-block-${absence ? 'abwesenheit' : 'ticket'}`];
      if (viewState.planungHighlightBlockId === b.id) classes.push('tl-block-highlight');
      if (sIdx === eIdx) classes.push('tl-block-single');
      if (b.state === 'done') classes.push('tl-block-done');
      if (b.state === 'waiting') classes.push('tl-block-handover-on');
      if (b.overrun) classes.push('tl-block-overrun');

      // Schraffierter Teil: ab dem ersten sichtbaren Tag nach der Schaetzung.
      let overrunPct = 0;
      if (b.overrun) {
        const oIdx = b.plannedEnd < startDate ? sIdx : startIdxOf(toISO(addDays(parseISO(b.plannedEnd), 1)));
        if (oIdx >= 0 && oIdx <= eIdx) overrunPct = ((eIdx - oIdx + 1) / (eIdx - sIdx + 1)) * 100;
      }
      // Nur Subtasks zaehlen — steht nur der Auftrag selbst offen, sagt eine 1 nichts.
      const openSubtasks = open.filter(t => String(t.key).toUpperCase() !== key);

      const title = [
        label,
        key ? `${key}${jiraUrl(key) ? ' (Cmd/Strg-Klick öffnet)' : ''}` : '',
        absence ? `${formatDate(b.start)}–${formatDate(b.end)}` : `geschätzt ${formatDate(b.start)}–${formatDate(b.plannedEnd)}`,
        b.overrun ? `läuft über — laut Jira noch offen (Stand: ${syncAge})` : '',
        b.state === 'done' ? (b.done ? 'erledigt' : 'erledigt laut Jira') : '',
        waitingStatus ? `wartet: ${waitingStatus} — Person ist hier faktisch frei` : '',
        open.length ? `\nOffen (Stand: ${syncAge}):` : '',
        ...open.map(t => `· ${t.key} ${t.summary || ''} — ${t.status || ''}`),
      ].filter(Boolean).join('\n');

      const leftPct = (sIdx / cols) * 100;
      const widthPct = ((eIdx - sIdx + 1) / cols) * 100;
      const topPx = trackPadding + lane * (laneSize + laneGap);
      return `<div class="${classes.join(' ')}" style="left:${leftPct}%;width:${widthPct}%;top:${topPx}px;height:${laneSize}px"
        data-block-id="${b.id}"
        data-unit-key="${b.id}"
        title="${esc(title)}"
        onclick="event.stopPropagation();if(_suppressNextBlockClick)return;if((event.metaKey||event.ctrlKey)&&openBlockJira('${b.id}'))return;openBlockForm('${b.id}')"
        onpointerdown="onBlockPointerDown(event,'${b.id}')">
        ${overrunPct ? `<span class="tl-block-overrun-part" style="width:${overrunPct.toFixed(3)}%"></span>` : ''}
        ${b.state === 'done' ? '<span class="tl-block-check">&#x2713;</span>' : ''}${waitingStatus ? `<span class="tl-block-handover">${esc(waitingStatus.toLowerCase())}</span>` : ''}<span class="tl-block-label">${esc(label)}</span>${openSubtasks.length ? `<span class="tl-block-group-count" title="Offene Subtasks">${openSubtasks.length} offen</span>` : ''}
      </div>`;
    }).join('');

    const insertLaneHtml = insertLane ? `
      <div class="tl-insert-lane"
        style="top:${trackPadding + (laneCount - 1) * (laneSize + laneGap)}px;height:${laneSize}px;grid-template-columns:repeat(${cols},minmax(0,1fr))">
        ${days.map(d => `
          <div class="tl-insert-cell">
            <button class="tl-insert-button"
              type="button"
              title="Block am ${formatDate(d.iso)} einfügen"
              onpointerdown="event.stopPropagation()"
              onclick="event.stopPropagation();openBlockForm(null,'${pid}','${d.iso}','${d.iso}')">
              +
            </button>
          </div>
        `).join('')}
      </div>
    ` : '';

    const freeFrom = showFreeFrom ? personFreeFrom(pid) : '';
    const freeHtml = showFreeFrom ? `<span class="tl-person-cap" title="Erster Werktag nach der letzten geplanten Arbeit — überzogene Aufträge laufen bis heute, eine direkt anschließende Abwesenheit schiebt mit"><span class="tl-cap-days">${esc(freeFromLabel(freeFrom))}</span></span>` : '';
    const unplanned = showInbox ? jiraUnplannedAuftraege(person) : null;
    const inboxBadge = unplanned && unplanned.length ? `<button class="tl-jira-drift" type="button"
      onclick="event.preventDefault();event.stopPropagation();openPlanungInbox('${pid}')"
      title="${esc(`${unplanned.length} Auftr${unplanned.length === 1 ? 'ag' : 'äge'} ohne Block: ${unplanned.map(a => a.key).join(', ')}\n— klicken zum Einplanen`)}">+${unplanned.length} neu</button>` : '';

    const labelClick = `navigate('team:detail',{personId:'${pid}'})`;
    return `
      <div class="tl-row">
        <div class="tl-person" style="height:${trackHeight}px" onclick="${labelClick}">
          <div class="tl-person-main">
            <div class="tl-person-top">
              ${showSupBadge ? `<span class="tl-sup-badge" title="${esc('Support-Rotation: ' + supMonths.map(formatMonthName).join(', '))}">SUP</span>` : ''}
              <span class="tl-person-name">${esc(person.name)}</span>
              ${inboxBadge}
            </div>
          </div>
          ${freeHtml}
          ${renderPersonWaitingBadge(pid)}
        </div>
        <div class="tl-track-row" style="height:${trackHeight}px">
          <div class="tl-track"
            data-person-id="${pid}"
            ${trackMetrics}
            onpointerdown="onTrackPointerDown(event,'${pid}')">
            <div class="tl-track-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">
              ${cellsHtml}
            </div>
            <div class="tl-track-overlay">
              ${blocksHtml}
              ${insertLaneHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Marker chips shown in header (single row across all people)
  const markerChips = (data.markers || [])
    .map(m => ({ m, idx: days.findIndex(d => d.iso === m.date) }))
    .filter(x => x.idx >= 0)
    .map(({ m, idx }) => {
      const leftPct = ((idx + 0.5) / cols) * 100;
      const title = `${m.label || ''} — ${m.date}`;
      const style = `left:${leftPct}%;border-color:${m.color};color:${m.color}`;
      return `<div class="tl-marker-chip" style="${style}" title="${esc(title)}" onclick="event.stopPropagation();openMarkerForm('${m.id}')"><span class="tl-marker-dot" style="background:${m.color}"></span><span class="tl-marker-label">${esc(m.label || '')}</span></div>`;
    }).join('');
  return `
    <div class="timeline ${dense ? 'timeline-dense' : ''} ${compact ? 'timeline-compact' : ''}" id="${idPrefix}-timeline" style="--tl-person-col:${compact ? 140 : 180}px">
      <div class="tl-header">
        <div class="tl-person-head"></div>
        <div class="tl-grid-head">
          <div class="tl-months-row" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${monthsRow}${markerChips}</div>
          <div class="tl-days-row" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${daysRow}</div>
        </div>
      </div>
      <div class="tl-body">
        ${todayIdx >= 0 ? `<div class="tl-body-today-line" style="--tl-today-frac:${((todayIdx + 0.5) / cols).toFixed(6)}"></div>` : ''}
        ${rowsHtml}
      </div>
    </div>
  `;
}

// ============================================================
// PLANUNG VIEW
// ============================================================
function planungExtraPastWeeks() {
  return Math.max(0, parseInt(viewState.planungExtraPastWeeks || 0, 10) || 0);
}

function planungExtraFutureWeeks() {
  if (viewState.planungExtraFutureWeeks != null) return Math.max(0, Number(viewState.planungExtraFutureWeeks) || 0);
  try { return [1, 2, 4].includes(Number(localStorage.getItem('tktool-planung-weeks'))) ? Number(localStorage.getItem('tktool-planung-weeks')) - 1 : 0; } catch { return 0; }
}

function planungShowWeekends() {
  try { return localStorage.getItem(PLANUNG_WEEKENDS_KEY) === '1'; } catch { return false; }
}

function togglePlanungWeekends() {
  try { localStorage.setItem(PLANUNG_WEEKENDS_KEY, planungShowWeekends() ? '0' : '1'); } catch {}
  render();
}

function planungWeekOffset() {
  return parseInt(viewState.planungWeekOffset || 0, 10) || 0;
}

function navigateToPlanungBlock(blockId) {
  const block = (data.blocks || []).find(candidate => candidate.id === blockId);
  if (!block || isBlockParked(block)) {
    navigate('planung');
    return;
  }

  const today = todayStr();
  const anchor = block.start > today ? block.start : block.end < today ? block.end : today;
  const currentWeek = startOfWeek(parseISO(today));
  const targetWeek = startOfWeek(parseISO(anchor));
  const weekOffset = Math.round((targetWeek - currentWeek) / (7 * 86400000));

  navigate('planung', {
    planungWeekOffset: weekOffset,
    planungHighlightBlockId: blockId,
    planungHideHandover: false,
  });
  setTimeout(() => highlightPlanungBlock(blockId), 0);
}

function highlightPlanungBlock(blockId) {
  const target = Array.from(document.querySelectorAll('#planung-timeline .tl-block'))
    .find(element => element.dataset.blockId === blockId);
  if (!target) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
  setTimeout(() => {
    target.classList.remove('tl-block-highlight');
    if (viewState.planungHighlightBlockId === blockId) delete viewState.planungHighlightBlockId;
  }, reducedMotion ? 1200 : 2200);
}

function planungWindow() {
  // Default window: current week, with optional extension controls
  const today = parseISO(todayStr());
  const baseStart = addDays(startOfWeek(today), planungWeekOffset() * 7);
  const start = addDays(baseStart, -7 * planungExtraPastWeeks());
  const end = addDays(baseStart, 6 + 7 * planungExtraFutureWeeks());
  return { start: toISO(start), end: toISO(end) };
}

function planungSupportMonth() {
  const { start, end } = planungWindow();
  const mid = addDays(parseISO(start), Math.floor(daysBetween(start, end) / 2));
  return monthOfDate(mid);
}

function planungAnchorMonth() {
  return planungSupportMonth();
}

function renderPlanung() {
  const { start, end } = planungWindow();
  const sort = viewState.planungSort || 'name';
  const rawQuery = viewState.planungQuery || '';
  const blockQuery = rawQuery.trim().toLocaleLowerCase('de-AT');
  const personFilter = planungPersonFilter();
  const workOnly = planungHideHandover();
  const visibleBlocks = (data.blocks || [])
    .filter(block => !workOnly || blockStateBinds(blockState(block)));
  const queryBlocks = blockQuery ? visibleBlocks.filter(block => blockMatchesPlanungQuery(block, blockQuery)) : visibleBlocks;
  // Personenfilter zieht durch alle Panels — sonst zeigt die Zeile eine Person,
  // die Liste darunter aber weiter das ganze Team.
  const matchingBlocks = personFilter ? queryBlocks.filter(block => block.personId === personFilter) : queryBlocks;
  const matchingPersonIds = new Set(matchingBlocks.map(block => block.personId));

  // Auswahlliste bleibt vollstaendig, auch wenn gerade gefiltert wird.
  const filterablePersons = data.persons
    .filter(p => p.type !== 'kontakt')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'de-AT'));

  const team = data.persons.filter(p => p.type !== 'kontakt'
    && (!personFilter || p.id === personFilter)
    && (!blockQuery || matchingPersonIds.has(p.id) || personNameMatchesPlanungQuery(p.id, blockQuery)));
  const byName = (a, b) => a.name.localeCompare(b.name, 'de-AT');
  let personIds;
  if (sort === 'frei') {
    // Wer zuerst frei wird, steht oben — die Frage "wer kann das naechste
    // Thema nehmen" beantwortet dann die erste Zeile.
    personIds = team
      .map(p => ({ p, free: personFreeFrom(p.id) }))
      .sort((a, b) => a.free.localeCompare(b.free) || byName(a.p, b.p))
      .map(x => x.p.id);
  } else {
    personIds = team.slice().sort(byName).map(p => p.id);
  }
  // Freeze order during block drag to avoid jumping rows
  if (_tlDrag && _tlFrozenOrder) {
    const knownSet = new Set(_tlFrozenOrder);
    const extras = personIds.filter(id => !knownSet.has(id));
    personIds = _tlFrozenOrder.filter(id => personIds.includes(id)).concat(extras);
  }

  const inbox = planungInboxRows(personFilter);
  const inboxCount = inbox.auftraege.length + inbox.parked.length;
  const inboxChip = inboxCount ? `
    <button class="filter-btn planung-inbox-btn ${viewState.planungShowInbox ? 'active' : ''}"
      onclick="togglePlanungInbox()"
      title="Jira-Aufträge, an denen jemand arbeitet, die aber noch keinen Block haben">${inboxCount} einzuplanen</button>
  ` : '';
  const mergeGroups = planungMergeGroups();
  const mergeChip = mergeGroups.length ? `
    <button class="filter-btn" onclick="openPlanungMergeDialog()"
      title="Blöcke auf Subtasks zu ihrem Auftrag zusammenführen">${mergeGroups.length} ${mergeGroups.length === 1 ? 'Auftrag' : 'Aufträge'} zusammenführen</button>
  ` : '';

  const searchResults = blockQuery ? `
    <div class="planung-search-results">
      <div class="planung-search-results-head">${matchingBlocks.length} treffer</div>
      ${matchingBlocks.length ? matchingBlocks
        .slice()
        .sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999'))
        .map(block => `
          <button class="planung-search-result" onclick="openBlockForm('${block.id}')">
            <span class="tl-block-swatch tl-block-${isAbsenceBlock(block) ? 'abwesenheit' : 'ticket'}"></span>
            <strong>${esc(blockDisplayLabel(block))}</strong>
            <span>${esc(personName(block.personId))}</span>
            <span>${isBlockParked(block) ? 'ohne Datum' : `${formatDate(block.start)} – ${formatDate(block.end)}`}</span>
            ${blockAuftragKey(block) ? `<span>${esc(blockAuftragKey(block))}</span>` : ''}
          </button>
        `).join('')
        : '<span class="planung-search-results-empty">Keine Blöcke entsprechen der Suche.</span>'}
    </div>
  ` : '';

  return `
    <div class="section-header planner-toolbar">
      <div class="planner-toolbar-row planner-toolbar-primary">
        <div class="month-selector">
          <button onclick="changePlanungWeek(-1)" aria-label="Vorige Woche">←</button>
          <button class="btn btn-secondary btn-sm" onclick="resetPlanungWindow()">Heute</button>
          <button onclick="changePlanungWeek(1)" aria-label="Nächste Woche">→</button>
          <span class="month-label">${formatDate(start)} – ${formatDate(end)}</span>
        </div>
        <div class="filters" aria-label="Zeitraum">
          ${[1,2,4].map(n => `<button class="filter-btn ${planungExtraFutureWeeks() === n-1 ? 'active' : ''}" onclick="setPlanungWeeks(${n})" aria-pressed="${planungExtraFutureWeeks() === n-1}">${n} ${n === 1 ? 'Woche' : 'Wochen'}</button>`).join('')}
        </div>
        <div class="planner-primary-actions">
          <button class="jira-sync-stamp" onclick="openJiraImport()">Jira ${jiraSyncAgeLabel() || 'einspielen'} ↻</button>
          <button class="btn btn-primary btn-sm" onclick="openBlockForm(null)">+ Block</button>
          <details class="overview-actions-menu"><summary>Mehr</summary><div class="overview-actions-menu-panel">
            <button class="btn btn-secondary btn-sm" onclick="openMarkerForm(null)">+ Marker</button>
            <button class="btn btn-secondary btn-sm" onclick="openSupportEditor()">Support-Rotation</button>
            <button class="btn btn-secondary btn-sm" onclick="togglePlanungWeekends()">Wochenende ${planungShowWeekends() ? 'ausblenden' : 'anzeigen'}</button>
          </div></details>
        </div>
      </div>
      <div class="planner-toolbar-row">
        <div class="filters" aria-label="Darstellung">
          <button class="filter-btn ${workOnly ? 'active' : ''}" aria-pressed="${workOnly}" title="Nur was die Leute bindet — ohne Erledigtes und Wartendes" onclick="if(!planungHideHandover())togglePlanungHideHandover()">Arbeitsplan</button>
          <button class="filter-btn ${!workOnly ? 'active' : ''}" aria-pressed="${!workOnly}" title="Auch Erledigtes und Wartendes" onclick="if(planungHideHandover())togglePlanungHideHandover()">Alles</button>
        </div>
        <select class="filter-btn" aria-label="Person" onchange="setPlanungPerson(this.value)">
          <option value="">Alle Teammitglieder</option>
          ${filterablePersons.map(p => `<option value="${esc(p.id)}" ${personFilter === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
        <select class="filter-btn" aria-label="Sortierung" onchange="setPlanungSort(this.value)">
          <option value="name" ${sort === 'name' ? 'selected' : ''}>Nach Name</option>
          <option value="frei" ${sort === 'frei' ? 'selected' : ''}>Nach „frei ab“</option>
        </select>
        <div class="view-search planung-search"><input id="planungSearchInput" type="search" aria-label="Planung durchsuchen"
          placeholder="Person, Thema oder Jira-Key suchen…" value="${esc(rawQuery)}" oninput="setPlanungQuery(this.value)"></div>
        ${inboxChip}
        ${mergeChip}
        ${renderJiraChangesChip()}
      </div>
    </div>
    ${inboxCount && viewState.planungShowInbox ? renderPlanungInbox(inbox) : ''}
    ${searchResults}

    ${personIds.length ? renderTimeline({ personIds, startDate: start, endDate: end, options: { idPrefix: 'planung', insertLane: true, showInbox: true, showWeekends: planungShowWeekends(), blockQuery, workOnly } })
      : `<div class="empty-state"><div class="empty-state-icon">&#128269;</div><div class="empty-state-text">${blockQuery ? 'Keine passenden Blöcke' : 'Keine Teammitglieder'}</div></div>`}

    ${renderWaitingQueue(personFilter, blockQuery)}
    <div class="tl-legend">
      ${BLOCK_TYPES.map(t => `<span class="tl-legend-item"><span class="tl-block-swatch tl-block-${t.val}"></span>${t.label}</span>`).join('')}
      <span class="tl-legend-item"><span class="tl-block-swatch tl-block-swatch-overrun"></span>läuft über (laut Jira offen)</span>
      <span class="tl-legend-item"><span class="tl-legend-today"></span>Heute</span>
      <span class="tl-legend-item"><span class="tl-sup-badge">SUP</span>Support-Rotation</span>
    </div>
  `;
}

// ============================================================
// POSTEINGANG: Auftraege ohne Block
// ============================================================
// Die einzige Stelle, an der Jira eine Entscheidung verlangt: jemand arbeitet
// an einem Auftrag, fuer den es noch keinen Block gibt. Alles andere (Titel,
// erledigt, ueberzogen) wird abgeleitet. Alte Bloecke ohne Datum stehen mit
// drin, bis sie eingeplant oder geloescht sind.
function planungInboxRows(personFilter = '') {
  const team = data.persons
    .filter(p => p.type !== 'kontakt' && (!personFilter || p.id === personFilter))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'de-AT'));
  const auftraege = [];
  for (const person of team) {
    for (const auftrag of jiraUnplannedAuftraege(person) || []) auftraege.push({ person, auftrag });
  }
  const teamIds = new Set(team.map(p => p.id));
  const parked = (data.blocks || []).filter(b => teamIds.has(b.personId) && isBlockParked(b) && !b.done);
  return { auftraege, parked };
}

function renderPlanungInbox(inbox) {
  const weeksButtons = (onclick, title) => [1, 2, 4].map(n => `
    <button class="btn btn-sm btn-secondary" onclick="${onclick(n)}" title="${esc(title(n))}">${n} W</button>`).join('');
  const auftragRows = inbox.auftraege.map(({ person, auftrag }) => {
    const from = personFreeFrom(person.id);
    const statuses = [...new Set(auftrag.tickets.map(t => t.status).filter(Boolean))].join(', ');
    return `
      <div class="planung-inbox-row">
        <span class="planung-inbox-info" title="${esc(auftrag.tickets.map(t => `${t.key} ${t.summary || ''} — ${t.status || ''}`).join('\n'))}">
          <span class="planung-inbox-person">${esc(person.name)}</span>
          ${jiraKeyLink(auftrag.key)}
          <span class="planung-inbox-label">${esc(auftrag.summary)}</span>
          <span class="planung-inbox-date">${auftrag.tickets.length} ${auftrag.tickets.length === 1 ? 'ticket' : 'tickets'}${statuses ? ' · ' + esc(statuses.toLowerCase()) : ''}</span>
        </span>
        <span class="planung-inbox-actions">
          <span class="planung-inbox-from">ab ${formatDateShort(from)}</span>
          ${weeksButtons(n => `planAuftrag('${person.id}','${esc(auftrag.key)}',${n})`, n => `${n} ${n === 1 ? 'Woche' : 'Wochen'} ab ${formatDate(from)} — hinten angestellt`)}
        </span>
      </div>`;
  }).join('');
  const parkedRows = inbox.parked.map(b => `
    <div class="planung-inbox-row">
      <span class="planung-inbox-info" onclick="openBlockForm('${b.id}')" title="Block öffnen">
        <span class="planung-inbox-person">${esc(personName(b.personId))}</span>
        <span class="planung-inbox-label">${esc(blockDisplayLabel(b))}</span>
        <span class="planung-inbox-date">ohne datum</span>
      </span>
      <span class="planung-inbox-actions">
        <span class="planung-inbox-from">ab ${formatDateShort(personFreeFrom(b.personId))}</span>
        ${weeksButtons(n => `scheduleParkedBlock('${b.id}',${n})`, n => `${n} ${n === 1 ? 'Woche' : 'Wochen'} einplanen — hinten angestellt`)}
      </span>
    </div>`).join('');
  return `
    <div class="planung-inbox-panel planung-inbox" id="planung-inbox">
      <div class="planung-inbox-head">Einzuplanen · Stand ${esc(jiraSyncAgeLabel() || 'unbekannt')} — wird hinter die letzte geplante Arbeit gestellt, Dauer danach per Ziehen anpassen</div>
      ${auftragRows}
      ${parkedRows}
    </div>`;
}

function togglePlanungInbox() {
  viewState.planungShowInbox = !viewState.planungShowInbox;
  render();
}

function openPlanungInbox(personId) {
  viewState.planungShowInbox = true;
  if (personId && planungPersonFilter() && planungPersonFilter() !== personId) viewState.planungPerson = personId;
  render();
  document.getElementById('planung-inbox')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function planSpanFor(personId, weeks) {
  const start = personFreeFrom(personId);
  return { start, end: addWorkdays(start, Math.max(1, weeks * 5) - 1) };
}

function planAuftrag(personId, key, weeks) {
  const ref = jiraAuftragKey(key);
  if (!ref) return;
  const exists = data.blocks.some(b => b.personId === personId && !b.done && blockAuftragKey(b) === ref);
  if (exists) { toast(`${ref} hat schon einen Block`); render(); return; }
  const { start, end } = planSpanFor(personId, weeks);
  const summary = jiraSummaryForKey(ref);
  data.blocks.push({
    id: uid(), personId, typ: 'ticket', label: summary || ref, start, end, done: false,
    jiraRef: ref, jiraSummary: summary || null, notiz: null,
  });
  saveData(data);
  toast(`${ref} eingeplant: ${formatDateShort(start)}–${formatDateShort(end)}`);
  render();
}

function scheduleParkedBlock(id, weeks) {
  const b = data.blocks.find(x => x.id === id);
  if (!b) return;
  Object.assign(b, planSpanFor(b.personId, weeks));
  saveData(data);
  toast(`Eingeplant: ${formatDateShort(b.start)}–${formatDateShort(b.end)}`);
  render();
}

// ============================================================
// UMSTELLUNG: Subtask-Bloecke zu Auftrags-Bloecken
// ============================================================
// Frueher bekam jeder Subtask einen eigenen Block. Jetzt ist die Einheit der
// Auftrag: offene Bloecke derselben Person, die laut Jira zum selben Auftrag
// gehoeren, werden zu einem zusammengefasst (fruehester Start bis spaetestes
// Ende). Loescht Bloecke — deshalb nur per Dialog und nach einem Backup, wie
// das Aufraeumen.
function planungMergeGroups() {
  if (!jiraSyncData) return [];
  const groups = new Map();
  for (const b of data.blocks || []) {
    if (isAbsenceBlock(b) || b.done || !b.jiraRef) continue;
    const key = blockAuftragKey(b);
    const gk = b.personId + '|' + key;
    if (!groups.has(gk)) groups.set(gk, { personId: b.personId, key, blocks: [] });
    groups.get(gk).blocks.push(b);
  }
  return [...groups.values()].filter(g => g.blocks.length > 1
    || g.blocks[0].jiraRef.trim().toUpperCase() !== g.key);
}

function openPlanungMergeDialog() {
  const groups = planungMergeGroups();
  if (!groups.length) { closeOverlay(); return; }
  const removed = groups.reduce((n, g) => n + g.blocks.length - 1, 0);
  const rows = groups.map(g => {
    const dated = g.blocks.filter(b => !isBlockParked(b));
    const span = dated.length
      ? `${formatDate(dated.map(b => b.start).sort()[0])}–${formatDate(dated.map(b => b.end).sort().pop())}`
      : 'ohne Datum';
    return `
      <div class="jira-drift-row">
        <span class="planung-inbox-person">${esc(personName(g.personId))}</span>
        ${jiraKeyLink(g.key)}
        <span class="jira-drift-text" title="${esc(g.blocks.map(b => `${b.jiraRef} ${b.label || ''}`).join('\n'))}">${esc(jiraSummaryForKey(g.key) || g.key)}</span>
        <span class="jira-drift-note">${g.blocks.length} → 1 · ${esc(span)}</span>
      </div>`;
  }).join('');
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Auf Aufträge umstellen</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <p class="form-hint" style="margin-bottom:10px">Blöcke auf Subtasks werden zu einem Block pro Person und Auftrag zusammengeführt: frühester Start bis spätestes Ende.
        ${removed ? `${removed} ${removed === 1 ? 'Block fällt' : 'Blöcke fallen'} dabei weg.` : ''} Vorher wird ein Backup geschrieben. Erledigte Blöcke bleiben unverändert.</p>
      ${rows}
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1" onclick="runPlanungMerge()">Umstellen</button>
        <button class="btn btn-secondary" onclick="closeOverlay()">Abbrechen</button>
      </div>
    </div>
  `;
  openOverlay();
}

async function runPlanungMerge() {
  const groups = planungMergeGroups();
  if (!groups.length) { closeOverlay(); return; }
  try {
    await writeBackupFile('umstellung');
  } catch (error) {
    toast('Backup fehlgeschlagen — nichts umgestellt: ' + errorMessage(error));
    return;
  }
  const drop = new Set();
  for (const g of groups) {
    // Behalten wird der Block, der schon auf den Auftrag zeigt — sonst der
    // erste. So bleibt seine Notiz und seine id (Verweise aus Suche/Dashboard).
    const keep = g.blocks.find(b => b.jiraRef.trim().toUpperCase() === g.key) || g.blocks[0];
    const dated = g.blocks.filter(b => !isBlockParked(b));
    const notes = g.blocks.map(b => b.notiz).filter(Boolean);
    const summary = jiraSummaryForKey(g.key);
    Object.assign(keep, {
      typ: 'ticket',
      jiraRef: g.key,
      jiraSummary: summary || null,
      label: summary || keep.label || g.key,
      start: dated.length ? dated.map(b => b.start).sort()[0] : null,
      end: dated.length ? dated.map(b => b.end).sort().pop() : null,
      notiz: notes.length ? [...new Set(notes)].join('\n') : null,
    });
    for (const b of g.blocks) if (b !== keep) drop.add(b.id);
  }
  data.blocks = data.blocks.filter(b => !drop.has(b.id));
  saveData(data);
  closeOverlay();
  toast(`Umgestellt: ${groups.length} ${groups.length === 1 ? 'Auftrag' : 'Aufträge'}, ${drop.size} ${drop.size === 1 ? 'Block' : 'Blöcke'} zusammengeführt`);
  render();
}

// Der grep trifft auch Mitarbeiternamen: dann zaehlen alle Bloecke dieser
// Person mit. Ab 2 Zeichen, damit ein einzelner Buchstabe nicht das halbe
// Team einsammelt und den grep wirkungslos macht.
function personNameMatchesPlanungQuery(personId, query) {
  if (!query || query.length < 2) return false;
  const person = data.persons.find(p => p.id === personId);
  return !!person && person.type !== 'kontakt'
    && person.name.toLocaleLowerCase('de-AT').includes(query);
}

function blockMatchesPlanungQuery(block, query) {
  if (!query) return true;
  if (personNameMatchesPlanungQuery(block.personId, query)) return true;
  return [blockDisplayLabel(block), block.label, block.jiraRef, blockAuftragKey(block), block.notiz]
    .filter(Boolean)
    .some(value => String(value).toLocaleLowerCase('de-AT').includes(query));
}

function setPlanungQuery(value) {
  const input = document.getElementById('planungSearchInput');
  pendingPlanungSearchSelection = input
    ? { start: input.selectionStart, end: input.selectionEnd }
    : { start: value.length, end: value.length };
  viewState.planungQuery = value;
  render();
}

function restorePlanungSearchFocus() {
  if (!pendingPlanungSearchSelection) return;
  const input = document.getElementById('planungSearchInput');
  if (!input) { pendingPlanungSearchSelection = null; return; }
  const selection = pendingPlanungSearchSelection;
  pendingPlanungSearchSelection = null;
  input.focus({ preventScroll: true });
  input.setSelectionRange(selection.start, selection.end);
}

function extendPlanungPastWeek() {
  viewState.planungExtraPastWeeks = planungExtraPastWeeks() + 1;
  render();
}

function extendPlanungFutureWeek() {
  viewState.planungExtraFutureWeeks = planungExtraFutureWeeks() + 1;
  render();
}

function changePlanungWeek(dir) {
  viewState.planungWeekOffset = planungWeekOffset() + (dir < 0 ? -1 : 1);
  render();
}

function resetPlanungWindow() {
  viewState.planungWeekOffset = 0;
  viewState.planungExtraPastWeeks = 0;
  render();
}

// Leerer String = ganzes Team. Verweist der Filter auf eine geloeschte Person,
// faellt er still auf "alle" zurueck.
function planungPersonFilter() {
  const id = viewState.planungPerson || '';
  if (!id) return '';
  return (data.persons || []).some(p => p.id === id && p.type !== 'kontakt') ? id : '';
}

function setPlanungPerson(id) {
  viewState.planungPerson = id || '';
  delete viewState.planungQueuePerson;
  render();
}

function setPlanungSort(sort) {
  viewState.planungSort = sort;
  render();
}

function togglePlanungHandover() {
  viewState.planungShowHandover = !viewState.planungShowHandover;
  render();
}

function planungHideHandover() {
  if (typeof viewState.planungHideHandover === 'boolean') return viewState.planungHideHandover;
  try { return localStorage.getItem('tktool-planung-work-only') !== '0'; } catch { return true; }
}
function togglePlanungHideHandover() {
  viewState.planungHideHandover = !planungHideHandover();
  try { localStorage.setItem('tktool-planung-work-only', viewState.planungHideHandover ? '1' : '0'); } catch {}
  render();
}

function markBlockDone(id) {
  const b = data.blocks.find(x => x.id === id);
  if (!b) return;
  b.done = true;
  saveData(data);
  toast('Block erledigt');
  render();
}

// ============================================================
// PERSON PLANUNG (timeline + support editor on detail page)
// ============================================================
function renderPersonPlanungCard(person) {
  const today = new Date();
  const todayISO = todayStr();
  const months = parseInt(viewState.personTimelineMonths || 1, 10);
  const startISO = todayISO;
  const end = new Date(today);
  end.setMonth(end.getMonth() + months);
  const endISO = toISO(end);

  const curMonth = currentMonth();
  const sup = (person.supportMonate || []).slice().sort();
  const isSupThis = sup.includes(curMonth);
  const past = sup.filter(m => m <= curMonth);
  const future = sup.filter(m => m > curMonth);
  const last = past.length ? past[past.length - 1] : null;
  const next = future.length ? future[0] : null;

  const pBlocks = data.blocks.filter(b => b.personId === person.id && !isAbsenceBlock(b)).map(blockView);
  const openBlocks = pBlocks.filter(b => !isBlockParked(b) && b.state !== 'done').sort((a, b) => a.start.localeCompare(b.start));
  const parkedList = pBlocks.filter(b => isBlockParked(b) && b.state !== 'done');
  const allDone = pBlocks.filter(b => !isBlockParked(b) && b.state === 'done').sort((a, b) => b.start.localeCompare(a.start));
  // Erledigtes ist Archiv, nicht Arbeitsvorrat: eingeklappt, bis jemand fragt.
  const showDone = !!viewState.personBlocksShowDone;
  const doneBlocks = showDone ? allDone : [];
  const blockRow = (b) => {
    const waiting = b.state === 'waiting' ? String(blockOpenTickets(b)[0]?.status || '') : '';
    return `
    <div class="person-block-row ${b.state === 'done' ? 'person-block-done' : ''}" onclick="openBlockForm('${b.id}')">
      <span class="tl-block-swatch tl-block-ticket"></span>
      <span class="person-block-label">${esc(blockDisplayLabel(b))}</span>
      <span class="person-block-range">${isBlockParked(b) ? 'ohne datum' : formatDate(b.start) + '–' + formatDate(b.plannedEnd)}</span>
      ${b.overrun ? `<span class="person-block-overdue" title="Laut Jira noch offen (Stand: ${esc(jiraSyncAgeLabel() || 'unbekannt')})">läuft über</span>` : ''}
      ${waiting ? `<span class="jira-status-chip jira-status-handover" title="Wartet woanders (Stand: ${esc(jiraSyncAgeLabel() || 'unbekannt')})">${esc(waiting.toLowerCase())}</span>` : ''}
      ${b.state === 'done'
        ? `<span class="person-block-checked" title="${b.done ? 'erledigt' : 'erledigt laut Jira'}">&#x2713;</span>`
        : `<button class="person-block-check" onclick="event.stopPropagation();markBlockDone('${b.id}')" title="Als erledigt markieren">&#x2713;</button>`}
    </div>`;
  };
  const blocksSection = (openBlocks.length || parkedList.length || allDone.length) ? `
    <div class="person-blocks">
      <div class="person-blocks-head">Blöcke</div>
      ${openBlocks.map(blockRow).join('')}
      ${parkedList.map(blockRow).join('')}
      ${allDone.length ? `
        <button class="person-blocks-sub person-blocks-toggle" type="button"
          onclick="togglePersonBlocksShowDone()"
          title="${showDone ? 'Erledigte ausblenden' : 'Erledigte anzeigen'}">
          <span class="person-blocks-toggle-icon">${showDone ? '&minus;' : '+'}</span>
          erledigt &middot; ${allDone.length}
        </button>
        ${doneBlocks.map(blockRow).join('')}` : ''}
    </div>
  ` : '';

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Planung</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-secondary" onclick="changePersonTimelineMonths(1)">+ Monat</button>
          <button class="btn btn-sm btn-primary" onclick="openBlockForm(null,'${person.id}')">+ Block</button>
        </div>
      </div>

      <div class="planung-info">
        <div><strong>Support-Rotation diesen Monat:</strong> ${isSupThis ? 'ja' : 'nein'}</div>
        <div><strong>Letzte:</strong> ${last ? formatMonthName(last) : '—'}</div>
        <div><strong>Nächste:</strong> ${next ? formatMonthName(next) : '—'}</div>
      </div>

      ${renderTimeline({ personIds: [person.id], startDate: startISO, endDate: endISO, options: { idPrefix: 'person', showWeekends: planungShowWeekends() } })}

      ${blocksSection}

      <div class="support-editor">
        <div class="support-editor-head">Support-Rotation verwalten</div>
        <div class="support-months-list">
          ${sup.length ? sup.map(m => `
            <span class="support-month-chip">
              ${formatMonthName(m)}
              <button onclick="removeSupportMonth('${person.id}','${m}')" title="Entfernen">&#x2715;</button>
            </span>
          `).join('') : '<span style="color:var(--text-muted)">Keine Monate</span>'}
        </div>
        <div class="support-add">
          <input type="month" class="form-input" id="supportMonthInput-${person.id}" value="${curMonth}">
          <button class="btn btn-secondary btn-sm" onclick="addSupportMonthFromInput('${person.id}')">+ Monat</button>
        </div>
      </div>
    </div>
  `;
}

function togglePersonBlocksShowDone() {
  viewState.personBlocksShowDone = !viewState.personBlocksShowDone;
  render();
}

function changePersonTimelineMonths(delta) {
  const cur = parseInt(viewState.personTimelineMonths || 1, 10);
  viewState.personTimelineMonths = Math.max(1, cur + delta);
  render();
}

function addSupportMonthFromInput(personId) {
  const input = document.getElementById(`supportMonthInput-${personId}`);
  if (!input || !input.value) return;
  addSupportMonth(personId, input.value);
}

function addSupportMonth(personId, month) {
  const p = data.persons.find(p => p.id === personId);
  if (!p) return;
  if (!p.supportMonate) p.supportMonate = [];
  if (!p.supportMonate.includes(month)) {
    p.supportMonate.push(month);
    p.supportMonate.sort();
    saveData(data);
    render();
  }
}

function removeSupportMonth(personId, month) {
  const p = data.persons.find(p => p.id === personId);
  if (!p || !p.supportMonate) return;
  p.supportMonate = p.supportMonate.filter(m => m !== month);
  saveData(data);
  render();
}

// ============================================================
// MEETING DETAIL — embedded team status
// ============================================================
function renderMeetingTeamStatusForDate(dateISO, options = {}) {
  if (!dateISO) return '';
  const { inForm = false, personIds = null, heading = 'Team-Status', idPrefix = null } = options;
  const weekStart = startOfWeek(parseISO(dateISO));
  const start = toISO(weekStart);
  const end = toISO(addDays(weekStart, 4));

  let resolvedPersonIds = personIds;
  if (!resolvedPersonIds) {
    const team = data.persons
      .filter(p => p.type !== 'kontakt')
      .slice()
      .sort(comparePersonsByName);
    if (!team.length) return '';
    resolvedPersonIds = team.map(p => p.id);
  }
  resolvedPersonIds = resolvedPersonIds
    .slice()
    .sort((a, b) => comparePersonsByName(
      data.persons.find(person => person.id === a),
      data.persons.find(person => person.id === b),
    ));
  if (!resolvedPersonIds.length) return '';

  return `
    <div class="${inForm ? 'meeting-status-preview' : 'meeting-detail-section'}">
      <h3>${esc(heading)} — KW ${formatDateShort(start)}–${formatDateShort(end)}</h3>
      ${renderTimeline({ personIds: resolvedPersonIds, startDate: start, endDate: end, options: { showWeekends: false, dense: true, compact: inForm, idPrefix: idPrefix || (inForm ? 'meeting-preview' : 'meeting'), insertLane: true } })}
    </div>
  `;
}

function renderMeetingTeamStatus(m) {
  if (!m.date) return '';
  if (m.type === 'oneOnOne' && m.personId) {
    const person = data.persons.find(p => p.id === m.personId);
    return renderMeetingTeamStatusForDate(m.date, {
      personIds: [m.personId],
      heading: person ? person.name : '1:1-Status',
      idPrefix: `meeting-${m.id}`,
    });
  }
  if (!isTeamMeeting(m)) return '';
  return renderMeetingTeamStatusForDate(m.date, { idPrefix: `meeting-${m.id}` });
}

// ============================================================
// BLOCK CRUD
// ============================================================
function openBlockForm(blockId, prefillPersonId, prefillStart, prefillEnd) {
  document.getElementById('overlay').classList.toggle('overlay-drawer', currentView === 'planung');
  const b = blockId ? data.blocks.find(x => x.id === blockId) : null;
  const personId = b ? b.personId : (prefillPersonId || '');
  const personOpts = data.persons.filter(p => p.type !== 'kontakt')
    .map(p => `<option value="${p.id}" ${personId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  const typ = b && isAbsenceBlock(b) ? 'abwesenheit' : 'ticket';
  // Neu ohne Datum aus der Timeline: hinten anstellen, eine Woche.
  const suggested = !b && !prefillStart && personId ? planSpanFor(personId, 1) : null;
  const start = b ? (b.start || '') : (prefillStart || (suggested ? suggested.start : todayStr()));
  const end = b ? (b.end || '') : (prefillEnd || (suggested ? suggested.end : addWorkdays(start, 4)));
  const view = b ? blockView(b) : null;
  const jiraDone = !!(view && view.state === 'done' && !b.done);
  const auftragKey = b ? blockAuftragKey(b) : '';
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">${b ? 'Block bearbeiten' : 'Neuer Block'}</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body" data-block-new="${b ? '' : '1'}" data-dates-touched="${b || prefillStart ? '1' : ''}">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Person</label>
          <select class="form-select" id="blockPerson" onchange="onBlockPersonChange()">
            <option value="">Person wählen...</option>
            ${personOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Typ</label>
          <select class="form-select" id="blockTyp" onchange="onBlockTypChange()">
            ${BLOCK_TYPES.map(t => `<option value="${t.val}" ${typ === t.val ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group" id="blockTicketGroup" ${typ === 'abwesenheit' ? 'hidden' : ''}>
        <label class="form-label" style="display:flex;justify-content:space-between;align-items:baseline">
          Jira-Auftrag
          <a id="blockJiraLink" class="jira-link" target="_blank" rel="noopener" href="${auftragKey && jiraUrl(auftragKey) ? esc(jiraUrl(auftragKey)) : '#'}" ${auftragKey && jiraUrl(auftragKey) ? '' : 'hidden'}>öffnen ↗</a>
        </label>
        <input class="form-input" id="blockJira" list="blockJiraSuggest" autocomplete="off" autofocus
          value="${esc(auftragKey || (b && b.jiraRef) || '')}" placeholder="TK-1234 — ein Subtask-Key wird zu seinem Auftrag"
          oninput="onBlockJiraInput(this.value)">
        <datalist id="blockJiraSuggest">
          ${jiraAuftragPool().map(t => `<option value="${esc(t.key)}" label="${esc(t.summary)}">${esc(t.summary)}</option>`).join('')}
        </datalist>
        <div class="form-hint" id="blockJiraHint">${esc(blockJiraHintText(auftragKey || (b && b.jiraRef) || '', b))}</div>
      </div>
      <div class="form-group" id="blockLabelGroup" ${typ === 'abwesenheit' ? '' : 'hidden'}>
        <label class="form-label">Bezeichnung</label>
        <input class="form-input" id="blockLabel" value="${b && isAbsenceBlock(b) ? esc(b.label || '') : ''}" placeholder="z.B. Urlaub, Schulung">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start</label>
          <input type="date" class="form-input" id="blockStart" value="${start}" oninput="markBlockDatesTouched()">
        </div>
        <div class="form-group">
          <label class="form-label">Ende ${typ === 'abwesenheit' ? '' : '(geschätzt)'}</label>
          <input type="date" class="form-input" id="blockEnd" value="${end}" oninput="markBlockDatesTouched()">
        </div>
      </div>
      <div class="form-group block-duration">
        <span class="form-hint">Dauer ab Start:</span>
        ${[1, 2, 3, 4, 6].map(n => `<button type="button" class="filter-btn" onclick="setBlockDurationWeeks(${n})">${n} W</button>`).join('')}
      </div>
      ${view && view.overrun ? `<div class="form-hint">Läuft über: laut Jira noch offen (Stand: ${esc(jiraSyncAgeLabel() || 'unbekannt')}), der Balken reicht deshalb bis heute. Ist es in Wahrheit schon fertig, „Erledigt“ anhaken und das Ende aufs echte Datum setzen.</div>` : ''}
      <div class="form-group" id="blockDoneGroup" ${typ === 'abwesenheit' ? 'hidden' : ''}>
        <label class="form-label" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="blockDone" ${(b && b.done) || jiraDone ? 'checked' : ''} ${jiraDone ? 'disabled' : ''}>
          <span>Erledigt${jiraDone ? ' — laut Jira' : ''}</span>
        </label>
      </div>
      <div class="form-group">
        <label class="form-label">Notiz</label>
        <textarea class="form-textarea" id="blockNotiz" rows="3">${b ? esc(b.notiz || '') : ''}</textarea>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" style="flex:1;min-width:140px" onclick="saveBlock('${blockId || ''}')">Speichern</button>
        <button class="btn btn-secondary" onclick="closeOverlay()">Abbrechen</button>
        ${b ? `<button class="btn btn-danger" onclick="deleteBlock('${b.id}')">Löschen</button>` : ''}
      </div>
    </div>
  `;
  openOverlay();
}

// Was hinter der Eingabe steckt: Auftrag, Titel und ob schon geplant. Ein
// Subtask-Key wird hier sichtbar auf seinen Auftrag umgebogen.
function blockJiraHintText(val, block = null) {
  const raw = String(val || '').trim().toUpperCase();
  if (!raw) return jiraSyncData ? 'Aus der Liste wählen oder Key eintippen.' : 'Noch kein Jira-Stand — Key eintippen, Titel kommt mit dem nächsten Import.';
  const key = jiraAuftragKey(raw);
  const summary = jiraSummaryForKey(key);
  const parts = [];
  if (key !== raw) parts.push(`Subtask von ${key}`);
  parts.push(summary || (jiraSyncData ? 'nicht im Jira-Stand' : ''));
  const personId = document.getElementById('blockPerson')?.value || (block && block.personId);
  const other = personId && data.blocks.find(b => b.personId === personId && !b.done
    && (!block || b.id !== block.id) && blockAuftragKey(b) === key);
  if (other) parts.push(`hat schon einen Block (${formatDateShort(other.start || todayStr())}–${formatDateShort(other.end || todayStr())})`);
  return parts.filter(Boolean).join(' · ');
}

function onBlockTypChange() {
  const absence = document.getElementById('blockTyp').value === 'abwesenheit';
  document.getElementById('blockTicketGroup').hidden = absence;
  document.getElementById('blockLabelGroup').hidden = !absence;
  document.getElementById('blockDoneGroup').hidden = absence;
}

function markBlockDatesTouched() {
  const body = document.querySelector('#modal .modal-body');
  if (body) body.dataset.datesTouched = '1';
}

// Bei einem neuen Block ohne Datum aus der Timeline wandert der Vorschlag
// mit der Person mit — bis man selbst ein Datum anfasst.
function onBlockPersonChange() {
  const body = document.querySelector('#modal .modal-body');
  const personId = document.getElementById('blockPerson').value;
  if (body && body.dataset.blockNew && !body.dataset.datesTouched && personId) {
    const span = planSpanFor(personId, 1);
    document.getElementById('blockStart').value = span.start;
    document.getElementById('blockEnd').value = span.end;
  }
  const hint = document.getElementById('blockJiraHint');
  if (hint) hint.textContent = blockJiraHintText(document.getElementById('blockJira').value);
}

function setBlockDurationWeeks(weeks) {
  const startEl = document.getElementById('blockStart');
  const endEl = document.getElementById('blockEnd');
  const start = nextWorkdayOnOrAfter(startEl.value || todayStr());
  startEl.value = start;
  endEl.value = addWorkdays(start, weeks * 5 - 1);
  markBlockDatesTouched();
}

function updateBlockJiraLink(val) {
  const a = document.getElementById('blockJiraLink');
  if (!a) return;
  const href = jiraUrl(jiraAuftragKey(val));
  a.hidden = !href;
  if (href) a.href = href;
}

function onBlockJiraInput(val) {
  updateBlockJiraLink(val);
  const hint = document.getElementById('blockJiraHint');
  if (hint) hint.textContent = blockJiraHintText(val);
}

// Opens the block's Jira ticket in a new tab. Returns false when there is
// nothing to open (no ref or no base URL configured) so the caller can
// fall back to the edit form.
function openBlockJira(blockId) {
  const b = data.blocks.find(x => x.id === blockId);
  const url = b ? jiraUrl(blockAuftragKey(b)) : null;
  if (!url) return false;
  window.open(url, '_blank', 'noopener');
  return true;
}

function saveBlock(id) {
  const existing = id ? data.blocks.find(x => x.id === id) : null;
  if (id && !existing) return;
  const personId = document.getElementById('blockPerson').value;
  const typ = document.getElementById('blockTyp').value === 'abwesenheit' ? 'abwesenheit' : 'ticket';
  let start = document.getElementById('blockStart').value;
  let end = document.getElementById('blockEnd').value;
  const notiz = document.getElementById('blockNotiz').value.trim();
  const doneEl = document.getElementById('blockDone');
  // Ein von Jira abgeleitetes Erledigt ist kein manuelles — nicht speichern.
  const done = typ === 'ticket' && !!(doneEl && doneEl.checked && !doneEl.disabled);

  if (!personId) { toast('Person nötig'); return; }
  if (!start && !end) { toast('Start und Ende nötig'); return; }
  if (!start) start = end;
  if (!end) end = start;
  if (end < start) { const tmp = start; start = end; end = tmp; }

  let fields;
  if (typ === 'abwesenheit') {
    const label = document.getElementById('blockLabel').value.trim() || 'Abwesenheit';
    fields = { personId, typ, label, start, end, done: false, jiraRef: null, jiraSummary: null, notiz: notiz || null };
  } else {
    const raw = document.getElementById('blockJira').value.trim();
    const key = jiraAuftragKey(raw);
    // Ohne Jira gibt es keine Tickets mehr. Nur alte Bloecke ohne Key duerfen
    // so bleiben, damit man sie noch abschliessen kann.
    if (!key && !(existing && !existing.jiraRef && !isAbsenceBlock(existing))) { toast('Jira-Auftrag nötig'); return; }
    if (key && !done) {
      const dup = data.blocks.find(b => b.personId === personId && !b.done && b.id !== id && blockAuftragKey(b) === key);
      if (dup) { toast(`${key} hat für diese Person schon einen Block — den bitte verlängern`); return; }
    }
    const summary = key ? jiraSummaryForKey(key) : '';
    fields = {
      personId, typ, start, end, done, notiz: notiz || null,
      jiraRef: key || null,
      jiraSummary: summary || (existing && existing.jiraSummary) || null,
      // Gespeichert nur als Rueckfall fuer die Anzeige ohne Jira-Stand.
      label: summary || (existing && blockAuftragKey(existing) === key && existing.label) || key || (existing && existing.label) || '',
    };
  }

  if (existing) Object.assign(existing, fields);
  else data.blocks.push({ id: uid(), ...fields });
  saveData(data);
  closeOverlay();
  toast(existing ? 'Block aktualisiert' : 'Block angelegt');
  render();
}

function deleteBlock(id) {
  if (!confirm('Block löschen?')) return;
  data.blocks = data.blocks.filter(b => b.id !== id);
  saveData(data);
  closeOverlay();
  render();
}

function openMarkerForm(markerId) {
  const m = markerId ? (data.markers || []).find(x => x.id === markerId) : null;
  const date = m ? m.date : todayStr();
  const color = m ? m.color : MARKER_COLORS[0];
  const swatches = MARKER_COLORS.map(c => `
    <label class="marker-swatch ${c === color ? 'selected' : ''}" style="background:${c}">
      <input type="radio" name="markerColor" value="${c}" ${c === color ? 'checked' : ''}>
    </label>
  `).join('');
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">${m ? 'Marker bearbeiten' : 'Neuer Marker'}</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Label</label>
        <input class="form-input" id="markerLabel" value="${m ? esc(m.label || '') : ''}" placeholder="z.B. Release 4.2, Code Freeze" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Datum</label>
        <input type="date" class="form-input" id="markerDate" value="${date}">
      </div>
      <div class="form-group">
        <label class="form-label">Farbe</label>
        <div class="marker-swatches" onclick="onMarkerSwatchClick(event)">${swatches}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" style="flex:1;min-width:140px" onclick="saveMarker('${markerId || ''}')">Speichern</button>
        <button class="btn btn-secondary" onclick="closeOverlay()">Abbrechen</button>
        ${m ? `<button class="btn btn-danger" onclick="deleteMarker('${m.id}')">Löschen</button>` : ''}
      </div>
    </div>
  `;
  openOverlay();
}

function onMarkerSwatchClick(e) {
  const label = e.target.closest('.marker-swatch');
  if (!label) return;
  document.querySelectorAll('.marker-swatch').forEach(el => el.classList.remove('selected'));
  label.classList.add('selected');
}

function saveMarker(id) {
  const label = document.getElementById('markerLabel').value.trim();
  const date = document.getElementById('markerDate').value;
  const colorInput = document.querySelector('input[name="markerColor"]:checked');
  const color = colorInput ? colorInput.value : MARKER_COLORS[0];
  if (!date) { toast('Datum nötig'); return; }
  if (!data.markers) data.markers = [];
  if (id) {
    const m = data.markers.find(x => x.id === id);
    if (!m) return;
    Object.assign(m, { label, date, color });
  } else {
    data.markers.push({ id: uid(), label, date, color });
  }
  saveData(data);
  closeOverlay();
  toast(id ? 'Marker aktualisiert' : 'Marker angelegt');
  render();
}

function deleteMarker(id) {
  if (!confirm('Marker löschen?')) return;
  data.markers = (data.markers || []).filter(m => m.id !== id);
  saveData(data);
  closeOverlay();
  render();
}

// ============================================================
// BLOCK DRAG INTERACTIONS
// ============================================================
let _tlDrag = null;
let _tlFrozenOrder = null;
let _tlFrozenLanes = null; // { personId, keys: Map<unitKey, index> }

function tlFrozenLaneKeysFor(personId) {
  return _tlFrozenLanes && _tlFrozenLanes.personId === personId ? _tlFrozenLanes.keys : null;
}

// Reihenfolge aus dem gerenderten Track lesen: erst Lane (top), dann Startspalte.
// Genau die Reihenfolge, in der der Lane-Packer die Einheiten vergeben hat.
function tlCaptureLaneOrder(personId) {
  const track = document.querySelector(`.tl-track[data-person-id="${personId}"]`);
  if (!track) { _tlFrozenLanes = null; return; }
  const els = Array.from(track.querySelectorAll('[data-unit-key]'))
    .map(el => ({ key: el.dataset.unitKey, top: parseFloat(el.style.top) || 0, left: parseFloat(el.style.left) || 0 }))
    .sort((a, b) => (a.top - b.top) || (a.left - b.left));
  const keys = new Map();
  els.forEach(({ key }) => { if (!keys.has(key)) keys.set(key, keys.size); });
  _tlFrozenLanes = { personId, keys };
}

function _dayIsoFromTrack(trackEl, clientX) {
  const cells = trackEl.querySelectorAll('.tl-track-grid .tl-cell');
  if (!cells.length) return null;
  const firstRect = cells[0].getBoundingClientRect();
  if (clientX < firstRect.left) return cells[0].dataset.dayIso;
  for (let i = cells.length - 1; i >= 0; i--) {
    const rect = cells[i].getBoundingClientRect();
    if (clientX >= rect.left) return cells[i].dataset.dayIso;
  }
  return cells[cells.length - 1].dataset.dayIso;
}

function onTrackPointerDown(event, personId) {
  if (event.target.closest('.tl-block')) return; // block handles its own drag
  if (event.button !== 0) return;
  const track = event.currentTarget;
  const overlay = track.querySelector('.tl-track-overlay');
  const startIso = _dayIsoFromTrack(track, event.clientX);
  if (!startIso || !overlay) return;
  _tlDrag = { mode: 'create', personId, track, startIso, currentIso: startIso };
  track.classList.add('tl-track-creating');
  track.setPointerCapture(event.pointerId);
  event.preventDefault();

  const ghost = document.createElement('div');
  ghost.className = 'tl-block tl-block-preview';
  ghost.style.pointerEvents = 'none';
  const insertLane = track.querySelector('.tl-insert-lane');
  if (insertLane) {
    ghost.style.top = insertLane.style.top;
    ghost.style.height = insertLane.style.height;
    ghost.style.zIndex = '3';
  }
  overlay.appendChild(ghost);

  const updateGhost = () => {
    const cells = track.querySelectorAll('.tl-track-grid .tl-cell');
    let sIdx = -1, eIdx = -1;
    cells.forEach((c, i) => {
      if (c.dataset.dayIso === _tlDrag.startIso) sIdx = i;
      if (c.dataset.dayIso === _tlDrag.currentIso) eIdx = i;
    });
    if (sIdx < 0 || eIdx < 0) return;
    const lo = Math.min(sIdx, eIdx), hi = Math.max(sIdx, eIdx);
    const cols = parseInt(track.dataset.cols || String(cells.length), 10) || cells.length;
    ghost.style.left = `${(lo / cols) * 100}%`;
    ghost.style.width = `${((hi - lo + 1) / cols) * 100}%`;
    const n = hi - lo + 1;
    ghost.textContent = `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
  };
  updateGhost();

  const onMove = (e) => {
    const iso = _dayIsoFromTrack(track, e.clientX);
    if (iso) { _tlDrag.currentIso = iso; updateGhost(); }
  };
  const onUp = (e) => {
    track.removeEventListener('pointermove', onMove);
    track.removeEventListener('pointerup', onUp);
    track.removeEventListener('pointercancel', onUp);
    track.classList.remove('tl-track-creating');
    ghost.remove();
    if (!_tlDrag) return;
    const s = _tlDrag.startIso, c = _tlDrag.currentIso;
    const start = s < c ? s : c;
    const end = s < c ? c : s;
    _tlDrag = null;
    openBlockForm(null, personId, start, end);
  };
  track.addEventListener('pointermove', onMove);
  track.addEventListener('pointerup', onUp);
  track.addEventListener('pointercancel', onUp);
}

function onBlockPointerDown(event, blockId) {
  if (event.button !== 0) return;
  const blockEl = event.currentTarget;
  const track = blockEl.closest('.tl-track');
  if (!track) return;
  const rect = blockEl.getBoundingClientRect();
  const relX = event.clientX - rect.left;
  const edgeSize = Math.min(12, Math.max(6, rect.width / 4));
  let mode = 'move';
  if (relX <= edgeSize) mode = 'resize-start';
  else if (relX >= rect.width - edgeSize) mode = 'resize-end';

  const b = data.blocks.find(x => x.id === blockId);
  if (!b) return;

  // Gezogen wird, was man sieht: bei einem ueberzogenen Block ist das Ende
  // heute, nicht die gespeicherte Schaetzung dahinter.
  const shown = blockView(b);
  const startIsoAtDown = _dayIsoFromTrack(track, event.clientX);
  _tlDrag = { mode, blockId, track, downIso: startIsoAtDown, origStart: shown.start, origEnd: shown.end, moved: false };
  _tlFrozenOrder = Array.from(document.querySelectorAll('.tl-track[data-person-id]')).map(el => el.dataset.personId);
  tlCaptureLaneOrder(b.personId);
  event.preventDefault();
  event.stopPropagation();

  const apply = (iso) => {
    if (!iso) return;
    const signedDelta = Math.round((parseISO(iso) - parseISO(_tlDrag.downIso)) / 86400000);
    if (mode === 'move') {
      b.start = toISO(addDays(parseISO(_tlDrag.origStart), signedDelta));
      b.end = toISO(addDays(parseISO(_tlDrag.origEnd), signedDelta));
    } else if (mode === 'resize-start') {
      let newStart = toISO(addDays(parseISO(_tlDrag.origStart), signedDelta));
      if (newStart > _tlDrag.origEnd) newStart = _tlDrag.origEnd;
      b.start = newStart;
      if (b.end < b.start) b.end = b.start;
    } else if (mode === 'resize-end') {
      let newEnd = toISO(addDays(parseISO(_tlDrag.origEnd), signedDelta));
      if (newEnd < b.start) newEnd = b.start;
      b.end = newEnd;
    }
    _tlDrag.moved = true;
    render();
  };

  const onMove = (e) => {
    const iso = _dayIsoFromTrack(document.querySelector(`.tl-track[data-person-id="${b.personId}"]`) || track, e.clientX);
    apply(iso);
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    const moved = _tlDrag && _tlDrag.moved;
    _tlDrag = null;
    _tlFrozenOrder = null;
    _tlFrozenLanes = null;
    if (moved) {
      _suppressNextBlockClick = true;
      setTimeout(() => { _suppressNextBlockClick = false; }, 100);
      saveData(data);
      render();
    }
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

let _suppressNextBlockClick = false;

// ============================================================
// EXPORT EXTENSIONS
// ============================================================
function exportMonthBlocks(month) {
  const ms = toISO(monthStart(month));
  const me = toISO(monthEnd(month));
  const blocks = data.blocks.filter(b => b.end >= ms && b.start <= me);
  if (!blocks.length) return '';
  // Group by person
  const byPerson = {};
  blocks.forEach(b => {
    (byPerson[b.personId] = byPerson[b.personId] || []).push(b);
  });
  let md = `## Kapazitätsplanung\n\n`;
  Object.keys(byPerson).forEach(pid => {
    const p = data.persons.find(x => x.id === pid);
    const name = p ? p.name : '(unbekannt)';
    md += `### ${name}\n`;
    byPerson[pid].sort((a, b) => a.start.localeCompare(b.start));
    byPerson[pid].forEach(b => {
      md += `- ${blockDisplayLabel(b)} · ${isAbsenceBlock(b) ? 'abwesenheit' : 'ticket'}`;
      if (blockAuftragKey(b)) md += ` · ${jiraMd(blockAuftragKey(b))}`;
      md += '\n';
    });
    md += '\n';
  });
  return md;
}

function exportPersonBlocks(personId, from, to, matchingBlocks) {
  const blocks = matchingBlocks || data.blocks.filter(b =>
    b.personId === personId
    && (!from || (b.end && b.end >= from))
    && (!to || (b.start && b.start <= to))
  );
  let md = `## Planungsblöcke (${blocks.length})\n\n`;
  if (blocks.length) {
    blocks.slice().sort((a, b) => (b.start || '').localeCompare(a.start || '')).forEach(b => {
      md += `- ${b.start && b.end ? `${formatDate(b.start)}–${formatDate(b.end)}` : 'ohne Zeitraum'} · ${blockDisplayLabel(b)} · ${isAbsenceBlock(b) ? 'abwesenheit' : 'ticket'}`;
      if (blockState(b) === 'done') md += ` · erledigt`;
      if (blockAuftragKey(b)) md += ` · ${jiraMd(blockAuftragKey(b))}`;
      md += '\n';
    });
  } else {
    md += `_Keine Planungsblöcke im gewählten Zeitraum._\n`;
  }
  md += '\n';

  const p = data.persons.find(x => x.id === personId);
  const sup = (p && p.supportMonate)
    ? p.supportMonate.filter(month => (!from || month >= from.slice(0, 7)) && (!to || month <= to.slice(0, 7))).slice().sort()
    : [];
  if (sup.length) {
    md += `## Support-Rotation\n\n`;
    sup.forEach(m => { md += `- ${formatMonthName(m)}\n`; });
    md += '\n';
  }
  return md;
}

// Planner preferences and the calendar-independent waiting queue.
function setPlanungWeeks(weeks) {
  if (![1, 2, 4].includes(weeks)) return;
  viewState.planungExtraPastWeeks = 0;
  viewState.planungExtraFutureWeeks = weeks - 1;
  try { localStorage.setItem('tktool-planung-weeks', String(weeks)); } catch {}
  render();
}

function waitingStatusCounts(tickets) {
  const counts = new Map();
  for (const ticket of tickets) counts.set(ticket.status, (counts.get(ticket.status) || 0) + 1);
  return [...counts].map(([status, count]) => `${status} ${count}`).join(' · ');
}

function renderPersonWaitingBadge(personId) {
  const tickets = jiraWaitingTickets(personId);
  if (!tickets.length) return '';
  return `<button class="waiting-person-badge" onclick="event.stopPropagation();openWaitingQueue('${personId}')"
    title="Wartende Tickets unabhängig von der Woche öffnen">${esc(waitingStatusCounts(tickets))}</button>`;
}

function openWaitingQueue(personId = '') {
  if (currentView !== 'planung') navigate('planung');
  viewState.planungQueuePerson = personId;
  viewState.planungShowHandover = true;
  render();
  document.getElementById('waiting-queue')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderWaitingQueue(personFilter = '', query = '') {
  const selected = viewState.planungQueuePerson || personFilter;
  const all = jiraWaitingTickets(personFilter);
  const tickets = jiraWaitingTickets(selected).filter(t => (!personFilter || t.personId === personFilter)
    && (!query || includesQuery([t.key, t.summary, t.status, personName(t.personId)].join(' '), query)));
  const groups = new Map();
  const groupByPerson = viewState.planungQueueGroup === 'person';
  for (const ticket of tickets) {
    const group = groupByPerson ? personName(ticket.personId) : ticket.status;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(ticket);
  }
  return `<details class="waiting-queue card" id="waiting-queue" ${viewState.planungShowHandover ? 'open' : ''}
      ontoggle="viewState.planungShowHandover=this.open">
    <summary><strong>Warteschlange <span class="waiting-count">${tickets.length === all.length ? all.length : `${tickets.length} von ${all.length}`} Tickets</span></strong>
      <span>${esc(waitingStatusCounts(all)) || (jiraSyncData ? 'Keine wartenden Tickets im Jira-Stand' : 'Noch kein Jira-Stand')}</span>
      <small>Unabhängig vom Zeitraum · ${esc(jiraSyncAgeLabel() || 'kein Import')}</small></summary>
    <div class="queue-controls">
      <span>Gruppieren nach</span>
      <select class="filter-btn" aria-label="Warteschlange gruppieren" onchange="viewState.planungQueueGroup=this.value;render()">
        <option value="status" ${!groupByPerson ? 'selected' : ''}>Status</option>
        <option value="person" ${groupByPerson ? 'selected' : ''}>Person</option>
      </select>
      ${viewState.planungQueuePerson ? `<button class="filter-btn" onclick="viewState.planungQueuePerson='';render()">${esc(personName(viewState.planungQueuePerson))} ×</button>` : ''}
      <span class="queue-help">Kein Wochenwechsel und kein Planungsblock nötig.</span>
    </div>
    ${jiraSyncData?.truncated ? '<p class="queue-notice">Jira-Antwort unvollständig — die Anzahl ist möglicherweise zu niedrig.</p>' : ''}
    ${[...groups].map(([group, rows]) => `<section class="queue-group"><h3>${esc(group)} <span>${rows.length}</span></h3>
      ${rows.map(t => `<div class="queue-ticket">
        ${jiraKeyLink(t.key)}<span class="queue-ticket-title">${esc(t.summary || t.key)}</span>
        <span>${esc(groupByPerson ? t.status : personName(t.personId))}</span>
        ${t.blockId ? `<button class="btn btn-secondary btn-sm" onclick="openBlockForm('${t.blockId}')">Details</button>` : ''}
      </div>`).join('')}</section>`).join('') || '<p class="queue-notice">Keine passenden wartenden Tickets.</p>'}
  </details>`;
}

const JIRA_CHANGE_LABELS = { waiting: 'In Wartestatus', returned: 'Wieder beim Team', done: 'Erledigt' };

function jiraChangeRows() {
  const changes = jiraSyncData?.changes || [];
  return changes.map(change => `<div class="queue-ticket">${jiraKeyLink(change.key)}
    <span class="queue-ticket-title">${esc(change.summary)}</span><strong>${JIRA_CHANGE_LABELS[change.kind] || 'Statuswechsel'}</strong>
    <span>${esc(change.from)} → ${esc(change.to)}</span></div>`).join('');
}

function renderJiraChanges() {
  const changes = jiraSyncData?.changes || [];
  if (!changes.length) return '';
  return `<details class="jira-changes"><summary>Seit letztem Jira-Import · ${changes.length} Statuswechsel</summary>
    ${jiraChangeRows()}</details>`;
}

function renderJiraChangesChip() {
  const changes = jiraSyncData?.changes || [];
  if (!changes.length) return '';
  return `<button class="filter-btn planung-jira-changes-btn" onclick="openJiraChangesDrawer()"
    title="Statuswechsel seit dem letzten Jira-Import">${changes.length} statuswechsel</button>`;
}

function openJiraChangesDrawer() {
  const changes = jiraSyncData?.changes || [];
  if (!changes.length) return;
  document.getElementById('overlay').classList.add('overlay-drawer');
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Seit letztem Jira-Import</span>
      <button class="modal-close" onclick="closeOverlay()" aria-label="Schließen">&#x2715;</button>
    </div>
    <div class="modal-body">
      <p class="queue-help">${changes.length} Statuswechsel · ${esc(jiraSyncAgeLabel() || 'kein Import')}</p>
      ${jiraChangeRows()}
    </div>`;
  openOverlay();
}

function openSupportEditor() {
  document.getElementById('modal').innerHTML = `<div class="modal-header"><span class="modal-title">Support-Rotation</span>
    <button class="modal-close" onclick="closeOverlay()" aria-label="Schließen">×</button></div>
    <div class="modal-body">${data.persons.filter(p => p.type !== 'kontakt').sort(comparePersonsByName).map(p => `
      <section class="support-editor"><strong>${esc(p.name)}</strong>
        <div class="support-months-list">${(p.supportMonate || []).map(month => `<span class="support-month-chip">${formatMonthName(month)}
          <button onclick="removeSupportMonth('${p.id}','${month}');openSupportEditor()" aria-label="${esc(formatMonthName(month))} entfernen">×</button></span>`).join('')}</div>
        <div class="support-add"><input type="month" class="form-input" id="supportMonthInput-${p.id}" value="${planungSupportMonth()}" aria-label="Supportmonat für ${esc(p.name)}">
          <button class="btn btn-secondary btn-sm" onclick="addSupportMonthFromInput('${p.id}');openSupportEditor()">+ Monat</button></div>
      </section>`).join('')}</div>`;
  openOverlay();
}
