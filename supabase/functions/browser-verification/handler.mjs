// Browser verification is a SECOND factor after a Supabase Auth session is issued.
// The *database*, not this UI, enforces verified-session access to user data.
// The service-role RPC is not exposed to browsers.
export const ORIGINS=Object.freeze(['https://badgalnurkan.com','https://www.badgalnurkan.com','https://badgalnurkan.vercel.app']);
const uidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codeRe=/^\d{6}$/;
const makeJson=(data,status,headers)=>new Response(JSON.stringify(data),{status,headers});

export async function sha256(input,webCrypto=crypto){
 const hashed=await webCrypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
 return [...new Uint8Array(hashed)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function generateEmailCode(webCrypto=crypto){
 // Uniform integer in [0, 999999] through rejection sampling.
 const range=1000000,limit=Math.floor(0x100000000/range)*range;
 let n;
 do{n=webCrypto.getRandomValues(new Uint32Array(1))[0]}while(n>=limit);
 return String(n%range).padStart(6,'0');
}
function publicKey(env,preferred,fallback){
 try{const json=JSON.parse(env(preferred)||'{}');return json.default||env(fallback)||''}
 catch{return env(fallback)||''}
}
async function readBody(req){
 if(!req.body)throw Object.assign(Error('INVALID_REQUEST'),{status:400});
 const reader=req.body.getReader();let size=0,chunks=[];
 while(true){
  const {done,value}=await reader.read();if(done)break;
  size+=value.byteLength;
  if(size>4096){await reader.cancel();throw Object.assign(Error('INVALID_REQUEST'),{status:413})}
  chunks.push(value);
 }
 const buf=new Uint8Array(size);let at=0;
 for(const chunk of chunks){buf.set(chunk,at);at+=chunk.byteLength}
 let obj;try{obj=JSON.parse(new TextDecoder().decode(buf))}
 catch{throw Object.assign(Error('INVALID_REQUEST'),{status:400})}
 if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Object.assign(Error('INVALID_REQUEST'),{status:400});
 return obj;
}
function jwtClaims(token){
 try{
  const part=token.split('.')[1];
  if(!part||part.length>4096)return null;
  const base64=part.replace(/-/g,'+').replace(/_/g,'/');
  const parsed=JSON.parse(atob(base64.padEnd(Math.ceil(base64.length/4)*4,'=')));
  return parsed&&typeof parsed==='object'?parsed:null;
 }catch{return null}
}
export function createHandler({env,fetchImpl=fetch,webCrypto=crypto,clock=()=>Date.now(),allowedOrigins=ORIGINS}){
 const get=name=>env(name)||'';
 const base=get('SUPABASE_URL');
 const key=publicKey(get,'SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
 const service=publicKey(get,'SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 const resend=get('RESEND_API_KEY');
 const from=get('ACCOUNT_MAIL_FROM')||get('RESEND_FROM_EMAIL')||get('RESEND_FROM')||
  "Improvin' Your Day <security@badgalnurkan.com>";
 const transportReady=!!resend&&/^[^\r\n]+@[a-z0-9.-]+>?$/i.test(from);
 return async req=>{
  const origin=req.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store',
   'Referrer-Policy':'no-referrer','Vary':'Origin'};
  if(origin&&allowedOrigins.includes(origin)){
   headers['Access-Control-Allow-Origin']=origin;
   headers['Access-Control-Allow-Headers']='authorization,apikey,content-type';
   headers['Access-Control-Allow-Methods']='GET,POST,OPTIONS';
  }
  const reply=(data,status=200)=>makeJson(data,status,headers);
  if(origin&&!allowedOrigins.includes(origin))return reply({code:'ORIGIN_NOT_ALLOWED'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method==='GET')return reply({ok:true,version:1,mailReady:transportReady});
  if(req.method!=='POST')return reply({code:'METHOD_NOT_ALLOWED'},405);
  if(!base||!key||!service)return reply({code:'SERVER_CONFIGURATION_ERROR'},503);
  try{
   const body=await readBody(req),action=body.action;
   if(!['status','request','confirm'].includes(action))return reply({code:'INVALID_ACTION'},400);
   const bearer=req.headers.get('authorization')||'';
   if(!/^Bearer [^\s]{20,8192}$/.test(bearer))return reply({code:'UNAUTHORIZED'},401);
   const authResponse=await fetchImpl(base+'/auth/v1/user',{
    headers:{apikey:key,Authorization:bearer},signal:AbortSignal.timeout(10000)
   });
   if(!authResponse.ok)return reply({code:'UNAUTHORIZED'},401);
   const verifiedUser=await authResponse.json();
   const claims=jwtClaims(bearer.slice(7));
   const sid=claims?.session_id,uid=verifiedUser?.id;
   if(!uidRe.test(uid||'')||!uidRe.test(sid||'')||
      claims?.sub!==uid||claims.role!=='authenticated'||claims.is_anonymous===true||
      verifiedUser.is_anonymous===true||!(Number(claims.exp)>clock()/1000))
    return reply({code:'UNAUTHORIZED'},401);

   const usingOAuth=Array.isArray(claims.amr)&&claims.amr.some(x=>x&&x.method==='oauth');
   async function serviceRpc(method,fields={}){
    const response=await fetchImpl(base+'/rest/v1/rpc/iydu_browser_service',{
     method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,
      'Content-Type':'application/json'},
     body:JSON.stringify({p_action:method,p_uid:uid,p_sid:sid,p_fields:{...fields,using_oauth:usingOAuth}}),
     signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw Error('SERVER_UNAVAILABLE');
    return response.json();
   }
   if(action==='status'){
    const answer=await serviceRpc('status');
    if(answer?.error)return reply({code:answer.error},answer.error==='UNAUTHORIZED'?401:403);
    return reply({ok:true,verified:answer?.verified===true});
   }
   if(action==='request'){
    if(!transportReady)return reply({code:'MAIL_NOT_CONFIGURED'},503);
    const id=webCrypto.randomUUID(),code=generateEmailCode(webCrypto);
    const entry=await serviceRpc('request',{id,hash:await sha256(id+':'+code,webCrypto)});
    if(entry?.error)return reply({code:entry.error},entry.error==='RATE_LIMITED'?429:entry.error==='UNAUTHORIZED'?401:403);
    if(entry?.already_verified===true)return reply({ok:true,alreadyVerified:true});
    if(entry?.ok!==true||entry.id!==id||typeof entry.email!=='string')
      return reply({code:'SERVER_UNAVAILABLE'},503);
    const en=body.lang==='en';
    const message=en
     ?'A sign-in to Improvin’ Your Day needs verification. Enter this 6-digit code in the browser where you are signing in. It expires in 10 minutes. Never share it with anyone.'
     :'Improvin’ Your Day hesabına giriş yapabilmek için bu 6 haneli kodu giriş yaptığın tarayıcıya yaz. Kod 10 dakika geçerlidir. Kimseyle paylaşma.';
    let sent=false;
    try{
     const email=await fetchImpl('https://api.resend.com/emails',{
      method:'POST',headers:{Authorization:'Bearer '+resend,
       'Content-Type':'application/json','Idempotency-Key':'browser-'+id},
      body:JSON.stringify({from,to:[entry.email],
       subject:en?'New browser sign-in code — Improvin’ Your Day':
        'Yeni tarayıcı giriş kodun — Improvin’ Your Day',
       text:message+'\n\n'+code+'\n\n'+
        (en?'If you did not try to sign in, review your account security.':
          'Giriş yapmaya çalışmadıysan hesap güvenliğini kontrol et.')}),
      signal:AbortSignal.timeout(10000)
     });
     const accepted=await email.json().catch(()=>null);
     sent=email.ok&&typeof accepted?.id==='string'&&accepted.id.length>0;
    }catch{}
    if(!sent){
     // Cancel only the unsent candidate. The previous delivered challenge
     // stays usable until its original expiry/attempt limit.
     try{await serviceRpc('cancel',{id})}catch{}
     return reply({code:'MAIL_SEND_FAILED'},502);
    }
    // Only now retire the previous code and activate this mailed challenge.
    // The action is idempotent so a lost RPC response can be retried safely.
    let activated=false;
    for(let attempt=0;attempt<2&&!activated;attempt++){
     try{
      const committed=await serviceRpc('activate_delivery',{id});
      activated=committed?.ok===true;
     }catch{}
    }
    if(!activated)return reply({code:'SERVER_UNAVAILABLE'},503);
    return reply({ok:true,id,expiresIn:600});
   }
   if(!uidRe.test(body.id||'')||!codeRe.test(body.code||''))
    return reply({code:'INVALID_CHALLENGE'},400);
   const answer=await serviceRpc('confirm',{
    id:body.id,hash:await sha256(body.id+':'+body.code,webCrypto)
   });
   if(answer?.error)return reply({code:answer.error},answer.error==='UNAUTHORIZED'?401:400);
   if(answer?.verified!==true)return reply({code:'SERVER_UNAVAILABLE'},503);
   return reply({ok:true,verified:true});
  }catch(error){
   return reply({code: error?.status===413?'REQUEST_TOO_LARGE':
     error?.status===400?'INVALID_REQUEST':'SERVER_UNAVAILABLE'},error?.status||503);
  }
 };
}
