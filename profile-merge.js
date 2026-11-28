'use strict';
const IYProfileMerge=(()=>{
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

  function mergeProjectsWithDeletedReminders(base, local, remote, conflicts, preferLocal) {
    const versions=[base===ABSENT?[]:base,local,remote];
    if(!versions.every(Array.isArray))return null;
    const deleted=new Set(versions.flatMap(projects=>projects.filter(item=>item?.reminderDeleted===true).map(item=>item.id)));
    if(!deleted.size)return null;
    if(!versions.every(projects=>projects.every(item=>object(item)&&typeof item.id==='string'&&item.id)
      &&new Set(projects.map(item=>item.id)).size===projects.length))return null;

    const [before,device,cloud]=versions.map(projects=>new Map(projects.map(item=>[item.id,item])));
    const record=(version,id)=>{
      const item=version.get(id);
      if(!item)return ABSENT;
      if(!deleted.has(id))return item;
      const kept={...item,reminderDeleted:true,reminderEnabled:false};
      for(const field of ['reminderAt','reminderLabel','archivedAt','reminderArchivedAt'])delete kept[field];
      return kept;
    };
    const keepDevice=typeof preferLocal==='function'?preferLocal('projects'):preferLocal;
    const projectConflicts=[],list=[];
    for(const id of new Set([...cloud.keys(),...device.keys()])){
      const item=mergeNode(record(before,id),record(device,id),record(cloud,id),['projects',id],projectConflicts,keepDevice);
      if(item!==ABSENT)list.push(item);
    }
    const previousConflict=conflicts.indexOf('projects');
    if(previousConflict!==-1)conflicts.splice(previousConflict,1);
    if(projectConflicts.length)conflicts.push('projects');
    return list;
  }

  function mergeNode(base, local, remote, path, conflicts, preferLocal=false) {
    if (path.length===1 && path[0]==='iyduSyncVersion')return clone(remote);
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
            if(match&&!equal(match,t)){conflicts.push('tasks');return clone((typeof preferLocal==='function'?preferLocal(path.join('.')):preferLocal)?local:remote)}
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
    // Keep the answers and submission timestamp from the same annual form.
    const annualSubmission=path.length===2&&path[0]==='annualReports';
    if (!annualSubmission && object(local) && object(remote) && (base === ABSENT || object(base))) {
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
    return clone((typeof preferLocal==='function'?preferLocal(path.join('.')):preferLocal)?local:remote);
  }

  function merge(base, local, remote, preferLocal=false) {
    if (![base, local, remote].every(object)) throw Error('SYNC_INVALID_DOCUMENT');
    const conflicts = [];
    const merged = mergeNode(base, local, remote, [], conflicts, preferLocal);
    const projects=mergeProjectsWithDeletedReminders(base.projects??ABSENT,local.projects,remote.projects,conflicts,preferLocal);
    if(projects)merged.projects=projects;
    if(base.day&&local.day!==remote.day){
      const onOldDay=local.day===base.day?local:remote.day===base.day?remote:null;
      const fields=['day','tasks','completedBatches','hist','plans','backlog','backlogArchive'];
      if(!onOldDay||fields.slice(1).some(k=>!equal(onOldDay[k],base[k]))){
        for(const k of fields){
          if(!conflicts.includes(k))conflicts.push(k);
          const choice=(typeof preferLocal==='function'?preferLocal('day'):preferLocal)?local:remote;
          if(own(choice,k))merged[k]=clone(choice[k]);else delete merged[k];
        }
      }
    }
    // Moving entries between active backlog and archive is one logical transaction.
    // Conflicting concurrent changes must retain both exact alternatives.
    const backlogFields=['backlog','backlogArchive'];
    if(!conflicts.includes('day')&&backlogFields.some(k=>!equal(local[k],base[k]))&&backlogFields.some(k=>!equal(remote[k],base[k]))&&backlogFields.some(k=>!equal(local[k],remote[k]))){
      for(const k of backlogFields){
        if(!conflicts.includes(k))conflicts.push(k);
        const choice=(typeof preferLocal==='function'?preferLocal('backlog'):preferLocal)?local:remote;
        if(own(choice,k))merged[k]=clone(choice[k]);else delete merged[k];
      }
    }
    return { merged, conflicts };
  }

  return {merge,equal};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=IYProfileMerge;
