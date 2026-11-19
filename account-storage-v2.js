'use strict';
// Side-effect-free foundation for a future migration from legacy "b1" to
// account-scoped data. Not wired into the running app until QA is ready.
// This module deliberately never deletes or rewrites the old shared key.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else if(root)root.IYAccountStorageV2=api;
})(typeof window!=='undefined'?window:null,()=>{
  const SCHEMA=2,PREFIX='iyd.account.v2.';
  const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
  function owner(uid){
    if(typeof uid!=='string'||!uuid.test(uid.toLowerCase()))throw Error('INVALID_ACCOUNT_UID');
    return uid.toLowerCase();
  }
  function key(uid){return PREFIX+owner(uid)}
  function asStore(storage){
    if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')
      throw Error('STORAGE_UNAVAILABLE');
    return storage;
  }
  function snapshot(account,uid){
    if(!account||typeof account!=='object'||Array.isArray(account)||owner(account.authUid)!==uid)
      throw Error('ACCOUNT_OWNER_MISMATCH');
    const copy=JSON.parse(JSON.stringify(account));
    // Never persist passwords or password-salts as part of account migration.
    // For cloud identities the Supabase Auth server owns credentials.
    delete copy.pw;
    delete copy.salt;
    copy.authUid=uid;
    return copy;
  }
  function decode(raw,uid){
    if(typeof raw!=='string'||!raw)return null;
    try{
      const record=JSON.parse(raw);
      if(record?.schema!==SCHEMA||record?.ownerUid!==uid)return null;
      return snapshot(record.account,uid);
    }catch(_){return null}
  }
  function readAccount(storage,uid){
    const s=asStore(storage),u=owner(uid),main=s.getItem(key(u));
    const account=decode(main,u);
    if(account)return {account,source:'primary'};
    const backup=decode(s.getItem(key(u)+'.bak'),u);
    return backup?{account:backup,source:'backup'}:null;
  }
  function saveAccount(storage,uid,account){
    const s=asStore(storage),u=owner(uid),record=snapshot(account,u),target=key(u);
    const previous=s.getItem(target);
    if(previous!==null){
      if(!decode(previous,u))throw Error('ACCOUNT_PRIMARY_CORRUPT');
      // Save the old primary first; a storage write failure never destroys it.
      s.setItem(target+'.bak',previous);
      if(s.getItem(target+'.bak')!==previous)throw Error('BACKUP_READBACK_FAILED');
    }
    const raw=JSON.stringify({schema:SCHEMA,ownerUid:u,account:record});
    s.setItem(target,raw);
    if(s.getItem(target)!==raw)throw Error('ACCOUNT_READBACK_FAILED');
    return {ownerUid:u,source:'primary'};
  }
  function migrateLegacyCloudAccounts(storage,legacy){
    const s=asStore(storage),accounts=legacy?.accounts;
    if(!accounts||typeof accounts!=='object'||Array.isArray(accounts))
      throw Error('INVALID_LEGACY_DATA');
    const cloud=new Map(), skipped=[];
    // Preflight ALL identities before writing any v2 key.
    for(const [name,account] of Object.entries(accounts)){
      if(!account?.authUid){skipped.push(name);continue}
      const uid=owner(account.authUid);
      if(cloud.has(uid))throw Error('DUPLICATE_LEGACY_AUTH_UID');
      cloud.set(uid,snapshot(account,uid));
    }
    const migrated=[],existing=[];
    for(const [uid,account] of cloud){
      const target=key(uid);
      // Never overwrite even a malformed existing v2 record in migration.
      if(s.getItem(target)!==null||s.getItem(target+'.bak')!==null){
        existing.push(uid);continue;
      }
      saveAccount(s,uid,account);
      const result=readAccount(s,uid);
      if(!result||result.account.authUid!==uid)throw Error('MIGRATION_READBACK_FAILED');
      migrated.push(uid);
    }
    // The legacy "b1" and all other keys stay intact for manual rollback.
    return {migrated,existing,skipped};
  }
  return Object.freeze({key,readAccount,saveAccount,migrateLegacyCloudAccounts});
});
