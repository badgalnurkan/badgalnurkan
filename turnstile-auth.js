/* The public site key belongs in HTML; the secret stays in Supabase Auth. */
window.IYTurnstile=(()=>{
 'use strict';
 const scriptUrl='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
 let loading=null,active=null,widget=null,token='',solvedAt=0,revision=0,prompt=null;
 const sitekey=()=>String(document.querySelector('meta[name="iydu-turnstile-site-key"]')?.content||'').trim();
 const enabled=()=>!!sitekey();
 const text=(a,b)=>typeof tr==='function'&&tr()?a:b;
 const error=(code,message)=>Object.assign(new Error(message),{code});
 const required=()=>error('CAPTCHA_REQUIRED',text('Lütfen Cloudflare robot kontrolünü tamamla.','Please complete the Cloudflare verification.'));
 const unavailable=()=>error('CAPTCHA_UNAVAILABLE',text('Robot kontrolü yüklenemedi. Sayfayı yenileyerek tekrar dene.','Verification could not load. Refresh the page and try again.'));
 function protects(path,method='GET'){
  if(method.toUpperCase()!=='POST')return false;
  const url=new URL(path,'https://auth.invalid');
  if(url.pathname==='/auth/v1/token')return url.searchParams.get('grant_type')==='password';
  return ['/auth/v1/signup','/auth/v1/recover','/auth/v1/resend','/auth/v1/otp','/auth/v1/magiclink'].includes(url.pathname);
 }
 function markup(action){
  if(!enabled())return '';
  const safe=['login','signup','recovery','resend','account'].includes(action)?action:'account';
  return '<div class="auth-turnstile"><div data-iydu-turnstile="'+safe+'"></div><p data-turnstile-status role="status" aria-live="polite"></p></div>';
 }
 function status(value){const el=active?.parentElement?.querySelector('[data-turnstile-status]');if(el)el.textContent=value}
 function valid(){return !!token&&solvedAt>0&&Date.now()-solvedAt<240000&&active?.isConnected===true}
 function cancel(){
  if(prompt){const p=prompt;prompt=null;p.observer?.disconnect();clearTimeout(p.timer);p.reject(error('CAPTCHA_CANCELLED','Verification cancelled'));}
  if(typeof closeModal==='function')closeModal('turnstile-check');
 }
 function clear(){
  revision++;token='';solvedAt=0;
  if(widget!==null&&window.turnstile)try{window.turnstile.remove(widget)}catch{}
  widget=null;active=null;
 }
 function load(){
  if(window.turnstile)return Promise.resolve(window.turnstile);
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
   const el=document.createElement('script');let timer;
   const finish=err=>{clearTimeout(timer);el.onload=null;el.onerror=null;if(err){el.remove();loading=null;reject(err)}else resolve(window.turnstile)};
   el.src=scriptUrl;el.async=true;el.defer=true;
   el.onload=()=>finish(window.turnstile?null:unavailable());
   el.onerror=()=>finish(unavailable());timer=setTimeout(()=>finish(unavailable()),12000);
   document.head.appendChild(el);
  });
  return loading;
 }
 async function mount(container){
  const next=container||document.querySelector('[data-iydu-turnstile]');
  if(next===active)return;
  if(prompt&&active&&!active.isConnected)cancel();
  clear();
  if(!enabled()||!next)return;
  active=next;const at=revision;
  status(text('Robot kontrolü yükleniyor…','Loading verification…'));
  try{
   const provider=await load();
   if(at!==revision||!next.isConnected)return;
   const stillCurrent=()=>at===revision&&active===next&&next.isConnected;
   widget=provider.render(next,{
    sitekey:sitekey(),action:next.dataset.iyduTurnstile||'account',
    appearance:'always',theme:typeof DB!=='undefined'&&DB.themeChoice==='black'?'dark':'light',
    language:typeof tr==='function'&&tr()?'tr':'en',
    size:next.getBoundingClientRect().width<300?'compact':'flexible',
    'response-field':false,
    callback:value=>{
     if(!stillCurrent()||typeof value!=='string'||!value||value.length>2048)return;
     token=value;solvedAt=Date.now();status(text('Robot kontrolü tamamlandı.','Verification complete.'));
     if(prompt){const p=prompt;prompt=null;p.observer?.disconnect();clearTimeout(p.timer);p.resolve();}
    },
    'expired-callback':()=>{if(stillCurrent()){token='';solvedAt=0;status(required().message)}},
    'error-callback':()=>{if(stillCurrent()){token='';solvedAt=0;status(unavailable().message)}}
   });
  }catch(e){if(at===revision)status(e.message)}
 }
 function ready(){
  if(!enabled()||valid())return true;
  status(required().message);active?.scrollIntoView?.({block:'center',behavior:'smooth'});return false;
 }
 function take(){
  if(!valid())throw required();
  const value=token;token='';solvedAt=0;
  if(widget!==null&&window.turnstile)try{window.turnstile.reset(widget)}catch{}
  return value;
 }
 function modal(){
  if(prompt)return prompt.promise;
  if(typeof openModal!=='function')return Promise.reject(unavailable());
  clear();
  let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});
  prompt={resolve,reject,promise};
  openModal('turnstile-check','<h2>'+text('Robot kontrolü','Security verification')+'</h2>'+markup('account')+'<button class="g" onclick="IYTurnstile.cancel()">'+text('Vazgeç','Cancel')+'</button>');
  const container=document.querySelector('#turnstile-check [data-iydu-turnstile]');
  mount(container);
  if(prompt){
   prompt.timer=setTimeout(()=>cancel(),120000);
   prompt.observer=new MutationObserver(()=>{if(!container?.isConnected)cancel()});
   prompt.observer.observe(document.body,{childList:true,subtree:true});
  }
  return promise;
 }
 async function protect(path,method,body){
  if(!enabled()||!protects(path,method))return body;
  let opened=false;
  if(!valid()){
   if(active?.isConnected)throw required();
   opened=true;await modal();
  }
  try{return {...body,gotrue_meta_security:{...body?.gotrue_meta_security,captcha_token:take()}}}
  finally{if(opened){if(typeof closeModal==='function')closeModal('turnstile-check');clear()}}
 }
 return {enabled,protects,markup,mount,ready,protect,cancel};
})();
