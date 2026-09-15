// test medium content
function deleteFocus(id) {
  if (!confirm('Focus löschen?')) return;
  data.focuses = data.focuses.filter(f => f.id !== id);
  saveData(data);
  render();
}
