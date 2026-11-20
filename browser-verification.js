/* Session-bound email verification. The server blocks app data until approval. */
window.IYBrowserGate=(()=>{
 'use strict';
 let pendingUid='',pendingSid='',busy=false,challengeId='',entered=false;
 const trText=(a,b)=>tr()?a:b;
 const messages={
  MAIL_NOT_CONFIGURED:['Güvenlik e-postası henüz yapılandırılmamış. Giriş doğrulanamadı.','Security email is not configured. Sign-in could not be verified.'],
  MAIL_SEND_FAILED:['Kod e-postası gönderilemedi. Tekrar deneyebilirsin.','Code email could not be sent. You can retry.'],
  RATE_LIMITED:['Çok sık kod istendi. Yeni kod için biraz bekle.','Too many code requests. Please wait before retrying.'],
  INVALID_CHALLENGE:['Kod yanlış, süresi dolmuş veya daha önce kullanılmış.','Code is incorrect, expired, or already used.'],
  UNAUTHORIZED:['Oturum değişmiş veya sona ermiş. Yeniden giriş yap.','Your session changed or expired. Sign in again.'],
  SERVER_UNAVAILABLE:['Sunucuya bağlanılamadı. Verilerin korunması için giriş durduruldu.','The server is unavailable. Sign-in was paused to protect your data.'],
  SESSION_EXPIRED:['Google oturumunun 30 dakikalık süresi doldu. Lütfen yeniden giriş yap.','Your 30-minute Google session has expired. Please sign in again.']
 };
 function note(code){
  const m=messages[code]||messages.SERVER_UNAVAILABLE;
  return m[tr()?0:1];
 }
 function oauthExpiry(){
  const s=sbSession();
  if(!s?.access_token||!s.user?.id)return null;
  try{
   const part=s.access_token.split('.')[1];
   if(!part)return null;
   const b=part.replace(/-/g,'+').replace(/_/g,'/');
   const jwt=JSON.parse(atob(b.padEnd(Math.ceil(b.length/4)*4,'=')));
   if(jwt.sub!==s.user.id||!Array.isArray(jwt.amr))return null;
   const oauth=jwt.amr.find(x=>x&&x.method==='oauth'&&Number.isFinite(x.timestamp));
   if(!oauth)return null;
   return oauth.timestamp*1000+30*60*1000;
  }catch{return null}
 }
 function enforceSessionLifetime(){
  const due=oauthExpiry();
  if(!due||Date.now()<due)return true;
  const active=!!A;
  signOut();
  if(active)toast(trText('Google oturumunun süresi doldu. Yeniden giriş yap.','Google session expired. Sign in again.'));
  return false;
 }
 function sessionIdentity(){
  const s=sbSession();
  if(!s?.access_token||!s?.user?.id)return null;
  try{
   const b=s.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
   const data=JSON.parse(atob(b.padEnd(Math.ceil(b.length/4)*4,'=')));
   if(data.sub!==s.user.id||!data.session_id)return null;
   return {uid:s.user.id,sid:data.session_id};
  }catch{return null}
 }
 function localKey(uid,sid){return 'iydu.browser.challenge.v1.'+uid+'.'+sid}
 function keepChallenge(uid,sid,id){
  try{
   sessionStorage.setItem(localKey(uid,sid),JSON.stringify({id,at:Date.now()}));
  }catch{}
 }
 function priorChallenge(uid,sid){
  try{
   const item=JSON.parse(sessionStorage.getItem(localKey(uid,sid))||'null');
   if(item&&/^[0-9a-f-]{36}$/i.test(item.id)&&Date.now()-item.at<600000)return item.id;
  }catch{}
  return '';
 }
 function dropChallenge(uid,sid){
  try{sessionStorage.removeItem(localKey(uid,sid))}catch{}
 }
 async function requestApi(action,extra={}){
  const before=sessionIdentity();
  if(!before||before.uid!==pendingUid||before.sid!==pendingSid)
   throw Object.assign(Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'});
  const send=async()=>{
   const session=sbSession();
   return fetch(SUPABASE_URL+'/functions/v1/browser-verification',{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,
     'Authorization':'Bearer '+session.access_token},
    body:JSON.stringify({action,lang:DB.lang,...extra}),
    signal:AbortSignal.timeout(15000),
    cache:'no-store'
   });
  };
  let response=await send();
  if(response.status===401&&await sbRefresh()){
   const after=sessionIdentity();
   if(!after||after.uid!==before.uid||after.sid!==before.sid)
    throw Object.assign(Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'});
   response=await send();
  }
  const result=await response.json().catch(()=>({code:'SERVER_UNAVAILABLE'}));
  if(!response.ok||result.ok!==true){
   throw Object.assign(Error(result.code||'SERVER_UNAVAILABLE'),
    {code:result.code||'SERVER_UNAVAILABLE'});
  }
  const after=sessionIdentity();
  if(!after||after.uid!==before.uid||after.sid!==before.sid)
   throw Object.assign(Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'});
  return result;
 }
 function showMessage(value){
  const el=document.getElementById('browser-verify-message');
  if(el)el.textContent=value;
 }
 function display(user){
  A=null;view='login';pg='home';renderAppOrAuth();
  const email=String(user?.email||sbSession()?.user?.email||'');
  const subtitle=trText('Bu oturum yeni bir tarayıcıdan veya cihazdan açıldı. Hesabındaki günlükleri ve görevleri görüntülemek için e-postana gönderilen 6 haneli kodu gir.',
    'This is a new browser or device session. Enter the 6-digit code sent to your email before accessing journals and tasks.');
  openModal('browser-verify-gate',
   '<h2>'+trText('Yeni tarayıcıyı doğrula','Verify this browser')+'</h2>'+
   '<p>'+subtitle+'</p><p class="mut">'+esc(email)+'</p>'+
   '<label for="browser-verify-code">'+trText('E-posta kodu','Email code')+'</label>'+
   '<input id="browser-verify-code" type="text" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code" aria-describedby="browser-verify-message">'+
   '<p id="browser-verify-message" role="status" aria-live="polite">'+trText('Kod kontrolü bekleniyor.','Waiting for verification code.')+'</p>'+
   '<div class="row"><button data-browser-verify onclick="IYBrowserGate.confirm()">'+trText('Kodu doğrula','Verify code')+'</button>'+
   '<button class="g" data-browser-verify onclick="IYBrowserGate.request()">'+trText('Yeni kod gönder','Resend code')+'</button>'+
   '<button class="g" onclick="IYBrowserGate.signOut()">'+trText('Girişe dön','Back to sign in')+'</button></div>');
 }
 function setBusy(value){
  busy=value;
  document.querySelectorAll('[data-browser-verify]').forEach(x=>{x.disabled=value});
 }
 async function request(){
  if(busy||!pendingUid)return false;
  setBusy(true);
  try{
   const result=await requestApi('request');
   if(result.alreadyVerified){showMessage(trText('Oturum zaten doğrulanmış.','Session is already verified.'));return true}
   if(!result.id)throw Error('SERVER_UNAVAILABLE');
   challengeId=result.id;
   keepChallenge(pendingUid,pendingSid,challengeId);
   showMessage(trText('Kod gönderildi. E-postanı kontrol et.','Code sent. Check your email.'));
   document.getElementById('browser-verify-code')?.focus();
   return true;
  }catch(error){
    if(error.code==='SESSION_EXPIRED'){signOut();toast(note('SESSION_EXPIRED'));return false}
    showMessage(note(error.code||error.message));return false
  }
  finally{setBusy(false)}
 }
 async function check(user){
  const identity=sessionIdentity();
  if(!identity||identity.uid!==user?.id)throw Error('UNAUTHORIZED');
  pendingUid=identity.uid;pendingSid=identity.sid;
  let verified=false,failed=false;
  try{
   verified=(await requestApi('status')).verified===true;
  }catch(error){
   if(error.code==='SESSION_EXPIRED'){signOut();toast(note('SESSION_EXPIRED'));return false}
   failed=true
  }
  if(verified){
   dropChallenge(identity.uid,identity.sid);
   pendingUid='';pendingSid='';challengeId='';entered=false;
   return true;
  }
  challengeId=priorChallenge(identity.uid,identity.sid);
  display(user);
  if(failed)showMessage(note('SERVER_UNAVAILABLE'));
  else if(!challengeId){
   await request();
  }else{
   showMessage(trText('E-postandaki mevcut kodu gir.','Enter the code from your email.'));
  }
  return false;
 }
 async function confirm(){
  if(busy||!pendingUid)return false;
  const code=String(document.getElementById('browser-verify-code')?.value||'').trim();
  if(!/^\d{6}$/.test(code)){showMessage(trText('6 haneli kodu yaz.','Enter the 6-digit code.'));return false}
  if(!challengeId){showMessage(trText('Önce kod gönder.','Request a code first.'));return false}
  setBusy(true);
  try{
   const before=sessionIdentity();
   const result=await requestApi('confirm',{id:challengeId,code});
   if(!result.verified)throw Error('SERVER_UNAVAILABLE');
   dropChallenge(pendingUid,pendingSid);
   pendingUid='';pendingSid='';challengeId='';
   closeModal('browser-verify-gate');
   const active=sbSession();
   if(!active?.user||active.user.id!==before.uid)throw Error('UNAUTHORIZED');
   entered=true;
   await activateCloudUser(active,'',active.user.app_metadata?.providers?.includes('google')?'google':'password');
   entered=false;
   return true;
  }catch(error){
    entered=false;
    if(error.code==='SESSION_EXPIRED'){signOut();toast(note('SESSION_EXPIRED'));return false}
    showMessage(note(error.code||error.message));return false
  }
  finally{setBusy(false)}
 }
 function isPending(){return !!pendingUid}
 function signOut(){
  pendingUid='';pendingSid='';challengeId='';entered=false;
  closeModal('browser-verify-gate');
  // This is explicit user sign-out (or a forced OAuth expiry).
  // Revoke the Supabase session before discarding its local bearer.
  if(typeof invalidateCloudSession==='function')invalidateCloudSession();
  sbClear();
  A=null;view='login';renderAppOrAuth();
 }
 // A suspended tab can exceed the deadline without JS timers firing; check
 // again when it becomes visible. Backend RLS enforces the same limit.
 setInterval(()=>{try{enforceSessionLifetime()}catch{}},10000);
 window.addEventListener('focus',()=>{try{enforceSessionLifetime()}catch{}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)enforceSessionLifetime()});
 return {check,request,confirm,isPending,signOut,enforceSessionLifetime,oauthExpiry};
})();
