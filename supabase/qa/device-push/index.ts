import webpush from "npm:web-push@3.6.7";

const origins=new Set(["https://badgalnurkan-git-qa-browser-otp-e2e-20261120-5044.vercel.app"]);
const base=Deno.env.get("SUPABASE_URL")!;
if(base!=="https://lvomrcqytfygcmguojcj.supabase.co")throw Error("This build is for the QA project only");
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default;
async function rpc(name:string,body:Record<string,unknown>){
 const response=await fetch(base+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error("Database unavailable");
 const text=await response.text();return text?JSON.parse(text):null;
}
let credentials:Promise<{publicKey:string;privateKey:string}>|null=null;
function keys(){
 if(!credentials){
  const generated=webpush.generateVAPIDKeys();
  credentials=rpc("iydu_push_vapid",{p_public:generated.publicKey,p_private:generated.privateKey}).catch(e=>{credentials=null;throw e});
 }
 return credentials!;
}
function allowed(endpoint:string){
 try{const u=new URL(endpoint);return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&/^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*web\.push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)$/.test(u.hostname)}catch{return false}
}
type Job={id:number;lease:string;uid:string;lang:string;kind:string;event:string;endpoint:string;keys:{p256dh:string;auth:string}};
async function deliver(job:Job,vapid:{publicKey:string;privateKey:string}){
 let status=500;
 try{
  if(!allowed(job.endpoint))status=410;
  else{
   const payload=JSON.stringify({owner:job.uid,kind:job.kind,id:job.event,lang:job.lang});
   const details=webpush.generateRequestDetails({endpoint:job.endpoint,keys:job.keys},payload,{TTL:600,urgency:"normal",vapidDetails:{...vapid,subject:"https://badgalnurkan-git-qa-browser-otp-e2e-20261120-5044.vercel.app"}});
   const response=await fetch(details.endpoint,{method:"POST",headers:details.headers,body:new Uint8Array(details.body),redirect:"error",signal:AbortSignal.timeout(6500)});status=response.status;
   await response.body?.cancel();
  }
 }catch{}
 await rpc("iydu_finish_push",{p_id:job.id,p_lease:job.lease,p_result:status});
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 const headers:Record<string,string>={"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
 if(origin&&origins.has(origin)){headers["Access-Control-Allow-Origin"]=origin;headers["Access-Control-Allow-Headers"]="apikey,authorization,content-type";headers["Access-Control-Allow-Methods"]="GET,POST,OPTIONS"}
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{headers,status});
 if(origin&&!origins.has(origin))return reply({ok:false},403);
 if(req.method==="OPTIONS")return new Response(null,{headers,status:204});
 try{
  if(req.method==="GET"){if(new URL(req.url).searchParams.get("key")==="1")return reply({publicKey:(await keys()).publicKey});return reply({ok:true,version:1})}
  if(req.method!=="POST")return reply({ok:false},405);
  if(req.headers.get("content-length")&&Number(req.headers.get("content-length"))>120)return reply({ok:false},413);
  const {ticket}=await req.json();if(typeof ticket!=="string"||!/^[a-f0-9-]{36}$/.test(ticket))return reply({ok:false},403);
  const jobs=await rpc("iydu_claim_push",{p_ticket:ticket});if(!Array.isArray(jobs))return reply({ok:false},403);
  if(jobs.length){const vapid=await keys();for(let i=0;i<jobs.length;i+=8)await Promise.all(jobs.slice(i,i+8).map(job=>deliver(job,vapid)))}
  return reply({ok:true});
 }catch{return reply({ok:false},503)}
});
