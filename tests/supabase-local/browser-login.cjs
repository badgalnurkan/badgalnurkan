'use strict';
// Real Chromium browser integration against a LOCAL Supabase test instance.
// The production URL/key are replaced ONLY in an in-memory HTML response.
// No modified HTML is committed or deployed. All accounts are synthetic.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright-core');

const base=(process.env.API_URL||'').trim();
const anon=process.env.ANON_KEY||'';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)){
  throw Error('Safety gate: refusing to run browser E2E against non-local Supabase');
}
if(!anon)throw Error('Missing local anon key');

const source=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
const patched=source.replace(/const SUPABASE_URL='https:\/\/[^']+';/,
  "const SUPABASE_URL='"+base+"';")
  .replace(/const SUPABASE_KEY='[^']+';/,
    "const SUPABASE_KEY='"+anon+"';");
if(patched===source||!patched.includes("const SUPABASE_URL='"+base+"';")||
   !patched.includes("const SUPABASE_KEY='"+anon+"';")){
  throw Error('Could not safely replace production API settings in CI-only HTML');
}

const password='LocalBrowserPassphrase-2026!';
const prefix='iydu-browser-ci-'+Date.now().toString(36)+'-';
async function signup(n,data){
  const email=prefix+n+'@example.com';
  const res=await fetch(base+'/auth/v1/signup',{
    method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},
    body:JSON.stringify({email,password,data}),
    signal:AbortSignal.timeout(15000)
  });
  const body=await res.json();
  assert.equal(res.ok,true,'Synthetic browser account signup failed: '+(body.code||res.status));
  assert.ok(body?.user?.id);
  return {email,uid:body.user.id};
}
async function flow(page,account,expected){
  await page.goto(site,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>goTo('login','home'));
  await page.locator('#login-submit').waitFor({timeout:15000});
  await page.locator('#u').fill(account.email);
  await page.locator('#p').fill(password);
  await page.locator('#login-submit').click();
  if(expected==='claim'){
    await page.locator('#claim-name').waitFor({timeout:20000});
    const unclaimed=await page.evaluate(()=>({a:A,view}));
    assert.equal(unclaimed.a,null);
    assert.equal(unclaimed.view,'claim-username');
  }else{
    await page.waitForFunction(name=>typeof A!=='undefined' && A?.u===name,expected,{timeout:20000});
    assert.equal(await page.evaluate(()=>view),'app');
  }
}

let server,site,browser;
async function main(){
  const first=await signup('first',{username:'BrowserOne',nick:'Browser Display'});
  const unclaimed=await signup('no-name',{nickname:'Fresh Browser'});
  server=http.createServer((req,res)=>{
    if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html')){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      res.end(patched);
    }else{res.writeHead(404);res.end('Not found')}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  site='http://127.0.0.1:'+server.address().port+'/';

  browser=await chromium.launch({
    executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
  });
  const normalContext=await browser.newContext({viewport:{width:390,height:844}});
  const normal=await normalContext.newPage();
  await flow(normal,first,'BrowserOne');
  await normal.reload({waitUntil:'domcontentloaded'});
  await normal.waitForFunction(()=>typeof A!=='undefined'&&A?.u==='BrowserOne',null,{timeout:20000});
  assert.equal(await normal.evaluate(()=>view),'app',
    'Verified account did not restore after browser reload');

  const freshContext=await browser.newContext({viewport:{width:390,height:844}});
  const fresh=await freshContext.newPage();
  await flow(fresh,unclaimed,'claim');
  await fresh.locator('#claim-name').fill('BrowserClaim');
  await fresh.locator('#claim-username-submit').click();
  await fresh.waitForFunction(()=>typeof A!=='undefined'&&A?.u==='BrowserClaim',null,{timeout:20000});
  assert.equal(await fresh.evaluate(()=>view),'app');
  await fresh.reload({waitUntil:'domcontentloaded'});
  await fresh.waitForFunction(()=>typeof A!=='undefined'&&A?.u==='BrowserClaim',null,{timeout:20000});
  assert.equal(await fresh.evaluate(()=>view),'app');

  const claimed=await fresh.evaluate(()=>({
    name:A?.u,
    stored:typeof sbSession==='function'&&!!sbSession()?.access_token
  }));
  assert.equal(claimed.name,'BrowserClaim');
  assert.equal(claimed.stored,true);
  console.log('PASS Chrome mobile viewport: email login, session restore, unclaimed-name screen, claim and reload.');
  console.log('Not tested: external Google OAuth consent, production deployment, multi-device JSON CAS.');
}
main().catch(err=>{
  console.error('FAIL browser integration:',err.stack||err);
  process.exitCode=1;
}).finally(async()=>{
  if(browser)await browser.close().catch(()=>{});
  if(server)await new Promise(resolve=>server.close(resolve));
});
