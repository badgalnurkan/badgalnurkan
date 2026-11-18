/* Account security UI. Supabase owns identity; local profile JSON never grants access. */
window.IYAccount=(()=>{
 let state=null,stateUid='',busy=false,challenge=null,deleteLink=null,lastCheck=0;
 const txt=(a,b)=>tr()?a:b;
 const field=id=>String(document.getElementById(id)?.value||'');
 const date=value=>value?new Date(value).toLocaleString(tr()?'tr-TR':'en-GB',{timeZone:'Europe/Istanbul',dateStyle:'medium',timeStyle:'short'}):'—';
 const errors={
  MAIL_NOT_CONFIGURED:['Hesap onay e-postaları henüz etkin değil. Hesabında değişiklik yapılmadı.','Account confirmation email is not configured. Your account was not changed.'],
  MAIL_SEND_FAILED:['Onay e-postası gönderilemedi. Hesabında değişiklik yapılmadı.','Could not send the confirmation email. Your account was not changed.'],
  RECENT_SIGN_IN_REQUIRED:['Güvenlik için Google veya şifrenle yeniden giriş yapıp tekrar dene.','For security, sign in again with Google or your password and retry.'],
  EMAIL_NOT_VERIFIED:['Önce mevcut e-posta adresini doğrula.','Verify your current email address first.'],
  RATE_LIMITED:['Yeni kod için en az 60 saniye bekle. Saatte en fazla 5 istek gönderebilirsin.','Wait at least 60 seconds. You can request up to 5 emails per hour.'],
  INVALID_CHALLENGE:['Kod veya bağlantı geçersiz, süresi dolmuş ya da kullanılmış. Yeni bir tane iste.','The code or link is invalid, expired or already used. Request a new one.'],
  DELETION_DUE:['30 günlük geri alma süresi doldu. Hesap yeniden açılamaz.','The 30-day recovery period has expired. This account cannot be reopened.'],
  UNAUTHORIZED:['Oturumun doğrulanamadı. Yeniden giriş yap.','Your session could not be verified. Sign in again.']
 };
 function message(e){const v=errors[e.code||e.message];return v?v[tr()?0:1]:txt('İşlem tamamlanamadı. Bağlantını kontrol edip tekrar dene.','Could not complete the action. Check your connection and retry.')}
 async function run(work){
  if(busy)return;busy=true;document.querySelectorAll('[data-security-action]').forEach(x=>x.disabled=true);
  try{return await work()}catch(e){const target=document.getElementById('security-message');if(target)target.textContent=message(e);toast(message(e))}
  finally{busy=false;document.querySelectorAll('[data-security-action]').forEach(x=>x.disabled=false)}
 }
 async function api(action,fields={}){
  const session=sbSession();
  const headers={'Content-Type':'application/json','apikey':SUPABASE_KEY};
  if(action!=='confirm_delete'){
   if(!session?.access_token)throw Object.assign(Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'});
   headers.Authorization='Bearer '+session.access_token;
  }
  let response=await fetch(SUPABASE_URL+'/functions/v1/account-security',{method:'POST',headers,body:JSON.stringify({action,...fields,lang:DB.lang}),signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(response.status===401&&action!=='confirm_delete'&&await sbRefresh()){
   headers.Authorization='Bearer '+sbSession().access_token;
   response=await fetch(SUPABASE_URL+'/functions/v1/account-security',{method:'POST',headers,body:JSON.stringify({action,...fields,lang:DB.lang}),signal:AbortSignal.timeout(15000),cache:'no-store'});
  }
  const data=await response.json();
  if(!response.ok||data.ok!==true)throw Object.assign(Error(data.code||'SERVICE_UNAVAILABLE'),{code:data.code});
  return data;
 }
 async function status(user){
  const expected=user?.id||sbSession()?.user?.id;
  const data=await sb('/rest/v1/rpc/iydu_account_status',{method:'POST',body:{}});
  if(!expected||!data||data.user_id!==expected||sbSession()?.user?.id!==expected)throw Object.assign(Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'});
  state=data;stateUid=expected;lastCheck=Date.now();
  if(A?.authUid===expected){A.email=data.email||'';A.mail=A.email;}
  return data;
 }
 function emailMarkup(){
  const verified=state&&stateUid===A?.authUid;
  return '<span data-account-email>'+esc(verified?(state.email||'—'):txt('E-posta doğrulanıyor…','Verifying email…'))+'</span>';
 }
 function settingsMarkup(){
  return '<section class="card account-security" aria-labelledby="security-title"><h2 id="security-title">'+txt('Hesap güvenliği ve e-posta','Account security and email')+'</h2><div id="security-content" aria-live="polite"><p class="mut">'+txt('Sunucudan hesap bilgileri alınıyor…','Loading account details…')+'</p></div><details id="password-renewal" class="security-details"><summary>'+txt('Şifreyi değiştir','Change password')+'</summary><div id="account-password-form"></div><p>'+txt('Doğrulanmış hesap adresine şifre yenileme bağlantısı gönder.','Send a password reset link to your verified account email.')+'</p><button type="button" data-security-action onclick="requestMyPasswordReset()">'+txt('Şifre yenileme bağlantısı gönder','Send password reset link')+'</button></details><p id="security-message" role="status"></p></section>';
 }
 function passwordForm(prefix='security-',hasPassword=true){
  return '<div class="security-form">'+(hasPassword?'<label for="'+prefix+'old">'+txt('Mevcut şifre','Current password')+'</label><input id="'+prefix+'old" type="password" autocomplete="current-password">':'')+
   '<label for="'+prefix+'new">'+txt('Yeni uygulama şifresi','New app password')+'</label><input id="'+prefix+'new" type="password" minlength="8" autocomplete="new-password"><label for="'+prefix+'confirm">'+txt('Yeni şifre tekrar','Confirm new password')+'</label><input id="'+prefix+'confirm" type="password" minlength="8" autocomplete="new-password"><button data-security-action onclick="IYAccount.password(\''+prefix+'\','+hasPassword+')">'+txt('Şifreyi kaydet','Save password')+'</button></div>';
 }
 function renderDetails(){
  document.querySelectorAll('[data-account-email]').forEach(el=>el.textContent=state?.email||'—');
  const target=document.getElementById('security-content');if(!target||stateUid!==A?.authUid)return;
  const form=document.getElementById('account-password-form');
  if(form){
   const owner=state.has_password===true?stateUid:'';
   if((form.dataset.owner||'')!==owner){
    form.innerHTML=owner?passwordForm():'';
    form.dataset.owner=owner;
   }
  }
  const pending=state.pending_email?'<p class="note">'+txt('Onay bekleyen adres: ','Awaiting confirmation: ')+esc(state.pending_email)+'</p>':'';
  target.innerHTML='<dl class="security-summary"><div><dt>'+txt('Hesap e-postası','Account email')+'</dt><dd>'+esc(state.email||'—')+'</dd></div><div><dt>'+txt('E-posta durumu','Email status')+'</dt><dd>'+txt(state.email_verified?'Doğrulanmış':'Doğrulama bekliyor',state.email_verified?'Verified':'Awaiting verification')+'</dd></div></dl>'+pending+
   (!state.email_verified?'<button class="g" data-security-action onclick="requestMyEmailVerification()">'+txt('Doğrulama e-postası gönder','Send verification email')+'</button>':'')+
   '<details class="security-details"><summary>'+txt('E-posta adresini değiştir','Change email address')+'</summary><p class="mut">'+txt('Yeni adresin için gönderilen doğrulama bağlantılarını tamamla. Güvenli e-posta değişimi açıksa mevcut adresine de onay gönderilir.','Complete the verification links for your new address. Secure email change also sends a confirmation to your current address.')+'</p><label for="change-email-input">'+txt('Yeni e-posta','New email')+'</label><input id="change-email-input" type="email" autocomplete="email" placeholder="name@example.com"><button data-security-action onclick="requestMyEmailChange()">'+txt('Değişiklik iste','Request email change')+'</button></details>'+
   '<details class="security-details"><summary>'+txt('Hesabı geçici olarak kapat','Temporarily close account')+'</summary><p class="mut">'+txt('E-postana gelen 6 haneli kodu girdiğinde hesabın kapatılır. Verilerin korunur; yeniden giriş yapıp e-posta koduyla açabilirsin.','Enter the 6-digit email code to deactivate. Your data is kept; sign in again and verify an email code to reactivate.')+'</p><button class="g" data-security-action onclick="IYAccount.request(\'deactivate\')">'+txt('Onay kodu gönder','Send confirmation code')+'</button></details>'+
   '<details class="security-details"><summary>'+txt('Hesabı kalıcı olarak kapat','Permanently close account')+'</summary><p class="mut">'+txt('Önce e-postana onay bağlantısı gönderilir. Sebebini seçip son onayı verdikten sonra 30 gün boyunca geri açabilirsin. Süre dolunca hesap ve uygulama verileri kalıcı olarak silinir.','An email link lets you choose a reason and confirm. You can reactivate for 30 days after confirmation. After that, the account and app data are permanently deleted.')+'</p><button class="g" data-security-action onclick="IYAccount.request(\'delete\')">'+txt('Silme bağlantısı gönder','Send deletion link')+'</button></details>';
 }
 async function refresh(){
  if(!A?.authUid)return;
  const uid=A.authUid;
  try{const s=await status();if(A?.authUid!==uid)return;if(s.state!=='active'||s.password_required){gate(s);return}renderDetails()}
  catch(e){if(e.code==='UNAUTHORIZED'&&A?.authUid===uid){clearIdentity();toast(message(e));return}const el=document.getElementById('security-content');if(el)el.textContent=message(e)}
 }
 async function checkAccess(user){
  const s=await status(user);
  if(s.state!=='active'||s.password_required){gate(s);return false}
  return true;
 }
 function gate(s,recovery=false){
  const uid=stateUid;
  if(A?.authUid===uid||Object.values(DB.accounts||{}).some(a=>a?.authUid===uid)){const verifiedSession=sbSession();stopTimers();removeDeletedAccountFromBrowser(uid,A?.u||'');if(verifiedSession?.user?.id===uid)sbSave(verifiedSession);}
  // Preserve only the verified Auth session for code-based reactivation or password renewal.
  A=null;view='login';pg='home';renderAppOrAuth();
  document.querySelectorAll('.modal').forEach(x=>x.remove());
  const deletionExpired=s.state==='pending_delete'&&new Date(s.delete_after)<=new Date(s.server_time);
  let content='<p>'+esc(s.email||'')+'</p>';
  if(s.state==='active'){
   content+='<p>'+txt(recovery?'E-postayla doğruladığın hesap için yeni bir şifre belirle.':'90 günlük şifre süren doldu. Devam etmek için şifreni yenile.',recovery?'Set a new password for your verified recovery session.':'Your 90-day password period has ended. Renew it to continue.')+'</p>'+passwordForm('gate-',!recovery&&s.has_password)+
    '<button class="g" data-security-action onclick="requestMyPasswordReset()">'+txt('Yenileme bağlantısı gönder','Send a reset link')+'</button>';
  }else{
   content+='<p>'+txt(s.state==='deactivated'?'Hesabın geçici olarak kapalı. Verilerin korunuyor.':deletionExpired?'Hesabının geri açılma süresi doldu.':'Hesabın silinmeyi bekliyor. Şu tarihe kadar geri açabilirsin: '+date(s.delete_after),
    s.state==='deactivated'?'Your account is temporarily closed. Your data is kept.':deletionExpired?'The reactivation period has expired.':'Your account is scheduled for deletion. Reactivate before '+date(s.delete_after))+'</p>';
   if(!deletionExpired)content+='<button data-security-action onclick="IYAccount.request(\'reactivate\')">'+txt('Yeniden açma kodu gönder','Send reactivation code')+'</button>';
  }
  content+='<p id="security-message" role="status"></p><button class="g" onclick="IYAccount.signOut()">'+txt('Giriş ekranına dön','Back to sign in')+'</button>';
  openModal('security-gate','<h2>'+txt('Hesap güvenliği','Account security')+'</h2>'+content);
 }
 async function recovery(user){const s=await status(user);gate(s,s.state==='active')}
 async function request(kind){return run(async()=>{
  const data=await api('request_'+kind);
  if(kind==='delete'){toast(txt('Onay bağlantısı gönderildi. E-postanı kontrol et.','Confirmation link sent. Check your email.'));return}
  challenge={kind,id:data.id,uid:sbSession()?.user?.id};
  openModal('account-code','<h2>'+txt('E-posta kodunu gir','Enter your email code')+'</h2><p>'+txt('Kod 10 dakika geçerli; en fazla 5 kez deneyebilirsin. Yeni kod için 60 saniye bekle.','The code is valid for 10 minutes with up to 5 attempts. Wait 60 seconds before requesting another.')+'</p><label for="account-code-input">'+txt('6 haneli onay kodu','6-digit confirmation code')+'</label><input id="account-code-input" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"><div class="row"><button data-security-action onclick="IYAccount.confirmCode()">'+txt('Onayla','Confirm')+'</button><button class="g" onclick="closeModal(\'account-code\')">'+txt('Vazgeç','Cancel')+'</button></div>');
 })}
 async function confirmCode(){return run(async()=>{
  if(!challenge||challenge.uid!==sbSession()?.user?.id)throw Error('UNAUTHORIZED');
  const token=field('account-code-input').trim();
  if(!/^\d{6}$/.test(token))return toast(txt('6 haneli kodu yaz.','Enter the 6-digit code.'));
  const kind=challenge.kind;
  if(kind==='deactivate'&&A?.authUid===challenge.uid&&!await sbPush())throw Error('SERVICE_UNAVAILABLE');
  await api('confirm_'+kind,{id:challenge.id,token});challenge=null;closeModal('account-code');
  if(kind==='reactivate'){closeModal('security-gate');await restoreCloudOnLoad();toast(txt('Hesabın yeniden açıldı.','Your account is active again.'))}
  else {clearIdentity();toast(txt('Hesabın geçici olarak kapatıldı.','Your account was temporarily closed.'))}
 })}
 function clearIdentity(){
  const uid=stateUid||sbSession()?.user?.id;
  stopTimers();removeDeletedAccountFromBrowser(uid,A?.u||'');sbClear();state=null;stateUid='';
  document.querySelectorAll('.modal').forEach(x=>x.remove());goTo('welcome','home');
 }
 function signOut(){state=null;stateUid='';document.querySelectorAll('.modal').forEach(x=>x.remove());goLogin()}
 async function password(prefix='security-',hasPassword=true){return run(async()=>{
  const uid=sbSession()?.user?.id,s=await status();
  const password=field(prefix+'new'),confirm=field(prefix+'confirm');
  const problem=pwOk(password,A?.u||'');if(problem)return toast(problem);
  if(password.length<8)return toast(txt('Şifre en az 8 karakter olmalı.','Use at least 8 characters.'));
  if(password!==confirm)return toast(txt('Şifreler eşleşmiyor.','Passwords do not match.'));
  if(hasPassword){
   if(!field(prefix+'old'))return toast(txt('Mevcut şifreni yaz.','Enter your current password.'));
   const auth=await sbSignIn('',field(prefix+'old'),s.email);
   if(auth?.user?.id!==uid)throw Error('UNAUTHORIZED');sbSave({...auth,at:Date.now()});
  }
  const updated=await sb('/auth/v1/user',{method:'PUT',body:{password}});
  if(updated?.id!==uid)throw Error('UNAUTHORIZED');
  for(const x of ['old','new','confirm']){const input=document.getElementById(prefix+x);if(input)input.value=''}
  await status();
  if(prefix==='gate-'){closeModal('security-gate');await restoreCloudOnLoad()}else renderDetails();
  toast(txt('Şifren yenilendi. Sonraki yenileme 90 gün sonra.','Password renewed. The next renewal is in 90 days.'));
 })}
 function consumeLink(){
  const p=new URLSearchParams(location.hash.slice(1));
  if(p.get('account-action')!=='delete')return false;
  deleteLink={id:p.get('id')||'',token:p.get('token')||''};
  history.replaceState(history.state||{},'',location.pathname+location.search);
  if(!/^[a-f0-9-]{36}$/i.test(deleteLink.id)||!/^[a-f0-9]{64}$/.test(deleteLink.token)){toast(txt('Bağlantı geçersiz.','Invalid link.'));deleteLink=null;return true}
  showReasons();return true;
 }
 const reasons=[['break','Bir süre ara vermek istiyorum','I need a break'],['not_useful','İhtiyaçlarımı karşılamıyor','It does not meet my needs'],['hard_to_use','Kullanımı zor buluyorum','It is difficult to use'],['technical','Teknik sorun yaşıyorum','I have technical problems'],['privacy','Gizlilik endişem var','I have privacy concerns'],['emails','Çok fazla ileti alıyorum','I receive too many messages'],['another_account','Başka bir hesap kullanacağım','I will use another account'],['other','Diğer','Other']];
 function showReasons(){
  openModal('account-delete-reasons','<h2>'+txt('Hesabını neden kapatıyorsun?','Why are you closing your account?')+'</h2><label for="delete-reason">'+txt('Sebep','Reason')+'</label><select id="delete-reason" onchange="document.getElementById(\'delete-other-wrap\').hidden=this.value!==\'other\'"><option value="">'+txt('Bir sebep seç','Choose a reason')+'</option>'+reasons.map(r=>'<option value="'+r[0]+'">'+txt(r[1],r[2])+'</option>').join('')+'</select><div id="delete-other-wrap" hidden><label for="delete-other">'+txt('Diğer sebep','Other reason')+'</label><textarea id="delete-other" maxlength="1000" rows="3"></textarea></div><p class="mut">'+txt('Son onaydan sonra 30 gün içinde yeniden giriş yapıp e-postayla doğrulayarak silmeyi iptal edebilirsin.','After the final confirmation, you can cancel deletion within 30 days by signing in and verifying an email code.')+'</p><div class="row"><button onclick="IYAccount.confirmReason()">'+txt('Tamam','Continue')+'</button><button class="g" onclick="IYAccount.cancelDeletion()">'+txt('Vazgeç','Cancel')+'</button></div>');
 }
 function confirmReason(){
  if(!deleteLink)return;
  const reason=field('delete-reason'),other=field('delete-other').trim();
  if(!reasons.some(r=>r[0]===reason)||(reason==='other'&&!other))return toast(txt('Bir sebep seç; Diğer için açıklama yaz.','Choose a reason; describe Other.'));
  deleteLink.reason=reason;deleteLink.other=other;
  openModal('account-delete-final','<h2>'+txt('Emin misin?','Are you sure?')+'</h2><p>'+txt('Hesabın kapanacak. 30 gün içinde yeniden açmazsan hesabın ve uygulama verilerin kalıcı olarak silinecek.','Your account will be closed. Unless you reactivate within 30 days, the account and app data will be permanently deleted.')+'</p><div class="row"><button data-security-action onclick="IYAccount.finalizeDeletion()">'+txt('Evet, hesabımı kapat','Yes, close my account')+'</button><button class="g" onclick="closeModal(\'account-delete-final\')">'+txt('Hayır','No')+'</button></div>');
 }
 async function finalizeDeletion(){return run(async()=>{
  if(!deleteLink)return;
  const data=await api('confirm_delete',{...deleteLink,confirmation:'YES_DELETE_IN_30_DAYS'});deleteLink=null;
  // Clear this device's identity only if it is the one being closed.
  if(sbSession()?.user?.id===data.user_id||stateUid===data.user_id)clearIdentity();
  else {closeModal('account-delete-final');closeModal('account-delete-reasons')}
  openModal('account-delete-scheduled','<h2>'+txt('Hesap kapatıldı','Account closed')+'</h2><p>'+txt('Yeniden açmak için son tarih: ','Reactivation deadline: ')+esc(date(data.delete_after))+'</p><p>'+txt('Bu tarihten önce giriş yapıp e-posta kodunu doğrula.','Before this deadline, sign in and verify the email code.')+'</p><button onclick="closeModal(\'account-delete-scheduled\')">'+txt('Tamam','Done')+'</button>');
 })}
 function cancelDeletion(){deleteLink=null;closeModal('account-delete-final');closeModal('account-delete-reasons')}
 function cookieInfo(force=false){
  if(!force&&getItem('iydu.storage-notice.v1'))return;
  if(document.getElementById('storage-notice'))return;
  const el=document.createElement('aside');el.id='storage-notice';el.className='storage-notice';el.setAttribute('aria-label',txt('Çerez ve depolama bilgisi','Cookie and storage notice'));
  el.innerHTML='<p>'+txt('Girişini sürdürmek, verilerini ve seçtiğin ayarları saklamak için tarayıcı depolaması kullanıyoruz. Reklam veya analiz çerezi kullanmıyoruz.','We use browser storage for your session, saved data and chosen settings. We do not use advertising or analytics cookies.')+' <a href="/cookies.html">'+txt('Çerez politikası','Cookie policy')+'</a></p><button type="button" onclick="IYAccount.dismissCookie()">'+txt('Anladım','Got it')+'</button>';
  document.body.appendChild(el);
 }
 function dismissCookie(){setItem('iydu.storage-notice.v1',new Date().toISOString());document.getElementById('storage-notice')?.remove()}
 function init(){
  cookieInfo();
  let queued=false;
  new MutationObserver(()=>{
   if(queued)return;queued=true;queueMicrotask(()=>{
    queued=false;
    if(!A?.authUid)return;
    const target=document.getElementById('security-content');
    if(target&&!target.dataset.loaded){target.dataset.loaded='true';refresh()}
    else if(document.querySelector('[data-account-email]')&&stateUid===A.authUid)document.querySelectorAll('[data-account-email]').forEach(el=>{if(el.textContent!==state.email)el.textContent=state.email||'—'});
   });
  }).observe(document.getElementById('app'),{childList:true,subtree:true});
  setInterval(()=>{if(A?.authUid&&Date.now()-lastCheck>60000)refresh()},60000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&A?.authUid)refresh()});
 }
 document.addEventListener('DOMContentLoaded',init,{once:true});
 return {api,status,checkAccess,emailMarkup,settingsMarkup,refresh,recovery,password,request,confirmCode,signOut,consumeLink,showReasons,confirmReason,finalizeDeletion,cancelDeletion,cookieInfo,dismissCookie};
})();
