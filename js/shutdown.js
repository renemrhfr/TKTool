// ============================================================
// TAGESABSCHLUSS
// ============================================================
// Abend-Ritual in drei Schritten: alles aus dem Kopf aufschreiben, jedem
// Gedanken einen Platz in den bestehenden Strukturen geben (Todo, 1:1-Punkt,
// Backlog) oder bewusst loslassen, dann Feierabend. Es gibt absichtlich keine
// eigene Inbox: ein Gedanke, der nur "morgen angezeigt" wird, waere noch eine
// Liste, die man abarbeiten muss.

const SHUTDOWN_DRAFT_KEY = 'tktool-shutdown-draft';
const SHUTDOWN_DONE_KEY = 'tktool-shutdown-done';
const SHUTDOWN_TIMER_SECONDS = 5 * 60;

const SHUTDOWN_PROMPTS = [
  'Was ist heute offen geblieben?',
  'Wem schuldest du noch eine Antwort?',
  'Was hat dich heute geärgert?',
  'Worüber wirst du heute Abend nachdenken?',
  'Wer im Team macht dir gerade Sorgen?',
  'Was hast du jemandem versprochen?',
];

const SHUTDOWN_ROUTES = [
  { key: 'todo', label: 'Todo', hint: 'Wird Todo, fällig am nächsten Arbeitstag' },
  { key: 'oneOnOne', label: '1:1', hint: 'Punkt fürs nächste 1:1' },
  { key: 'backlog', label: 'Backlog', hint: 'Ins Backlog, ohne Datum' },
  { key: 'drop', label: 'Loslassen', hint: 'Liegt nicht bei dir. Wird nirgends abgelegt.' },
];

// Zustand lebt nur im Speicher; der Entwurf aus Schritt 1 zusaetzlich im
// localStorage, damit ein Reload nicht alles Aufgeschriebene wegwirft.
let shutdownState = null;
let shutdownTimerTick = null;
let shutdownAutocomplete = null;

function isShutdownTime(date = new Date()) {
  return date.getHours() >= 12;
}

function shutdownDoneToday() {
  try { return localStorage.getItem(SHUTDOWN_DONE_KEY) === todayStr(); } catch { return false; }
}

function loadShutdownDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(SHUTDOWN_DRAFT_KEY) || 'null');
    return saved && saved.date === todayStr() ? saved.text || '' : '';
  } catch {
    return '';
  }
}

function saveShutdownDraft(text) {
  try {
    if (text.trim()) localStorage.setItem(SHUTDOWN_DRAFT_KEY, JSON.stringify({ date: todayStr(), text }));
    else localStorage.removeItem(SHUTDOWN_DRAFT_KEY);
  } catch {}
}

function getShutdownState() {
  const today = todayStr();
  if (!shutdownState || shutdownState.date !== today) {
    shutdownState = {
      date: today,
      step: shutdownDoneToday() ? 4 : 1,
      text: loadShutdownDraft(),
      thoughts: [],
      rollover: {},
      good: '',
      timerStart: null,
      result: null,
    };
  }
  return shutdownState;
}

function shutdownNextWorkday(today = todayStr()) {
  let d = addDays(parseISO(today), 1);
  while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
  return toISO(d);
}

function shutdownTeam() {
  return data.persons.filter(p => p.type !== 'kontakt');
}

// Reihenfolge: exakter Vorname (oder ganzer Name ohne Leerzeichen, so fuegt
// die Vervollstaendigung doppelte Vornamen ein), Vorname beginnt mit,
// Nachname beginnt mit. Nur Team, keine Kontakte.
function matchTeamPersons(query) {
  const q = query.toLowerCase();
  const rank = person => {
    const name = person.name.toLowerCase();
    const [first, ...rest] = name.split(/\s+/);
    if (first === q || name.replace(/\s+/g, '') === q) return 0;
    if (first.startsWith(q)) return 1;
    if (rest.some(part => part.startsWith(q))) return 2;
    return -1;
  };
  return shutdownTeam()
    .map(person => ({ person, r: rank(person) }))
    .filter(entry => entry.r >= 0)
    .sort((a, b) => a.r - b.r || comparePersonsByName(a.person, b.person))
    .map(entry => entry.person);
}

