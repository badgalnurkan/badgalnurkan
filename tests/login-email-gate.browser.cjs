'use strict';
const assert=require('node:assert/strict');
module.exports=async(browser,engine,origin)=>{
 for(const width of [320,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const user={id:'ab000000-0000-4000-8000-000000000011',email:'login-owner@example.invalid',email_confirmed_at:'2026-11-22T12:00:00Z',created_at:'2026-11-22T12:00:00Z',user_metadata:{username:'loginowner'},app_metadata:{providers:['email']}};
  const claims={sub:user.id,session_id:'ab100000-0000-4000-8000-000000000001'};
  const session={user,access_token:'fixture.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature',refresh_token:'fixture-refresh'};
  let profile={u:'loginowner',nick:'Login owner',authUid:user.id,email:user.email};
  let verified=false,loads=0,sends=0,allowSend,allowCode,allowLoad,holdReminderDeletion=false;
  const sendGate=new Promise(resolve=>{allowSend=resolve});
  const codeGate=new Promise(resolve=>{allowCode=resolve}),profileGate=new Promise(resolve=>{allowLoad=resolve});
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
     else{await sendGate;data={ok:true,id:'ab200000-0000-4000-8000-000000000001',expiresIn:600}}
    }else if(body.action==='confirm'){
     if(body.code==='123456'){await codeGate;verified=true;data={ok:true,verified:true}}
     else{status=400;data={code:'INVALID_CHALLENGE'}}
    }
   }else if(url.pathname.endsWith('/iydu_quick_resume_status')){assert.equal(req.headers().authorization,'Bearer '+session.access_token);data={allowed:verified};
   }else if(url.pathname.endsWith('/iydu_load')){
    assert.equal(verified,true,'no profile call before email proof');loads++;await profileGate;
    data=[{data:profile}];
   }else if(url.pathname.endsWith('/iydu_progress_policy'))data='daily';
   else if(url.pathname.endsWith('/iydu_sync_profile')){
    assert.ok(verified);const body=req.postDataJSON();
    const deletingReminder=body.p_data.projects?.some(project=>project.reminderDeleted===true);
    data=!(holdReminderDeletion&&deletingReminder)&&require('../profile-merge.js').equal(profile,body.p_expected_data);
    if(data)profile=body.p_data;
   }
   else throw Error('Unexpected login request '+url.pathname);
   await route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  });
  try{
   await page.goto('http://127.0.0.1:4173/');await page.locator('#welcome-continue').click();
   await page.locator('#u').fill(user.email);await page.locator('#p').fill('Fixture-Password-99!');await page.locator('#p').press('Enter');
   const modal=page.locator('#browser-verify-gate');await modal.waitFor({state:'visible'});
   await page.locator('#browser-verify-message').filter({hasText:'Requesting your sign-in code'}).waitFor();
   assert.equal(await page.locator('#auth-busy:visible').count(),0,'code screen usable while email request is in flight');
   await page.locator('#browser-verify-code').fill('6');
   allowSend();
   await page.locator('#browser-verify-message').filter({hasText:'email service accepted'}).waitFor();
   assert.equal(await page.locator('#browser-verify-code').inputValue(),'6');
   assert.equal(loads,0);assert.equal(await page.locator('#busy-overlay:visible, #auth-busy:visible').count(),0);assert.equal(await page.locator('.shell').count(),0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'login gate fits '+width);
   await page.locator('#browser-verify-code').fill('654321');await page.locator('#browser-verify-code').press('Enter');
   await page.locator('#browser-verify-message').filter({hasText:'incorrect'}).waitFor();assert.equal(loads,0);
   await modal.getByRole('button',{name:'Request another code',exact:true}).click();
   await page.locator('#browser-verify-message').filter({hasText:'60 seconds'}).waitFor();
   await page.locator('#browser-verify-code').fill('123456');await page.locator('#browser-verify-code').press('Enter');
   await page.locator('#browser-verify-message').filter({hasText:'Verifying'}).waitFor();assert.equal(loads,0);
   allowCode();await page.locator('#browser-verify-message').filter({hasText:'Sign-in confirmed'}).waitFor();
   allowLoad();await page.locator('.shell').waitFor();assert.ok(loads>=1);assert.deepEqual(errors,[]);
   if(engine==='chromium'&&width===320){
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   }
   const requestsBeforeReload=sends;
   await page.reload();await page.locator('#welcome-continue').waitFor();
   await page.evaluate(async()=>{const original=sbSession();const claims=JSON.parse(atob(original.access_token.split('.')[1]));claims.session_id='ab100000-0000-4000-8000-000000000099';const candidate={...original,access_token:'fixture.'+btoa(JSON.stringify(claims))+'.signature'};await activateCloudUser(candidate,'loginowner','password')});
   await page.locator('.shell').waitFor();assert.equal(sends,requestsBeforeReload,'reload/new auth does not request another email inside verified hour');assert.equal(await page.evaluate(()=>sbSession().access_token),session.access_token,'server-approved original session retained');assert.equal(await page.locator('#browser-verify-gate:not(.is-closing)').count(),0);

   if(engine==='chromium'&&width===320){
    const context=page.context();
    assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),true,'reload remains controlled by the installed service worker');
    await context.setOffline(true);await origin.disconnect();
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('#offline-entry').waitFor();
    assert.equal(await page.locator('#offline-entry fieldset').isDisabled(),false);
    await page.locator('#offline-body').fill('Saved offline at the library');
    await page.locator('#offline-entry button').click();await page.locator('#pad-status').filter({hasText:'Saved on this device'}).waitFor();
    await page.locator('#kind').selectOption('note');await page.locator('#day').fill('2031-03-31');await page.locator('#offline-body').fill('March note');
    await page.locator('#offline-entry button').click();assert.equal(await page.evaluate(()=>IYOfflinePad.list(IYOfflinePad.owner()).length),2);
    await origin.reconnect();await context.setOffline(false);
    await page.locator('.shell').waitFor();
    await page.waitForFunction(()=>A&&A.future?.['2031-03-31']==='March note'&&A.tasks.some(task=>task.t==='Saved offline at the library'));
    await page.evaluate(async()=>{await IYReconcile.check()});
    await page.waitForFunction(()=>IYOfflinePad.list(IYOfflinePad.owner()).length===0);
    assert.equal(profile.future['2031-03-31'],'March note');assert.equal(profile.tasks.filter(task=>task.t==='Saved offline at the library').length,1);
    await page.evaluate(async()=>{await IYReconcile.check()});
    profile=structuredClone(profile);profile.future['2031-04-30']='From a second device';
    await page.evaluate(async()=>{A.future['2031-04-30']='From this phone';save();await IYReconcile.check()});
    const entryPoint=page.getByRole('button',{name:'Review pending entries',exact:true});
    assert.equal(await page.locator('[onclick="IYReconcile.show()"]').count(),1);
    await entryPoint.click();
    const panel=page.locator('#sync-review'),row=panel.locator('fieldset').filter({hasText:'Future notes · 30 April 2031'});
    assert.equal(await panel.locator('pre, code').count(),0);
    assert.ok(await panel.evaluate(el=>el.firstElementChild.scrollWidth<=el.firstElementChild.clientWidth+1));
    await row.getByText('From a second device',{exact:true}).waitFor();await row.getByText('From this phone',{exact:true}).waitFor();
    await row.locator('input[value=device]').check();await panel.locator('button[type=submit]').click();
    await page.waitForFunction(()=>!cloudBlockedDrafts.has(A.authUid)&&A.future['2031-04-30']==='From this phone');
    assert.equal(profile.future['2031-04-30'],'From this phone');assert.equal(profile.future['2031-03-31'],'March note');
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('iydu.resolved.v1.'+A.authUid+'.')).length),1);
    console.log('PASS chromium: browser reopened with the server stopped, two offline entries reconciled; same-field choices retain both original versions');

    await panel.getByRole('button',{name:'Back',exact:true}).click();
    await panel.waitFor({state:'detached'});
    const dates=await page.evaluate(()=>({project:addD(today(),4),reminder:addD(today(),1)+'T23:00'}));
    await page.locator('#pn').fill('Reminder regression fixture');
    await page.locator('#pd').fill(dates.project);
    await page.locator('.project-add button[type=submit]').click();
    const project=page.locator('.project-task').filter({hasText:'Reminder regression fixture'});
    assert.match(await project.innerText(),/4 days/);
    await project.getByRole('button',{name:'Reminder',exact:true}).click();
    const settings=page.locator('#project-reminder-settings');
    await settings.locator('#project-remind-at').fill(dates.reminder);
    await settings.getByRole('button',{name:'Save',exact:true}).click();
    await settings.waitFor({state:'detached'});
    assert.match(await project.innerText(),/4 days/);
    await project.getByRole('button',{name:'Delete',exact:true}).click();
    await page.locator('#archive-confirm').getByRole('button',{name:'Yes',exact:true}).click();
    await project.waitFor({state:'detached'});
    await page.waitForFunction(()=>!cloudDraftEntries(A.authUid).length);
    assert.ok(profile.projects.find(item=>item.n==='Reminder regression fixture')?.archivedAt);
    const archiveTrigger=page.getByRole('button',{name:'Archive (1)',exact:true});
    await archiveTrigger.click();
    const archive=page.locator('#timed-archive-modal'),archivedProject=archive.locator('.note-tile').filter({hasText:'Reminder regression fixture'});
    const confirm=page.locator('#timed-project-delete');
    await archivedProject.getByRole('button',{name:'Delete',exact:true}).click();
    await confirm.getByRole('button',{name:'No',exact:true}).click();
    await confirm.waitFor({state:'detached'});
    assert.equal(await archivedProject.count(),1);
    await archivedProject.getByRole('button',{name:'Delete',exact:true}).click();
    holdReminderDeletion=true;
    await confirm.getByRole('button',{name:'Yes',exact:true}).click();
    await confirm.waitFor({state:'detached'});
    await archivedProject.waitFor({state:'detached'});
    assert.equal(await archive.isVisible(),true);
    assert.ok(profile.projects.find(item=>item.n==='Reminder regression fixture')?.archivedAt,'cloud still holds the previous version');
    await archive.getByRole('button',{name:'Close',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Archive (0)',exact:true}).count(),1);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#welcome-continue').waitFor();
    await page.evaluate(()=>activateCloudUser(sbSession(),'loginowner','password'));
    await page.locator('.shell').waitFor();
    assert.equal(await project.count(),0,'deleted reminder stays hidden when reopening with an unsynced deletion');
    assert.equal(await page.getByRole('button',{name:'Archive (0)',exact:true}).count(),1);
    holdReminderDeletion=false;
    await page.waitForFunction(()=>!cloudDraftEntries(A.authUid).length);
    const savedProject=profile.projects.find(item=>item.n==='Reminder regression fixture');
    assert.equal(savedProject.reminderDeleted,true);
    assert.equal(savedProject.d,dates.project);
    assert.equal(savedProject.reminderAt,undefined);
    console.log('PASS chromium: editing keeps the project date, confirmation closes, and reminder deletion survives reload and sync');


   }

  }finally{await page.close()}
 }
 console.log('PASS '+engine+': per-account login code, denied pre-code data, wrong code, resend limit, Enter and mobile layout');
};
