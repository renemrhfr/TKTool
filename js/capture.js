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
  if (type === 'meeting' || type === 'oneOnOne') return 'meeting';
  return isGrowthType(type) ? 'teammate' : 'personal';
}

function currentCaptureMode() {
  return document.getElementById('captureMode')?.value || 'personal';
}

function setCaptureMode(mode) {
  const input = document.getElementById('captureMode');
  if (!input) return;
  input.value = ['personal', 'teammate', 'meeting'].includes(mode) ? mode : 'personal';
  updateCaptureModeUI();
  updateCaptureDateUI();
}

function updateCaptureModeUI() {
  const mode = currentCaptureMode();
  const personalActive = mode === 'personal';
  const teammateActive = mode === 'teammate';
  const meetingActive = mode === 'meeting';
  const personalBtn = document.getElementById('captureModePersonal');
  const teammateBtn = document.getElementById('captureModeTeammate');
  const meetingBtn = document.getElementById('captureModeMeeting');
  const textGroup = document.getElementById('captureTextGroup');
  const personalFields = document.getElementById('capturePersonalFields');
  const teammateFields = document.getElementById('captureTeammateFields');
  const meetingFields = document.getElementById('captureMeetingFields');
  const personalPersonGroup = document.getElementById('capturePersonalPersonGroup');
  const dateGroup = document.getElementById('captureDateGroup');
  const meetingGroup = document.getElementById('captureMeetingGroup');
  const notesGroup = document.getElementById('captureNotesGroup');
  const monthGroup = document.getElementById('captureMonthGroup');
  const showMonthGroup = personalActive;
  if (personalBtn) personalBtn.classList.toggle('active', personalActive);
  if (teammateBtn) teammateBtn.classList.toggle('active', teammateActive);
  if (meetingBtn) meetingBtn.classList.toggle('active', meetingActive);
  if (textGroup) textGroup.style.display = meetingActive ? 'none' : '';
  if (personalFields) personalFields.style.display = personalActive ? '' : 'none';
  if (teammateFields) teammateFields.style.display = teammateActive ? '' : 'none';
  if (meetingFields) meetingFields.style.display = meetingActive ? '' : 'none';
  if (personalPersonGroup) personalPersonGroup.style.display = personalActive ? '' : 'none';
  if (dateGroup) dateGroup.style.display = meetingActive ? 'none' : '';
  if (meetingGroup) meetingGroup.style.display = personalActive ? '' : 'none';
  if (notesGroup) notesGroup.style.display = personalActive ? '' : 'none';
  if (monthGroup) monthGroup.style.display = showMonthGroup ? '' : 'none';
  if (meetingActive) updateCaptureMeetingTypeUI();
}

function updateCaptureTypeUI() {
  const type = document.getElementById('captureType')?.value || 'todo';
  const statusSelect = document.getElementById('captureStatus');
  if (statusSelect && type === 'win') statusSelect.value = 'done';
  updateCaptureModeUI();
  updateCaptureDateUI();
}

function updateCaptureDateUI() {
  const mode = currentCaptureMode();
  const type = document.getElementById('captureType')?.value || 'todo';
  const status = document.getElementById('captureStatus')?.value || 'todo';
  const dateInput = document.getElementById('captureDate');
  if (!dateInput) return;
  const dateDisabled = mode === 'personal' && type !== 'win' && status === 'backlog';
  dateInput.disabled = dateDisabled;
  if (dateDisabled) dateInput.value = '';
}

function currentCaptureMeetingType() {
  return document.getElementById('captureMeetingType')?.value || 'meeting';
}

function setCaptureMeetingType(type) {
  const input = document.getElementById('captureMeetingType');
  if (!input) return;
  input.value = type === 'oneOnOne' ? 'oneOnOne' : 'meeting';
  updateCaptureMeetingTypeUI();
}

