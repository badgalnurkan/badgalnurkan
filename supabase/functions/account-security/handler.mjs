// Pure request handler: no browser identity, email address or user_id is trusted.
export const ALLOWED_ORIGINS = ['https://badgalnurkan.com','https://www.badgalnurkan.com','https://badgalnurkan.vercel.app','https://qa.badgalnurkan.com'];
export const REQUESTS = ['request_deactivate','request_delete','request_reactivate'];
export async function digest(value,cryptoImpl=crypto){
 const bytes=await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function recentAuthentication(claims,uid,at=Date.now()){
 if(claims.sub!==uid||claims.role!=='authenticated'||!claims.session_id||claims.is_anonymous===true)return false;
 const methods=['password','oauth','otp','totp','sso/saml','magiclink'];
 return Array.isArray(claims.amr)&&claims.amr.some(x=>methods.includes(x.method)&&Number.isFinite(x.timestamp)&&x.timestamp*1000<=at&&at-x.timestamp*1000<600000);
}
export function createHandler({env,fetchImpl=fetch,cryptoImpl=crypto,now=()=>Date.now()}){
 const get=k=>env(k)||'';
 function keySet(name,fallback){try{return JSON.parse(get(name)).default||get(fallback)}catch{return get(fallback)}}
 const base=get('SUPABASE_URL'),publicKey=keySet('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),service=keySet('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 const mailKey=get('RESEND_API_KEY');
 const from=get('ACCOUNT_MAIL_FROM')||get('RESEND_FROM_EMAIL')||get('RESEND_FROM')||"Improvin' Your Day <security@badgalnurkan.com>";
 const mailReady=!!mailKey&&/^[^\r\n]+@[a-z0-9.-]+>?$/i.test(from);
 return async req=>{
  const origin=req.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Vary':'Origin'};
  if(origin&&ALLOWED_ORIGINS.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,GET,OPTIONS'});
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&!ALLOWED_ORIGINS.includes(origin))return reply({code:'ORIGIN_NOT_ALLOWED'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method==='GET')return reply({ok:true,version:4,transactionalMailReady:mailReady,mailReady,delivery:mailReady?'resend':'unavailable'});
  if(req.method!=='POST')return reply({code:'METHOD_NOT_ALLOWED'},405);
  if(!base||!publicKey||!service)return reply({code:'SERVER_CONFIGURATION_ERROR'},503);
  try{
   const reader=req.body?.getReader();if(!reader)return reply({code:'INVALID_REQUEST'},400);
   let length=0,parts=[];
   while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8192){await reader.cancel();return reply({code:'INVALID_REQUEST'},413)}parts.push(value)}
   const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{return reply({code:'INVALID_REQUEST'},400)}
   const action=body?.action;
   if(![...REQUESTS,'confirm_deactivate','confirm_delete','confirm_reactivate'].includes(action))return reply({code:'INVALID_ACTION'},400);
   let uid=null,user=null;
   if(action!=='confirm_delete'){
    const bearer=req.headers.get('authorization')||'';
    if(!/^Bearer [^\s]{20,8192}$/.test(bearer))return reply({code:'UNAUTHORIZED'},401);
    const auth=await fetchImpl(base+'/auth/v1/user',{headers:{apikey:publicKey,Authorization:bearer},signal:AbortSignal.timeout(10000)});
    if(!auth.ok)return reply({code:'UNAUTHORIZED'},401);
    user=await auth.json();uid=user?.id;
    if(!uid||user.is_anonymous)return reply({code:'UNAUTHORIZED'},401);
    if(REQUESTS.includes(action)){
     let claims;try{claims=JSON.parse(atob(bearer.slice(7).split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))}catch{return reply({code:'UNAUTHORIZED'},401)}
     if(!recentAuthentication(claims,uid,now()))return reply({code:'RECENT_SIGN_IN_REQUIRED'},403);
    }
   }
   async function rpc(cmd,fields){
    const result=await fetchImpl(base+'/rest/v1/rpc/iydu_account_service',{method:'POST',
     headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},
     body:JSON.stringify({p_action:cmd,p_uid:uid,p_fields:fields}),signal:AbortSignal.timeout(10000)});
    if(!result.ok)throw Error('DATABASE_UNAVAILABLE');
    return result.json();
   }
   if(REQUESTS.includes(action)){
    // Never issue a challenge that the configured mail transport cannot deliver.
    if(!mailReady)return reply({code:'MAIL_NOT_CONFIGURED'},503);
    const id=cryptoImpl.randomUUID(),kind=action.slice(8);
    let secret;
    if(kind==='delete')secret=[...cryptoImpl.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
    else {let x;do{x=cryptoImpl.getRandomValues(new Uint32Array(1))[0]}while(x>=4294000000);secret=String(x%1000000).padStart(6,'0')}
    const result=await rpc(action,{id,hash:await digest(id+':'+secret,cryptoImpl)});
    if(result.error)return reply({code:result.error},result.error==='RATE_LIMITED'?429:400);
    const en=body.lang==='en';
    const labels={
     deactivate:en?'Your temporary account closure code':'Geçici hesap kapatma onay kodun',
     delete:en?'Confirm your account deletion request':'Kalıcı hesap silme talebini onayla',
     reactivate:en?'Your account reactivation code':'Hesabını yeniden açma onay kodun'
    };
    const safeOrigin=ALLOWED_ORIGINS.includes(origin)?origin:'https://badgalnurkan.com';
    const destination=safeOrigin+(kind==='delete'?'/account-close.html#id='+id+'&token='+secret:'/#account-action='+kind+'&id='+id+'&token='+secret);
    const content=kind==='delete'
     ?(en?'Open the link to choose a reason and confirm. Nothing is deleted by opening it. It expires in 30 minutes. After confirmation you have 60 days to reactivate.':'Sebebini seçmek ve onaylamak için bağlantıyı aç. Bağlantıyı açmak hesabını silmez. Bağlantı 30 dakika geçerlidir. Onaydan sonra yeniden açmak için 60 günün olacak.')+'\n\n'+destination
     :(en?'Your confirmation code (valid for 10 minutes): ':'Onay kodun (10 dakika geçerli): ')+secret;
    try{
     // Use one transport that actually carries the generated challenge.
     const sent=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+mailKey,'Content-Type':'application/json','Idempotency-Key':'account-'+id},
      body:JSON.stringify({from,to:[result.email],subject:labels[kind]+" · Improvin’ Your Day",text:"Improvin' your day\n\n"+content+'\n\n'+(en?'If you did not request this, ignore this email.':'Bu işlemi sen istemediysen bu e-postayı dikkate alma.')}),signal:AbortSignal.timeout(10000)});
     if(!sent.ok){await rpc('cancel',{id});return reply({code:'MAIL_SEND_FAILED'},502)}
    }catch{await rpc('cancel',{id});return reply({code:'MAIL_SEND_FAILED'},502)}
    return reply({ok:true,id,delivery:'resend',expiresIn:kind==='delete'?1800:600});
   }
   const id=String(body.id||''),secret=String(body.token||'');
   if(!/^[a-f0-9-]{36}$/i.test(id)||(action==='confirm_delete'?!/^[a-f0-9]{64}$/.test(secret):!/^\d{6}$/.test(secret)))return reply({code:'INVALID_CHALLENGE'},400);
   const result=await rpc(action,{id,hash:await digest(id+':'+secret,cryptoImpl),reason:body.reason,other:body.other,confirmation:body.confirmation});
   if(result.error)return reply({code:result.error},400);
   return reply(result);
  }catch{return reply({code:'SERVICE_UNAVAILABLE'},503)}
 };
}
