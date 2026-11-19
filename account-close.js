/* Standalone deletion link. The proof is kept in memory and never persisted. */
(()=>{
'use strict';
const SUPABASE_URL="https://flcfqwndqfmbritaywfb.supabase.co";
const SUPABASE_KEY="sb_publishable_4QTEEc6tSYV2QtNhmeP6Iw_B3sM6dtm";
const locale=(navigator.language||'tr').toLowerCase().startsWith('tr')?'tr':'en';
const tr=(a,b)=>locale==='tr'?a:b;
document.documentElement.lang=locale;
for(const el of document.querySelectorAll('[data-tr]'))el.textContent=el.dataset[locale]||el.textContent;
const status=document.getElementById('status');
const reason=document.getElementById('deletion-reason');
const other=document.getElementById('deletion-other');
const reasonStep=document.getElementById('reason-step');
const confirmationStep=document.getElementById('confirm-step');
const doneStep=document.getElementById('done-step');
const path=new URLSearchParams(location.hash.slice(1));
const id=path.get('id')||'';
let token=path.get('token')||'';
const allowedReasons=new Set(['break','not_useful','hard_to_use','technical','privacy','emails','another_account','other']);
const valid=/^[a-f0-9-]{36}$/i.test(id)&&/^[a-f0-9]{64}$/.test(token);
history.replaceState(history.state||{},'',location.pathname);
const say=(a,b)=>{status.textContent=tr(a,b)};
if(!valid){
 say('Bağlantı eksik veya geçersiz. Yeni bir hesap silme bağlantısı iste.','Missing or invalid link. Request a new account deletion email.');
 return;
}
reasonStep.hidden=false;
function chooseReason(){
 const why=reason.value,description=other.value.trim();
 if(!allowedReasons.has(why)){say('Lütfen bir sebep seç.','Please choose a reason.');reason.focus();return null}
 if(why==='other'&&!description){say('Diğer sebebini yaz.','Please describe the other reason.');other.focus();return null}
 if(description.length>1000){say('Açıklama çok uzun.','The reason is too long.');return null}
 return {reason:why,other:why==='other'?description:''};
}
reason.addEventListener('change',()=>{document.getElementById('other-wrap').hidden=reason.value!=='other';status.textContent=''});
document.getElementById('review-deletion').addEventListener('click',()=>{
 if(!chooseReason())return;
 reasonStep.hidden=true;confirmationStep.hidden=false;status.textContent='';
 document.getElementById('finalize-deletion').focus();
});
document.getElementById('return-to-reasons').addEventListener('click',()=>{
 confirmationStep.hidden=true;reasonStep.hidden=false;status.textContent='';reason.focus();
});
const yes=document.getElementById('finalize-deletion');
yes.addEventListener('click',async()=>{
 if(yes.disabled)return;
 const details=chooseReason();
 if(!details){confirmationStep.hidden=true;reasonStep.hidden=false;return}
 yes.disabled=true;
 say('Talebin güvenli şekilde doğrulanıyor…','Verifying your request securely…');
 try{
  const response=await fetch(SUPABASE_URL+'/functions/v1/account-security',{
   method:'POST',redirect:'error',referrerPolicy:'no-referrer',
   headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},
   body:JSON.stringify({action:'confirm_delete',id,token,reason:details.reason,other:details.other,confirmation:'YES_DELETE_IN_60_DAYS',lang:locale}),
   signal:AbortSignal.timeout(15000),cache:'no-store'
  });
  const result=await response.json();
  if(!response.ok||result?.ok!==true||result?.state!=='pending_delete'||!result.delete_after)
   throw Error('ACCOUNT_CONFIRMATION_FAILED');
  token='';
  confirmationStep.hidden=true;reasonStep.hidden=true;doneStep.hidden=false;
  const until=new Date(result.delete_after);
  document.getElementById('deletion-deadline').textContent=tr(
   'Verilerin bu tarihe kadar korunur: ','Your data is retained until: ')+
   (Number.isFinite(until.getTime())?until.toLocaleString(locale==='tr'?'tr-TR':'en-GB',{dateStyle:'long',timeZone:'Europe/Istanbul'}):String(result.delete_after));
  status.textContent='';
 }catch(error){
  console.warn('Deletion confirmation failed',error?.message);
  say('Bağlantı kullanılmış, geçersiz veya sunucuya ulaşılamıyor. Hesabın kapatıldığı doğrulanamadı; yeniden bağlantı iste.','The link may have expired or the server is unreachable. Deletion was not confirmed; request another link.');
  yes.disabled=false;
 }
});
})();