function updateCaptureMeetingTypeUI() {
  const type = currentCaptureMeetingType();
  const isOneOnOne = type === 'oneOnOne';
  const meetingBtn = document.getElementById('captureMeetingTypeMeeting');
  const oneOnOneBtn = document.getElementById('captureMeetingTypeOneOnOne');
  const titleGroup = document.getElementById('captureMeetingTitleGroup');
  const teamGroup = document.getElementById('captureMeetingTeamGroup');
  const personGroup = document.getElementById('captureMeetingPersonGroup');
  const oneOnOneDateHint = document.getElementById('captureOneOnOneDateHint');
  const dateInput = document.getElementById('meetingDate');
  if (meetingBtn) meetingBtn.classList.toggle('active', !isOneOnOne);
  if (oneOnOneBtn) oneOnOneBtn.classList.toggle('active', isOneOnOne);
  if (titleGroup) titleGroup.style.display = isOneOnOne ? 'none' : '';
  if (teamGroup) teamGroup.style.display = isOneOnOne ? 'none' : '';
  if (personGroup) personGroup.style.display = isOneOnOne ? '' : 'none';
  if (oneOnOneDateHint) oneOnOneDateHint.style.display = isOneOnOne ? '' : 'none';
  if (dateInput && !isOneOnOne && !dateInput.value) dateInput.value = todayStr();
  updateMeetingStatusPreview();
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
  updateEditItemDateUI();
}

function updateEditItemDateUI() {
  const type = currentEditType();
  const status = document.getElementById('editStatus')?.value || 'todo';
  const dateInput = document.getElementById('editDate');
  if (!dateInput) return;
  const dateDisabled = !isGrowthType(type) && status === 'backlog';
  dateInput.disabled = dateDisabled;
  if (dateDisabled) dateInput.value = '';
}

