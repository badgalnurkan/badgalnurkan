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

  function mergeNode(base, local, remote, path, conflicts, preferLocal=false) {
    if (path.length===1 && path[0]==='updatedAt' && Number.isFinite(local) && Number.isFinite(remote))return Math.max(local,remote);
    if (equal(local, remote)) return clone(local);
    if (equal(local, base)) return clone(remote);
    if (equal(remote, base)) return clone(local);
    // Independent appends retain their identities and order. Ambiguous edits and removals
    // continue to the ordinary conflict path so a user's existing task cannot disappear.
    if(path.length===1&&path[0]==='tasks'&&Array.isArray(local)&&Array.isArray(remote)&&Array.isArray(base)){
      const appended=list=>list.length>=base.length&&base.every((v,i)=>equal(v,list[i]));
      if(appended(local)&&appended(remote)){
        const extra=local.slice(base.length),other=remote.slice(base.length);
        if([...extra,...other].every(t=>typeof t?.id==='string')){
          const merged=clone(remote);
          for(const t of extra){
            const match=other.find(x=>x.id===t.id);
            if(match&&!equal(match,t)){conflicts.push('tasks');return clone(preferLocal?local:remote)}
            if(!match)merged.push(clone(t));
          }
          return merged;
        }
      }
    }
    if(path.length===1&&path[0]==='notifications'&&Array.isArray(local)&&Array.isArray(remote)){
      const previous=new Map((Array.isArray(base)?base:[]).map(n=>[n.id,n]));
      const left=new Map(local.map(n=>[n.id,n])),right=new Map(remote.map(n=>[n.id,n]));
      const merged=[];
      for(const id of new Set([...left.keys(),...right.keys()])){
        const l=left.get(id),r=right.get(id);
        if(previous.has(id)&&(!l||!r))continue;
        const item=clone(r||l);if(l&&r)item.read=!!(l.read||r.read);merged.push(item);
      }
      return merged.sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,200);
    }
    if((path[0]==='noticeDelivered'||path[path.length-1]==='updatedAt')&&Number.isFinite(local)&&Number.isFinite(remote))return Math.max(local,remote);
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
          path.concat(key), conflicts, preferLocal
        );
        if (part !== ABSENT) merged[key] = part;
      }
      return merged;
    }
    conflicts.push(path.length ? path.join('.') : '$');
    return clone(preferLocal?local:remote);
  }

  function merge(base, local, remote, preferLocal=false) {
    if (![base, local, remote].every(object)) throw Error('SYNC_INVALID_DOCUMENT');
    const conflicts = [];
    const merged = mergeNode(base, local, remote, [], conflicts, preferLocal);
    if(base.day&&local.day!==remote.day){
      const onOldDay=local.day===base.day?local:remote.day===base.day?remote:null;
      const fields=['day','tasks','completedBatches','hist','plans','backlog'];
      if(!onOldDay||fields.slice(1).some(k=>!equal(onOldDay[k],base[k]))){
        for(const k of fields){
          if(!conflicts.includes(k))conflicts.push(k);
          const choice=preferLocal?local:remote;
          if(own(choice,k))merged[k]=clone(choice[k]);else delete merged[k];
        }
      }
    }
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
    function orphaned() {
      // New browser tabs have different sessionStorage tab IDs. A prior tab's
      // unacknowledged draft remains discoverable rather than being hidden.
      const entries = [], prefix = 'iydu.sync.pending.v2.' + uid + '.';
      const count = Number(storage.length) || 0;
      if (typeof storage.key !== 'function') return entries;
      for (let i = 0; i < count; i++) {
        const found = storage.key(i);
        if (typeof found !== 'string' || !found.startsWith(prefix) || found === key)continue;
        const raw = storage.getItem(found);
        if (!raw)continue;
        let pending;
        try { pending = JSON.parse(raw); } catch (_) { continue; }
        if (pending?.uid !== uid || !object(pending.local) || !object(pending.base))continue;
        entries.push({ tabId: pending.tabId, at: pending.at, local: clone(pending.local),
          base: clone(pending.base) });
      }
      return entries;
    }
    function confirmedRemote(value) {
      if (!object(value)) throw Error('SYNC_INVALID_REMOTE');
      return clone(value);
    }
    function initialize(remote) {
      base = confirmedRemote(remote);
      ready = true;
      const pending = getPending();
      report(pending ? 'pending' : orphaned().length ? 'other-pending' : 'synced');
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
        report(orphaned().length ? 'other-pending' : 'synced');
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
          if (!pending) { report(orphaned().length ? 'other-pending' : 'synced'); return true; }
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
            else { base = clone(next); report(orphaned().length ? 'other-pending' : 'synced'); }
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
            else { base = clone(next); report(orphaned().length ? 'other-pending' : 'synced'); }
            return true;
          }
          base = clone(next);
          // A local edit arrived during the network request. Rebase that edit
          // onto the just-acknowledged remote snapshot without deleting it.
          const rebased = merge(pending.local, current.local, next);
          if (rebased.conflicts.length) {
            // CAS succeeded, but another edit was made before its response.
            // Keep the newer pending draft AND a durable three-way conflict
            // snapshot so the recovery UI can show both versions after reload.
            try {
              durablePut(conflictKey, {
                uid, tabId, at: clock(), paths: rebased.conflicts,
                base: clone(pending.local), local: clone(current.local),
                remote: clone(next)
              });
            } catch (_) { report('unsafe'); return false; }
            report('conflict');
            return false;
          }
          try {
            durablePut(key, { ...current, base: clone(next), local: rebased.merged });
            storage.removeItem(conflictKey);
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
      const archivePrefix = 'iydu.sync.archive.v2.' + uid + '.' + tabId + '.' + clock();
      let archive = archivePrefix, suffix = 0;
      // Two conflict resolutions can occur in the same millisecond, including
      // after a reload. Never overwrite an earlier recovery snapshot.
      while (storage.getItem(archive) !== null) {
        if (++suffix > 10000) throw Error('SYNC_ARCHIVE_SPACE_EXHAUSTED');
        archive = archivePrefix + '.' + suffix;
      }
      durablePut(archive, { uid, tabId, issue, pending });
      // The application may be editing an input and unable to display cloud
      // data yet. Never delete pending drafts or advance the CAS baseline
      // until the current screen has accepted the selected cloud version.
      if (onRemote(clone(newest)) === false) {
        report('remote-pending');
        throw Error('SYNC_REMOTE_APPLY_DEFERRED');
      }
      storage.removeItem(key);
      if (storage.getItem(key) !== null) throw Error('SYNC_PENDING_REMOVE_FAILED');
      storage.removeItem(conflictKey);
      base = clone(newest);
      report('synced');
      return archive;
    }
    async function resolveFields(useLocal){
      const existing=getPending(),issue=conflict();
      if(!existing||!issue)return false;
      const latest=confirmedRemote(await load());
      if(!equal(latest,issue.remote)||!equal(existing.local,issue.local)){await flush();return false}
      const result=merge(existing.base,existing.local,latest,useLocal).merged;
      const backup=conflictKey+'.kept.'+clock()+'.'+existing.seq;
      if(storage.getItem(backup)!==null&&!equal(JSON.parse(storage.getItem(backup)),issue))throw Error('SYNC_BACKUP_COLLISION');
      durablePut(backup,issue);
      if(!equal(result,latest)&&await cas(latest,result)!==true){await flush();return false}
      if(getPending()?.seq!==existing.seq)return false;
      if(onRemote(clone(result))===false)return false;
      storage.removeItem(key);storage.removeItem(conflictKey);base=clone(result);report('synced');return true;
    }
    return {
      initialize, enqueue, flush, refresh, conflict, resolveWithRemote, resolveFields,
      pending: getPending, orphaned,
      getStatus: () => status,
      getBase: () => base === null ? null : clone(base),
      keys: { pending: key, conflict: conflictKey }
    };
  }
  return Object.freeze({ merge, equal, create });
});
