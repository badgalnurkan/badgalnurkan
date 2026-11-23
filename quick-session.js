/* Tab-scoped account sessions. Supabase decides whether email proof is fresh. */
window.IYQuickSession=(()=>{
 'use strict';
 const key='iydu.quick.sessions.v1';let busy=false;
 function read(){try{const value=JSON.parse(sessionStorage.getItem(key)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}}
 function write(value){try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}}
 function sid(session){try{return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id}catch{return null}}
 function remember(session,expiresAt){
  const uid=session?.user?.id,end=Date.parse(expiresAt||'');
  if(!uid||!session?.access_token||!sid(session)||!Number.isFinite(end)||end<=Date.now())return;
  const records=read();records[uid]={session,expiresAt:end};
  const keep=Object.entries(records).sort((a,b)=>b[1].expiresAt-a[1].expiresAt).slice(0,3);write(Object.fromEntries(keep));
 }
 function update(session){const records=read(),entry=records[session?.user?.id];if(entry&&sid(entry.session)===sid(session)){entry.session=session;write(records)}}
 function forget(uid){const records=read();delete records[uid];write(records)}
 function has(uid){return !!read()[uid]?.session?.access_token}
 async function resume(name){
  const account=DB.accounts?.[name],entry=account?.authUid?read()[account.authUid]:null;
  if(!entry)return false;
  if(busy||typeof authBusy!=='undefined'&&authBusy)return true;
  busy=true;
  try{
   if(A?.authUid&&A.authUid!==account.authUid){
    if(!await sbPush()){toast(tr()?'Önce mevcut hesabının eşitlenmesini bekle.':'Wait for your current account to sync first.');return true}
   }
   if(A)stopTimers();clearTimeout(pushT);A=null;
   sbSave(entry.session);
   const user=await sbCurrentUser();
   if(user?.id!==account.authUid)throw Error('ACCOUNT_IDENTITY_MISMATCH');
   sbSave({...sbSession(),user});
   await activateCloudUser(sbSession(),account.u,account.loginMethod||'password');
   return true;
  }catch{
   forget(account.authUid);sbClear();A=null;loginDat={u:account.email||account.u,p:''};view='login';msg=tr()?'Hızlı geçiş tamamlanamadı. Yeniden giriş yap.':'Quick switch could not complete. Sign in again.';renderAppOrAuth();return true;
  }finally{busy=false}
 }
 return {remember,update,forget,has,resume};
})();
