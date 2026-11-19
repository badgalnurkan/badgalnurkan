/* Improvin' Your Day: loss-averse, dependency-free cross-browser sync core.
 * The server must enforce atomic CAS and reject every legacy blind-write path.
 * This module never stores credentials, auto-deletes a conflicting draft,
 * or silently chooses between two edits to the same value.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IYSync = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const ABSENT = Symbol('absent');
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const object = value => value !== null && typeof value === 'object' &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  const safe = key => key !== '__proto__' && key !== 'prototype' && key !== 'constructor';
  const clone = value => value === ABSENT ? ABSENT : JSON.parse(JSON.stringify(value));

  function equal(a, b) {
    if (a === ABSENT || b === ABSENT) return a === b;
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
        a.every((v, i) => equal(v, b[i]));
    }
    if (object(a) || object(b)) {
      if (!object(a) || !object(b)) return false;
      const ak = Object.keys(a), bk = Object.keys(b);
      return ak.length === bk.length && ak.every(k => own(b, k) && equal(a[k], b[k]));
    }
    return false;
  }

  function mergeNode(base, local, remote, path, conflicts) {
    if (equal(local, remote)) return clone(local);
    if (equal(local, base)) return clone(remote);
    if (equal(remote, base)) return clone(local);
    if (object(local) && object(remote) && (base === ABSENT || object(base))) {
      const before = base === ABSENT ? {} : base;
      const merged = {};
      const keys = new Set([...Object.keys(before), ...Object.keys(local), ...Object.keys(remote)]);
      for (const key of keys) {
        if (!safe(key)) { conflicts.push(path.concat(key).join('.')); continue; }
        const part = mergeNode(
          own(before, key) ? before[key] : ABSENT,
          own(local, key) ? local[key] : ABSENT,
          own(remote, key) ? remote[key] : ABSENT,
          path.concat(key), conflicts
        );
        if (part !== ABSENT) merged[key] = part;
      }
      return merged;
    }
    conflicts.push(path.length ? path.join('.') : '$');
    return clone(remote);
  }

  function merge(base, local, remote) {
    if (![base, local, remote].every(object)) throw Error('SYNC_INVALID_DOCUMENT');
    const conflicts = [];
    const merged = mergeNode(base, local, remote, [], conflicts);
    return { merged, conflicts };
  }

  function create(options) {
    const { uid, tabId, storage, load, cas } = options || {};
    if (typeof uid !== 'string' || !/^[a-zA-Z0-9-]{8,}$/.test(uid) ||
        typeof tabId !== 'string' || !/^[a-zA-Z0-9-]{8,}$/.test(tabId) ||
        !storage || typeof storage.getItem !== 'function' ||
        typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function' ||
        typeof load !== 'function' || typeof cas !== 'function') {
      throw Error('SYNC_INVALID_CONFIGURATION');
    }
    const key = 'iydu.sync.pending.v2.' + uid + '.' + tabId;
    const conflictKey = 'iydu.sync.conflict.v2.' + uid + '.' + tabId;
    const clock = options.now || Date.now;
    const onRemote = options.onRemote || (() => {});
    const onStatus = options.onStatus || (() => {});
    let base = null, ready = false, flight = null, status = 'idle';

    function report(next) {
      if (status !== next) { status = next; onStatus(next); }
    }
    function durablePut(k, value) {
      const raw = JSON.stringify(value);
      storage.setItem(k, raw);
      if (storage.getItem(k) !== raw) throw Error('SYNC_STORAGE_NOT_DURABLE');
    }
    function getPending() {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      let entry;
      try { entry = JSON.parse(raw); } catch (_) { throw Error('SYNC_PENDING_CORRUPTED'); }
      if (!entry || entry.uid !== uid || entry.tabId !== tabId ||
          !object(entry.base) || !object(entry.local) || !Number.isSafeInteger(entry.seq) ||
          entry.seq < 1) throw Error('SYNC_PENDING_CORRUPTED');
      return entry;
    }
    function confirmedRemote(value) {
      if (!object(value)) throw Error('SYNC_INVALID_REMOTE');
      return clone(value);
    }
    function initialize(remote) {
      base = confirmedRemote(remote);
      ready = true;
      const pending = getPending();
      report(pending ? 'pending' : 'synced');
      return pending ? clone(pending.local) : null;
    }
    function enqueue(snapshot) {
      if (!ready) { report('unsafe'); return false; }
      if (!object(snapshot)) throw Error('SYNC_INVALID_LOCAL');
      try {
        const previous = getPending();
        const entry = {
          uid, tabId, seq: previous ? previous.seq + 1 : 1,
          base: clone(previous ? previous.base : base),
          local: clone(snapshot), at: clock()
        };
        durablePut(key, entry);
        report('pending');
        return true;
      } catch (error) {
        report('unsafe');
        return false;
      }
    }
    async function refresh() {
      if (!ready) throw Error('SYNC_NOT_INITIALIZED');
      if (getPending()) return flush();
      try {
        const current = confirmedRemote(await load());
        if (!equal(current, base)) {
          // A focused editor can defer applying remote changes. Never advance
          // the CAS baseline until the displayed document has actually changed.
          if (onRemote(clone(current)) === false) {
            report('remote-pending');
            return false;
          }
          base = clone(current);
        }
        report('synced');
        return true;
      } catch (error) {
        report('offline');
        return false;
      }
    }
    async function flush() {
      if (!ready) throw Error('SYNC_NOT_INITIALIZED');
      if (flight) return flight;
      flight = (async () => {
        for (let attempt = 0; attempt < 4; attempt++) {
          let pending;
          try { pending = getPending(); }
          catch (_) { report('unsafe'); return false; }
          if (!pending) { report('synced'); return true; }
          let latest;
          try { latest = confirmedRemote(await load()); }
          catch (_) { report('offline'); return false; }

          const result = merge(pending.base, pending.local, latest);
          if (result.conflicts.length) {
            try {
              durablePut(conflictKey, {
                uid, tabId, at: clock(), paths: result.conflicts,
                base: pending.base, local: pending.local, remote: latest
              });
            } catch (_) { report('unsafe'); return false; }
            report('conflict');
            return false;
          }
          const next = result.merged;
          let committed = equal(next, latest);
          if (!committed) {
            try { committed = (await cas(latest, next)) === true; }
            catch (_) { report('offline'); return false; }
          }
          if (!committed) continue;

          let current;
          try { current = getPending(); }
          catch (_) { report('unsafe'); return false; }
          if (!current) {
            if (onRemote(clone(next)) === false) report('remote-pending');
            else { base = clone(next); report('synced'); }
            return true;
          }
          if (current.seq === pending.seq) {
            try {
              storage.removeItem(key);
              if (storage.getItem(key) !== null) throw Error('SYNC_PENDING_REMOVE_FAILED');
              storage.removeItem(conflictKey);
            } catch (_) { report('unsafe'); return false; }
            // If the user is typing into an unsaved editor, do NOT mark its
            // stale display as the current CAS base. Future saves will merge
            // from the displayed older version instead of erasing new data.
            if (onRemote(clone(next)) === false) report('remote-pending');
            else { base = clone(next); report('synced'); }
            return true;
          }
          base = clone(next);
          // A local edit arrived during the network request. Rebase that edit
          // onto the just-acknowledged remote snapshot without deleting it.
          const rebased = merge(pending.local, current.local, next);
          if (rebased.conflicts.length) { report('conflict'); return false; }
          try {
            durablePut(key, { ...current, base: clone(next), local: rebased.merged });
          } catch (_) { report('unsafe'); return false; }
        }
        report('pending');
        return false;
      })();
      try { return await flight; }
      finally { flight = null; }
    }
    function conflict() {
      const raw = storage.getItem(conflictKey);
      if (!raw) return null;
      let parsed;
      try { parsed = JSON.parse(raw); } catch (_) { return null; }
      return parsed?.uid === uid && parsed.tabId === tabId ? parsed : null;
    }
    async function resolveWithRemote() {
      const issue = conflict();
      const pending = getPending();
      if (!issue || !pending) throw Error('SYNC_CONFLICT_NOT_FOUND');
      // The displayed conflict snapshot can be old. Read the current cloud
      // state again before choosing it; archive local edits before clearing.
      const newest = confirmedRemote(await load());
      const archive = 'iydu.sync.archive.v2.' + uid + '.' + tabId + '.' + clock();
      durablePut(archive, { uid, tabId, issue, pending });
      storage.removeItem(key);
      if (storage.getItem(key) !== null) throw Error('SYNC_PENDING_REMOVE_FAILED');
      storage.removeItem(conflictKey);
      base = clone(newest);
      onRemote(clone(newest));
      report('synced');
      return archive;
    }
    return {
      initialize, enqueue, flush, refresh, conflict, resolveWithRemote,
      pending: getPending,
      getStatus: () => status,
      getBase: () => base === null ? null : clone(base),
      keys: { pending: key, conflict: conflictKey }
    };
  }
  return Object.freeze({ merge, equal, create });
});
