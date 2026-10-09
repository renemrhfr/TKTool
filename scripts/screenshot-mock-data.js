// Erzeugt erfundene Daten fuer Screenshots: tktool-data.json und
// jira-tickets.json, relativ zu einem festen "heute" (TODAY). Personen,
// Tickets und Texte sind ausgedacht.
//
//   node scripts/screenshot-mock-data.js [zielordner]
//
// buildMockData(TODAY) laeuft auch im Browser: die Demo (scripts/build-demo.js)
// bettet die Funktion ein und erzeugt die Daten relativ zum echten Heute.
function buildMockData(TODAY) {
  const iso = d => d.toISOString().slice(0, 10);
  const base = new Date(TODAY + 'T12:00:00Z');
  const day = n => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const isWeekend = s => { const w = new Date(s + 'T12:00:00Z').getUTCDay(); return w === 0 || w === 6; };
  // n-ter Werktag ab heute (0 = heute bzw. naechster Werktag)
  const wd = n => {
    let d = 0, left = Math.abs(n), step = n < 0 ? -1 : 1;
    while (isWeekend(day(d))) d += step;
    while (left > 0) { d += step; if (!isWeekend(day(d))) left--; }
    return day(d);
  };
  const month = s => s.slice(0, 7);
  let seq = 0;
  const id = p => `${p}${(++seq).toString(36).padStart(4, '0')}`;

  // --- Personen -------------------------------------------------------
  const team = [
    ['lena', 'Lena Hofer', 'Architektur-Ownership für die Schaden-API übernehmen'],
    ['jonas', 'Jonas Berger', 'Mehr Sichtbarkeit: Ergebnisse selbst im Review präsentieren'],
    ['miriam', 'Miriam Novak', 'Vom Umsetzen zum Zerlegen: Stories selbst schneiden'],
    ['david', 'David Steiner', 'Testabdeckung im Tarifrechner als Thema treiben'],
    ['sophie', 'Sophie Wagner', 'Onboarding abschließen, erste eigene Stories end-to-end'],
    ['felix', 'Felix Gruber', 'Ops-Wissen ins Team tragen, Runbooks schreiben'],
  ];
  const persons = team.map(([key, name, push]) => ({
    id: 'p_' + key, name, type: 'team', pushDirection: push,
    jiraUrl: '', jiraAccountId: 'acc-' + key, gitlabMrUrl: '',
    supportMonate: [],
  }));
  const P = Object.fromEntries(persons.map(p => [p.id.slice(2), p.id]));
  persons.find(p => p.id === P.felix).supportMonate = [month(day(-20)), month(day(0)), month(day(95))];
  persons.find(p => p.id === P.david).supportMonate = [month(day(-50)), month(day(35))];
  persons.find(p => p.id === P.lena).supportMonate = [month(day(-80)), month(day(65))];
  persons.push(
    { id: 'p_andrea', name: 'Andrea Huber', type: 'kontakt', pushDirection: '' },
    { id: 'p_markus', name: 'Markus Lang', type: 'kontakt', pushDirection: '' },
  );

  // --- Jira ----------------------------------------------------------
  // Auftraege mit Subtasks; jeder Subtask gehoert einer Person.
  const auftraege = [
    ['POL-412', 'Schadensmeldung: Fotos direkt aus der App hochladen', [
      ['POL-418', 'Upload-Endpoint mit Virenscan', 'lena', 'In Arbeit'],
      ['POL-419', 'Thumbnails im Sachbearbeiter-Frontend', 'sophie', 'In Arbeit'],
      ['POL-420', 'Größenlimit und Fehlermeldungen', 'sophie', 'Offen'],
    ]],
    ['POL-388', 'Tarifrechner: neue Selbstbehaltsstufen 2027', [
      ['POL-391', 'Tarifmatrix aus Excel importieren', 'david', 'Code Review'],
      ['POL-392', 'Regressionstests gegen Tarif 2026', 'david', 'In Arbeit'],
    ]],
    ['POL-430', 'Kündigungsstrecke barrierefrei machen', [
      ['POL-431', 'Formular-Labels und Fokusreihenfolge', 'miriam', 'In Arbeit'],
      ['POL-432', 'Screenreader-Test mit NVDA', 'miriam', 'Offen'],
    ]],
    ['POL-401', 'Partnerportal: SSO über Azure AD', [
      ['POL-403', 'OIDC-Flow und Token-Refresh', 'jonas', 'In Arbeit'],
      ['POL-404', 'Rollen-Mapping aus AD-Gruppen', 'jonas', 'Offen'],
      ['POL-405', 'Logout über alle Tabs', 'jonas', 'Offen'],
    ]],
    ['POL-377', 'Polizzen-PDF: Rendering auf neuen Service umstellen', [
      ['POL-379', 'Templates migrieren', 'lena', 'QA'],
    ]],
    ['OPS-77', 'Monitoring: Alerts für Batch-Läufe nachziehen', [
      ['OPS-78', 'Dashboard für Nachtlauf', 'felix', 'In Arbeit'],
      ['OPS-79', 'Runbook: Wiederanlauf Inkasso-Batch', 'felix', 'Offen'],
    ]],
    ['POL-440', 'Vertragsübersicht: Filter nach Sparte', [
      ['POL-441', 'Backend-Query und Index', 'miriam', 'Offen'],
    ]],
    // Ohne Block in der Planung -> landet im Posteingang
    ['POL-445', 'Adressänderung: Validierung gegen Post-API', [
      ['POL-446', 'API-Client mit Retry', 'david', 'Offen'],
    ]],
    ['OPS-81', 'Zertifikatsrotation automatisieren', [
      ['OPS-82', 'Renewal-Job in der Pipeline', 'felix', 'Offen'],
    ]],
  ];
  const cat = s => (s === 'Offen' ? 'new' : 'indeterminate');
  const assignees = Object.fromEntries(team.map(([k]) => ['acc-' + k, []]));
  const refs = {};
  for (const [key, summary, subs] of auftraege) {
    for (const [skey, ssum, who, status] of subs) {
      assignees['acc-' + who].push({
        key: skey, summary: ssum, status, statusCategory: cat(status),
        priority: 'Medium', type: 'Sub-task', updated: day(-1) + 'T09:12:00.000+0200',
        parentKey: key, subtask: true, parentSummary: summary,
      });
    }
    const lead = subs[0][2];
    refs[key] = { status: 'In Arbeit', statusCategory: 'indeterminate', assignee: 'acc-' + lead,
      summary, parentKey: 'POL-300', subtask: false, parentSummary: '' };
  }
  // Direkt zugewiesene Tickets ohne Subtasks
  assignees['acc-jonas'].push({ key: 'POL-450', summary: 'Hotfix: Prämienrundung bei Ratenzahlung', status: 'In Arbeit',
    statusCategory: 'indeterminate', priority: 'High', type: 'Bug', updated: day(0) + 'T08:40:00.000+0200',
    parentKey: '', subtask: false, parentSummary: '' });
  refs['POL-450'] = { status: 'In Arbeit', statusCategory: 'indeterminate', assignee: 'acc-jonas',
    summary: 'Hotfix: Prämienrundung bei Ratenzahlung', parentKey: '', subtask: false, parentSummary: '' };
  // Erledigt
  refs['POL-360'] = { status: 'Erledigt', statusCategory: 'done', assignee: 'acc-miriam',
    summary: 'Zahlungsverzug: Mahnstufen im Kundenportal anzeigen', parentKey: '', subtask: false, parentSummary: '' };
  refs['POL-365'] = { status: 'Erledigt', statusCategory: 'done', assignee: 'acc-lena',
    summary: 'Schaden-API: Pagination für Belege', parentKey: '', subtask: false, parentSummary: '' };
  const resolved = [
    { key: 'POL-360', summary: 'Zahlungsverzug: Mahnstufen im Kundenportal anzeigen', accountId: 'acc-miriam', type: 'Story', resolvedAt: wd(-2) + 'T15:20:00.000+0200' },
    { key: 'POL-365', summary: 'Schaden-API: Pagination für Belege', accountId: 'acc-lena', type: 'Story', resolvedAt: wd(-1) + 'T11:05:00.000+0200' },
    { key: 'OPS-70', summary: 'Log-Retention auf 30 Tage', accountId: 'acc-felix', type: 'Task', resolvedAt: wd(-3) + 'T10:00:00.000+0200' },
  ];
  const jira = {
    generatedAt: day(0) + 'T06:15:00.000Z',
    source: 'https://jira.example.com',
    assignees, refs, resolved, truncated: false,
    changes: [
      { key: 'POL-391', summary: 'Tarifmatrix aus Excel importieren', from: 'In Arbeit', to: 'Code Review', kind: 'waiting' },
      { key: 'POL-365', summary: 'Schaden-API: Pagination für Belege', from: 'QA', to: 'Erledigt', kind: 'done' },
    ],
  };

  // --- Planung -------------------------------------------------------
  const blocks = [];
  const block = (who, ref, start, end, extra = {}) => blocks.push({
    id: id('b'), personId: P[who], typ: 'ticket', label: refs[ref]?.summary || ref, start, end, done: false,
    jiraRef: ref, jiraSummary: refs[ref]?.summary || null, notiz: null, ...extra,
  });
  const away = (who, label, start, end) => blocks.push({
    id: id('b'), personId: P[who], typ: 'abwesenheit', label, start, end, done: false,
    jiraRef: null, jiraSummary: null, notiz: null,
  });
  block('lena', 'POL-365', wd(-14), wd(-1), { done: true });
  block('lena', 'POL-412', wd(-3), wd(8), { updates: [
    { id: id('u'), date: wd(-1), text: 'Virenscan läuft, fehlt noch Quarantäne-Bucket', meetingId: null },
  ] });
  block('lena', 'POL-377', wd(9), wd(16));
  away('lena', 'Urlaub', wd(17), wd(21));
  block('sophie', 'POL-412', wd(-5), wd(6));
  block('david', 'POL-388', wd(-12), wd(-2), { blockedSince: wd(-3), updates: [
    { id: id('u'), date: wd(-3), text: 'hängt an finaler Tarifmatrix von Aktuariat', meetingId: null },
  ] });
  away('david', 'Fortbildung', wd(3), wd(4));
  block('miriam', 'POL-360', wd(-15), wd(-2), { done: true });
  block('miriam', 'POL-430', wd(-1), wd(9));
  block('miriam', 'POL-440', wd(10), wd(16));
  block('jonas', 'POL-401', wd(-8), wd(12));
  block('jonas', 'POL-450', wd(-1), wd(1));
  away('felix', 'Zeitausgleich', wd(1), wd(1));
  block('felix', 'OPS-77', wd(-6), wd(5));
  block('sophie', 'POL-430', wd(7), wd(14));
  away('sophie', 'Urlaub', wd(22), wd(26));

  const markers = [
    { id: id('m'), label: 'Release 26.4', date: wd(10), color: '#3b82f6' },
    { id: id('m'), label: 'Code Freeze', date: wd(7), color: '#ef4444' },
  ];

  // --- Items ---------------------------------------------------------
  const items = [];
  const item = (type, status, text, extra = {}) => {
    const date = extra.date ?? day(0);
    items.push({ id: id('i'), type, status, text, personId: null, meetingId: null,
      date, month: date ? month(date) : month(day(0)), notes: null, ...extra });
  };
  item('todo', 'todo', 'Kapazitätsplanung Q4 an Bereichsleitung schicken', { date: day(0) });
  item('todo', 'todo', 'Feedback zu Lenas Architektur-Proposal (Schaden-API v2)', { date: day(-1), personId: P.lena });
  item('todo', 'todo', 'Onboarding-Checkliste für Sophie aktualisieren', { date: day(3), personId: P.sophie });
  item('todo', 'todo', 'Recruiting: zwei Lebensläufe Backend sichten', { date: day(4) });
  item('todo', 'waiting', 'Freigabe Budget Fortbildung (Davids Kubernetes-Kurs)', { date: day(-9), personId: P.david, notes: 'liegt bei HR' });
  item('todo', 'waiting', 'Rückmeldung Aktuariat zur Tarifmatrix', { date: day(-4), personId: 'p_andrea' });
  item('todo', 'todo', 'Runbook-Review mit Felix', { date: day(5), personId: P.felix });
  item('todo', 'backlog', 'Team-Retro-Format mal umstellen (Sailboat?)', { date: '' });
  item('todo', 'backlog', 'Pairing-Rotation für Q1 überlegen', { date: '' });
  item('todo', 'done', 'Jahresgespräch-Termine fixieren', { date: day(-2) });
  item('todo', 'done', 'Release-Notes 26.3 abgenommen', { date: day(-3) });
  item('win', 'done', 'Schadensmeldung mobil: 30 % weniger Rückfragen im Callcenter', { date: day(-4) });
  item('win', 'done', 'Inkasso-Batch läuft seit drei Wochen ohne manuellen Eingriff', { date: day(-15) });

  const growth = [
    ['lena', 'highlight', 'Architektur-Review souverän moderiert, gute Trade-off-Diskussion', -3],
    ['lena', 'highlight', 'Pagination-Lösung sauber dokumentiert, von anderem Team übernommen', -11],
    ['jonas', 'highlight', 'Hotfix Prämienrundung schnell eingegrenzt', -1],
    ['jonas', 'concern', 'PR für SSO zu groß, Review hat drei Tage gedauert', -6],
    ['miriam', 'highlight', 'Mahnstufen-Story selbst in vier Teile geschnitten', -8],
    ['david', 'concern', 'Blocker zur Tarifmatrix erst im Standup erwähnt, nicht vorher eskaliert', -3],
    ['david', 'concern', 'Regressionstests wieder hinten angestellt', -16],
    ['david', 'concern', 'Schätzung um Faktor zwei daneben, ohne Bescheid zu geben', -24],
    ['sophie', 'highlight', 'Erste Story ohne Hilfe bis in Produktion gebracht', -5],
    ['felix', 'highlight', 'Nachtlauf-Alarm um 3 Uhr ruhig und sauber abgearbeitet', -13],
  ];
  for (const [who, type, text, d] of growth) item(type, 'done', text, { personId: P[who], date: day(d) });

  // --- Meetings ------------------------------------------------------
  const meetings = [];
  const meet = m => { const x = { id: id('mt'), title: '', personId: null, participants: [],
    isTeamMeeting: false, prep: '', notes: '', ...m }; meetings.push(x); return x; };
  const prevDavid = meet({ type: 'oneOnOne', date: day(-15), personId: P.david,
    notes: 'Will mehr Richtung Testautomatisierung. Kurs angefragt.\nWirkt gestresst wegen Tarif-Deadline.' });
  item('todo', 'todo', 'Teststrategie für Tarifrechner skizzieren', { date: day(-8), personId: P.david, meetingId: prevDavid.id });
  item('todo', 'todo', 'Klären, wer Tarif-Rückfragen an Aktuariat stellt', { date: day(-10), personId: P.david, meetingId: prevDavid.id });
  meet({ type: 'oneOnOne', date: day(0), personId: P.david,
    prep: '- Blocker Tarifmatrix: warum erst im Standup? (notiert 29.09.)\n- Kurs-Freigabe: Stand HR\n- [x] Feedback zu Schätzungen' });
  meet({ type: 'oneOnOne', date: day(3), personId: P.lena, prep: '- Architektur-Proposal Schaden-API v2\n- Urlaubsübergabe PDF-Service' });
  meet({ type: 'oneOnOne', date: day(-12), personId: P.lena, notes: 'Möchte Ownership für Schaden-API. Proposal bis Ende Monat.' });
  meet({ type: 'oneOnOne', date: day(6), personId: P.sophie, prep: '- Wie läuft das Pairing mit Lena?' });
  meet({ type: 'oneOnOne', date: day(-6), personId: P.jonas, notes: 'SSO-PR kleiner schneiden, Feature-Flag verwenden.' });
  meet({ type: 'oneOnOne', date: day(-20), personId: P.miriam, notes: 'Story-Schnitt klappt gut, nächster Schritt: Refinement moderieren.' });
  meet({ type: 'oneOnOne', date: day(-9), personId: P.felix, notes: 'Support-Monat läuft ruhig. Will Runbooks im Team verankern.' });
  meet({ type: 'oneOnOne', date: '', personId: P.felix, prep: '- Runbooks: wo sollen die liegen? (notiert 30.09.)' });
  const standup = meet({ type: 'meeting', title: 'Standup', date: day(0), isTeamMeeting: true, isStandup: true,
    participants: [P.lena, P.jonas, P.miriam, P.david, P.sophie],
    standup: { [P.sophie]: 'Pairing mit Lena am Upload' } });
  for (const b of blocks) {
    if (b.jiraRef === 'POL-412' && b.personId === P.lena) b.updates.push({ id: id('u'), date: day(0), text: 'Quarantäne-Bucket da, heute Integrationstest', meetingId: standup.id });
  }
  meet({ type: 'meeting', title: 'Refinement Schadensmeldung', date: day(-2), isTeamMeeting: true,
    participants: [P.lena, P.sophie, P.miriam, 'p_andrea'], notes: 'Größenlimit 20 MB, mehr braucht das Callcenter nicht.' });
  meet({ type: 'meeting', title: 'Abstimmung Release 26.4 mit Ops', date: wd(2), personId: null,
    participants: ['p_markus', P.felix], prep: '- Wartungsfenster\n- Rollback-Plan' });
  meet({ type: 'meeting', title: 'Team-Workshop: Teststrategie', date: day(7), isTeamMeeting: true,
    participants: [P.lena, P.jonas, P.miriam, P.david, P.sophie, P.felix] });

  // --- Sonstiges -----------------------------------------------------
  const focuses = [
    { id: id('f'), month: month(day(0)), title: 'Blocker früh sichtbar machen', description: 'Was hängt, wird am selben Tag gesagt, nicht im nächsten Standup.' },
  ];
  const notes = [
    { id: id('n'), title: 'Gedanken Teamschnitt 2027', text: 'Ops-Anteil wächst. Felix entlasten?', createdAt: day(-7), updatedAt: day(-2) },
  ];
  const dashboardLinks = [
    { id: id('l'), title: 'Jira Board', url: 'https://jira.example.com/board/12', kind: 'link', label: '' },
    { id: id('l'), title: 'GitLab MRs', url: 'https://gitlab.example.com/merge_requests', kind: 'link', label: '' },
    { id: id('l'), title: 'Confluence Team', url: 'https://wiki.example.com/team', kind: 'link', label: '' },
  ];
  const monthReviews = [
    { id: id('r'), month: month(day(-31)), summary: 'Mahnstufen live, Schadensmeldung angefangen. David überlastet, Thema fürs 1:1.', createdAt: day(-30), updatedAt: day(-30) },
  ];
  const settings = [
    { id: 'jira-status', excluded: ['Storniert'], seen: ['Offen', 'In Arbeit', 'Code Review', 'QA', 'Erledigt', 'Storniert'], handover: ['Code Review', 'QA'] },
  ];

  const store = { items, persons, meetings, notes, focuses, dashboardLinks, monthReviews, blocks, markers, settings };
  return { store, jira };
}

if (typeof module !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const TODAY = process.env.MOCK_TODAY || '2026-10-02';
  const outDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'mock-data'));
  const { store, jira } = buildMockData(TODAY);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'tktool-data.json'), JSON.stringify(store, null, 2));
  fs.writeFileSync(path.join(outDir, 'jira-tickets.json'), JSON.stringify(jira, null, 2));
  console.log(`Mock-Daten fuer ${TODAY} nach ${path.relative(process.cwd(), outDir) || '.'} geschrieben`);
}

if (typeof module !== 'undefined') module.exports = { buildMockData };
