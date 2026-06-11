// ============================================================
// ROUTER
// ============================================================
let currentView = 'reviews';
let viewState = {};
let pendingOverviewSearchSelection = null;
let pendingMeetingSearchSelection = null;
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
  render();
  document.querySelectorAll('#nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view.split(':')[0]);
  });
}

document.getElementById('nav').addEventListener('click', e => {
  if (e.target.tagName === 'BUTTON') navigate(e.target.dataset.view);
});

// ============================================================
// RENDER
// ============================================================
function render() {
  const app = document.getElementById('app');
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
    case 'search': app.innerHTML = renderSearch(); break;
    default: app.innerHTML = renderOverview();
  }
  restoreOverviewSearchFocus();
  restoreMeetingSearchFocus();
}

