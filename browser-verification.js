/* The server approves an Auth session only after its account email is proved. */
window.IYBrowserGate=(()=>{
 'use strict';
 let pending=null,challenge='',busy=false,generation=0;
 const text=(trValue,enValue)=>tr()?trValue:enValue;
 const notices={
  MAIL_NOT_CONFIGURED:['Giriş kodu gönderimi hazır değil. Biraz sonra tekrar dene.','Sign-in email is unavailable. Please retry shortly.'],
  MAIL_SEND_FAILED:['Kod gönderilemedi. Yeni kod isteyebilirsin.','The code could not be sent. You can request another.'],
  RATE_LIMITED:['Yeni kod istemeden önce 60 saniye bekle. Saatte en fazla 5 kod isteyebilirsin.','Wait 60 seconds before requesting another code. Up to five codes are allowed per hour.'],
  INVALID_CHALLENGE:['Kod yanlış, süresi dolmuş veya kullanılmış. En son gelen kodu kontrol et.','The code is incorrect, expired, or already used. Check the latest email.'],
  EMAIL_NOT_VERIFIED:['Önce kayıt e-postanı doğrula.','Confirm your signup email first.'],
  ACCOUNT_RESTRICTED:['Hesabının durumunu kontrol etmek için yeniden giriş yap.','Sign in again to check your account status.'],
  UNAUTHORIZED:['Oturum değişti veya sona erdi. Yeniden giriş yap.','Your session changed or expired. Sign in again.'],
  SERVER_UNAVAILABLE:['Doğrulama tamamlanamadı. Verilerin yüklenmedi; tekrar deneyebilirsin.','Verification could not finish. Your data has not been loaded; you can retry.']
 };
 function message(code){const pair=notices[code]||notices.SERVER_UNAVAILABLE;return pair[tr()?0:1]}
 function identity(){
  const s=sbSession();
  try{
   if(!s?.user?.id||!s.access_token)return null;
   const part=s.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
   const claims=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')));
   return claims.sub===s.user.id&&claims.session_id?{uid:s.user.id,sid:claims.session_id}:null;
  }catch{return null}
 }
 function current(at){
  const id=identity();
  return pending===at&&at.generation===generation&&id?.uid===at.uid&&id.sid===at.sid;
 }
 function key(at){return 'iydu.browser.challenge.v1.'+at.uid+'.'+at.sid}
 function remembered(at){
  try{
   const item=JSON.parse(sessionStorage.getItem(key(at))||'null');
   return /^[a-f0-9-]{36}$/i.test(item?.id||'')&&Date.now()-item.at<600000?item.id:'';
  }catch{return ''}
 }
 function forget(at){try{sessionStorage.removeItem(key(at))}catch{}}
 function status(value){const el=document.getElementById('browser-verify-message');if(el)el.textContent=value}
 function lock(value){busy=value;document.querySelectorAll('[data-browser-verify]').forEach(el=>{el.disabled=value})}
 async function api(at,action,fields={}){
  if(!current(at))throw Object.assign(Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'});
  const send=()=>fetch(SUPABASE_URL+'/functions/v1/browser-verification',{
   method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,Authorization:'Bearer '+sbSession().access_token},
   body:JSON.stringify({action,lang:DB.lang,...fields}),signal:AbortSignal.timeout(15000),cache:'no-store'
  });
  let response=await send();
  if(response.status===401&&await sbRefresh()){
   if(!current(at))throw Object.assign(Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'});
   response=await send();
  }
  const result=await response.json().catch(()=>({code:'SERVER_UNAVAILABLE'}));
  if(!current(at))throw Object.assign(Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'});
  if(!response.ok||result.ok!==true)throw Object.assign(Error(result.code||'SERVER_UNAVAILABLE'),{code:result.code||'SERVER_UNAVAILABLE'});
  return result;
 }
 function display(user){
  A=null;view='login';pg='home';renderAppOrAuth();
  openModal('browser-verify-gate',
   '<h2>'+text('Girişini doğrula','Verify your sign-in')+'</h2>'+
   '<p>'+text('Devam etmek için hesabının doğrulanmış e-posta adresine gelen 6 haneli kodu bu ekrana gir.','Enter the six-digit code from your verified account email here to continue.')+'</p>'+
   '<p class="mut">'+esc(String(user.email||''))+'</p>'+
   '<label for="browser-verify-code">'+text('Giriş kodu','Sign-in code')+'</label>'+
   '<input id="browser-verify-code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" aria-describedby="browser-verify-message" onkeydown="if(event.key===\'Enter\'){event.preventDefault();IYBrowserGate.confirm()}">'+
   '<p id="browser-verify-message" role="status" aria-live="polite"></p>'+
   '<div class="row"><button data-browser-verify onclick="IYBrowserGate.confirm()">'+text('Kodu doğrula','Verify code')+'</button>'+
   '<button class="g" data-browser-verify onclick="IYBrowserGate.request()">'+text('Yeni kod iste','Request another code')+'</button>'+
   '<button class="g" onclick="IYBrowserGate.signOut()">'+text('Girişe dön','Back to sign in')+'</button></div>');
 }
 async function enter(at){
  if(!current(at))return false;
  const session=sbSession();
  forget(at);pending=null;challenge='';generation++;
  closeModal('browser-verify-gate');
  try{
   await activateCloudUser(session,at.preferredName,at.method,at.options);
   return true;
  }catch{
   A=null;view='login';pg='home';loginDat={u:session.user.email||'',p:''};
   msg=text('Kod doğrulandı ancak hesap verileri yüklenemedi. Yeniden giriş yapabilirsin.','The code was verified, but account data could not be loaded. You can sign in again.');
   renderAppOrAuth();return false;
  }
 }
 async function request(){
  const at=pending;if(busy||!at)return false;
  lock(true);
  try{
   const result=await api(at,'request');
   if(result.alreadyVerified===true)return await enter(at);
   if(!/^[a-f0-9-]{36}$/i.test(result.id||''))throw Error('SERVER_UNAVAILABLE');
   challenge=result.id;
   try{sessionStorage.setItem(key(at),JSON.stringify({id:challenge,at:Date.now()}))}catch{}
   status(text('E-posta servisi kod isteğini kabul etti. Gelen kutunu ve spam klasörünü kontrol et.','The email service accepted the code request. Check your inbox and spam folder.'));
   document.getElementById('browser-verify-code')?.focus();return true;
  }catch(error){if(current(at))status(message(error.code||error.message));return false}
  finally{if(pending===at||!pending)lock(false)}
 }
 async function check(user,context={}){
  const id=identity();
  if(!id||id.uid!==user?.id)throw Error('UNAUTHORIZED');
  const at={...id,...context,generation:++generation};
  pending=at;challenge='';busy=false;
  let verified=false,failed=false;
  try{verified=(await api(at,'status')).verified===true}catch{failed=true}
  if(!current(at))return false;
  if(verified){forget(at);pending=null;return true}
  challenge=remembered(at);display(user);
  if(failed)status(message('SERVER_UNAVAILABLE'));
  else if(challenge)status(text('En son gelen giriş kodunu yaz.','Enter the latest sign-in code.'));
  else await request();
  return false;
 }
 async function confirm(){
  const at=pending;if(busy||!at)return false;
  const code=String(document.getElementById('browser-verify-code')?.value||'').trim();
  if(!/^\d{6}$/.test(code)){status(text('6 haneli kodu yaz.','Enter the six-digit code.'));return false}
  if(!challenge){status(text('Önce yeni kod iste.','Request a code first.'));return false}
  lock(true);
  try{
   const result=await api(at,'confirm',{id:challenge,code});
   if(result.verified!==true)throw Error('SERVER_UNAVAILABLE');
   return await enter(at);
  }catch(error){if(current(at))status(message(error.code||error.message));return false}
  finally{if(pending===at||!pending)lock(false)}
 }
 function signOut(){
  if(pending)forget(pending);
  pending=null;challenge='';generation++;lock(false);closeModal('browser-verify-gate');
  if(typeof invalidateCloudSession==='function')invalidateCloudSession();
  sbClear();A=null;view='login';renderAppOrAuth();
 }
 return {check,request,confirm,signOut,isPending:()=>!!pending};
})();
