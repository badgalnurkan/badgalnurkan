'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'inline application script must exist');
const todo = script.match(/P\.todo=\(\)=>\{[\s\S]*?\n\};\nfunction vibrateTask\(\)/)?.[0]?.replace(/\nfunction vibrateTask\(\)$/, '');
assert.ok(todo, 'todo render function must be found');

function renderTodo(tasks, { archived = false, lang = 'tr' } = {}) {
  const output = [];
  const text = {
    tr: { today: 'Bugün', addTask: 'Bir görev ekle.', newTask: 'Yeni görev', add: 'Ekle', backlog: 'Birikim', delete: 'Sil', noRecords: 'Kayıt yok' },
    en: { today: 'Today', addTask: 'Add a task.', newTask: 'New task', add: 'Add', backlog: 'Backlog', delete: 'Delete', noRecords: 'No records' }
  };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const context = {
    P: {}, A: { tasks, backlog: [], plans: {} },
    fixTodoData() {},
    archiveFinishedTasks: () => false,
    save() {},
    today: () => '2026-11-19',
    addD: () => '2026-11-20',
    sortTaskLists: () => tasks.map((task, index) => ({ task, index })),
    esc, t: key => text[lang][key] || key,
    tr: () => lang === 'tr',
    fmt: d => d,
    taskSortMode: () => 'manual',
    M: markup => output.push(markup),
    allTodayTasksArchived: () => archived,
    tk: (task, index) => '<div class="task" data-task-index="' + index + '">' + esc(task.t) + '</div>'
  };
  vm.runInNewContext(todo, context, { timeout: 1000 });
  context.P.todo();
  assert.equal(output.length, 1);
  return output[0];
}

test('complete inline script parses before release', () => {
  assert.doesNotThrow(() => new Function(script));
});

test('empty current-day list shows localized empty state instead of JavaScript source', () => {
  const output = renderTodo([]);
  assert.match(output, /<div id="tl"><p class="mut">Bir görev ekle\.<\/p><\/div>/);
  assert.doesNotMatch(output, /\|\|'<p|dayFinished\?\(|\}\|\|/);
});

test('archived day shows tomorrow guidance, no literal expression', () => {
  const output = renderTodo([], { archived: true });
  assert.match(output, /Bugünkü görevlerin raporlara kaydedildi/);
  assert.match(output, /placeholder="Yarın için yeni görev"/);
  assert.doesNotMatch(output, /\|\|'<p|dayFinished\?\(/);
});

test('existing tasks render once without spurious empty markup', () => {
  const output = renderTodo([{ t: 'Read a chapter', s: '' }]);
  assert.match(output, /data-task-index="0">Read a chapter/);
  assert.doesNotMatch(output, /Bir görev ekle\.<\/p>/);
  assert.doesNotMatch(output, /\|\|'<p|dayFinished\?\(/);
});

test('English empty state and HTML safety are retained', () => {
  const output = renderTodo([], { archived: true, lang: 'en' });
  assert.match(output, /Today is completed and archived/);
  assert.doesNotMatch(output, /dayFinished\?\(|\|\|'<p/);
  const tasks = renderTodo([{ t: '<unsafe>', s: '' }], { lang: 'en' });
  assert.match(tasks, /&lt;unsafe&gt;/);
  assert.doesNotMatch(tasks, /<unsafe>/);
});

test('repository email templates use OTP tokens only, not magic links', () => {
  for (const name of ['confirm-signup-otp.html', 'magic-link-otp.html']) {
    const template = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'email-templates', name), 'utf8');
    assert.match(template, /\{\{\s*\.Token\s*\}\}/, name);
    assert.doesNotMatch(template, /\{\{\s*\.ConfirmationURL\s*\}\}/, name);
  }
});
