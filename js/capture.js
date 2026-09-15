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
