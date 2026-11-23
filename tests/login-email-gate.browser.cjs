'use strict';
const assert=require('node:assert/strict');
module.exports=async(browser,engine)=>{
 for(const width of [320,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const user={id:'ab000000-0000-4000-8000-000000000011',email:'login-owner@example.invalid',email_confirmed_at:'2026-11-22T12:00:00Z',created_at:'2026-11-22T12:00:00Z',user_metadata:{username:'loginowner'},app_metadata:{providers:['email']}};
  const claims={sub:user.id,session_id:'ab100000-0000-4000-8000-000000000001'};
  const session={user,access_token:'fixture.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature',refresh_token:'fixture-refresh'};
  let verified=false,loads=0,sends=0;
  await page.addInitScript(()=>localStorage.setItem('iydu.storage-notice.v1','test'));
  await page.route('https://flcfqwndqfmbritaywfb.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url());let data,status=200;
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS'}});
   if(url.pathname==='/auth/v1/token'){assert.match(req.postDataJSON().gotrue_meta_security?.captcha_token||'',/^ci-/, 'password sign-in carries CAPTCHA proof');data=session;}
   else if(url.pathname==='/auth/v1/user')data=user;
   else if(url.pathname.endsWith('/iydu_account_status'))data={user_id:user.id,email:user.email,email_verified:true,state:'active',password_required:false};
   else if(url.pathname.endsWith('/browser-verification')){
    const body=req.postDataJSON();assert.equal(body.email,undefined,'client cannot choose mail recipient');
    if(body.action==='status')data={ok:true,verified:verified&&req.headers().authorization==='Bearer '+session.access_token,expiresAt:new Date(Date.now()+3600000).toISOString()};
    else if(body.action==='request'){
     if(++sends>1){status=429;data={code:'RATE_LIMITED'}}
     else data={ok:true,id:'ab200000-0000-4000-8000-000000000001',expiresIn:600};
    }else if(body.action==='confirm'){
     if(body.code==='123456'){verified=true;data={ok:true,verified:true}}
     else{status=400;data={code:'INVALID_CHALLENGE'}}
    }
   }else if(url.pathname.endsWith('/iydu_quick_resume_status')){assert.equal(req.headers().authorization,'Bearer '+session.access_token);data={allowed:verified};
   }else if(url.pathname.endsWith('/iydu_load')){
    assert.equal(verified,true,'no profile call before email proof');loads++;
    data=[{data:{u:'loginowner',nick:'Login owner',authUid:user.id,email:user.email}}];
   }else if(url.pathname.endsWith('/iydu_progress_policy'))data='daily';
   else if(url.pathname.endsWith('/iydu_save'))data=null;
   else throw Error('Unexpected login request '+url.pathname);
   await route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  });
  try{
   await page.goto('http://127.0.0.1:4173/');await page.locator('#welcome-continue').click();
   await page.locator('#u').fill(user.email);await page.locator('#p').fill('Fixture-Password-99!');await page.locator('#p').press('Enter');
   const modal=page.locator('#browser-verify-gate');await modal.waitFor({state:'visible'});
   await page.locator('#browser-verify-message').filter({hasText:'email service accepted'}).waitFor();
   assert.equal(loads,0);assert.equal(await page.locator('.shell').count(),0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'login gate fits '+width);
   await page.locator('#browser-verify-code').fill('654321');await page.locator('#browser-verify-code').press('Enter');
   await page.locator('#browser-verify-message').filter({hasText:'incorrect'}).waitFor();assert.equal(loads,0);
   await modal.getByRole('button',{name:'Request another code',exact:true}).click();
   await page.locator('#browser-verify-message').filter({hasText:'60 seconds'}).waitFor();
   await page.locator('#browser-verify-code').fill('123456');await page.locator('#browser-verify-code').press('Enter');
   await page.locator('.shell').waitFor();assert.equal(loads,1);assert.deepEqual(errors,[]);
   const requestsBeforeReload=sends;
   await page.reload();await page.locator('#welcome-continue').waitFor();
   await page.evaluate(async()=>{const original=sbSession();const claims=JSON.parse(atob(original.access_token.split('.')[1]));claims.session_id='ab100000-0000-4000-8000-000000000099';const candidate={...original,access_token:'fixture.'+btoa(JSON.stringify(claims))+'.signature'};await activateCloudUser(candidate,'loginowner','password')});
   await page.locator('.shell').waitFor();assert.equal(sends,requestsBeforeReload,'reload/new auth does not request another email inside verified hour');assert.equal(await page.evaluate(()=>sbSession().access_token),session.access_token,'server-approved original session retained');assert.equal(await page.locator('#browser-verify-gate:not(.is-closing)').count(),0);

  }finally{await page.close()}
 }
 console.log('PASS '+engine+': per-account login code, denied pre-code data, wrong code, resend limit, Enter and mobile layout');
};
