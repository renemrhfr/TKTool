// ============================================================
// NOTES
// ============================================================
const noteSaveTimers = {};

function formatNoteUpdatedAt(value) {
  const date = String(value || '').slice(0, 10);
  return date ? formatDate(date) : '';
}

function noteMatches(note, query) {
  if (!query) return true;
  return [note.title, note.text].some(value => includesQuery(value, query));
}

function renderNotes() {
  const rawQuery = viewState.notesQuery || '';
  const query = rawQuery.trim().toLocaleLowerCase('de-AT');
  const allNotes = (data.notes || []).slice().sort((a, b) =>
    (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
  );
  const notes = allNotes.filter(note => noteMatches(note, query));

  return `
    <div class="section-header notes-page-head">
      <div class="overview-toolbar">
        <span class="section-title">Notizen</span>
        <div class="view-search">
          <input id="notesSearchInput" type="search" placeholder="grep: titel, inhalt..."
            value="${esc(rawQuery)}" oninput="setNotesQuery(this.value)">
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openNoteForm()">+ Notiz</button>
    </div>
    <p class="notes-page-intro">Langfristige Pläne, Beobachtungen und Dokumentationen, die keinem einzelnen Todo oder Meeting gehören.</p>

    ${notes.length ? `
      <div class="notes-grid">
        ${notes.map(note => renderNoteCard(note)).join('')}
      </div>
    ` : `
      <div class="empty-state">
        <div class="empty-state-text">${query ? 'Keine passenden Notizen' : 'Noch keine Notizen'}</div>
      </div>
    `}
  `;
}

function renderNoteCard(note) {
  return `
    <article class="note-card ${viewState.focusNoteId === note.id ? 'is-focused' : ''}" id="note-${note.id}">
      <div class="note-toolbar">
        <input class="note-title" value="${esc(note.title || '')}"
          aria-label="Titel der Notiz"
          oninput="updateNoteDebounced('${note.id}','title',this.value)"
          onchange="saveNoteField('${note.id}','title',this.value)">
        <button class="btn btn-sm btn-secondary" onclick="deleteNote('${note.id}')">löschen</button>
      </div>
      <textarea class="form-textarea note-editor"
        placeholder="Beobachtungen, Daten, Vorkommnisse, nächste Schritte..."
        oninput="updateNoteDebounced('${note.id}','text',this.value)"
        onchange="saveNoteField('${note.id}','text',this.value)">${esc(note.text || '')}</textarea>
      <div class="note-meta">zuletzt geändert ${formatNoteUpdatedAt(note.updatedAt) || '—'}</div>
    </article>
  `;
}

function openNoteForm() {
  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Neue Notiz</span>
      <button class="modal-close" onclick="closeOverlay()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Titel</label>
        <input class="form-input" id="newNoteTitle" placeholder="Titel der Notiz" autofocus
          onkeydown="if(event.key==='Enter'){createNote()}">
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="createNote()">Notiz anlegen</button>
    </div>
  `;
  openOverlay();
}

function createNote() {
  const title = document.getElementById('newNoteTitle')?.value.trim();
  if (!title) { toast('Titel nötig'); return; }
  const timestamp = new Date().toISOString();
  const note = { id: uid(), title, text: '', createdAt: timestamp, updatedAt: timestamp };
  data.notes.push(note);
  saveData(data);
  closeOverlay();
  navigate('notizen', { focusNoteId: note.id });
}

function setNotesQuery(value) {
  const input = document.getElementById('notesSearchInput');
  pendingNotesSearchSelection = input
    ? { start: input.selectionStart, end: input.selectionEnd }
    : { start: value.length, end: value.length };
  viewState.notesQuery = value;
  render();
}

function restoreNotesSearchFocus() {
  if (currentView !== 'notizen' || !pendingNotesSearchSelection) return;
  const input = document.getElementById('notesSearchInput');
  if (!input) return;
  const selection = pendingNotesSearchSelection;
  pendingNotesSearchSelection = null;
  input.focus({ preventScroll: true });
  input.setSelectionRange(selection.start ?? input.value.length, selection.end ?? input.value.length);
}

function updateNoteDebounced(id, field, value) {
  const note = data.notes.find(entry => entry.id === id);
  if (!note) return;
  note[field] = value;
  note.updatedAt = new Date().toISOString();
  clearTimeout(noteSaveTimers[id]);
  noteSaveTimers[id] = setTimeout(() => saveData(data), 300);
}

function saveNoteField(id, field, value) {
  const note = data.notes.find(entry => entry.id === id);
  if (!note) return;
  note[field] = value;
  note.updatedAt = new Date().toISOString();
  clearTimeout(noteSaveTimers[id]);
  saveData(data);
}

function deleteNote(id) {
  const note = data.notes.find(entry => entry.id === id);
  if (!note || !confirm(`Notiz „${note.title || 'Unbenannt'}“ löschen?`)) return;
  clearTimeout(noteSaveTimers[id]);
  data.notes = data.notes.filter(entry => entry.id !== id);
  saveData(data);
  render();
}

function initNotesView() {
  const id = viewState.focusNoteId;
  if (!id) return;
  const card = document.getElementById(`note-${id}`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.querySelector('.note-editor')?.focus({ preventScroll: true });
  viewState.focusNoteId = null;
}
