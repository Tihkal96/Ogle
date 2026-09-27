'use strict';
// Temporary text zoom belongs to this editing session, never the saved note.
window.OgleNotesZoom = (() => {
  const note = document.getElementById('note');
  let size = null;
  function reset() {
    size = null;
    note.style.removeProperty('font-size');
  }
  note.addEventListener('wheel', event => {
    if (!event.ctrlKey || !event.deltaY) return;
    event.preventDefault();
    const current = size ?? parseFloat(getComputedStyle(note).fontSize);
    size = Math.max(8, Math.min(40, current + (event.deltaY < 0 ? 1 : -1)));
    note.style.fontSize = `${size}px`;
  }, { passive: false });
  note.addEventListener('blur', reset);
  window.addEventListener('blur', reset);
  return { reset };
})();