function mentionedPerson(text) {
  const match = text.match(/(?:^|[\s(])@([A-Za-zÄÖÜäöüß-]+)/);
  return match ? matchTeamPersons(match[1])[0] || null : null;
}

// Das 1:1 von heute ist abends vorbei: ein Punkt gehoert ins naechste.
function shutdownOneOnOneTarget(personId) {
  const today = todayStr();
  return data.meetings
    .filter(m => m.type === 'oneOnOne' && m.personId === personId && m.date && m.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
    || personUnscheduledOneOnOne(personId);
}

function shutdownOpenTodos() {
  const today = todayStr();
  return data.items
    .filter(i => i.type === 'todo' && i.status !== 'done' && i.status !== 'backlog' && i.date && i.date <= today)
    .sort(compareByDueDate);
}

// Zuordnung ueber die urspruengliche Zeile: wer in Schritt 2 umformuliert und
// nochmal zurueck in Schritt 1 geht, behaelt Formulierung und Ziel.
function parseShutdownThoughts(state) {
  const previous = new Map(state.thoughts.map(t => [t.source, t]));
  state.thoughts = state.text
    .split('\n')
    .map(line => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
    .map(text => {
      if (previous.has(text)) return previous.get(text);
      const person = mentionedPerson(text);
      return { id: uid(), source: text, text, personId: person ? person.id : '', route: person ? 'oneOnOne' : 'todo' };
    });
}

// ---------- Darstellung ----------

function renderShutdownStepper() {
  const state = getShutdownState();
  if (state.step > 3) return '';
  const steps = ['Auskippen', 'Ablegen', 'Feierabend'];
  return `<ol class="shutdown-stepper">${steps.map((label, i) => {
    const cls = state.step === i + 1 ? 'is-current' : state.step > i + 1 ? 'is-done' : '';
    return `<li class="${cls}"><span>${i + 1}</span>${label}</li>`;
  }).join('')}</ol>`;
}

function renderShutdown() {
  const state = getShutdownState();
  if (state.step === 2) return renderShutdownSort(state);
  if (state.step === 3) return renderShutdownClose(state);
  if (state.step === 4) return renderShutdownDone(state);
  return renderShutdownDump(state);
}

function renderShutdownDump(state) {
  const open = shutdownOpenTodos();
  const meetings = data.meetings.filter(m => m.date === todayStr());
  return `
    <div class="shutdown-layout">
      <section class="card shutdown-dump">
        <div class="shutdown-dump-head">
          <div>
            <div class="card-title">Alles raus, was im Kopf ist</div>
            <div class="shutdown-sub">Eine Zeile pro Gedanke. Nicht ordnen, nicht formulieren, nicht bewerten.</div>
          </div>
          <div class="shutdown-timer" id="shutdownTimer" title="Richtwert, kein Zwang"></div>
        </div>
        <div class="shutdown-text-wrap">
          <textarea id="shutdownText" class="shutdown-textarea" spellcheck="false" placeholder="z. B.&#10;Release Freitag, reicht die Testabdeckung?&#10;@David Budget Kurs nachfragen (tippe @ für Vorschläge)&#10;Hab Lena noch kein Feedback gegeben">${esc(state.text)}</textarea>
          <div class="mention-ac" id="shutdownAc" hidden></div>
        </div>
        <div class="shutdown-foot">
          <span class="shutdown-count" id="shutdownCount"></span>
          <span class="shutdown-spacer"></span>
          <kbd class="shutdown-kbd">Ctrl ↵</kbd>
          <button class="btn btn-primary" type="button" onclick="goShutdownStep(2)">Weiter: ablegen</button>
        </div>
      </section>
      <aside class="shutdown-side">
        <section class="card">
          <div class="card-header"><span class="card-title">Falls es stockt</span></div>
          <ul class="shutdown-prompts">${SHUTDOWN_PROMPTS.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        </section>
        <section class="card">
          <div class="card-header"><span class="card-title">Dein Tag in TKTool</span></div>
          <ul class="shutdown-facts">
            <li><strong>${meetings.length}</strong> ${meetings.length === 1 ? 'Meeting' : 'Meetings'} heute${meetings.length ? `<span>${meetings.slice(0, 4).map(m => esc(meetingTitleText(m))).join(', ')}</span>` : ''}</li>
            <li><strong>${open.length}</strong> offene Todos fällig bis heute${open.length ? '<span>kommen im nächsten Schritt dran</span>' : ''}</li>
          </ul>
        </section>
      </aside>
    </div>`;
}

function renderShutdownSort(state) {
  const nextDay = shutdownNextWorkday();
  const weekday = parseISO(nextDay).toLocaleDateString('de-AT', { weekday: 'long' });
  const team = shutdownTeam().slice().sort(comparePersonsByName);
  const thoughtRows = state.thoughts.map(t => {
    const person = t.personId ? data.persons.find(p => p.id === t.personId) : null;
    const target = person ? shutdownOneOnOneTarget(person.id) : null;
    const routeButtons = SHUTDOWN_ROUTES.map(r =>
      `<button type="button" class="shutdown-route${t.route === r.key ? ' is-on' : ''}" title="${esc(r.hint)}" onclick="setShutdownRoute('${t.id}','${r.key}')">${r.label}</button>`).join('');
    let extra = '';
    if (t.route === 'oneOnOne') {
      extra = `
        <div class="shutdown-row-extra">
          mit <select onchange="setShutdownPerson('${t.id}', this.value)">
            <option value="">Person wählen…</option>
            ${team.map(p => `<option value="${p.id}"${p.id === t.personId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
          ${person ? `<span>${target && target.date ? `nächstes 1:1 am ${formatDateShort(target.date)}` : '1:1 noch ohne Datum'}</span>` : ''}
        </div>`;
    } else if (t.route === 'todo') {
      const mention = mentionedPerson(t.text) || mentionedPerson(t.source);
      extra = `<div class="shutdown-row-extra">fällig ${formatDateShort(nextDay)}${mention ? ` · @${esc(mention.name)}` : ''}</div>`;
    }
    return `
      <li class="shutdown-row shutdown-route-${t.route}">
        <input class="shutdown-row-input" value="${esc(t.text)}" title="Zum Umformulieren klicken" aria-label="Gedanke umformulieren" oninput="setShutdownText('${t.id}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();focusNextShutdownRow(this)}">
        <div class="shutdown-routes">${routeButtons}</div>
        ${extra}
      </li>`;
  }).join('');

  const open = shutdownOpenTodos();
  const rolloverRows = open.map(item => {
    const choice = state.rollover[item.id] || 'keep';
    const person = item.personId ? data.persons.find(p => p.id === item.personId) : null;
    const opt = (key, label) =>
      `<button type="button" class="shutdown-route${choice === key ? ' is-on' : ''}" onclick="setShutdownRollover('${item.id}','${key}')">${label}</button>`;
    return `
      <li class="shutdown-row shutdown-rollover-${choice}">
        <div class="shutdown-row-text">
          ${esc(item.text)}
          <div class="shutdown-row-meta">${item.date < todayStr() ? `<span class="shutdown-danger">fällig ${formatDateShort(item.date)}</span>` : 'heute fällig'}${person ? ` · @${esc(person.name)}` : ''}</div>
        </div>
        <div class="shutdown-routes">${opt('done', 'Erledigt')}${opt('tomorrow', 'Auf ' + esc(weekday))}${opt('keep', 'Bleibt')}</div>
      </li>`;
  }).join('');

  return `
    <div class="shutdown-layout shutdown-layout-single">
      <section class="card">
        <div class="card-header">
          <span class="card-title">Jedem Gedanken einen Platz geben</span>
          <span class="search-summary">${state.thoughts.length} ${state.thoughts.length === 1 ? 'Gedanke' : 'Gedanken'}</span>
        </div>
        <div class="shutdown-sub shutdown-sub-pad">Voreingestellt ist <strong>Todo für ${esc(weekday)}</strong>, mit @Name ein Punkt fürs 1:1. Nur umklicken, wenn es nicht passt. Den Text kannst du direkt umformulieren.</div>
        ${state.thoughts.length ? `<ul class="shutdown-list">${thoughtRows}</ul>` : '<div class="week-empty">Nichts aufgeschrieben. Auch gut.</div>'}
      </section>
      ${open.length ? `
      <section class="card">
        <div class="card-header">
          <span class="card-title">Heute liegen geblieben</span>
          <span class="search-summary">${open.length} ${open.length === 1 ? 'Todo' : 'Todos'}</span>
        </div>
        <div class="shutdown-sub shutdown-sub-pad">Offene Todos mit Fälligkeit bis heute. Was bleibt, bleibt überfällig.</div>
        <ul class="shutdown-list">${rolloverRows}</ul>
      </section>` : ''}
      <div class="shutdown-actions">
        <button class="btn btn-secondary" type="button" onclick="goShutdownStep(1)">Zurück</button>
        <span class="shutdown-spacer"></span>
        <button class="btn btn-primary" type="button" onclick="goShutdownStep(3)">Weiter</button>
      </div>
    </div>`;
}

function shutdownGoodHint(text) {
  const person = mentionedPerson(text);
  if (!text.trim()) return 'Wird ein Win wie mit Ctrl K → Win. Mit @Name wird es ein Highlight im Journal dieser Person.';
  return person
    ? `Wird <strong>Highlight</strong> im Journal von ${esc(person.name)}`
    : 'Wird <strong>Win</strong> und taucht im Wochenabschluss auf';
}

function renderShutdownClose(state) {
  const count = key => state.thoughts.filter(t => t.route === key).length;
  const rollover = Object.values(state.rollover);
  const moved = rollover.filter(v => v === 'tomorrow').length;
  const done = rollover.filter(v => v === 'done').length;
  const nextDay = shutdownNextWorkday();
  const weekday = parseISO(nextDay).toLocaleDateString('de-AT', { weekday: 'long' });
  const nextMeetings = data.meetings
    .filter(m => m.date === nextDay)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const nextTodos = data.items.filter(i => i.type === 'todo' && i.status !== 'done' && i.status !== 'backlog' && i.date === nextDay).length
    + count('todo') + moved;
  const line = (n, singular, plural) => n ? `<li><strong>${n}</strong> ${n === 1 ? singular : plural}</li>` : '';
  const nothing = !state.thoughts.length && !moved && !done;
  return `
    <div class="shutdown-layout shutdown-layout-single">
      <section class="card">
        <div class="card-header"><span class="card-title">Abgelegt</span></div>
        <ul class="shutdown-summary">
          ${line(count('todo'), 'neues Todo', 'neue Todos')}
          ${line(count('oneOnOne'), 'Punkt fürs 1:1', 'Punkte fürs 1:1')}
          ${line(count('backlog'), 'Gedanke ins Backlog', 'Gedanken ins Backlog')}
          ${line(moved, `Todo auf ${weekday} verschoben`, `Todos auf ${weekday} verschoben`)}
          ${line(done, 'Todo erledigt', 'Todos erledigt')}
          ${line(count('drop'), 'losgelassen', 'losgelassen')}
          ${nothing ? '<li>Nichts offen.</li>' : ''}
        </ul>
      </section>
      <section class="card">
        <div class="card-header"><span class="card-title">${esc(weekday)} wartet</span></div>
        <ul class="shutdown-summary">
          <li><strong>${nextMeetings.length}</strong> ${nextMeetings.length === 1 ? 'Meeting' : 'Meetings'}${nextMeetings[0] ? `, das erste: ${esc(meetingTitleText(nextMeetings[0]))}${nextMeetings[0].time ? ` um ${esc(nextMeetings[0].time)}` : ''}` : ''}</li>
          <li><strong>${nextTodos}</strong> ${nextTodos === 1 ? 'Todo fällig' : 'Todos fällig'}</li>
        </ul>
        <div class="shutdown-sub">Das steht alles im Tool. Du musst es dir nicht merken.</div>
      </section>
      <section class="card">
        <div class="card-header"><span class="card-title">Ein Satz: was lief heute gut?</span><span class="search-summary">optional</span></div>
        <input id="shutdownGood" class="shutdown-input" placeholder="z. B. Release ohne Hotfix raus, oder: @David hat den Rollout allein durchgezogen" value="${esc(state.good)}">
        <div class="shutdown-hint" id="shutdownGoodHint">${shutdownGoodHint(state.good)}</div>
      </section>
      <div class="shutdown-actions">
        <button class="btn btn-secondary" type="button" onclick="goShutdownStep(2)">Zurück</button>
        <span class="shutdown-spacer"></span>
        <button class="btn btn-primary" type="button" onclick="finishShutdown()">Tag abschließen</button>
      </div>
    </div>`;
}

function renderShutdownDone(state) {
  const result = state.result;
  return `
    <div class="shutdown-done">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      <h2>Feierabend.</h2>
      <p>Es steht alles in deinen Todos und 1:1s, nicht mehr in deinem Kopf.<br>Fällt dir heute Abend noch was ein: <strong>Ctrl K</strong>, aufschreiben, weg damit.</p>
      ${result ? `<div class="shutdown-sub">Abgeschlossen um ${esc(result.at)}</div>` : '<div class="shutdown-sub">Heute schon abgeschlossen.</div>'}
      <div class="shutdown-actions">
        <button class="btn btn-secondary" type="button" onclick="navigate('overview')">Aufgaben ansehen</button>
        ${result && result.meetingId ? `<button class="btn btn-secondary" type="button" onclick="navigate('meetings:detail',{meetingId:'${result.meetingId}'})">1:1-Punkte ansehen</button>` : ''}
        <button class="btn btn-secondary" type="button" onclick="restartShutdown()">Noch was eingefallen</button>
      </div>
    </div>`;
}

// ---------- Interaktion ----------

function goShutdownStep(step) {
  const state = getShutdownState();
  if (state.step === 1) parseShutdownThoughts(state);
  state.step = step;
  resetScrollOnNextRender = true;
  render();
}

function setShutdownRoute(id, route) {
  const thought = getShutdownState().thoughts.find(t => t.id === id);
  if (!thought) return;
  thought.route = route;
  if (route === 'oneOnOne' && !thought.personId) {
    const person = mentionedPerson(thought.text);
    if (person) thought.personId = person.id;
  }
  render();
}

// Ohne render(): der Fokus bliebe sonst nicht im Feld.
function setShutdownText(id, text) {
  const thought = getShutdownState().thoughts.find(t => t.id === id);
  if (thought) thought.text = text;
}

function focusNextShutdownRow(input) {
  const inputs = [...document.querySelectorAll('.shutdown-row-input')];
  const next = inputs[inputs.indexOf(input) + 1];
  if (next) next.focus();
  else input.blur();
}

function setShutdownPerson(id, personId) {
  const thought = getShutdownState().thoughts.find(t => t.id === id);
  if (thought) thought.personId = personId;
  render();
}

function setShutdownRollover(id, choice) {
  getShutdownState().rollover[id] = choice;
  render();
}

function restartShutdown() {
  try { localStorage.removeItem(SHUTDOWN_DONE_KEY); } catch {}
  shutdownState = null;
  render();
}

function finishShutdown() {
  const state = getShutdownState();
  const unassigned = state.thoughts.filter(t => t.route === 'oneOnOne' && !t.personId);
  if (unassigned.length) {
    toast('Für jeden 1:1-Punkt eine Person wählen');
    return;
  }
  const today = todayStr();
  const nextDay = shutdownNextWorkday(today);
  const newItem = fields => ({
    id: uid(), type: 'todo', status: 'todo', text: '', personId: null, meetingId: null,
    date: '', month: today.slice(0, 7), notes: null, ...fields,
  });
  let meetingId = '';

  state.thoughts.forEach(t => {
    // Leer umformuliert heisst nicht "weg": dann gilt die Zeile aus Schritt 1.
    // Die Person bleibt auch, wenn das @Name beim Umformulieren rausfliegt.
    const text = t.text.trim() || t.source;
    const mention = mentionedPerson(text) || mentionedPerson(t.source);
    if (t.route === 'todo') {
      data.items.push(newItem({ text, personId: mention ? mention.id : null, date: nextDay, month: nextDay.slice(0, 7) }));
    } else if (t.route === 'backlog') {
      data.items.push(newItem({ text, status: 'backlog', personId: mention ? mention.id : null }));
    } else if (t.route === 'oneOnOne') {
      let meeting = shutdownOneOnOneTarget(t.personId);
      if (!meeting) {
        meeting = {
          id: uid(), type: 'oneOnOne', title: '', date: '', personId: t.personId,
          participants: [], isTeamMeeting: false, prep: '', notes: '',
        };
        data.meetings.push(meeting);
      }
      // Wie bei "Punkt fuers 1:1": das Datum steht im Punkt selbst.
      meeting.prep = serializePrepBullets([...parsePrepBullets(meeting.prep), { text: `${text} (notiert ${formatDateShort(today)})`, done: false }]);
      meetingId = meeting.id;
    }
  });

  Object.entries(state.rollover).forEach(([id, choice]) => {
    const item = data.items.find(i => i.id === id);
    if (!item) return;
    if (choice === 'done') item.status = 'done';
    if (choice === 'tomorrow') {
      item.date = nextDay;
      item.month = nextDay.slice(0, 7);
    }
  });

  const good = state.good.trim();
  if (good) {
    const person = mentionedPerson(good);
    data.items.push(person
      ? newItem({ type: 'highlight', status: 'done', text: good, personId: person.id, date: today })
      : newItem({ type: 'win', status: 'done', text: good, date: today }));
  }

  saveData(data);
  saveShutdownDraft('');
  try { localStorage.setItem(SHUTDOWN_DONE_KEY, today); } catch {}
  state.result = { at: new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }), meetingId };
  state.step = 4;
  resetScrollOnNextRender = true;
  render();
}

function updateShutdownTimer() {
  const el = document.getElementById('shutdownTimer');
  if (!el) {
    clearInterval(shutdownTimerTick);
    shutdownTimerTick = null;
    return;
  }
  const state = getShutdownState();
  const elapsed = state.timerStart ? Math.floor((Date.now() - state.timerStart) / 1000) : 0;
  const left = Math.max(0, SHUTDOWN_TIMER_SECONDS - elapsed);
  el.textContent = left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Zeit um. Was noch kommt, darf noch rein.';
  el.classList.toggle('is-running', !!state.timerStart && left > 0);
  el.classList.toggle('is-over', left === 0);
}

function initShutdownView() {
  const state = getShutdownState();
  const textarea = document.getElementById('shutdownText');
  if (textarea) {
    const updateCount = () => {
      const n = textarea.value.split('\n').filter(line => line.trim()).length;
      document.getElementById('shutdownCount').textContent = n ? `${n} ${n === 1 ? 'Gedanke' : 'Gedanken'}` : '';
    };
    textarea.addEventListener('input', () => {
      state.text = textarea.value;
      if (!state.timerStart && state.text.trim()) state.timerStart = Date.now();
      saveShutdownDraft(state.text);
      updateCount();
    });
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        goShutdownStep(2);
      }
    });
    attachMentionAutocomplete(textarea, document.getElementById('shutdownAc'));
    updateCount();
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }
  const good = document.getElementById('shutdownGood');
  if (good) {
    good.addEventListener('input', () => {
      state.good = good.value;
      document.getElementById('shutdownGoodHint').innerHTML = shutdownGoodHint(good.value);
    });
    good.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        finishShutdown();
      }
    });
  }
  if (!shutdownTimerTick) shutdownTimerTick = setInterval(updateShutdownTimer, 500);
  updateShutdownTimer();
}

// ---------- @-Vorschlaege ----------
// Allgemein gehalten: haengt an jedes Textfeld mit einem Popup-Element im
// selben positionierten Container.

function textCaretOffset(field, pos) {
  const mirror = document.createElement('div');
  const style = getComputedStyle(field);
  ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft',
    'paddingRight', 'borderTopWidth', 'borderLeftWidth', 'boxSizing'].forEach(k => { mirror.style[k] = style[k]; });
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.width = field.offsetWidth + 'px';
  mirror.textContent = field.value.slice(0, pos);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
  const offset = { left: field.offsetLeft + marker.offsetLeft, top: field.offsetTop + marker.offsetTop + lineHeight - field.scrollTop };
  mirror.remove();
  return offset;
}

function attachMentionAutocomplete(field, popup) {
  const close = () => {
    shutdownAutocomplete = null;
    popup.hidden = true;
  };
  const pick = index => {
    const ac = shutdownAutocomplete;
    if (!ac) return;
    const person = ac.list[index];
    const first = person.name.split(/\s+/)[0];
    // Vorname reicht, ausser er ist im Team doppelt vergeben.
    const label = shutdownTeam().filter(p => p.name.split(/\s+/)[0] === first).length > 1
      ? person.name.replace(/\s+/g, '')
      : first;
    const before = field.value.slice(0, ac.start);
    const after = field.value.slice(field.selectionStart);
    field.value = `${before}@${label} ${after.replace(/^\s+/, '')}`;
    const caret = before.length + label.length + 2;
    field.setSelectionRange(caret, caret);
    close();
    field.dispatchEvent(new Event('input'));
  };
  const update = () => {
    const pos = field.selectionStart;
    const match = field.value.slice(0, pos).match(/(^|[\s(])@([A-Za-zÄÖÜäöüß-]*)$/);
    if (!match) return close();
    const query = match[2];
    const list = (query ? matchTeamPersons(query) : shutdownTeam().slice().sort(comparePersonsByName)).slice(0, 6);
    if (!list.length) return close();
    const keep = shutdownAutocomplete && shutdownAutocomplete.query === query ? shutdownAutocomplete.index : 0;
    shutdownAutocomplete = { start: pos - query.length - 1, query, list, index: Math.min(keep, list.length - 1), pick };
    const offset = textCaretOffset(field, shutdownAutocomplete.start);
    popup.style.left = Math.max(0, Math.min(offset.left, field.offsetLeft + field.offsetWidth - 280)) + 'px';
    popup.style.top = (offset.top + 4) + 'px';
    popup.innerHTML = list.map((person, i) => {
      const next = shutdownOneOnOneTarget(person.id);
      return `<button type="button" class="mention-ac-item${i === shutdownAutocomplete.index ? ' is-on' : ''}" data-index="${i}">
        ${personAvatar(person, 'sm')}<span>${esc(person.name)}</span>${next && next.date ? `<span class="mention-ac-meta">1:1 ${formatDateShort(next.date)}</span>` : ''}
      </button>`;
    }).join('') + '<div class="mention-ac-foot">↑↓ wählen · Tab/Enter übernehmen · Esc</div>';
    popup.hidden = false;
  };

  popup.addEventListener('mousedown', e => {
    const item = e.target.closest('.mention-ac-item');
    if (!item) return;
    e.preventDefault();
    pick(Number(item.dataset.index));
  });
  field.addEventListener('keydown', e => {
    const ac = shutdownAutocomplete;
    if (!ac || popup.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      ac.index = (ac.index + (e.key === 'ArrowDown' ? 1 : -1) + ac.list.length) % ac.list.length;
      update();
    } else if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      pick(ac.index);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });
  field.addEventListener('input', update);
  field.addEventListener('click', update);
  field.addEventListener('blur', close);
}
