// ============================================================
// ROUTER
// ============================================================
let currentView = 'reviews';
let viewState = {};
let pendingOverviewSearchSelection = null;
let pendingMeetingSearchSelection = null;
let pendingPlanungSearchSelection = null;
let pendingNotesSearchSelection = null;
let sudoMode = false;

function isSudoMode() {
  return sudoMode;
}

function toggleSudoMode() {
  sudoMode = !sudoMode;
  toast(`sudo ${sudoMode ? 'on' : 'off'}`);
  render();
}

function sudoLockedPlaceholder(label = 'Interner Bereich') {
  return `
    <div class="sudo-locked-placeholder" aria-label="${esc(label)} gesperrt">
      <div class="sudo-locked-scrim" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <div class="sudo-locked-message">
        <strong>${esc(label)}</strong>
        <span>Sudo Mode mit Cmd/Ctrl+Shift+S aktivieren</span>
      </div>
    </div>
  `;
}

function navigate(view, state = {}) {
  const previousView = currentView;
  const preserveMeetingState = previousView.startsWith('meetings') && view.startsWith('meetings');
  currentView = view;
  viewState = preserveMeetingState
    ? {
        meetingQuery: viewState.meetingQuery,
        meetingFilter: viewState.meetingFilter,
        meetingRange: viewState.meetingRange,
        ...state,
      }
    : state;
  resetScrollOnNextRender = true;
  render();
  document.querySelectorAll('#nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.view === (view.startsWith('kontakte') ? 'team' : view.split(':')[0]));
  });
}

document.getElementById('nav').addEventListener('click', e => {
  if (e.target.tagName === 'BUTTON') navigate(e.target.dataset.view);
});

// ============================================================
// RENDER
// ============================================================

// render() ersetzt das komplette #app-innerHTML. Ohne das hier verliert
// jeder Klick (Block aufklappen, draggen, filtern) die Scrollposition --
// die Seite und Container wie #planung-timeline springen nach oben.
// Beim Viewwechsel ist oben aber richtig, darum das Flag.
let resetScrollOnNextRender = false;

function scrollKeyOf(el) {
  if (el.id) return '#' + CSS.escape(el.id);
  const cls = Array.from(el.classList).map(c => '.' + CSS.escape(c)).join('');
  return cls ? el.tagName.toLowerCase() + cls : null;
}

function captureScrollState() {
  const snapshot = { window: window.scrollY, elements: [] };
  const seen = new Map();
  document.querySelectorAll('#app *').forEach(el => {
    const key = scrollKeyOf(el);
    if (!key) return;
    const index = seen.get(key) || 0;
    seen.set(key, index + 1);
    if (el.scrollTop || el.scrollLeft) {
      snapshot.elements.push({ key, index, top: el.scrollTop, left: el.scrollLeft });
    }
  });
  return snapshot;
}

function restoreScrollState(snapshot) {
  snapshot.elements.forEach(({ key, index, top, left }) => {
    const el = document.querySelectorAll('#app ' + key)[index];
    if (!el) return;
    el.scrollTop = top;
    el.scrollLeft = left;
  });
  window.scrollTo(0, snapshot.window);
}

function render() {
  const app = document.getElementById('app');
  const scrollState = resetScrollOnNextRender ? null : captureScrollState();
  resetScrollOnNextRender = false;
  app.dataset.view = currentView.split(':')[0];
  syncGlobalSearchInput();
  switch (currentView) {
    case 'overview': app.innerHTML = renderOverview(); break;
    case 'team': app.innerHTML = renderTeam(); break;
    case 'team:detail': app.innerHTML = renderTeam(); break;
    case 'kontakte': app.innerHTML = renderKontakte(); break;
    case 'kontakte:detail': app.innerHTML = renderKontaktDetail(); break;
    case 'meetings': app.innerHTML = renderMeetings(); setTimeout(initPrepBulletsAutoResize, 0); break;
    case 'meetings:detail': app.innerHTML = renderMeetings(); setTimeout(initPrepBulletsAutoResize, 0); break;
    case 'reviews': app.innerHTML = renderReviews(); break;
    case 'planung': app.innerHTML = renderPlanung(); break;
    case 'notizen': app.innerHTML = renderNotes(); setTimeout(initNotesView, 0); break;
    case 'search': app.innerHTML = renderSearch(); break;
    default: app.innerHTML = renderOverview();
  }
  if (scrollState) restoreScrollState(scrollState);
  else window.scrollTo(0, 0);
  restoreOverviewSearchFocus();
  restoreMeetingSearchFocus();
  restorePlanungSearchFocus();
  restoreNotesSearchFocus();
}
