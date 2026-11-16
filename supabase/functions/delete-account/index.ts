Deno.serve(req=>{
 const origin=req.headers.get('origin')||'';
 const allowed=['https://badgalnurkan.com','https://www.badgalnurkan.com','https://badgalnurkan.vercel.app'];
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 if(allowed.includes(origin))headers['Access-Control-Allow-Origin']=origin;
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 return new Response(JSON.stringify({ok:false,code:'USE_ACCOUNT_SECURITY',message:'Use the verified 30-day account-security flow.'}),{status:410,headers});
});
