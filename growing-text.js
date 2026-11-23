'use strict';

function fitTextField(field) {
  if (!field.clientWidth) return;
  field.style.height = 'auto';
  const border = field.offsetHeight - field.clientHeight;
  field.style.height = (field.scrollHeight + border + 1) + 'px';
}

function fitTextFields(root = document) {
  const fields = root.querySelectorAll('textarea');
  fields.forEach(fitTextField);
  // Dialogs and responsive rows can acquire their final width on the next layout.
  if (fields.length) requestAnimationFrame(() => {
    fields.forEach(field => { if (field.isConnected) fitTextField(field); });
  });
}

function keepLastLineVisible(field) {
  if (field !== document.activeElement || field.selectionEnd !== field.value.length) return;
  const viewport = window.visualViewport;
  const screenBottom = viewport ? Math.min(innerHeight, viewport.offsetTop + viewport.height) : innerHeight;
  const dialog = field.closest('[role="dialog"] .card');
  if (dialog) {
    const bottom = Math.min(dialog.getBoundingClientRect().bottom, screenBottom) - 8;
    const distance = Math.ceil(field.getBoundingClientRect().bottom - bottom);
    if (distance > 0) dialog.scrollTop += distance;
  }
  const distance = Math.ceil(field.getBoundingClientRect().bottom - screenBottom + 8);
  if (distance > 0) window.scrollBy(0, distance);
}

let followTextFrame = 0;
function followWriting(field) {
  cancelAnimationFrame(followTextFrame);
  keepLastLineVisible(field);
  // WebKit also scrolls the insertion point after dispatching the input event.
  followTextFrame = requestAnimationFrame(() => keepLastLineVisible(field));
}

document.addEventListener('input', event => {
  const field = event.target;
  if (!(field instanceof HTMLTextAreaElement)) return;
  fitTextField(field);
  if (!event.isComposing) followWriting(field);
});
document.addEventListener('compositionend', event => {
  if (event.target instanceof HTMLTextAreaElement) followWriting(event.target);
});

document.addEventListener('focusin', event => {
  if (event.target instanceof HTMLTextAreaElement) fitTextField(event.target);
});
window.addEventListener('resize', () => fitTextFields());
document.fonts?.ready.then(() => fitTextFields());