function openCapture(prefill = {}) {
  const month = prefill.month || viewState.month || currentMonth();
  const selectedPersonId = prefill.personId || null;
  const selectedMeetingId = prefill.meetingId || null;
  const captureMode = prefill.captureMode || captureModeForType(prefill.type);
  const captureStatus = prefill.status || (prefill.type === 'win' ? 'done' : 'todo');
  const captureMeetingType = prefill.meetingType || (prefill.type === 'oneOnOne' ? 'oneOnOne' : 'meeting');
  const personOpts = personOptions(selectedPersonId);
  const meetingOpts = meetingOptions(selectedMeetingId, { personId: selectedPersonId });
  const teamPersons = data.persons
    .filter(p => p.type !== 'kontakt')
    .slice()
    .sort(comparePersonsByName);
  const oneOnOnePersonOpts = teamPersons
    .map(p => `<option value="${p.id}" ${selectedPersonId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`)
    .join('');
  const existingMeetingTitles = [...new Set(data.meetings
    .filter(m => m.type === 'meeting' && m.title)
    .map(m => m.title))];
  const meetingDate = prefill.date || (captureMeetingType === 'oneOnOne' ? '' : todayStr());

  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Quick Capture</span>
      <div><span class="kbd">Ctrl+K</span> <button class="modal-close" onclick="closeOverlay()">&#x2715;</button></div>
    </div>
    <div class="modal-body">
      <input type="hidden" id="captureMode" value="${captureMode}">
      <div class="segmented-toggle capture-mode-toggle">
        <button type="button" class="segmented-toggle-btn" id="captureModePersonal" onclick="setCaptureMode('personal')">mein impact</button>
        <button type="button" class="segmented-toggle-btn" id="captureModeTeammate" onclick="setCaptureMode('teammate')">teamentwicklung</button>
        <button type="button" class="segmented-toggle-btn" id="captureModeMeeting" onclick="setCaptureMode('meeting')">meeting</button>
      </div>
      <div class="form-group" id="captureTextGroup">
        <textarea class="form-textarea" id="captureText" placeholder="Was ist passiert / was muss getan werden?" rows="3" autofocus>${esc(prefill.text || '')}</textarea>
      </div>
      <div id="capturePersonalFields">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Typ</label>
            <select class="form-select" id="captureType" onchange="updateCaptureTypeUI()">
              <option value="todo" ${(!prefill.type || prefill.type === 'todo') ? 'selected' : ''}>Todo</option>
              <option value="win" ${prefill.type === 'win' ? 'selected' : ''}>Win</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="captureStatus" onchange="updateCaptureDateUI()">
              <option value="todo" ${captureStatus === 'todo' ? 'selected' : ''}>Todo</option>
              <option value="backlog" ${captureStatus === 'backlog' ? 'selected' : ''}>Backlog</option>
              <option value="waiting" ${captureStatus === 'waiting' ? 'selected' : ''}>Warte auf...</option>
              <option value="done" ${captureStatus === 'done' ? 'selected' : ''}>Done</option>
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
      <div id="captureMeetingFields">
        <input type="hidden" id="captureMeetingType" value="${captureMeetingType}">
        <div class="segmented-toggle">
          <button type="button" class="segmented-toggle-btn" id="captureMeetingTypeMeeting" onclick="setCaptureMeetingType('meeting')">meeting</button>
          <button type="button" class="segmented-toggle-btn" id="captureMeetingTypeOneOnOne" onclick="setCaptureMeetingType('oneOnOne')">1:1</button>
        </div>
        <div class="form-group" id="captureMeetingTitleGroup">
          <label class="form-label">Titel</label>
          <input class="form-input" id="meetingTitle" list="meetingTitleSuggestions" placeholder="z.B. Standup, TK-Meeting, Retro...">
          <datalist id="meetingTitleSuggestions">
            ${existingMeetingTitles.map(title => `<option value="${esc(title)}">`).join('')}
          </datalist>
        </div>
        <div class="form-group" id="captureMeetingTeamGroup">
          <label class="form-label" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="meetingIsTeam" checked onchange="updateMeetingStatusPreview()">
            <span>Team-Meeting</span>
          </label>
        </div>
        <div class="form-group" id="captureMeetingPersonGroup">
          <label class="form-label">Mit</label>
          <select class="form-select" id="meetingPerson" onchange="updateMeetingStatusPreview()">
            <option value="">Person wählen...</option>
            ${oneOnOnePersonOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Datum</label>
          <input type="date" class="form-input" id="meetingDate" value="${meetingDate}" onchange="updateMeetingStatusPreview()">
          <div class="form-hint" id="captureOneOnOneDateHint">Leer lassen für eine 1:1-Agenda ohne Termin.</div>
        </div>
        <div id="meetingStatusPreview">${renderMeetingFormStatusPreview(meetingDate, captureMeetingType === 'oneOnOne', selectedPersonId || '', true)}</div>
        <div id="meetingCarryoverPreview">${renderMeetingFormCarryoverPreview(captureMeetingType === 'oneOnOne', selectedPersonId || '', meetingDate)}</div>
        <div class="form-group">
          <label class="form-label">Vorbereitung</label>
          <textarea class="form-textarea" id="meetingPrep" placeholder="Was möchte ich ansprechen..." rows="3">${esc(prefill.prep || '')}</textarea>
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
        <div class="form-group" id="captureDateGroup">
          <label class="form-label">Datum</label>
          <input type="date" class="form-input" id="captureDate" value="${captureStatus === 'backlog' ? '' : (prefill.date || todayStr())}">
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
  updateCaptureDateUI();
  setTimeout(() => {
    const focusTarget = currentCaptureMode() === 'meeting'
      ? (currentCaptureMeetingType() === 'oneOnOne' ? document.getElementById('meetingPerson') : document.getElementById('meetingTitle'))
      : document.getElementById('captureText');
    focusTarget?.focus();
  }, 100);
}

function saveCapture() {
  const mode = currentCaptureMode();
  if (mode === 'meeting') {
    saveCaptureMeeting();
    return;
  }

  const text = document.getElementById('captureText').value.trim();
  if (!text) return;
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
    const status = document.getElementById('captureStatus').value;
    const personId = type === 'win' ? null : (document.getElementById('capturePerson').value || null);
    const date = status === 'backlog' ? '' : document.getElementById('captureDate').value;
    item = {
      id: uid(),
      type,
      status,
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

function saveCaptureMeeting() {
  const type = currentCaptureMeetingType();
  const isOneOnOne = type === 'oneOnOne';
  const personId = isOneOnOne ? (document.getElementById('meetingPerson')?.value || '') : '';
  if (isOneOnOne && !personId) {
    toast('Person wählen');
    document.getElementById('meetingPerson')?.focus();
    return;
  }

  const title = isOneOnOne
    ? ''
    : (document.getElementById('meetingTitle')?.value.trim() || 'Meeting');
  const meeting = {
    id: uid(),
    type,
    isTeamMeeting: isOneOnOne ? false : !!document.getElementById('meetingIsTeam')?.checked,
    title,
    date: document.getElementById('meetingDate')?.value || '',
    personId: isOneOnOne ? personId : null,
    participants: [],
    prep: document.getElementById('meetingPrep')?.value.trim() || '',
    notes: '',
  };

  data.meetings.push(meeting);
  saveData(data);
  closeOverlay();
  toast('Meeting erstellt');
  navigate('meetings:detail', { meetingId: meeting.id });
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
          <select class="form-select" id="editStatus" onchange="updateEditItemDateUI()">
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
          <input type="date" class="form-input" id="editDate" value="${item.status === 'backlog' ? '' : item.date}">
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
    if (item.status === 'backlog') item.date = '';
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
  if (status === 'backlog') item.date = '';
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
          <label class="form-label">Jira Account-ID</label>
          <input class="form-input" id="personJiraAccountId" placeholder="5b10a2844c20165700ede21g" value="${p ? esc(p.jiraAccountId || '') : ''}">
          <div class="form-hint">findest du über <span class="form-hint-code">/rest/api/3/user/search?query=mail@firma.at</span> im Browser</div>
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
        p.jiraAccountId = document.getElementById('personJiraAccountId').value.trim();
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
      person.jiraAccountId = document.getElementById('personJiraAccountId').value.trim();
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
  const captureMeetingType = document.getElementById('captureMeetingType')?.value;
  const isOneOnOne = captureMeetingType ? captureMeetingType === 'oneOnOne' : !!document.getElementById('meetingPerson');
  const personId = isOneOnOne ? (document.getElementById('meetingPerson')?.value || '') : '';
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

function openPersonDossierExport(id) {
  const p = data.persons.find(p => p.id === id);
  if (!p) return;

  const year = todayStr().slice(0, 4);
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Personen-Dossier exportieren</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-hint" style="margin-bottom:16px">
        Erstellt eine Markdown-Chronik für ${esc(p.name)} aus personenbezogenen Items,
        1:1-Notizen und Planungsblöcken.
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Von</label>
          <input type="date" class="form-input" id="personDossierFrom" value="${year}-01-01">
        </div>
        <div class="form-group">
          <label class="form-label">Bis</label>
          <input type="date" class="form-input" id="personDossierTo" value="${todayStr()}">
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="exportPersonDossier('${id}')">Dossier herunterladen</button>
    </div>
  `;
  openOverlay();
}

function personDossierMonths(from, to) {
  const months = [];
  let cursor = from.slice(0, 7);
  const last = to.slice(0, 7);
  while (cursor <= last) {
    months.push(cursor);
    const [year, month] = cursor.split('-').map(Number);
    cursor = `${year + (month === 12 ? 1 : 0)}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
  }
  return months;
}

function personDossierItemDate(item) {
  return item.date || (item.month ? `${item.month}-01` : '');
}

function dossierItemLine(item) {
  const date = personDossierItemDate(item);
  const check = item.status === 'done' ? 'x' : ' ';
  let line = `- [${check}] ${date ? formatDate(date) : 'ohne Datum'} · ${item.text}`;
  if (item.type !== 'todo') line += ` · ${itemTypeLabel(item.type)}`;
  if (item.status !== 'done') line += ` · ${itemTypeLabel(item.status)}`;
  line += '\n';
  if (item.notes) line += `  > ${item.notes.replace(/\n/g, '\n  > ')}\n`;
  return line;
}

function exportPersonDossier(id) {
  const p = data.persons.find(person => person.id === id);
  if (!p) return;

  const from = document.getElementById('personDossierFrom')?.value || '';
  const to = document.getElementById('personDossierTo')?.value || '';
  if (!from || !to) {
    toast('Zeitraum vollständig angeben');
    return;
  }
  if (from > to) {
    toast('„Von“ muss vor „Bis“ liegen');
    return;
  }

  const inRange = date => !!date && date >= from && date <= to;
  const items = data.items
    .filter(item => item.personId === id && !isPersonalWin(item) && inRange(personDossierItemDate(item)))
    .sort((a, b) => personDossierItemDate(b).localeCompare(personDossierItemDate(a)));
  const growth = items.filter(isGrowthEntry);
  const doneItems = items.filter(item => !isGrowthEntry(item) && item.status === 'done');
  const openItems = items.filter(item => !isGrowthEntry(item) && item.status !== 'done');
  const meetings = data.meetings
    .filter(meeting => meeting.type === 'oneOnOne' && meeting.personId === id && inRange(meeting.date))
    .sort((a, b) => b.date.localeCompare(a.date));
  const blocks = data.blocks
    .filter(block => block.personId === id && block.start && block.end && block.end >= from && block.start <= to)
    .sort((a, b) => b.start.localeCompare(a.start));

  const coveredMonths = new Set();
  items.forEach(item => coveredMonths.add(personDossierItemDate(item).slice(0, 7)));
  meetings.forEach(meeting => coveredMonths.add(meeting.date.slice(0, 7)));
  blocks.forEach(block => {
    personDossierMonths(
      block.start < from ? from : block.start,
      block.end > to ? to : block.end
    ).forEach(month => coveredMonths.add(month));
  });
  const missingMonths = personDossierMonths(from, to).filter(month => !coveredMonths.has(month));

  let md = `# Personen-Dossier: ${p.name}\n\n`;
  md += `**Zeitraum:** ${formatDate(from)} bis ${formatDate(to)}  \n`;
  md += `**Erstellt am:** ${formatDate(todayStr())}\n\n`;

  md += `## Überblick\n\n`;
  md += `- ${growth.length} Highlights / Concerns\n`;
  md += `- ${doneItems.length} erledigte Items\n`;
  md += `- ${openItems.length} offene Items\n`;
  md += `- ${meetings.length} 1:1-Gespräche\n`;
  md += `- ${blocks.length} Planungsblöcke\n`;
  md += `- ${missingMonths.length} Monate ohne personenbezogene Einträge\n\n`;
  if (missingMonths.length) {
    md += `**Keine Einträge in:** ${missingMonths.map(formatMonthName).join(', ')}\n\n`;
  }

  if (p.pushDirection || p.notes) {
    md += `## Profil-Kontext\n\n`;
    if (p.pushDirection) md += `**Push-Richtung:** ${p.pushDirection}\n\n`;
    if (p.notes) md += `**Notizen:**\n\n${p.notes}\n\n`;
  }

  md += `## Highlights & Concerns (${growth.length})\n\n`;
  if (growth.length) {
    growth.forEach(item => {
      md += `- ${formatDate(personDossierItemDate(item))} · **${itemTypeLabel(item.type)}:** ${item.text}\n`;
    });
  } else {
    md += `_Keine Einträge im gewählten Zeitraum._\n`;
  }
  md += '\n';

  md += `## Erledigte Items (${doneItems.length})\n\n`;
  md += doneItems.length ? doneItems.map(dossierItemLine).join('') : `_Keine Einträge im gewählten Zeitraum._\n`;
  md += '\n';

  md += `## Offene Items (${openItems.length})\n\n`;
  md += openItems.length ? openItems.map(dossierItemLine).join('') : `_Keine Einträge im gewählten Zeitraum._\n`;
  md += '\n';

  md += `## 1:1-Gespräche (${meetings.length})\n\n`;
  if (meetings.length) {
    meetings.forEach(meeting => {
      md += `### ${formatDate(meeting.date)}\n\n`;
      if (meeting.prep) md += `**Vorbereitung**\n\n${meeting.prep}\n\n`;
      if (meeting.notes) md += `**Mitschrift**\n\n${meeting.notes}\n\n`;
      if (!meeting.prep && !meeting.notes) md += `_Keine Notizen._\n\n`;
    });
  } else {
    md += `_Keine Gespräche im gewählten Zeitraum._\n\n`;
  }

  md += exportPersonBlocks(id, from, to, blocks);

  const slug = p.name.toLowerCase().trim().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '');
  closeOverlay();
  downloadFile(`${slug}-dossier-${from}-${to}.md`, md);
  toast('Personen-Dossier exportiert');
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
async function exportBackup() {
  if (typeof closeThemeMenu === 'function') closeThemeMenu();
  try {
    const info = await writeBackupFile('manuell');
    await updateBackupSetting({ lastBackupAt: new Date().toISOString() });
    toast(`Backup gespeichert: ${info.path}`, 5000);
  } catch (error) {
    // Kein Ordnerzugriff (oder verweigert): dann eben in den Download-Ordner,
    // damit die Aktion nie folgenlos bleibt.
    console.error('Backup to data folder failed:', error);
    downloadFile('tktool-backup-' + todayStr() + '.json', JSON.stringify(data, null, 2));
    toast('Ordner-Backup fehlgeschlagen – als Download gespeichert', 5000, 'error');
  }
}

// ============================================================
// CLEANUP
// ============================================================
let cleanupDialogState = null;

const CLEANUP_MONTH_CHOICES = [0, 1, 2, 3, 4, 6, 9, 12, 18, 24, 36];

function openCleanupDialog() {
  if (typeof closeThemeMenu === 'function') closeThemeMenu();
  cleanupDialogState = { months: cleanupMonthsMap(), running: false };
  renderCleanupDialog();
  openOverlay();
}

function setCleanupGroupMonths(id, months) {
  if (!cleanupDialogState) return;
  cleanupDialogState.months[id] = Math.max(0, parseInt(months, 10) || 0);
  renderCleanupDialog();
}

function monthsLabel(months) {
  if (!months) return 'nie';
  if (months === 12) return '1 jahr';
  if (months === 24) return '2 jahre';
  if (months === 36) return '3 jahre';
  return `${months} mon`;
}

function relativeDaysLabel(iso) {
  if (!iso) return 'nie';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (!Number.isFinite(days)) return 'unbekannt';
  if (days <= 0) return 'heute';
  return days === 1 ? 'gestern' : `vor ${days} tagen`;
}

// Zeigt, warum die Löschmarker noch da sind: entweder wartet ein Gerät auf
// seine Bestätigung, oder es ist alles bestätigt und sie fallen mit.
function renderCleanupGraveSection(staleGraves) {
  const graves = countGraves();
  if (!graves) return '';
  const pending = devicesPendingAck();
  const others = activeDevices().filter(d => d.id !== getDeviceId());
  if (staleGraves >= graves && !pending.length) {
    return `
      <div class="cleanup-row cleanup-row-fixed">
        <span class="cleanup-row-fixed-mark" aria-hidden="true">&#x2713;</span>
        <span class="cleanup-row-label">löschmarker</span>
        <span class="cleanup-row-hint">von allen geräten bestätigt, fallen mit</span>
        <span class="cleanup-row-count">${staleGraves}</span>
      </div>
    `;
  }
  return `
    <div class="cleanup-row cleanup-row-fixed">
      <span class="cleanup-row-fixed-mark" aria-hidden="true">&#8987;</span>
      <span class="cleanup-row-label">löschmarker</span>
      <span class="cleanup-row-hint">${pending.length
        ? `warten auf ${pending.map(d => esc(d.label || d.id.slice(0, 4))).join(', ')}`
        : `warten auf die frist (${GRAVE_GRACE_DAYS} tage)`}</span>
      <span class="cleanup-row-count">${staleGraves}/${graves}</span>
    </div>
    ${pending.length ? `
      <div class="cleanup-devices">
        TKTool dort einmal öffnen, dann verschwinden die Marker automatisch.
        ${others.map(d => `<span class="cleanup-device">${esc(d.label || d.id.slice(0, 4))} · ${relativeDaysLabel(d.lastSeenAt)}</span>`).join('')}
      </div>
    ` : ''}
  `;
}

function renderCleanupDialog() {
  if (!cleanupDialogState) return;
  const { months, running } = cleanupDialogState;
  const picked = cleanupCandidates(months);
  const total = Object.values(picked).reduce((sum, list) => sum + list.length, 0);
  const staleGraves = countStaleGraves();
  const lastCleanup = backupSetting()?.lastCleanupAt;

  const rows = CLEANUP_GROUPS.map(group => {
    const groupMonths = months[group.id] || 0;
    const count = (picked[group.id] || []).length;
    // Wieviel läge bei der großzügigsten Einstellung an? Zeigt, ob eine
    // strengere Aufbewahrung überhaupt etwas brächte.
    const possible = cleanupCandidates({ [group.id]: 36 })[group.id].length;
    return `
      <div class="cleanup-row ${groupMonths ? '' : 'cleanup-row-off'}">
        <span class="cleanup-row-label">${esc(group.label)}</span>
        <span class="cleanup-row-hint">${esc(group.hint)}</span>
        <select class="cleanup-row-select" onchange="setCleanupGroupMonths('${group.id}', this.value)">
          ${CLEANUP_MONTH_CHOICES.map(m => `
            <option value="${m}" ${m === groupMonths ? 'selected' : ''}>${monthsLabel(m)}</option>
          `).join('')}
        </select>
        <span class="cleanup-row-count" title="${possible} älter als 3 jahre">${count}</span>
      </div>
    `;
  }).join('') + renderCleanupGraveSection(staleGraves);

  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Cleanup</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">aufbewahren</label>
        <div class="cleanup-groups">${rows}</div>
        <div class="form-hint">
          Alles Ältere wird gelöscht. Notizen, Personen und Monatsreviews bleiben immer.
        </div>
      </div>
      <div class="cleanup-summary">
        <strong>${total}</strong> einträge weniger in suche, listen und exporten
        ${lastCleanup ? `<span class="cleanup-summary-last">letztes cleanup: ${relativeDaysLabel(lastCleanup)}</span>` : ''}
      </div>
      <div class="form-hint">
        Backup nach <code>${BACKUP_DIRNAME}/</code> läuft vorher automatisch.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-danger" style="flex:1;min-width:160px"
          ${(total || staleGraves) && !running ? '' : 'disabled'}
          onclick="confirmCleanup()">${running ? 'läuft...' : `Backup + ${total} löschen`}</button>
        <button class="btn btn-secondary" onclick="closeOverlay()">Abbrechen</button>
      </div>
    </div>
  `;
}

async function confirmCleanup() {
  if (!cleanupDialogState || cleanupDialogState.running) return;
  const months = cleanupDialogState.months;
  const picked = cleanupCandidates(months);
  const lines = CLEANUP_GROUPS
    .filter(g => (picked[g.id] || []).length)
    .map(g => `• ${picked[g.id].length} ${g.label} (älter als ${monthsLabel(months[g.id])})`);
  if (lines.length && !confirm(`Endgültig löschen?\n\n${lines.join('\n')}\n\nEin Backup wird vorher angelegt.`)) return;
  cleanupDialogState.running = true;
  renderCleanupDialog();
  try {
    const result = await runCleanup(months);
    closeOverlay();
    cleanupDialogState = null;
    toast(`${result.removed} Einträge gelöscht — Backup: ${result.backup.path}`, 6000);
    render();
  } catch (error) {
    console.error('Cleanup failed:', error);
    cleanupDialogState.running = false;
    renderCleanupDialog();
    reportUiError('Cleanup fehlgeschlagen – es wurde nichts gelöscht', error);
  }
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

let toastTimer = null;
function toast(msg, duration = 2000, kind = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('toast-error', kind === 'error');
  t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), duration);
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
