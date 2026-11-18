// Only a browser with the original PKCE verifier can redeem the email confirmation.
const IYRecovery=(()=>{
 const prefix='iyd.recovery.v1.',ttl=3600000;
 let current='',memory=null,working=false;
 const t=(trText,enText)=>tr()?trText:enText;
 const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const validId=value=>/^[a-f0-9]{32}$/.test(value||'');
 const validCode=value=>typeof value==='string'&&/^[A-Za-z0-9._~-]{20,512}$/.test(value);
 function forget(id){
   try{localStorage.removeItem(prefix+id)}catch{}
   if(memory?.id===id)memory=null;
 }
 function read(id){
   if(!validId(id))return null;
   let data=memory?.id===id?memory:null;
   try{data=JSON.parse(localStorage.getItem(prefix+id)||'null')||data}catch{}
   if(!data||!data.at||Date.now()-data.at>=ttl||Date.now()<data.at){forget(id);return null}
   return data;
 }
 function requests(){
   const ids=new Set(memory?[memory.id]:[]);
   try{for(const key of Object.keys(localStorage))if(key.startsWith(prefix))ids.add(key.slice(prefix.length))}catch{}
   return [...ids].map(read).filter(Boolean);
 }
 function status(id,text){const el=document.getElementById(id);if(el)el.textContent=text}
 function waiting(){
   openModal('recovery-browser-wait',`<h2>${t('Şifreni bu tarayıcıda yenile','Reset in this browser')}</h2><p>${t('E-postandaki bağlantıyı aç. Başka bir tarayıcı açılırsa orada gösterilen kodu buraya gir.','Open the link in your email. If another browser opens, enter the code it shows here.')}</p><label for="recovery-return-code">${t('Doğrulama kodu','Confirmation code')}</label><input id="recovery-return-code" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="512"><button onclick="IYRecovery.submit()">${t('Bu tarayıcıda devam et','Continue in this browser')}</button><p id="recovery-return-status" role="status"></p><button class="g" onclick="closeModal('recovery-browser-wait')">${t('Kapat','Close')}</button>`);
 }
 async function request(email){
   const previous=requests(),address=email.trim().toLowerCase();
   const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
   const verifier=b64(crypto.getRandomValues(new Uint8Array(32)));
   const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
   const entry={id,email:address,verifier,at:Date.now(),uid:A?.authUid||''};
   memory=entry;try{localStorage.setItem(prefix+id,JSON.stringify(entry))}catch{}
   const redirect=new URL('/',location.origin);redirect.searchParams.set('iyd_recovery',id);
   try{await sb('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect.href),{method:'POST',body:{email:address,code_challenge:challenge,code_challenge_method:'s256'}})}
   catch(error){forget(id);throw error}
   for(const old of previous)if(old.email===address)forget(old.id);
   current=id;waiting();
 }
 async function exchange(entry,code){
   if(working||!entry||!validCode(code)||(A?.authUid&&entry.uid&&entry.uid!==A.authUid))return false;
   working=true;
   try{
     const data=await sb('/auth/v1/token?grant_type=pkce',{method:'POST',body:{auth_code:code,code_verifier:entry.verifier}});
     if(!data?.access_token||!data.refresh_token||!data.user?.id||data.user.email?.toLowerCase()!==entry.email||
        (entry.uid&&data.user.id!==entry.uid)||(A?.authUid&&A.authUid!==data.user.id))return false;
     const previousSession=sbSession();
     forget(entry.id);sbSave({...data,at:Date.now()});
     try{await IYAccount.recovery(data.user)}catch(error){if(previousSession)sbSave(previousSession);else sbClear();throw error}
     closeModal('recovery-browser-wait');return true;
   }catch{return false}finally{working=false}
 }
 async function submit(){
   const code=document.getElementById('recovery-return-code')?.value.trim();
   if(!await exchange(read(current),code))status('recovery-return-status',t('Kod geçersiz veya süresi dolmuş. Yeni bağlantı isteyebilirsin.','Invalid or expired code. You can request another link.'));
 }
 async function callback(){
   const url=new URL(location.href),code=url.searchParams.get('code'),id=url.searchParams.get('iyd_recovery');
   const frag=new URLSearchParams(url.hash.slice(1));
   if(!validCode(code)||['account-action','access_token','error','type'].some(key=>frag.has(key))||url.searchParams.has('error'))return false;
   const pending=requests(),entry=validId(id)?read(id):pending.length===1?pending[0]:null;
   url.searchParams.delete('code');url.searchParams.delete('iyd_recovery');history.replaceState(history.state,'',url.pathname+url.search);
   if(entry){
     if(!await exchange(entry,code))openModal('recovery-browser-error',`<h2>${t('Bağlantı doğrulanamadı','Could not confirm the link')}</h2><p>${t('Bağlantının süresi dolmuş veya hesap değişmiş olabilir. Şifre yenileme ekranından yeni bir bağlantı iste.','The link may have expired or the account may have changed. Request a new link from the password reset screen.')}</p><button onclick="closeModal('recovery-browser-error')">${t('Kapat','Close')}</button>`);
     return true;
   }
   openModal('recovery-browser-return',`<h2>${t('İsteği başlattığın tarayıcıya dön','Return to the browser where you requested the reset')}</h2><p>${t('Bu kodu yalnızca kendi açık şifre yenileme ekranına gir.','Enter this code only in your own open password reset screen.')}</p><label for="recovery-copy">${t('Doğrulama kodu','Confirmation code')}</label><input id="recovery-copy" readonly><button onclick="IYRecovery.copy()">${t('Kodu kopyala','Copy code')}</button><p role="status" id="recovery-copy-status"></p>`);
   document.getElementById('recovery-copy').value=code;return true;
 }
 async function copy(){
   const el=document.getElementById('recovery-copy');if(!el)return;
   try{await navigator.clipboard.writeText(el.value);status('recovery-copy-status',t('Kopyalandı.','Copied.'))}catch{el.focus();el.select()}
 }
 function resume(email){
   const entry=requests().find(x=>x.email===String(email||'').trim().toLowerCase());
   if(entry){current=entry.id;waiting()}else toast(t('Bu tarayıcıdan yeni bir bağlantı iste.','Request a new link in this browser.'));
 }
 return {request,callback,submit,copy,resume};
})();
