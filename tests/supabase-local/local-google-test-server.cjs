'use strict';
// Optional local-only HTTP server for REAL Google OAuth manual browser tests.
// Run from the checked-out repository with Supabase CLI and Docker available.
// Never uses hosted Supabase credentials, and never commits user data.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');

function localConfig(){
  let output='';
  if(process.env.API_URL&&process.env.ANON_KEY){
    output='API_URL='+process.env.API_URL+'\nANON_KEY='+process.env.ANON_KEY;
  }else{
    const cli=process.platform==='win32'?'supabase.cmd':'supabase';
    const result=spawnSync(cli,['status','-o','env'],{
      cwd:root,encoding:'utf8',timeout:20000,windowsHide:true
    });
    if(result.error||result.status!==0){
      throw new Error('Supabase CLI local stack not found. Install CLI, run supabase init (once) and supabase start locally. Never link to production.');
    }
    output=result.stdout;
  }
  const data={};
  for(const line of output.split(/\r?\n/)){
    const pos=line.indexOf('=');
    if(pos<1)continue;
    const name=line.slice(0,pos);
    if(name==='API_URL'||name==='ANON_KEY'){
      data[name]=line.slice(pos+1).replace(/^"|"$/g,'').trim();
    }
  }
  if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(data.API_URL||'')){
    throw new Error('Safety block: Supabase must be a local http://127.0.0.1 or localhost URL');
  }
  if(!data.ANON_KEY||/\s/.test(data.ANON_KEY)){
    throw new Error('Missing local Supabase anonymous test key');
  }
  return data;
}

const {API_URL,ANON_KEY}=localConfig();
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const originalUrl=/const SUPABASE_URL='https:\/\/[^']+';/;
const originalKey=/const SUPABASE_KEY='[^']+';/;
if(!originalUrl.test(source)||!originalKey.test(source)){
  throw new Error('Cannot find expected public Supabase config; refusing to serve unmodified HTML');
}
const localHtml=source.replace(originalUrl,()=>"const SUPABASE_URL='"+API_URL+"';")
  .replace(originalKey,()=>"const SUPABASE_KEY='"+ANON_KEY+"';");
if(localHtml.includes("const SUPABASE_URL='https://")){
  throw new Error('Safety block: live production Supabase URL remains in test HTML');
}
if(process.argv.includes('--check')){
  console.log('PASS: local-only in-memory HTML, Supabase API guard, and local credentials detected.');
  process.exit(0);
}
const port=4173;
const documents=new Set(['privacy.html','kvkk.html','terms.html']);
http.createServer((request,response)=>{
  const u=new URL(request.url,'http://127.0.0.1:'+port);
  if(request.method!=='GET'||u.search||u.hash){
    response.writeHead(404);response.end('Not found');return;
  }
  const file=u.pathname.slice(1);
  if(u.pathname==='/'||file==='index.html'){
    response.writeHead(200,{
      'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store',
      'Referrer-Policy':'no-referrer',
      'X-Content-Type-Options':'nosniff'
    });
    response.end(localHtml);return;
  }
  if(documents.has(file)){
    const target=path.join(root,file);
    if(fs.existsSync(target)){
      response.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      response.end(fs.readFileSync(target));return;
    }
  }
  response.writeHead(404);response.end('Not found');
}).listen(port,'127.0.0.1',()=>{
  console.log('Local OAuth test app: http://127.0.0.1:'+port+'/');
  console.log('Only LOCAL Supabase Auth and synthetic accounts. Exit with Ctrl+C.');
});
