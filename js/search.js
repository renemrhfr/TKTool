// ============================================================
// GLOBAL SEARCH
// ============================================================
function syncGlobalSearchInput() {
  const input = document.getElementById('globalSearchInput');
  if (!input) return;
  const nextValue = currentView === 'search' ? (viewState.query || '') : '';
  if (input.value !== nextValue) input.value = nextValue;
}

function handleGlobalSearchInput(value) {
  const query = value.trim();
  if (!query) {
    if (currentView === 'search') navigate('overview');
    return;
  }
  navigate('search', { query: value });
}

function handleGlobalSearchKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.currentTarget.value = '';
    if (currentView === 'search') navigate('overview');
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    submitGlobalSearch();
  }
}

function submitGlobalSearch() {
  const input = document.getElementById('globalSearchInput');
  if (!input) return;
  const query = input.value.trim();
  if (!query) {
    if (currentView === 'search') navigate('overview');
    return;
  }
  navigate('search', { query });
}

function restoreOverviewSearchFocus() {
  if (currentView !== 'overview' || !pendingOverviewSearchSelection) return;
  const input = document.getElementById('overviewSearchInput');
  if (!input) return;
  const { start, end } = pendingOverviewSearchSelection;
  input.focus();
  input.setSelectionRange(start ?? input.value.length, end ?? input.value.length);
  pendingOverviewSearchSelection = null;
}

function restoreMeetingSearchFocus() {
  if (!currentView.startsWith('meetings') || !pendingMeetingSearchSelection) return;
  const input = document.getElementById('meetingSearchInput');
  if (!input) return;
  const { start, end } = pendingMeetingSearchSelection;
  pendingMeetingSearchSelection = null;
  requestAnimationFrame(() => {
    const nextInput = document.getElementById('meetingSearchInput');
    if (!nextInput) return;
    nextInput.focus({ preventScroll: true });
    nextInput.setSelectionRange(start ?? nextInput.value.length, end ?? nextInput.value.length);
  });
}

