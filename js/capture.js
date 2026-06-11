// ============================================================
// QUICK CAPTURE
// ============================================================
function personOptions(selectedId) {
  const team = data.persons
    .filter(p => p.type !== 'kontakt')
    .slice()
    .sort(comparePersonsByName);
  const kontakte = data.persons
    .filter(p => p.type === 'kontakt')
    .slice()
    .sort(comparePersonsByName);
  let html = '';
  if (team.length) {
    html += `<optgroup label="Team">`;
    html += team.map(p => `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    html += `</optgroup>`;
  }
  if (kontakte.length) {
    html += `<optgroup label="Kontakte">`;
    html += kontakte.map(p => `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    html += `</optgroup>`;
  }
  return html;
}

function captureModeForType(type) {
  return isGrowthType(type) ? 'teammate' : 'personal';
}

function currentCaptureMode() {
  return document.getElementById('captureMode')?.value || 'personal';
}

function setCaptureMode(mode) {
  const input = document.getElementById('captureMode');
  if (!input) return;
  input.value = mode === 'teammate' ? 'teammate' : 'personal';
  updateCaptureModeUI();
}

function updateCaptureModeUI() {
  const mode = currentCaptureMode();
  const personalActive = mode === 'personal';
  const teammateActive = mode === 'teammate';
  const personalType = document.getElementById('captureType')?.value || 'todo';
  const personalBtn = document.getElementById('captureModePersonal');
  const teammateBtn = document.getElementById('captureModeTeammate');
  const personalFields = document.getElementById('capturePersonalFields');
  const teammateFields = document.getElementById('captureTeammateFields');
  const personalPersonGroup = document.getElementById('capturePersonalPersonGroup');
  const meetingGroup = document.getElementById('captureMeetingGroup');
  const notesGroup = document.getElementById('captureNotesGroup');
  const monthGroup = document.getElementById('captureMonthGroup');
  const showMonthGroup = personalActive;
  if (personalBtn) personalBtn.classList.toggle('active', personalActive);
  if (teammateBtn) teammateBtn.classList.toggle('active', teammateActive);
  if (personalFields) personalFields.style.display = personalActive ? '' : 'none';
  if (teammateFields) teammateFields.style.display = teammateActive ? '' : 'none';
  if (personalPersonGroup) personalPersonGroup.style.display = personalActive ? '' : 'none';
  if (meetingGroup) meetingGroup.style.display = personalActive ? '' : 'none';
  if (notesGroup) notesGroup.style.display = personalActive ? '' : 'none';
  if (monthGroup) monthGroup.style.display = showMonthGroup ? '' : 'none';
}

function currentEditType() {
  return document.getElementById('editType')?.value || 'todo';
}

function updateEditItemTypeUI() {
  const type = currentEditType();
  const isGrowth = isGrowthType(type);
  const statusSelect = document.getElementById('editStatus');
  const meetingGroup = document.getElementById('editMeetingGroup');
  const monthInput = document.getElementById('editMonth');
  const personLabel = document.getElementById('editPersonLabel');
  if (statusSelect) {
    statusSelect.disabled = isGrowth;
    if (isGrowth) statusSelect.value = 'done';
  }
  if (meetingGroup) meetingGroup.style.display = isGrowth ? 'none' : '';
  if (personLabel) personLabel.textContent = isGrowth ? 'Teammitglied' : 'Person';
  if (monthInput && document.getElementById('editDate')?.value) monthInput.value = document.getElementById('editDate').value.slice(0, 7);
}

function openCapture(prefill = {}) {
  const month = prefill.month || viewState.month || currentMonth();
  const selectedPersonId = prefill.personId || null;
  const selectedMeetingId = prefill.meetingId || null;
  const captureMode = prefill.captureMode || captureModeForType(prefill.type);
  const personOpts = personOptions(selectedPersonId);
  const meetingOpts = meetingOptions(selectedMeetingId, { personId: selectedPersonId });

  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Quick Capture</span>
      <div><span class="kbd">Ctrl+K</span> <button class="modal-close" onclick="closeOverlay()">&#x2715;</button></div>
    </div>
    <div class="modal-body">
      <input type="hidden" id="captureMode" value="${captureMode}">
      <div class="segmented-toggle">
        <button type="button" class="segmented-toggle-btn" id="captureModePersonal" onclick="setCaptureMode('personal')">mein impact</button>
        <button type="button" class="segmented-toggle-btn" id="captureModeTeammate" onclick="setCaptureMode('teammate')">teamentwicklung</button>
      </div>
      <div class="form-group">
        <textarea class="form-textarea" id="captureText" placeholder="Was ist passiert / was muss getan werden?" rows="3" autofocus>${esc(prefill.text || '')}</textarea>
      </div>
      <div id="capturePersonalFields">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Typ</label>
            <select class="form-select" id="captureType" onchange="updateCaptureModeUI()">
              <option value="todo" ${(!prefill.type || prefill.type === 'todo') ? 'selected' : ''}>Todo</option>
              <option value="win" ${prefill.type === 'win' ? 'selected' : ''}>Win</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="captureStatus">
              <option value="todo" ${(!prefill.status || prefill.status === 'todo') ? 'selected' : ''}>Todo</option>
              <option value="backlog" ${prefill.status === 'backlog' ? 'selected' : ''}>Backlog</option>
              <option value="waiting" ${prefill.status === 'waiting' ? 'selected' : ''}>Warte auf...</option>
              <option value="done" ${prefill.status === 'done' ? 'selected' : ''}>Done</option>
            </select>
          </div>
        </div>
      </div>
      <div id="captureTeammateFields">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Teammitglied</label>
            <select class="form-select" id="captureGrowthPerson">
              <option value="">Person wählen...</option>
              ${data.persons
                .filter(person => person.type !== 'kontakt')
                .slice()
                .sort(comparePersonsByName)
                .map(person => `<option value="${person.id}" ${selectedPersonId === person.id ? 'selected' : ''}>${esc(person.name)}</option>`)
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Eintrag</label>
            <select class="form-select" id="captureGrowthType">
              <option value="highlight" ${prefill.type === 'highlight' ? 'selected' : ''}>Highlight</option>
              <option value="concern" ${prefill.type === 'concern' ? 'selected' : ''}>Concern</option>
            </select>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" id="capturePersonalPersonGroup">
          <label class="form-label">Person (optional)</label>
          <select class="form-select" id="capturePerson" onchange="updateCaptureMeetingOptions()">
            <option value="">—</option>
            ${personOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Datum</label>
          <input type="date" class="form-input" id="captureDate" value="${prefill.date || todayStr()}">
        </div>
      </div>
      <div class="form-group" id="captureMonthGroup">
        <label class="form-label">Monat</label>
        <input type="month" class="form-input" id="captureMonth" value="${month}">
      </div>
      <div class="form-group" id="captureMeetingGroup">
        <label class="form-label">Meeting (optional)</label>
        <select class="form-select" id="captureMeeting">
          ${meetingOpts}
        </select>
      </div>
      <div class="form-group" id="captureNotesGroup">
        <label class="form-label">Notizen (optional)</label>
        <textarea class="form-textarea" id="captureNotes" placeholder="Zwischenstand, Details, nächste Schritte..." rows="3">${esc(prefill.notes || '')}</textarea>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="saveCapture()">Speichern</button>
    </div>
  `;
  openOverlay();
  updateCaptureModeUI();
  setTimeout(() => document.getElementById('captureText').focus(), 100);
}

function saveCapture() {
  const text = document.getElementById('captureText').value.trim();
  if (!text) return;
  const mode = currentCaptureMode();
  let item;
  if (mode === 'teammate') {
    const personId = document.getElementById('captureGrowthPerson').value || null;
    if (!personId) {
      toast('Teammitglied wählen');
      return;
    }
    const date = document.getElementById('captureDate').value;
    item = {
      id: uid(),
      type: document.getElementById('captureGrowthType').value,
      status: 'done',
      text,
      personId,
      meetingId: null,
      date,
      month: date ? date.slice(0, 7) : document.getElementById('captureMonth').value,
      notes: null,
    };
  } else {
    const type = document.getElementById('captureType').value;
    const personId = type === 'win' ? null : (document.getElementById('capturePerson').value || null);
    const date = document.getElementById('captureDate').value;
    item = {
      id: uid(),
      type,
      status: document.getElementById('captureStatus').value,
      text,
      personId,
      meetingId: document.getElementById('captureMeeting').value || null,
      date,
      month: type === 'win'
        ? (date ? date.slice(0, 7) : document.getElementById('captureMonth').value)
        : document.getElementById('captureMonth').value,
      notes: document.getElementById('captureNotes').value.trim() || null,
    };
  }

  data.items.push(item);
  saveData(data);
  closeOverlay();
  toast('Item gespeichert');
  render();
}

function updateCaptureMeetingOptions() {
  const personId = document.getElementById('capturePerson')?.value || null;
  const meetingSelect = document.getElementById('captureMeeting');
  if (!meetingSelect) return;
  const currentValue = meetingSelect.value || null;
  meetingSelect.innerHTML = meetingOptions(currentValue, { personId });
}

// ============================================================
// EDIT ITEM
// ============================================================
function openEditItem(id) {
  const item = data.items.find(i => i.id === id);
  if (!item) return;

  const personOpts = personOptions(item.personId);
  const meetingOpts = meetingOptions(item.meetingId, { personId: item.personId });

  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Item bearbeiten</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <textarea class="form-textarea" id="editText" rows="3">${esc(item.text)}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Typ</label>
          <select class="form-select" id="editType" onchange="updateEditItemTypeUI()">
            <option value="todo" ${item.type === 'todo' ? 'selected' : ''}>Todo</option>
            <option value="win" ${item.type === 'win' ? 'selected' : ''}>Win</option>
            <option value="highlight" ${item.type === 'highlight' ? 'selected' : ''}>Highlight</option>
            <option value="concern" ${item.type === 'concern' ? 'selected' : ''}>Concern</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="editStatus">
            <option value="todo" ${item.status === 'todo' ? 'selected' : ''}>Todo</option>
            <option value="backlog" ${item.status === 'backlog' ? 'selected' : ''}>Backlog</option>
            <option value="waiting" ${item.status === 'waiting' ? 'selected' : ''}>Warte auf...</option>
            <option value="done" ${item.status === 'done' ? 'selected' : ''}>Done</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" id="editPersonLabel">Person</label>
          <select class="form-select" id="editPerson" onchange="updateEditItemMeetingOptions()">
            <option value="">—</option>
            ${personOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Datum</label>
          <input type="date" class="form-input" id="editDate" value="${item.date}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Monat</label>
        <input type="month" class="form-input" id="editMonth" value="${item.month}">
      </div>
      <div class="form-group" id="editMeetingGroup">
        <label class="form-label">Meeting</label>
        <select class="form-select" id="editMeeting">
          ${meetingOpts}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notizen (optional)</label>
        <textarea class="form-textarea" id="editNotes" placeholder="Zwischenstand, Details, nächste Schritte..." rows="3">${esc(item.notes || '')}</textarea>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="saveEditItem('${id}')">Speichern</button>
    </div>
  `;
  openOverlay();
  updateEditItemTypeUI();
}

function saveEditItem(id) {
  const item = data.items.find(i => i.id === id);
  if (!item) return;

  const nextDate = document.getElementById('editDate').value;
  item.text = document.getElementById('editText').value.trim();
  item.type = document.getElementById('editType').value;
  item.personId = item.type === 'win' ? null : (document.getElementById('editPerson').value || null);
  item.date = nextDate;
  item.notes = document.getElementById('editNotes').value.trim() || null;
  if (isGrowthType(item.type)) {
    if (!item.personId || !isTeamMemberId(item.personId)) {
      toast('Teammitglied wählen');
      return;
    }
    item.status = 'done';
    item.meetingId = null;
    item.notes = null;
    item.month = item.date ? item.date.slice(0, 7) : document.getElementById('editMonth').value;
  } else {
    item.status = document.getElementById('editStatus').value;
    item.meetingId = document.getElementById('editMeeting').value || null;
    item.month = document.getElementById('editMonth').value;
  }

  saveData(data);
  closeOverlay();
  toast('Item aktualisiert');
  render();
}

function updateEditItemMeetingOptions() {
  const personId = document.getElementById('editPerson')?.value || null;
  const meetingSelect = document.getElementById('editMeeting');
  if (!meetingSelect) return;
  const currentValue = meetingSelect.value || null;
  meetingSelect.innerHTML = meetingOptions(currentValue, { personId });
}

function toggleItem(id) {
  const item = data.items.find(i => i.id === id);
  if (!item) return;
  item.status = item.status === 'done' ? 'todo' : 'done';
  saveData(data);
  render();
}

let draggedItemId = null;

function onItemDragStart(event, id) {
  draggedItemId = id;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', id);
  event.currentTarget.classList.add('dragging');
}

function onItemDragEnd(event) {
  draggedItemId = null;
  event.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drop-target.drop-over').forEach(el => el.classList.remove('drop-over'));
}

function onItemDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('drop-over');
}

function onItemDragLeave(event) {
  if (event.currentTarget.contains(event.relatedTarget)) return;
  event.currentTarget.classList.remove('drop-over');
}

function onItemDrop(event, status) {
  event.preventDefault();
  event.currentTarget.classList.remove('drop-over');

  const id = event.dataTransfer.getData('text/plain') || draggedItemId;
  if (!id) return;

  const item = data.items.find(i => i.id === id);
  if (!item || item.status === status) return;

  item.status = status;
  saveData(data);
  toast('Status aktualisiert');
  render();
}

function deleteItem(id) {
  if (!confirm('Item löschen?')) return;
  data.items = data.items.filter(i => i.id !== id);
  saveData(data);
  render();
}

// ============================================================
// PERSON FORM
// ============================================================
function openPersonForm(id, personType) {
  const p = id ? data.persons.find(p => p.id === id) : null;
  const type = p ? (p.type || 'team') : (personType || 'team');
  const isKontakt = type === 'kontakt';
  const titleLabel = p ? 'Person bearbeiten' : (isKontakt ? 'Neuer Kontakt' : 'Neues Teammitglied');

  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">${titleLabel}</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <input type="hidden" id="personType" value="${type}">
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" id="personName" value="${p ? esc(p.name) : ''}" autofocus>
      </div>
      ${isKontakt ? `` : `
        <div class="form-group">
          <label class="form-label">Push-Richtung</label>
          <input class="form-input" id="personPush" placeholder="Was möchte ich bei dieser Person entwickeln?" value="${p ? esc(p.pushDirection || '') : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Jira Dashboard URL</label>
          <input class="form-input" id="personJiraUrl" placeholder="https://..." value="${p ? esc(p.jiraUrl || '') : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">GitLab MR URL</label>
          <input class="form-input" id="personGitlabUrl" placeholder="https://..." value="${p ? esc(p.gitlabMrUrl || '') : ''}">
        </div>
      `}
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="savePerson('${id || ''}')">${p ? 'Speichern' : 'Anlegen'}</button>
        ${p ? `<button class="btn btn-danger" onclick="deletePerson('${id}')">Löschen</button>` : ''}
      </div>
    </div>
  `;
  openOverlay();
}

function savePerson(id) {
  const name = document.getElementById('personName').value.trim();
  if (!name) return;
  const type = document.getElementById('personType').value;
  const isKontakt = type === 'kontakt';

  if (id) {
    const p = data.persons.find(p => p.id === id);
    if (p) {
      p.name = name;
      if (!isKontakt) {
        p.pushDirection = document.getElementById('personPush').value.trim();
        p.jiraUrl = normalizeExternalUrl(document.getElementById('personJiraUrl').value);
        p.gitlabMrUrl = normalizeExternalUrl(document.getElementById('personGitlabUrl').value);
      }
    }
  } else {
    const person = { id: uid(), name, type };
    if (isKontakt) {
      person.pushDirection = '';
    } else {
      person.pushDirection = document.getElementById('personPush').value.trim();
      person.jiraUrl = normalizeExternalUrl(document.getElementById('personJiraUrl').value);
      person.gitlabMrUrl = normalizeExternalUrl(document.getElementById('personGitlabUrl').value);
    }
    data.persons.push(person);
  }

  saveData(data);
  closeOverlay();
  toast(id ? 'Person aktualisiert' : 'Person angelegt');
  render();
}

function deletePerson(id) {
  if (!confirm('Person und alle zugehörigen Daten löschen?')) return;
  const p = data.persons.find(p => p.id === id);
  const wasKontakt = p && p.type === 'kontakt';
  data.persons = data.persons.filter(p => p.id !== id);
  data.items = data.items.filter(i => i.personId !== id);
  data.meetings = data.meetings
    .filter(m => m.personId !== id)
    .map(m => ({
      ...m,
      participants: meetingParticipantIds(m).filter(participantId => participantId !== id && participantId !== m.personId),
    }));
  saveData(data);
  closeOverlay();
  navigate(wasKontakt ? 'kontakte' : 'team');
}

// ============================================================
// MEETING FORM
// ============================================================
function openMeetingForm(type, personId) {
  const isOneOnOne = type === 'oneOnOne';
  const teamPersons = data.persons.filter(p => p.type !== 'kontakt');
  const personOpts = teamPersons.map(p => `<option value="${p.id}" ${personId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const initialDate = isOneOnOne ? '' : todayStr();

  // Collect existing meeting titles for datalist suggestions
  const existingTitles = [...new Set(data.meetings.filter(m => m.type === 'meeting' && m.title).map(m => m.title))];

  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">${isOneOnOne ? 'Neues 1:1' : 'Neues Meeting'}</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      ${!isOneOnOne ? `
        <div class="form-group">
          <label class="form-label">Titel</label>
          <input class="form-input" id="meetingTitle" list="meetingTitleSuggestions" placeholder="z.B. Standup, TK-Meeting, Retro..." autofocus>
          <datalist id="meetingTitleSuggestions">
            ${existingTitles.map(t => `<option value="${esc(t)}">`).join('')}
          </datalist>
        </div>
        <div class="form-group">
          <label class="form-label" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="meetingIsTeam" checked onchange="updateMeetingStatusPreview()">
            <span>Team-Meeting</span>
          </label>
        </div>
      ` : ''}
      <div class="form-group">
        <label class="form-label">Datum</label>
        <input type="date" class="form-input" id="meetingDate" value="${initialDate}" onchange="updateMeetingStatusPreview()">
        ${isOneOnOne ? '<div class="form-hint">Leer lassen für eine 1:1-Agenda ohne Termin.</div>' : ''}
      </div>
      ${isOneOnOne ? `
        <div class="form-group">
          <label class="form-label">Mit</label>
          <select class="form-select" id="meetingPerson" onchange="updateMeetingStatusPreview()">
            <option value="">Person wählen...</option>
            ${personOpts}
          </select>
        </div>
      ` : ''}
      <div id="meetingStatusPreview">${renderMeetingFormStatusPreview(initialDate, isOneOnOne, personId || '', true)}</div>
      <div id="meetingCarryoverPreview">${renderMeetingFormCarryoverPreview(isOneOnOne, personId || '', initialDate)}</div>
      <div class="form-group">
        <label class="form-label">Vorbereitung</label>
        <textarea class="form-textarea" id="meetingPrep" placeholder="Was möchte ich ansprechen..."></textarea>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="saveMeeting('${type}')">Erstellen &amp; öffnen</button>
    </div>
  `;
  openOverlay();
  if (isOneOnOne) return;
  setTimeout(() => document.getElementById('meetingTitle').focus(), 100);
}

function updateMeetingStatusPreview() {
  const preview = document.getElementById('meetingStatusPreview');
  const carryoverPreview = document.getElementById('meetingCarryoverPreview');
  const date = document.getElementById('meetingDate')?.value;
  const isOneOnOne = !!document.getElementById('meetingPerson');
  const personId = document.getElementById('meetingPerson')?.value || '';
  const isTeam = document.getElementById('meetingIsTeam')?.checked ?? true;
  if (preview) preview.innerHTML = renderMeetingFormStatusPreview(date, isOneOnOne, personId, isTeam);
  if (carryoverPreview) carryoverPreview.innerHTML = renderMeetingFormCarryoverPreview(isOneOnOne, personId, date);
}

function renderMeetingFormStatusPreview(dateISO, isOneOnOne, personId, teamMeeting = true) {
  if (!dateISO) return '';
  if (isOneOnOne) {
    if (!personId) return '';
    const person = data.persons.find(p => p.id === personId);
    return renderMeetingTeamStatusForDate(dateISO, {
      inForm: true,
      personIds: [personId],
      heading: person ? person.name : '1:1-Status',
      idPrefix: 'meeting-preview-oneonone',
    });
  }
  if (!teamMeeting) return '';
  return renderMeetingTeamStatusForDate(dateISO, { inForm: true });
}

function renderMeetingFormCarryoverPreview(isOneOnOne, personId, dateISO) {
  if (!isOneOnOne || !personId) return '';
  const carryover = oneOnOneCarryover({
    id: '',
    type: 'oneOnOne',
    personId,
    date: dateISO || todayStr(),
  });
  const total = carryoverCount(carryover);
  if (!total) return '';
  return `
    <div class="meeting-carryover-preview">
      <span>Übernahme</span>
      <strong>${carryover.openFollowUps.length}</strong> Follow-ups
      <strong>${carryover.openTodos.length}</strong> Todos
      <strong>${carryover.recentSignals.length}</strong> Signale
    </div>
  `;
}

function saveMeeting(type) {
  const isOneOnOne = type === 'oneOnOne';
  const title = !isOneOnOne ? (document.getElementById('meetingTitle').value.trim() || 'Meeting') : '';
  const personId = isOneOnOne ? (document.getElementById('meetingPerson').value || '') : '';
  if (isOneOnOne && !personId) {
    toast('Person wählen');
    document.getElementById('meetingPerson')?.focus();
    return;
  }

  const meeting = {
    id: uid(),
    type: isOneOnOne ? 'oneOnOne' : 'meeting',
    isTeamMeeting: isOneOnOne ? false : !!document.getElementById('meetingIsTeam')?.checked,
    title: isOneOnOne ? '' : title,
    date: document.getElementById('meetingDate').value,
    personId: isOneOnOne ? personId : null,
    participants: [],
    prep: document.getElementById('meetingPrep').value.trim(),
    notes: '',
  };

  data.meetings.push(meeting);
  saveData(data);
  closeOverlay();
  toast('Meeting erstellt');
  navigate('meetings:detail', { meetingId: meeting.id });
}

function deleteMeeting(id) {
  if (!confirm('Meeting löschen?')) return;
  data.meetings = data.meetings.filter(m => m.id !== id);
  data.items.forEach(item => {
    if (item.meetingId === id) item.meetingId = null;
  });
  saveData(data);
  render();
}

// ============================================================
// FOCUS FORM
// ============================================================
function openFocusForm(month) {
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Neuer Monthly Focus</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Titel</label>
        <input class="form-input" id="focusTitle" placeholder="z.B. I got your back Mentalität" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Beschreibung</label>
        <textarea class="form-textarea" id="focusDesc" placeholder="1-2 Sätze..."></textarea>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="saveFocus('${month}')">Speichern</button>
    </div>
  `;
  openOverlay();
}

function saveFocus(month) {
  const title = document.getElementById('focusTitle').value.trim();
  if (!title) return;

  data.focuses.push({
    id: uid(),
    month,
    title,
    description: document.getElementById('focusDesc').value.trim(),
  });
  saveData(data);
  closeOverlay();
  toast('Focus gespeichert');
  render();
}

function deleteFocus(id) {
  data.focuses = data.focuses.filter(f => f.id !== id);
  saveData(data);
  render();
}

// ============================================================
// DASHBOARD LINKS
// ============================================================
function openDashboardLinkForm(id) {
  const link = id ? (data.dashboardLinks || []).find(entry => entry.id === id) : null;
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">${link ? 'Quick Link bearbeiten' : 'Neuer Quick Link'}</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Titel</label>
        <input class="form-input" id="dashboardLinkTitle" value="${link ? esc(link.title || '') : ''}" placeholder="z.B. TK Jira Dashboard" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">URL</label>
        <input class="form-input" id="dashboardLinkUrl" value="${link ? esc(link.url || '') : ''}" placeholder="https://...">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Typ</label>
          <select class="form-select" id="dashboardLinkKind">
            ${['jira', 'gitlab', 'link'].map(kind => `<option value="${kind}" ${dashboardLinkKind(link || {}) === kind ? 'selected' : ''}>${kind}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Kurzinfo</label>
          <input class="form-input" id="dashboardLinkLabel" value="${link ? esc(link.label || '') : ''}" placeholder="optional">
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="saveDashboardLink('${id || ''}')">Speichern</button>
        ${link ? `<button class="btn btn-danger" onclick="deleteDashboardLink('${id}')">Löschen</button>` : ''}
      </div>
    </div>
  `;
  openOverlay();
}

function saveDashboardLink(id) {
  const title = document.getElementById('dashboardLinkTitle').value.trim();
  const url = normalizeExternalUrl(document.getElementById('dashboardLinkUrl').value);
  if (!title || !url) return;
  if (!data.dashboardLinks) data.dashboardLinks = [];

  const payload = {
    title,
    url,
    kind: document.getElementById('dashboardLinkKind').value,
    label: document.getElementById('dashboardLinkLabel').value.trim(),
  };

  if (id) {
    const link = data.dashboardLinks.find(entry => entry.id === id);
    if (link) Object.assign(link, payload);
  } else {
    data.dashboardLinks.push({ id: uid(), ...payload });
  }

  saveData(data);
  closeOverlay();
  toast('Link gespeichert');
  render();
}

function deleteDashboardLink(id) {
  if (!confirm('Quick Link löschen?')) return;
  data.dashboardLinks = (data.dashboardLinks || []).filter(link => link.id !== id);
  saveData(data);
  closeOverlay();
  render();
}

// ============================================================
// MONTH CARRYOVER
// ============================================================
function monthReviewMonths() {
  return (data.monthReviews || [])
    .filter(review => review.month && review.summary)
    .map(review => review.month)
    .sort((a, b) => b.localeCompare(a));
}

function openMonthReviewsArchive(month) {
  const months = monthReviewMonths();
  const activeMonth = months.includes(month) ? month : months[0];
  const reviews = (data.monthReviews || [])
    .filter(review => review.month && review.summary)
    .reduce((map, review) => ({ ...map, [review.month]: review }), {});
  const activeIndex = activeMonth ? months.indexOf(activeMonth) : -1;
  const prevMonthReview = activeIndex >= 0 ? months[activeIndex + 1] : '';
  const nextMonthReview = activeIndex > 0 ? months[activeIndex - 1] : '';
  const activeReview = activeMonth ? reviews[activeMonth] : null;
  const wins = activeMonth ? monthItems(data.items.filter(isPersonalWin), activeMonth).sort(compareItemsByDateDesc) : [];
  const growth = activeMonth ? monthItems(data.items.filter(isGrowthEntry), activeMonth).sort(compareItemsByDateDesc) : [];

  document.getElementById('modal').className = 'modal modal-month-reviews';
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Monatsrückblicke</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body month-reviews-modal-body">
      ${activeReview ? `
        <div class="month-review-archive-nav">
          ${prevMonthReview ? `<button class="btn btn-secondary btn-sm" onclick="openMonthReviewsArchive('${prevMonthReview}')">&#8592; früher</button>` : ''}
          <div class="month-review-archive-current">
            <div class="month-reflection-kicker">${formatMonth(activeMonth)}</div>
            <div class="month-review-archive-title">Monatsabschluss</div>
          </div>
          ${nextMonthReview ? `<button class="btn btn-secondary btn-sm" onclick="openMonthReviewsArchive('${nextMonthReview}')">später &#8594;</button>` : ''}
        </div>

        <article class="month-review-archive-card">
          <div class="month-review-archive-head">
            <div>
              <div class="month-reflection-kicker">meine monatsspur</div>
              <div class="month-review-archive-title">Wie der Monat war</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="openMonthCarryover('${activeMonth}')">bearbeiten</button>
          </div>
          <div class="month-review-archive-text">${esc(activeReview.summary).replace(/\n/g, '<br>')}</div>
        </article>

        <div class="month-close-grid">
          <div class="month-close-panel month-close-panel-wins">
            <div class="month-close-panel-title">Meine Wins</div>
            ${wins.length ? wins.slice(0, 8).map(item => `
              <div class="month-close-entry">
                <span class="month-close-entry-date">${formatDateShort(item.date) || '&ndash;'}</span>
                <span class="badge badge-win">${itemTypeLabel(item.type)}</span>
                <span class="month-close-entry-text">${esc(item.text)}</span>
              </div>
            `).join('') : '<div class="month-close-empty">Keine persönlichen Wins in diesem Monat.</div>'}
          </div>
          <div class="month-close-panel month-close-panel-growth">
            <div class="month-close-panel-title">Teamentwicklung</div>
            ${growth.length ? growth.slice(0, 8).map(item => `
              <div class="month-close-entry">
                <span class="month-close-entry-date">${formatDateShort(item.date) || '&ndash;'}</span>
                <span class="badge badge-${item.type}">${itemTypeLabel(item.type)}</span>
                <span class="month-close-entry-text"><strong>${esc(personName(item.personId))}</strong> · ${esc(item.text)}</span>
              </div>
            `).join('') : '<div class="month-close-empty">Keine Team-Highlights oder Concerns in diesem Monat.</div>'}
          </div>
        </div>
      ` : `
        <div class="month-review-archive-empty">
          <div class="month-review-archive-title">Noch keine Monatsrückblicke</div>
          <div class="month-reflection-empty">Sobald du einen Monat abschliesst, erscheint der Rückblick hier.</div>
        </div>
      `}
      <div class="month-review-archive-actions">
        <button class="btn btn-secondary" onclick="closeOverlay()">Schliessen</button>
        <button class="btn btn-primary" onclick="openMonthCarryover('${currentMonth()}')">Aktuellen Monat abschliessen</button>
      </div>
    </div>
  `;
  openOverlay();
}

function openMonthCarryover(month) {
  const openItems = data.items.filter(i => i.month === month && i.status !== 'done');
  const next = nextMonth(month);
  const progress = monthProgress(month);
  const wins = monthItems(data.items.filter(isPersonalWin), month).sort(compareItemsByDateDesc);
  const growth = monthItems(data.items.filter(isGrowthEntry), month).sort(compareItemsByDateDesc);
  const highlights = growth.filter(item => item.type === 'highlight');
  const concerns = growth.filter(item => item.type === 'concern');
  const existing = monthReview(month);
  document.getElementById('modal').className = 'modal modal-month-close';

  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Monat abschliessen</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body month-close-modal-body">
      <div class="month-close-intro">
        <div class="month-close-kicker">${formatMonth(month)} · Tag ${progress.elapsedDays} von ${progress.totalDays}</div>
        <div class="month-close-title">Was ich diesen Monat bewegt habe</div>
        <div class="month-close-stats">
          <span>${wins.length} Wins</span>
          <span>${highlights.length} Highlights</span>
          <span>${concerns.length} Concerns</span>
          <span>${openItems.length} offene Items</span>
        </div>
      </div>

      <div class="month-close-grid">
        <div class="month-close-panel month-close-panel-wins">
          <div class="month-close-panel-title">Meine Wins</div>
          ${wins.length ? wins.slice(0, 6).map(item => `
            <div class="month-close-entry">
              <span class="month-close-entry-date">${formatDateShort(item.date) || '&ndash;'}</span>
              <span class="badge badge-win">${itemTypeLabel(item.type)}</span>
              <span class="month-close-entry-text">${esc(item.text)}</span>
            </div>
          `).join('') : '<div class="month-close-empty">Noch keine persönlichen Wins in diesem Monat.</div>'}
        </div>
        <div class="month-close-panel month-close-panel-growth">
          <div class="month-close-panel-title">Teamentwicklung</div>
          ${growth.length ? growth.slice(0, 6).map(item => `
            <div class="month-close-entry">
              <span class="month-close-entry-date">${formatDateShort(item.date) || '&ndash;'}</span>
              <span class="badge badge-${item.type}">${itemTypeLabel(item.type)}</span>
              <span class="month-close-entry-text"><strong>${esc(personName(item.personId))}</strong> · ${esc(item.text)}</span>
            </div>
          `).join('') : '<div class="month-close-empty">Noch keine Team-Highlights oder Concerns in diesem Monat.</div>'}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Meine Monatszusammenfassung</label>
        <textarea class="form-textarea month-close-textarea" id="monthReviewSummary" placeholder="Wie hat sich der Monat angefühlt? Was war wichtig, worauf bist du stolz, was willst du mitnehmen?">${esc(existing?.summary || '')}</textarea>
      </div>

      <label class="month-close-carryover">
        <input type="checkbox" id="monthCarryoverCheckbox" ${openItems.length ? 'checked' : ''} ${openItems.length ? '' : 'disabled'}>
        <span>${openItems.length ? `${openItems.length} offene Items nach ${formatMonth(next)} übernehmen` : 'Keine offenen Items zum Übernehmen'}</span>
      </label>

      <div class="month-close-actions">
        <button class="btn btn-secondary" onclick="closeOverlay()">Abbrechen</button>
        <button class="btn btn-primary" onclick="saveMonthClosure('${month}')">Speichern &amp; abschliessen</button>
      </div>
    </div>
  `;
  openOverlay();
}

function saveMonthClosure(month) {
  const openItems = data.items.filter(i => i.month === month && i.status !== 'done');
  const next = nextMonth(month);
  const shouldCarry = !!document.getElementById('monthCarryoverCheckbox')?.checked && openItems.length > 0;
  const summary = document.getElementById('monthReviewSummary')?.value || '';

  upsertMonthReview(month, summary);

  if (shouldCarry) {
    openItems.forEach(item => {
      item.month = next;
    });
  }

  saveData(data);
  closeOverlay();
  if (shouldCarry) viewState.month = next;
  toast(shouldCarry ? `${openItems.length} Items übernommen` : 'Monatsrückblick gespeichert');
  render();
}

// ============================================================
// MARKDOWN EXPORT
// ============================================================
function exportMonth(month) {
  const items = data.items.filter(i => i.month === month);
  const focuses = data.focuses.filter(f => f.month === month);
  const taskItems = items.filter(i => !isGrowthEntry(i));

  let md = `# ${formatMonth(month)}\n\n`;

  if (focuses.length) {
    md += `## Focus\n`;
    focuses.forEach(f => {
      md += `- **${f.title}**${f.description ? ': ' + f.description : ''}\n`;
    });
    md += '\n';
  }

  const review = monthReview(month);
  if (review) {
    md += `## Monatsrückblick\n`;
    md += `${review.summary}\n\n`;
  }

  const groups = [
    ['Todo', taskItems.filter(i => i.status === 'todo')],
    ['Backlog', taskItems.filter(i => i.status === 'backlog')],
    ['Warte auf', taskItems.filter(i => i.status === 'waiting')],
    ['Done', taskItems.filter(i => i.status === 'done')],
  ];

  groups.forEach(([title, list]) => {
    if (list.length) {
      md += `## ${title}\n`;
      list.forEach(i => {
        const check = i.status === 'done' ? 'x' : ' ';
        const person = i.personId ? ` (@${personName(i.personId)})` : '';
        const badge = i.type !== 'todo' ? ` [${itemTypeLabel(i.type)}]` : '';
        md += `- [${check}] ${i.text}${person}${badge}\n`;
        if (i.notes) md += `  > ${i.notes.replace(/\n/g, '\n  > ')}\n`;
      });
      md += '\n';
    }
  });

  const wins = items.filter(isPersonalWin);
  if (wins.length) {
    md += `## My Wins\n`;
    wins.forEach(i => { md += `- ${formatDate(i.date)}: ${i.text}\n`; });
    md += '\n';
  }

  const growth = items.filter(isGrowthEntry).sort(compareItemsByDateDesc);
  if (growth.length) {
    md += `## Team Growth\n`;
    growth.forEach(i => { md += `- ${formatDate(i.date)}: ${personName(i.personId)} · ${itemTypeLabel(i.type)} · ${i.text}\n`; });
    md += '\n';
  }

  md += exportMonthBlocks(month);

  downloadFile(`${month}.md`, md);
}

function exportPerson(id) {
  const p = data.persons.find(p => p.id === id);
  if (!p) return;

  let md = `# ${p.name}\n\n`;
  md += `**Push-Richtung:** ${p.pushDirection || '—'}\n\n`;

  const meetings = data.meetings.filter(m => m.personId === id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (meetings.length) {
    md += `## 1:1 Gespräche\n\n`;
    meetings.forEach(m => {
      md += `### ${m.date ? formatDate(m.date) : 'ohne Datum'}\n`;
      if (m.prep) md += `**Vorbereitung:** ${m.prep}\n`;
      if (m.notes) md += `${m.notes}\n`;
      md += '\n';
    });
  }

  const items = data.items.filter(i => i.personId === id && i.status !== 'done');
  if (items.length) {
    md += `## Offene Items\n`;
    items.forEach(i => { md += `- [${itemTypeLabel(i.type)}] ${i.text} (${i.status})\n`; });
    md += '\n';
  }

  const growth = data.items.filter(i => i.personId === id && isGrowthEntry(i)).sort(compareItemsByDateDesc);
  if (growth.length) {
    md += `## Growth Journal\n`;
    growth.forEach(i => { md += `- ${formatDate(i.date)} · ${itemTypeLabel(i.type)}: ${i.text}\n`; });
    md += '\n';
  }

  md += exportPersonBlocks(id);

  downloadFile(`${p.name.toLowerCase().replace(/\s+/g, '-')}.md`, md);
}

function exportMeeting(id) {
  const m = data.meetings.find(m => m.id === id);
  if (!m) return;

  let title = m.type === 'oneOnOne' ? '1:1' : (m.title || 'Meeting');
  if (m.personId) title += ' mit ' + personName(m.personId);

  let md = `# ${title} — ${m.date ? formatDate(m.date) : 'ohne Datum'}\n\n`;
  md += `## Vorbereitung\n${m.prep || '—'}\n\n`;
  md += `## Mitschrift\n${m.notes || '—'}\n`;

  const slugTitle = (m.title || m.type).toLowerCase().replace(/\s+/g, '-');
  const slug = `${slugTitle}-${m.date || 'ohne-datum'}${m.personId ? '-' + personName(m.personId).toLowerCase().replace(/\s+/g, '-') : ''}`;
  downloadFile(`${slug}.md`, md);
}

function exportWins() {
  const wins = data.items.filter(isPersonalWin).sort(compareItemsByDateDesc);
  const highlights = data.items.filter(i => i.type === 'highlight').sort(compareItemsByDateDesc);
  const concerns = data.items.filter(i => i.type === 'concern').sort(compareItemsByDateDesc);

  let md = `# Impact Summary\n\n`;

  if (wins.length) {
    md += `## My Wins (${wins.length})\n`;
    wins.forEach(i => {
      const person = i.personId ? ` (@${personName(i.personId)})` : '';
      md += `- ${formatDate(i.date)}: ${i.text}${person}\n`;
    });
    md += '\n';
  }

  if (highlights.length) {
    md += `## Team Highlights (${highlights.length})\n`;
    highlights.forEach(i => {
      md += `- ${formatDate(i.date)}: ${personName(i.personId)} · ${i.text}\n`;
    });
    md += '\n';
  }

  if (concerns.length) {
    md += `## Team Concerns (${concerns.length})\n`;
    concerns.forEach(i => {
      md += `- ${formatDate(i.date)}: ${personName(i.personId)} · ${i.text}\n`;
    });
  }

  downloadFile('impact-summary.md', md);
}

// ============================================================
// BACKUP / IMPORT
// ============================================================
function exportBackup() {
  if (typeof closeThemeMenu === 'function') closeThemeMenu();
  const json = JSON.stringify(data, null, 2);
  downloadFile('tktool-backup-' + todayStr() + '.json', json);
  toast('Backup heruntergeladen');
}

function importBackup() {
  if (typeof closeThemeMenu === 'function') closeThemeMenu();
  document.getElementById('importInput').click();
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.items || imported.persons || imported.meetings) {
        if (confirm('Aktuelle Daten mit Backup ersetzen?')) {
          data = { ...defaultData(), ...imported };
          saveData(data);
          toast('Daten importiert');
          render();
        }
      } else {
        alert('Ungültiges Backup-Format');
      }
    } catch { alert('Fehler beim Lesen der Datei'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ============================================================
// OVERLAY / TOAST HELPERS
// ============================================================
function openOverlay() {
  document.getElementById('overlay').classList.add('open');
}

function closeOverlay() {
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('modal').className = 'modal';
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function downloadFile(name, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function normalizeExternalUrl(url) {
  const value = (url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function memberLinkIcon(kind) {
  if (kind === 'jira') {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 2.5h8v11H4z"></path>
        <path d="M6 5h4"></path>
        <path d="M6 8h4"></path>
        <path d="M6 11h4"></path>
        <path d="M4 2.5l2 2"></path>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 4L2.5 8 6 12"></path>
      <path d="M10 4l3.5 4-3.5 4"></path>
      <path d="M8.5 3 7 13"></path>
    </svg>
  `;
}

function renderMemberLink(url, kind, label, options = {}) {
  const href = normalizeExternalUrl(url);
  if (!href) return '';
  const { text = '', withText = false } = options;
  return `
    <a
      class="member-link member-link-${kind} ${withText ? 'member-link-with-text' : ''}"
      href="${esc(href)}"
      target="_blank"
      rel="noopener noreferrer"
      title="${esc(label)}"
      aria-label="${esc(label)}"
      onclick="event.stopPropagation()"
    >
      ${memberLinkIcon(kind)}
      ${withText ? `<span>${esc(text)}</span>` : ''}
    </a>
  `;
}

function renderMemberLinkBar(person) {
  const jira = renderMemberLink(person.jiraUrl, 'jira', `${person.name}: Jira Dashboard öffnen`, { withText: true, text: 'Jira' });
  const gitlab = renderMemberLink(person.gitlabMrUrl, 'gitlab', `${person.name}: GitLab Merge Requests öffnen`, { withText: true, text: 'GitLab' });
  if (!jira && !gitlab) return '';
  return `<div class="member-link-bar">${jira}${gitlab}</div>`;
}

function esc(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
