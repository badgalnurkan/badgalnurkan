'use strict';

function fitTextField(field) {
  if (!field.clientWidth) return;
  field.style.height = 'auto';
  const border = field.offsetHeight - field.clientHeight;
  field.style.height = (field.scrollHeight + border) + 'px';
}

function fitTextFields(root = document) {
  root.querySelectorAll('textarea').forEach(fitTextField);
}

document.addEventListener('input', event => {
  const field = event.target;
  if (!(field instanceof HTMLTextAreaElement)) return;
  const previousHeight = field.offsetHeight;
  fitTextField(field);
  if (field !== document.activeElement || event.isComposing ||
      field.selectionEnd !== field.value.length || field.offsetHeight <= previousHeight) return;

  // Keep the last line above the keyboard or the bottom edge of an open dialog.
  const viewport = window.visualViewport;
  const screenBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  const dialog = field.closest('[role="dialog"] .card');
  const visibleBottom = dialog ? Math.min(dialog.getBoundingClientRect().bottom, screenBottom) : screenBottom;
  if (field.getBoundingClientRect().bottom > visibleBottom) {
    field.scrollIntoView({block: 'end', inline: 'nearest', behavior: 'instant'});
  }
});

document.addEventListener('focusin', event => {
  if (event.target instanceof HTMLTextAreaElement) fitTextField(event.target);
});
window.addEventListener('resize', () => fitTextFields());
document.fonts?.ready.then(() => fitTextFields());
