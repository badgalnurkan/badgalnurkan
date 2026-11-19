'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { merge, equal, create } = require('../cross-device-sync.js');

function memoryStorage() {
  const items = new Map();
  return {
    getItem: key => items.has(key) ? items.get(key) : null,
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: key => { items.delete(key); },
    items
  };
}
function server(initial = {}) {
  let remote = structuredClone(initial);
  const clone = value => structuredClone(value);
  return {
    load: async () => clone(remote),
    cas: async (expected, next) => {
      if (!equal(expected, remote)) return false;
      remote = clone(next);
      return true;
    },
    current: () => clone(remote)
  };
}
const uid = n => '00000000-0000-4000-8000-0000000000' + String(n).padStart(2, '0');
const tab = n => 'browser-' + String(n).padStart(8, '0');
function engine(id, num, storage, remote, onRemote = () => {}) {
  return create({ uid: uid(id), tabId: tab(num), storage,
    load: remote.load, cas: remote.cas, onRemote });
}

test('deep equality ignores JSON object key ordering', () => {
  assert.ok(equal({ a: 1, x: { z: 2, y: 3 } }, { x: { y: 3, z: 2 }, a: 1 }));
  assert.ok(!equal({ a: [1, 2] }, { a: [2, 1] }));
});
test('disjoint calendar days merge without deleting either entry', () => {
  const base = { journal: {} };
  const local = { journal: { '2026-11-19': { text: 'desktop' } } };
  const remote = { journal: { '2026-11-20': { text: 'phone' } } };
  const result = merge(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.merged.journal['2026-11-19'].text, 'desktop');
  assert.equal(result.merged.journal['2026-11-20'].text, 'phone');
});
test('concurrent edits to one day never silently choose a winner', () => {
  const base = { journal: { '2026-11-19': { text: 'original' } } };
  const local = { journal: { '2026-11-19': { text: 'computer edit' } } };
  const remote = { journal: { '2026-11-19': { text: 'phone edit' } } };
  assert.deepEqual(merge(base, local, remote).conflicts,
    ['journal.2026-11-19.text']);
});
test('deleting a day and editing same day is a conflict', () => {
  const base = { journal: { '2026-11-19': { text: 'original' } } };
  const local = { journal: {} };
  const remote = { journal: { '2026-11-19': { text: 'new' } } };
  assert.deepEqual(merge(base, local, remote).conflicts, ['journal.2026-11-19']);
});
test('two browsers converge on disjoint daily journals through atomic CAS', async () => {
  const remote = server({ u: 'Test', journal: {} });
  const a = engine(1, 1, memoryStorage(), remote);
  const b = engine(1, 2, memoryStorage(), remote);
  a.initialize(await remote.load());
  b.initialize(await remote.load());
  assert.ok(a.enqueue({ u: 'Test', journal: { '2026-11-19': { text: 'desktop' } } }));
  assert.ok(b.enqueue({ u: 'Test', journal: { '2026-11-20': { text: 'phone' } } }));
  assert.equal(await a.flush(), true);
  assert.equal(await b.flush(), true);
  assert.equal(await a.refresh(), true);
  assert.deepEqual(Object.keys(remote.current().journal).sort(),
    ['2026-11-19', '2026-11-20']);
  assert.equal(a.pending(), null);
  assert.equal(b.pending(), null);
});
test('same-day conflict retains local draft and a remote copy across reload', async () => {
  const shared = memoryStorage();
  const remote = server({ u: 'Test', journal: {} });
  const a = engine(1, 1, memoryStorage(), remote);
  const b = engine(1, 2, shared, remote);
  a.initialize(await remote.load());
  b.initialize(await remote.load());
  a.enqueue({ u: 'Test', journal: { '2026-11-19': { text: 'computer' } } });
  b.enqueue({ u: 'Test', journal: { '2026-11-19': { text: 'phone' } } });
  assert.equal(await a.flush(), true);
  assert.equal(await b.flush(), false);
  assert.equal(b.getStatus(), 'conflict');
  assert.equal(remote.current().journal['2026-11-19'].text, 'computer');
  assert.equal(b.pending().local.journal['2026-11-19'].text, 'phone');
  assert.ok(b.conflict().paths.length > 0);
  const reopened = engine(1, 2, shared, remote);
  assert.equal(reopened.initialize(await remote.load()).journal['2026-11-19'].text, 'phone');
  assert.equal(reopened.pending().local.journal['2026-11-19'].text, 'phone');
});
test('network fails after server commit: retry identifies acknowledged data', async () => {
  const storage = memoryStorage(), remote = server({ u: 'Test', journal: {} });
  let once = true;
  const flaky = {
    load: remote.load,
    cas: async (base, next) => {
      const ok = await remote.cas(base, next);
      if (once) { once = false; throw Error('response lost after commit'); }
      return ok;
    }
  };
  const a = engine(1, 1, storage, flaky);
  a.initialize(await remote.load());
  a.enqueue({ u: 'Test', journal: { '2026-11-19': { text: 'preserved' } } });
  assert.equal(await a.flush(), false);
  assert.ok(a.pending());
  assert.equal(await a.flush(), true);
  assert.equal(a.pending(), null);
  assert.equal(remote.current().journal['2026-11-19'].text, 'preserved');
});
test('two tabs preserve independent pending drafts in the same storage', () => {
  const storage = memoryStorage(), remote = server({ journal: {} });
  const a = engine(1, 1, storage, remote);
  const b = engine(1, 2, storage, remote);
  a.initialize({ journal: {} });
  b.initialize({ journal: {} });
  a.enqueue({ journal: { '2026-11-19': { text: 'a' } } });
  b.enqueue({ journal: { '2026-11-20': { text: 'b' } } });
  assert.notEqual(a.keys.pending, b.keys.pending);
  assert.equal(a.pending().local.journal['2026-11-19'].text, 'a');
  assert.equal(b.pending().local.journal['2026-11-20'].text, 'b');
});
test('three user identities have independent pending data and cloud writes', async () => {
  const storage = memoryStorage();
  for (const i of [1, 2, 3]) {
    const remote = server({ journal: {} });
    const app = engine(i, 1, storage, remote);
    app.initialize(await remote.load());
    app.enqueue({ journal: { '2026-11-19': { text: 'user-' + i } } });
    assert.equal(await app.flush(), true);
    assert.equal(remote.current().journal['2026-11-19'].text, 'user-' + i);
  }
});
test('storage failure never acknowledges a local draft', () => {
  const remote = server({});
  const bad = memoryStorage();
  bad.setItem = () => { throw Error('QuotaExceededError'); };
  const app = engine(1, 1, bad, remote);
  app.initialize({});
  assert.equal(app.enqueue({ journal: { test: 1 } }), false);
  assert.equal(app.getStatus(), 'unsafe');
});
test('conflict cloud selection requires a durable recovery archive', async () => {
  const storage = memoryStorage(), remote = server({ journal: {} });
  const a = engine(1, 1, memoryStorage(), remote);
  const b = engine(1, 2, storage, remote);
  a.initialize(await remote.load()); b.initialize(await remote.load());
  a.enqueue({ journal: { entry: 'A' } });
  b.enqueue({ journal: { entry: 'B' } });
  await a.flush();
  await b.flush();
  const archiveKey = await b.resolveWithRemote();
  assert.ok(storage.getItem(archiveKey));
  assert.equal(JSON.parse(storage.getItem(archiveKey)).pending.local.journal.entry, 'B');
  assert.equal(b.pending(), null);
  assert.equal(b.getBase().journal.entry, 'A');
});
test('remote refresh does not overwrite an unsynced local draft', async () => {
  const remote = server({ journal: {} });
  const app = engine(1, 1, memoryStorage(), remote);
  app.initialize(await remote.load());
  app.enqueue({ journal: { '2026-11-19': 'local' } });
  await remote.cas({ journal: {} }, { journal: { '2026-11-20': 'remote' } });
  assert.equal(await app.refresh(), true);
  assert.equal(app.pending(), null);
  assert.equal(remote.current().journal['2026-11-19'], 'local');
  assert.equal(remote.current().journal['2026-11-20'], 'remote');
});
