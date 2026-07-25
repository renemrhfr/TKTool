// ============================================================
// GLOBAL SEARCH
// ============================================================
let globalSearchReturnTarget = null;

function syncGlobalSearchInput() {
  const input = document.getElementById('globalSearchInput');
  if (!input) return;
  const nextValue = currentView === 'search' ? (viewState.query || '') : '';
  if (input.value !== nextValue) input.value = nextValue;
}

function openGlobalSearch(query) {
  if (currentView !== 'search') {
    globalSearchReturnTarget = {
      view: currentView,
      state: { ...viewState },
    };
  }
  navigate('search', { query });
}

function closeGlobalSearch() {
  if (currentView !== 'search') return;
  const target = globalSearchReturnTarget;
  globalSearchReturnTarget = null;
  navigate(target?.view || 'overview', target?.state || {});
}

function handleGlobalSearchInput(value) {
  const query = value.trim();
  if (!query) {
    closeGlobalSearch();
    return;
  }
  openGlobalSearch(value);
}

function handleGlobalSearchKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.currentTarget.value = '';
    closeGlobalSearch();
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
    closeGlobalSearch();
    return;
  }
  openGlobalSearch(query);
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
