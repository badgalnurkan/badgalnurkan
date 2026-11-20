/* Email change: old and new mailbox confirmation stays in initiating browser.
 * Only the Supabase Auth server can decide when the email has changed.
 * Never persist, log or echo one-time codes.
 */
window.IYEmailChange=(()=>{
 'use strict';
 let pending=null,busy=false;
 const lang=(tr,en)=>typeof DB!=='undefined'&&DB?.lang==='tr'?tr:en;
 function identity(){
  const s=sbSession();
  return s?.access_token&&s?.user?.id?s.user.id:'';
 }
 function safeValue(x){return String(x||'').trim().toLowerCase()}
 function validEmail(x){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)&&x.length<=254}
 function message(text){
  const element=document.getElementById('email-change-otp-status');
  if(element)element.textContent=text;
 }
 function render(){
  if(!pending)return;
  const oldEmail=esc(pending.oldEmail),newEmail=esc(pending.newEmail);
  const caption=lang(
   'Eski ve yeni e-posta adresine gönderilen kodları bu tarayıcıda doğrula. Güvenli e-posta değişikliği açıksa her iki adresin onayı gerekir.',
   'Verify the codes sent to your old and new inbox in this browser. Secure email change requires confirmation from both addresses.');
  openModal('email-change-otp',
    '<h2>'+lang('E-posta değişikliğini doğrula','Verify email change')+'</h2>'+
    '<p class="mut">'+caption+'</p>'+
    '<p>'+lang('Mevcut adres','Current email')+': <strong>'+oldEmail+'</strong></p>'+
    '<label for="email-change-old-code">'+lang('Mevcut adrese gelen 6 haneli kod','6-digit code sent to current email')+'</label>'+
    '<input id="email-change-old-code" autocomplete="one-time-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}">'+
    '<button type="button" data-email-change-verify onclick="IYEmailChange.verify(\'old\')">'+lang('Mevcut adresi doğrula','Verify current email')+'</button>'+
    '<p>'+lang('Yeni adres','New email')+': <strong>'+newEmail+'</strong></p>'+
    '<label for="email-change-new-code">'+lang('Yeni adrese gelen 6 haneli kod','6-digit code sent to new email')+'</label>'+
    '<input id="email-change-new-code" autocomplete="one-time-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}">'+
    '<button type="button" data-email-change-verify onclick="IYEmailChange.verify(\'new\')">'+lang('Yeni adresi doğrula','Verify new email')+'</button>'+
    '<p id="email-change-otp-status" role="status" aria-live="polite"></p>'+
    '<button class="g" type="button" onclick="IYEmailChange.cancel()">'+lang('Kapat','Close')+'</button>');
 }
 function start({uid,oldEmail,newEmail}){
  const old=safeValue(oldEmail),next=safeValue(newEmail);
  if(!uid||identity()!==uid||!validEmail(old)||!validEmail(next)||old===next)return false;
  pending={uid,oldEmail:old,newEmail:next,oldAccepted:false,newAccepted:false};
  render();
  message(lang('E-postalarına gelen kodları girebilirsin.','Enter the codes from your inboxes.'));
  return true;
 }
 function cancel(){pending=null;closeModal('email-change-otp')}
 function disableButtons(value){
  busy=value;
  document.querySelectorAll('[data-email-change-verify]').forEach(e=>{e.disabled=value});
 }
 async function verify(which){
  if(busy||!pending||!['old','new'].includes(which))return false;
  if(identity()!==pending.uid){cancel();return false}
  const element=document.getElementById(which==='old'?'email-change-old-code':'email-change-new-code');
  const token=String(element?.value||'').trim();
  if(!/^\d{6}$/.test(token)){
   message(lang('6 haneli kodu yaz.','Enter a six-digit code.'));
   return false
  }
  if(element)element.value='';
  const saved=pending;
  disableButtons(true);
  try{
   const email=which==='old'?saved.oldEmail:saved.newEmail;
   const verified=await sb('/auth/v1/verify',{method:'POST',
     body:{email,token,type:'email_change'}});
   if(!pending||pending!==saved||identity()!==saved.uid)throw Error('SESSION_CHANGED');
   if(verified?.user?.id&&verified.user.id!==saved.uid)throw Error('USER_CHANGED');
   if(verified?.access_token&&verified?.refresh_token&&verified?.user?.id===saved.uid){
    sbSave({...verified,at:Date.now()});
   }
   if(which==='old')saved.oldAccepted=true;
   if(which==='new')saved.newAccepted=true;
   const current=await sbCurrentUser();
   if(!pending||pending!==saved||current?.id!==saved.uid)throw Error('SESSION_CHANGED');
   if(safeValue(current.email)===saved.newEmail&&current.email_confirmed_at){
    cancel();
    if(typeof IYAccount!=='undefined')await IYAccount.refresh();
    toast(lang('Yeni e-posta adresin sunucu tarafından doğrulandı.','Your new email was confirmed by the server.'));
    return true;
   }
   message(lang('Bu adresin kodu kabul edildi. Değişikliğin tamamlanması için diğer adresin onayı da gerekebilir.',
       'Code accepted. The other inbox may also need confirmation before the email change is complete.'));
   return true;
  }catch(e){
   if(pending===saved){
    if(e?.message==='SESSION_CHANGED'||e?.message==='USER_CHANGED')cancel();
    else message(lang('Kod doğrulanamadı. Yanlış veya süresi dolmuş olabilir. Yeni kod istemek için e-posta değişikliği talebini tekrarla.',
     'Code was not verified. It may be invalid or expired. Start a new email-change request to get another code.'));
   }
   return false;
  }finally{disableButtons(false)}
 }
 return {start,verify,cancel};
})();
