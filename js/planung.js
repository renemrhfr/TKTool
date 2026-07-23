// ============================================================
// PLANUNG / BLOCKS / TIMELINE
// ============================================================

const BLOCK_TYPES = [
  { val: 'ticket', label: 'Ticket' },
  { val: 'projekt', label: 'Projekt' },
  { val: 'incident', label: 'Incident' },
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

// --- Block status helpers ---
// "Geparkt": Block ohne Datum — schon angelegt, aber noch keiner Woche zugeordnet.
function isBlockParked(b) {
  return !b.start || !b.end;
}
// Abwesenheiten sind mit Ablauf einfach vorbei, die muss niemand "erledigen".
function blockNeedsDone(b) {
  return b.typ !== 'abwesenheit';
}
function isBlockOverdue(b) {
  return !isBlockParked(b) && blockNeedsDone(b) && !b.done && b.end < todayStr();
}

// --- Overlapping block workdays within [winStart, winEnd] ---
function blockWorkdaysInWindow(b, winStart, winEnd) {
  if (isBlockParked(b)) return 0;
  if (b.end < winStart || b.start > winEnd) return 0;
  const s = b.start > winStart ? b.start : winStart;
  const e = b.end < winEnd ? b.end : winEnd;
  return workdaysBetween(s, e);
}

function allocatedWorkdaysInWindow(blocks, winStart, winEnd) {
  const days = new Set();
  blocks.forEach(b => {
    if (isBlockParked(b)) return;
    if (b.end < winStart || b.start > winEnd) return;
    let d = parseISO(b.start > winStart ? b.start : winStart);
    const end = parseISO(b.end < winEnd ? b.end : winEnd);
    while (d <= end) {
      if (!isWeekendDate(d)) days.add(toISO(d));
      d = addDays(d, 1);
    }
  });
  return days.size;
}

function personSupportInMonth(p, month) {
  return (p.supportMonate || []).includes(month);
}

function personSupportInWindow(p, startISO, endISO) {
  if (!p.supportMonate || p.supportMonate.length === 0) return false;
  const months = new Set();
  let d = parseISO(startISO);
  const end = parseISO(endISO);
  while (d <= end) {
    months.add(monthOfDate(d));
    d = addDays(d, 1);
  }
  return p.supportMonate.some(m => months.has(m));
}

// --- Capacity for a person in a window ---
function personCapacity(personId, winStart, winEnd) {
  const werktage = workdaysBetween(winStart, winEnd);
  const blocks = data.blocks.filter(b => b.personId === personId);
  const allokiert = allocatedWorkdaysInWindow(blocks, winStart, winEnd);
  return { werktage, allokiert, frei: werktage - allokiert };
}

// ============================================================
// TIMELINE RENDERER
// ============================================================
function renderTimeline({ personIds, startDate, endDate, options = {} }) {
  const {
    weekendsOnly = false,
    showWeekends = true,
    dense = false,
    compact = false,
    idPrefix = 'tl',
    supportAnchorMonth = null,
    insertLane = false,
    showCapacity = true,
    blockQuery = '',
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

  const rowsHtml = personIds.map(pid => {
    const person = data.persons.find(p => p.id === pid);
    if (!person) return '';
    const hasSupInWindow = personSupportInWindow(person, startDate, endDate);
    const isSupport = supportAnchorMonth
      ? personSupportInMonth(person, supportAnchorMonth)
      : hasSupInWindow;
    const showSupBadge = supportAnchorMonth ? isSupport : hasSupInWindow;
    const cap = personCapacity(pid, startDate, endDate);

    // Track cells (weekends + support/markers). Today is shown by the header column and needle.
    const cellsHtml = days.map((d, i) => {
      const classes = ['tl-cell'];
      if (d.weekend) classes.push('tl-weekend');
      if (d.date.getDay() === 1 && i > 0) classes.push('tl-week-start');
      // determine support month cell
      if (personSupportInMonth(person, monthOfDate(d.date))) classes.push('tl-support-cell');
      if (d.marker) classes.push('tl-marker-cell');
      const style = d.marker ? ` style="background:${d.marker.color}26"` : '';
      return `<div class="${classes.join(' ')}"${style} data-day-idx="${i}" data-day-iso="${d.iso}"></div>`;
    }).join('');

    // Blocks
    const personBlocks = data.blocks
      .filter(b => b.personId === pid && !isBlockParked(b) && b.end >= startDate && b.start <= endDate && blockMatchesPlanungQuery(b, blockQuery))
      .map(b => {
        const sISO = b.start < startDate ? startDate : b.start;
        const eISO = b.end > endDate ? endDate : b.end;
        let sIdx = days.findIndex(d => d.iso === sISO);
        let eIdx = days.findIndex(d => d.iso === eISO);
        // Start/Ende fällt auf einen ausgeblendeten Tag (Wochenende):
        // auf den nächsten bzw. vorherigen sichtbaren Tag snappen.
        if (sIdx < 0) sIdx = days.findIndex(d => d.iso > sISO);
        if (eIdx < 0) {
          for (let i = days.length - 1; i >= 0; i--) {
            if (days[i].iso < eISO) { eIdx = i; break; }
          }
        }
        if (sIdx < 0 || eIdx < 0 || eIdx < sIdx) return null; // liegt komplett auf ausgeblendeten Tagen
        return { b, sIdx, eIdx };
      })
      .filter(Boolean)
      .sort((a, b) => (a.sIdx - b.sIdx) || ((b.eIdx - b.sIdx) - (a.eIdx - a.sIdx)));

    const jiraDrift = jiraDriftForPerson(person);
    const staleBlockIds = jiraDrift ? new Set(jiraDrift.stale.map(sb => sb.id)) : new Set();

    const laneEnds = [];
    const laidOutBlocks = personBlocks.map(entry => {
      let lane = laneEnds.findIndex(endIdx => entry.sIdx > endIdx);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(entry.eIdx);
      } else {
        laneEnds[lane] = entry.eIdx;
      }
      return { ...entry, lane };
    });

    const occupiedLaneCount = laneEnds.length;
    const laneCount = insertLane
      ? Math.max(minLanes, occupiedLaneCount + 1)
      : Math.max(minLanes, occupiedLaneCount);
    const trackHeight = laneCount * laneSize + Math.max(0, laneCount - 1) * laneGap + trackPadding * 2;
    const trackMetrics = `data-cols="${cols}" style="--tl-track-height:${trackHeight}px;--tl-lane-size:${laneSize}px;--tl-lane-gap:${laneGap}px"`;

    const blocksHtml = laidOutBlocks.map(({ b, sIdx, eIdx, lane }) => {
      const sISO = b.start < startDate ? startDate : b.start;
      const eISO = b.end > endDate ? endDate : b.end;
      const isSingleDay = sISO === eISO;
      const classes = ['tl-block', `tl-block-${b.typ}`];
      if (isSingleDay) classes.push('tl-block-single');
      if (b.done) classes.push('tl-block-done');
      else if (isBlockOverdue(b)) classes.push('tl-block-overdue');
      if (staleBlockIds.has(b.id)) classes.push('tl-block-jira-stale');
      const title = [
        b.label || '(ohne Label)',
        `${formatDate(b.start)}–${formatDate(b.end)}`,
        b.done ? 'erledigt' : (isBlockOverdue(b) ? 'überfällig — noch nicht erledigt' : ''),
        b.jiraRef ? 'Jira: ' + b.jiraRef + (jiraUrl(b.jiraRef) ? ' (Cmd/Strg-Klick öffnet)' : '') : '',
        staleBlockIds.has(b.id) ? '⚠ Jira-Ticket nicht mehr offen (erledigt oder umassigned)' : '',
      ].filter(Boolean).join('\n');
      const leftPct = (sIdx / cols) * 100;
      const widthPct = ((eIdx - sIdx + 1) / cols) * 100;
      const topPx = trackPadding + lane * (laneSize + laneGap);
      return `<div class="${classes.join(' ')}"
        style="left:${leftPct}%;width:${widthPct}%;top:${topPx}px;height:${laneSize}px"
        data-block-id="${b.id}"
        title="${esc(title)}"
        onclick="event.stopPropagation();if(_suppressNextBlockClick)return;if((event.metaKey||event.ctrlKey)&&openBlockJira('${b.id}'))return;openBlockForm('${b.id}')"
        onpointerdown="onBlockPointerDown(event,'${b.id}')">
        ${b.done ? '<span class="tl-block-check">&#x2713;</span>' : ''}<span class="tl-block-label">${esc(b.label || b.typ)}</span>
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

    // Capacity label (inline in name column)
    let capInline;
    if (isSupport) {
      capInline = `<span class="tl-person-cap"><span class="tl-cap-support">SUP</span></span>`;
    } else if (!showCapacity) {
      capInline = '';
    } else {
      const freiCls = cap.frei < 0 ? 'tl-cap-neg' : '';
      capInline = `<span class="tl-person-cap" title="${cap.frei} frei von ${cap.werktage} WT"><span class="tl-cap-days ${freiCls}">${cap.frei}/${cap.werktage}</span><span>Frei</span></span>`;
    }

    const labelClick = `navigate('team:detail',{personId:'${pid}'})`;
    return `
      <div class="tl-row">
        <div class="tl-person" style="height:${trackHeight}px" onclick="${labelClick}">
          <div class="tl-person-main">
            <div class="tl-person-top">
              ${showSupBadge ? '<span class="tl-sup-badge" title="Support-Rotation">SUP</span>' : ''}
              <span class="tl-person-name">${esc(person.name)}</span>
              ${jiraDrift && jiraDrift.hasDrift ? `<span class="tl-jira-drift" title="${esc([
                jiraDrift.unplanned.length ? `${jiraDrift.unplanned.length} Ticket${jiraDrift.unplanned.length === 1 ? '' : 's'} ohne Block: ${jiraDrift.unplanned.map(t => t.key).join(', ')}` : '',
                jiraDrift.stale.length ? `${jiraDrift.stale.length} Block${jiraDrift.stale.length === 1 ? '' : 's'} veraltet: ${jiraDrift.stale.map(sb => sb.jiraRef).join(', ')}` : '',
              ].filter(Boolean).join('\n'))}">jira ±${jiraDrift.unplanned.length + jiraDrift.stale.length}</span>` : ''}
            </div>
          </div>
          ${capInline}
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
  return Math.max(0, parseInt(viewState.planungExtraFutureWeeks || 0, 10) || 0);
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
  const month = planungSupportMonth();
  const sort = viewState.planungSort || 'name';
  const rawQuery = viewState.planungQuery || '';
  const blockQuery = rawQuery.trim().toLocaleLowerCase('de-AT');
  const matchingBlocks = blockQuery ? data.blocks.filter(block => blockMatchesPlanungQuery(block, blockQuery)) : data.blocks;
  const matchingPersonIds = new Set(matchingBlocks.map(block => block.personId));

  const team = data.persons.filter(p => p.type !== 'kontakt' && (!blockQuery || matchingPersonIds.has(p.id)));
  const withCap = team.map(p => {
    const isSupport = personSupportInMonth(p, month);
    const cap = personCapacity(p.id, start, end);
    return { p, isSupport, cap };
  });

  let sorted;
  if (sort === 'name') {
    sorted = withCap.slice().sort((a, b) => a.p.name.localeCompare(b.p.name, 'de-AT'));
  } else {
    const nonSup = withCap.filter(x => !x.isSupport).sort((a, b) => b.cap.frei - a.cap.frei);
    const sup = withCap.filter(x => x.isSupport).sort((a, b) => a.p.name.localeCompare(b.p.name, 'de-AT'));
    sorted = [...nonSup, ...sup];
  }

  let personIds = sorted.map(x => x.p.id);
  // Freeze order during block drag to avoid jumping rows
  if (_tlDrag && _tlFrozenOrder) {
    const knownSet = new Set(_tlFrozenOrder);
    const extras = personIds.filter(id => !knownSet.has(id));
    personIds = _tlFrozenOrder.filter(id => personIds.includes(id)).concat(extras);
  }

  const personName = pid => {
    const p = data.persons.find(x => x.id === pid);
    return p ? p.name : '(unbekannt)';
  };

  const overdue = matchingBlocks.filter(isBlockOverdue).sort((a, b) => a.end.localeCompare(b.end));
  const overdueChip = overdue.length ? `
    <button class="filter-btn planung-overdue-btn ${viewState.planungShowOverdue ? 'active' : ''}"
      onclick="togglePlanungOverdue()"
      title="Abgelaufene Blöcke, die noch nicht erledigt sind">${overdue.length} offen</button>
  ` : '';
  const overduePanel = (overdue.length && viewState.planungShowOverdue) ? `
    <div class="planung-overdue-panel">
      ${overdue.map(b => `
        <div class="planung-overdue-row">
          <span class="planung-overdue-info" onclick="openBlockForm('${b.id}')" title="Block öffnen">
            <span class="planung-overdue-person">${esc(personName(b.personId))}</span>
            <span class="planung-overdue-label">${esc(b.label || b.typ)}</span>
            <span class="planung-overdue-date">bis ${formatDate(b.end)}</span>
          </span>
          <span class="planung-overdue-actions">
            <button class="btn btn-sm btn-secondary" onclick="extendBlockToThisWeek('${b.id}')" title="Ende auf Freitag dieser Woche setzen">+1 woche</button>
            <button class="btn btn-sm btn-secondary" onclick="markBlockDone('${b.id}')" title="Als erledigt markieren">&#x2713; done</button>
          </span>
        </div>
      `).join('')}
    </div>
  ` : '';

  const parked = matchingBlocks.filter(isBlockParked);
  const parkedRow = parked.length ? `
    <div class="planung-parked">
      <span class="planung-parked-head">geparkt</span>
      ${parked.map(b => `
        <button class="planung-parked-chip" onclick="openBlockForm('${b.id}')" title="Klicken zum Einplanen">
          <span class="planung-parked-person">${esc(personName(b.personId))}</span>${esc(b.label || b.typ)}
        </button>
      `).join('')}
    </div>
  ` : '';
  const searchResults = blockQuery ? `
    <div class="planung-search-results">
      <div class="planung-search-results-head">${matchingBlocks.length} treffer</div>
      ${matchingBlocks.length ? matchingBlocks
        .slice()
        .sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999'))
        .map(block => `
          <button class="planung-search-result" onclick="openBlockForm('${block.id}')">
            <span class="tl-block-swatch tl-block-${block.typ}"></span>
            <strong>${esc(block.label || block.typ)}</strong>
            <span>${esc(personName(block.personId))}</span>
            <span>${isBlockParked(block) ? 'geparkt' : `${formatDate(block.start)} – ${formatDate(block.end)}`}</span>
            ${block.jiraRef ? `<span>${esc(block.jiraRef)}</span>` : ''}
          </button>
        `).join('')
        : '<span class="planung-search-results-empty">Keine Blöcke entsprechen der Suche.</span>'}
    </div>
  ` : '';

  return `
    <div class="section-header">
      <div class="overview-toolbar">
        <div class="overview-toolbar-main planung-toolbar-main">
          <div class="month-selector">
            <button onclick="changePlanungWeek(-1)">&#8592;</button>
            <button class="btn btn-sm btn-secondary" onclick="extendPlanungPastWeek()" title="Eine Vorwoche mehr anzeigen">+</button>
            <span class="month-label">${formatDate(start)} – ${formatDate(end)}</span>
            <button class="btn btn-sm btn-secondary" onclick="extendPlanungFutureWeek()" title="Eine Folgewoche mehr anzeigen">+</button>
            <button onclick="changePlanungWeek(1)">&#8594;</button>
            ${(planungWeekOffset() || planungExtraPastWeeks() || planungExtraFutureWeeks()) ? `<button class="btn btn-sm btn-secondary" onclick="resetPlanungWindow()" style="margin-left:8px">Reset</button>` : ''}
          </div>
          <div class="planung-sort">
            <button class="filter-btn ${sort === 'frei' ? 'active' : ''}" onclick="setPlanungSort('frei')">frei</button>
            <button class="filter-btn ${sort === 'name' ? 'active' : ''}" onclick="setPlanungSort('name')">name</button>
            <button class="filter-btn ${planungShowWeekends() ? 'active' : ''}" onclick="togglePlanungWeekends()" title="Samstag/Sonntag ein-/ausblenden">sa/so</button>
            ${overdueChip}
          </div>
          <div class="view-search planung-search">
            <input id="planungSearchInput" type="search"
              placeholder="grep: label, jira-ref, notiz..."
              value="${esc(rawQuery)}" oninput="setPlanungQuery(this.value)">
          </div>
          <div class="overview-actions planung-actions">
            <button class="btn btn-primary btn-sm" onclick="openBlockForm(null)">+ Block</button>
            <button class="btn btn-secondary btn-sm" onclick="openMarkerForm(null)">+ Marker</button>
          </div>
        </div>
      </div>
    </div>

    ${overduePanel}
    ${parkedRow}
    ${searchResults}

    ${personIds.length ? renderTimeline({ personIds, startDate: start, endDate: end, options: { idPrefix: 'planung', supportAnchorMonth: month, insertLane: true, showCapacity: sort === 'frei', showWeekends: planungShowWeekends(), blockQuery } })
      : `<div class="empty-state"><div class="empty-state-icon">&#128269;</div><div class="empty-state-text">${blockQuery ? 'Keine passenden Blöcke' : 'Keine Teammitglieder'}</div></div>`}

    <div class="tl-legend">
      ${BLOCK_TYPES.map(t => `<span class="tl-legend-item"><span class="tl-block-swatch tl-block-${t.val}"></span>${t.label}</span>`).join('')}
      <span class="tl-legend-item"><span class="tl-legend-today"></span>Heute</span>
      <span class="tl-legend-item"><span class="tl-sup-badge">SUP</span>Support-Rotation</span>
      <span class="tl-legend-item"><span class="tl-block-swatch tl-block-swatch-overdue"></span>überfällig</span>
    </div>
  `;
}

function blockMatchesPlanungQuery(block, query) {
  if (!query) return true;
  return [block.label, block.jiraRef, block.notiz]
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
  input.focus();
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
  viewState.planungExtraFutureWeeks = 0;
  render();
}

function setPlanungSort(sort) {
  viewState.planungSort = sort;
  render();
}

function togglePlanungOverdue() {
  viewState.planungShowOverdue = !viewState.planungShowOverdue;
  render();
}

function extendBlockToThisWeek(id) {
  const b = data.blocks.find(x => x.id === id);
  if (!b || isBlockParked(b)) return;
  const friday = toISO(addDays(startOfWeek(parseISO(todayStr())), 4));
  b.end = friday > todayStr() ? friday : todayStr();
  saveData(data);
  toast('Block bis ' + formatDate(b.end) + ' verlängert');
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

  const pBlocks = data.blocks.filter(b => b.personId === person.id && blockNeedsDone(b));
  const openBlocks = pBlocks.filter(b => !isBlockParked(b) && !b.done).sort((a, b) => a.start.localeCompare(b.start));
  const parkedList = pBlocks.filter(isBlockParked);
  const allDone = pBlocks.filter(b => !isBlockParked(b) && b.done).sort((a, b) => b.start.localeCompare(a.start));
  const showAllDone = !!viewState.personBlocksShowAll;
  const doneBlocks = showAllDone ? allDone : allDone.slice(0, 8);
  const blockRow = (b) => `
    <div class="person-block-row ${b.done ? 'person-block-done' : ''}" onclick="openBlockForm('${b.id}')">
      <span class="tl-block-swatch tl-block-${b.typ}"></span>
      <span class="person-block-label">${esc(b.label || b.typ)}</span>
      <span class="person-block-range">${isBlockParked(b) ? 'geparkt' : formatDate(b.start) + '–' + formatDate(b.end)}</span>
      ${isBlockOverdue(b) ? '<span class="person-block-overdue">überfällig</span>' : ''}
      ${b.done
        ? '<span class="person-block-checked">&#x2713;</span>'
        : `<button class="person-block-check" onclick="event.stopPropagation();markBlockDone('${b.id}')" title="Als erledigt markieren">&#x2713;</button>`}
    </div>`;
  const blocksSection = (openBlocks.length || parkedList.length || doneBlocks.length) ? `
    <div class="person-blocks">
      <div class="person-blocks-head">Blöcke</div>
      ${openBlocks.map(blockRow).join('')}
      ${parkedList.map(blockRow).join('')}
      ${doneBlocks.length ? `
        <div class="person-blocks-sub">
          erledigt · ${allDone.length}
          ${allDone.length > 8 ? `<button class="person-blocks-more" onclick="togglePersonBlocksShowAll()">${showAllDone ? 'weniger' : 'alle anzeigen'}</button>` : ''}
        </div>
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

      ${renderTimeline({ personIds: [person.id], startDate: startISO, endDate: endISO, options: { idPrefix: 'person', supportAnchorMonth: curMonth, showWeekends: planungShowWeekends() } })}

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

function togglePersonBlocksShowAll() {
  viewState.personBlocksShowAll = !viewState.personBlocksShowAll;
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
      ${renderTimeline({ personIds: resolvedPersonIds, startDate: start, endDate: end, options: { showWeekends: false, dense: true, compact: inForm, idPrefix: idPrefix || (inForm ? 'meeting-preview' : 'meeting'), supportAnchorMonth: monthOfDate(parseISO(dateISO)), insertLane: true } })}
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
  const b = blockId ? data.blocks.find(x => x.id === blockId) : null;
  const personOpts = data.persons.filter(p => p.type !== 'kontakt')
    .map(p => `<option value="${p.id}" ${((b && b.personId === p.id) || prefillPersonId === p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  const start = b ? (b.start || '') : (prefillStart || todayStr());
  const end = b ? (b.end || '') : (prefillEnd || todayStr());
  const typ = b ? b.typ : 'ticket';
  const parked = b ? isBlockParked(b) : false;
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">${b ? 'Block bearbeiten' : 'Neuer Block'}</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Person</label>
        <select class="form-select" id="blockPerson">
          <option value="">Person wählen...</option>
          ${personOpts}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Label</label>
        <input class="form-input" id="blockLabel" value="${b ? esc(b.label || '') : ''}" placeholder="z.B. Projekt Alpha, TK-1234" autofocus>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start</label>
          <input type="date" class="form-input" id="blockStart" value="${parked ? '' : start}" ${parked ? 'readonly' : ''}>
        </div>
        <div class="form-group">
          <label class="form-label">Ende</label>
          <input type="date" class="form-input" id="blockEnd" value="${parked ? '' : end}" ${parked ? 'readonly' : ''}>
        </div>
        <div class="form-group form-group-parked">
          <label class="form-label" title="Noch keiner Woche zugeordnet — Block erscheint in der geparkt-Zeile">
            <input type="checkbox" id="blockParked" ${parked ? 'checked' : ''} onchange="toggleBlockParked(this.checked)">
            <span>Geparkt</span>
          </label>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Typ</label>
          <select class="form-select" id="blockTyp" onchange="document.getElementById('blockDoneGroup').hidden = this.value === 'abwesenheit'">
            ${BLOCK_TYPES.map(t => `<option value="${t.val}" ${typ === t.val ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group" id="blockDoneGroup" ${typ === 'abwesenheit' ? 'hidden' : ''}>
        <label class="form-label" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="blockDone" ${b && b.done ? 'checked' : ''}>
          <span>Erledigt</span>
        </label>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;justify-content:space-between;align-items:baseline">
          Jira-Ref (optional)
          <a id="blockJiraLink" class="jira-link" target="_blank" rel="noopener" href="${b && jiraUrl(b.jiraRef) ? esc(jiraUrl(b.jiraRef)) : '#'}" ${b && jiraUrl(b.jiraRef) ? '' : 'hidden'}>öffnen ↗</a>
        </label>
        <input class="form-input" id="blockJira" value="${b ? esc(b.jiraRef || '') : ''}" placeholder="TK-1234" oninput="updateBlockJiraLink(this.value)">
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

function toggleBlockParked(checked) {
  const s = document.getElementById('blockStart');
  const e = document.getElementById('blockEnd');
  if (!s || !e) return;
  if (checked) { s.value = ''; e.value = ''; }
  s.readOnly = checked;
  e.readOnly = checked;
}

function updateBlockJiraLink(val) {
  const a = document.getElementById('blockJiraLink');
  if (!a) return;
  const href = jiraUrl((val || '').trim());
  a.hidden = !href;
  if (href) a.href = href;
}

// Opens the block's Jira ticket in a new tab. Returns false when there is
// nothing to open (no ref or no base URL configured) so the caller can
// fall back to the edit form.
function openBlockJira(blockId) {
  const b = data.blocks.find(x => x.id === blockId);
  const url = b ? jiraUrl(b.jiraRef) : null;
  if (!url) return false;
  window.open(url, '_blank', 'noopener');
  return true;
}

function saveBlock(id) {
  const personId = document.getElementById('blockPerson').value;
  const label = document.getElementById('blockLabel').value.trim();
  let start = document.getElementById('blockStart').value;
  let end = document.getElementById('blockEnd').value;
  const typ = document.getElementById('blockTyp').value;
  const jiraRef = document.getElementById('blockJira').value.trim();
  const notiz = document.getElementById('blockNotiz').value.trim();
  const doneEl = document.getElementById('blockDone');
  const done = typ !== 'abwesenheit' && !!(doneEl && doneEl.checked);
  const parkedEl = document.getElementById('blockParked');
  const parked = !!(parkedEl && parkedEl.checked);

  if (!personId) { toast('Person nötig'); return; }
  if (parked) {
    // Geparkt: ohne Datum anlegen, taucht in der "geparkt"-Zeile auf
    start = null;
    end = null;
  } else {
    if (!start && !end) { toast('Start und Ende nötig — oder Geparkt anhaken'); return; }
    if (!start) start = end;
    if (!end) end = start;
    if (end < start) { const tmp = start; start = end; end = tmp; }
  }

  if (id) {
    const b = data.blocks.find(x => x.id === id);
    if (!b) return;
    Object.assign(b, { personId, label, start, end, typ, done, jiraRef: jiraRef || null, notiz: notiz || null });
  } else {
    data.blocks.push({ id: uid(), personId, label, start, end, typ, done, jiraRef: jiraRef || null, notiz: notiz || null });
  }
  saveData(data);
  closeOverlay();
  toast(id ? 'Block aktualisiert' : (start ? 'Block angelegt' : 'Block geparkt'));
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

  const startIsoAtDown = _dayIsoFromTrack(track, event.clientX);
  _tlDrag = { mode, blockId, track, downIso: startIsoAtDown, origStart: b.start, origEnd: b.end, moved: false };
  _tlFrozenOrder = Array.from(document.querySelectorAll('.tl-track[data-person-id]')).map(el => el.dataset.personId);
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
      if (newStart > b.end) newStart = b.end;
      b.start = newStart;
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
      md += `- ${b.label || '(ohne Label)'} · ${b.typ}`;
      if (b.jiraRef) md += ` · ${jiraMd(b.jiraRef)}`;
      md += '\n';
    });
    md += '\n';
  });
  return md;
}

function exportPersonBlocks(personId) {
  const cur = currentMonth();
  // last 3 months + next 3
  const months = [];
  let m = cur;
  for (let i = 0; i < 3; i++) m = prevMonth(m);
  for (let i = 0; i < 7; i++) { months.push(m); m = nextMonth(m); }
  const winStart = toISO(monthStart(months[0]));
  const winEnd = toISO(monthEnd(months[months.length - 1]));
  const blocks = data.blocks.filter(b => b.personId === personId && b.end >= winStart && b.start <= winEnd);
  let md = '';
  if (blocks.length) {
    md += `## Allokationen\n`;
    blocks.slice().sort((a, b) => a.start.localeCompare(b.start)).forEach(b => {
      md += `- ${b.label || '(ohne Label)'} · ${b.typ}`;
      if (b.jiraRef) md += ` · ${jiraMd(b.jiraRef)}`;
      md += '\n';
    });
    md += '\n';
  }
  const p = data.persons.find(x => x.id === personId);
  const sup = (p && p.supportMonate) ? p.supportMonate.slice().sort() : [];
  if (sup.length) {
    const past = sup.filter(x => x <= cur);
    const future = sup.filter(x => x > cur);
    md += `## Support-Rotation\n`;
    sup.forEach(m => { md += `- ${formatMonthName(m)}\n`; });
    md += `\n_Letzte: ${past.length ? formatMonthName(past[past.length - 1]) : '—'}_\n`;
    md += `_Nächste: ${future.length ? formatMonthName(future[0]) : '—'}_\n\n`;
  }
  return md;
}
