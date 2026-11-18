// Read-only local review: no real credentials, emails, or production writes.
const { chromium, webkit }=require('playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict');
(async()=>{
 const server=spawn(process.env.PYTHON||'python3',['-m','http.server','4173','--directory','dist'],{stdio:'ignore'});
 try{
  for(let n=0;n<50;n++){try{if((await fetch('http://127.0.0.1:4173')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
   const browser=await type.launch();
   for(const width of [320,375,390,430,768,1440]){
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:2});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/review-app.html?lang=tr&theme=black');await page.waitForSelector('#pd');
    const box=await page.locator('#pd').boundingBox(),parent=await page.locator('.project-date-field').boundingBox();
    assert.ok(box.x>=parent.x-1&&box.x+box.width<=parent.x+parent.width+1,engine+' date overflow at '+width);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),engine+' document overflow '+width);
    await page.locator('#pd').fill('2027-04-30');assert.equal(await page.locator('#pd').inputValue(),'2027-04-30');
    assert.deepEqual(errors,[],engine+' JS errors');
    await page.close();
   }
   const welcome=await browser.newPage({viewport:{width:390,height:844}});
   await welcome.goto('http://127.0.0.1:4173/');await welcome.waitForSelector('#welcome-continue');
   await welcome.getByRole('button',{name:'Got it',exact:true}).click();
   await welcome.locator('#welcome-continue').click();await welcome.waitForSelector('#u');
   assert.equal(await welcome.locator('#login-portal').count(),0,'Continue opens manual sign-in directly');
   await welcome.close();
   const seed=await browser.newPage();
   await seed.goto('http://127.0.0.1:4173/review-app.html?lang=tr');
   const record=await seed.evaluate(()=>JSON.parse(JSON.stringify(A)));await seed.close();
   record.authUid='fixture-user';record.email='owner@example.invalid';record.mail=record.email;record.loginMethod='google';record.googleConnected=true;record.accountOrigin='cloud';
   // Independent local account. No real sign-in, network writes or production data.
   const productivity=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
   const productivityErrors=[];
   productivity.on('pageerror',error=>productivityErrors.push(error.message));
   await productivity.goto('http://127.0.0.1:4173/review-app.html?lang=tr');
   await productivity.evaluate(()=>{
     A.tasks=[{t:'Birinci görev',s:''},{t:'İkinci görev',s:'done'},{t:'Üçüncü görev',s:''}];
     goTo('app','todo');
   });
   await productivity.locator('#tl .task-grip').first().waitFor();
   assert.equal(await productivity.locator('#tl .task-grip').count(),3,engine+' task handles');
   await productivity.locator('#tl .task-grip').first().focus();
   await productivity.keyboard.press('ArrowDown');
   assert.deepEqual(await productivity.evaluate(()=>A.tasks.map(({t})=>t)),['İkinci görev','Birinci görev','Üçüncü görev'],engine+' keyboard reorder');
   assert.equal(await productivity.evaluate(()=>A.tasks[0].s),'done',engine+' reorder must keep status');
   await productivity.locator('#tl .task').nth(1).getByRole('button',{name:'Düzenle'}).click();
   await productivity.locator('#task-edit-text').fill('Güncellenmiş görev');
   await productivity.locator('#task-edit-modal').getByRole('button',{name:'Kaydet'}).click();
   assert.equal(await productivity.evaluate(()=>A.tasks[1].t),'Güncellenmiş görev',engine+' task editing');
   await productivity.locator('#task-edit-modal').waitFor({state:'detached'});
   const grip=await productivity.locator('#tl .task-grip').nth(1).boundingBox();
   const dest=await productivity.locator('#tl .task').nth(2).boundingBox();
   assert.ok(grip&&dest,engine+' grip positions');
   await productivity.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);
   await productivity.mouse.down();
   await productivity.mouse.move(dest.x+dest.width/2,dest.y+dest.height/2,{steps:6});
   await productivity.waitForFunction(()=>!!document.querySelector('#tl .is-lifted')&&taskReorder?.destination===2);
   assert.equal(await productivity.evaluate(()=>A.tasks[1].t),'Güncellenmiş görev',engine+' drag previews without persisting a move');
   await productivity.mouse.up();
   await productivity.waitForFunction(()=>!taskReorder&&A.tasks[2].t==='Güncellenmiş görev');
   assert.deepEqual(await productivity.evaluate(()=>A.tasks.map(({t})=>t)),['İkinci görev','Üçüncü görev','Güncellenmiş görev'],engine+' pointer reorder');
   await productivity.evaluate(()=>{
     const note=addD(today(),3);
     A.future={[note]:'Üç gün sonra hatırla'};
     goTo('app','pc');
   });
   await productivity.locator('.note-countdown').first().waitFor();
   assert.ok((await productivity.locator('.note-countdown').first().innerText()).includes('3 gün'),engine+' note countdown');
   await productivity.evaluate(()=>goTo('app','rep'));
   await productivity.locator('.report-archives').waitFor();
   await productivity.evaluate(()=>showReportDetail('summary'));
   await productivity.locator('.report-heading').first().waitFor();
   for(const width of [320,375,390,430]){
     await productivity.setViewportSize({width,height:844});
     assert.ok(await productivity.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),engine+' report overflow '+width);
   }
   assert.deepEqual(productivityErrors,[],engine+' productivity page errors');
   // A real report screen must close at Istanbul midnight even if its tab stays open.
   await productivity.goto('http://127.0.0.1:4173/review-app.html?page=rep&lang=tr&date=2026-11-29');
   assert.equal(await productivity.locator('.report-plan-period').count(),2,engine+' only weekly plan groups on Sunday');
   assert.equal(await productivity.locator('#report-group-plan-2026-12').count(),0);
   const draft=productivity.locator('.report-plan-period textarea').first();await draft.fill('Pazar taslağı');
   const changeDay=async value=>{
    await productivity.evaluate(date=>{const url=new URL(location.href);url.searchParams.set('date',date);history.replaceState(history.state,'',url);updateIstanbulClock()},value);
   };
   await changeDay('2026-11-30');
   await productivity.locator('#report-group-plan-2026-12').waitFor();
   assert.equal(await productivity.locator('#report-group-plan-2026-11-23').count(),0,engine+' weekly form closed');
   await changeDay('2026-12-01');assert.equal(await productivity.locator('.report-planning-overview').count(),0);
   await productivity.evaluate(()=>showReportDetail('month-previous'));
   assert.equal(await productivity.locator('textarea[id^="report-"]').count(),0,engine+' previous month is read-only statistics');
   await productivity.goto('http://127.0.0.1:4173/review-app.html?page=pomo&lang=en&date=2026-11-18');
   await productivity.evaluate(()=>{A.focusHistory=Array.from({length:6},(_,i)=>({at:new Date(2026,10,18-i,12).getTime(),seconds:(i+1)*60,completed:true}));P.pomo()});
   const analysis=productivity.locator('.focus-history'),more=analysis.locator('summary'),dateRows=analysis.locator('.focus-day:visible');
   const totals=await analysis.locator('.focus-history-totals').innerText();assert.equal(await dateRows.count(),3);
   assert.deepEqual(await dateRows.evaluateAll(rows=>rows.map(el=>el.dataset.focusDay)),['2026-11-18','2026-11-17','2026-11-16']);
   await more.click();assert.equal(await dateRows.count(),6);assert.equal(await analysis.locator('.focus-history-totals').innerText(),totals);
   await more.click();assert.equal(await dateRows.count(),3);assert.ok(await productivity.evaluate(()=>A.focusHistory.length===6));
   await productivity.evaluate(()=>{A.focusHistory=[];P.pomo()});assert.equal(await dateRows.count(),3);assert.equal(await more.count(),0);
   assert.deepEqual(productivityErrors,[]);
   await productivity.close();
   console.log('PASS '+engine+': task edit, keyboard and pointer reorder, future countdown and mobile report widths');
   const page=await browser.newPage({viewport:{width:390,height:844}});
   const session={user:{id:'fixture-user',email:record.email},access_token:'fixture-access-token',refresh_token:'fixture-refresh-token'};
   const db={accounts:{[record.u]:record},lastUser:record.u,last:record.nick,lang:'tr',beige:false};
   await page.addInitScript(({db,session})=>{localStorage.setItem('b1',JSON.stringify(db));localStorage.setItem('b1sb',JSON.stringify(session));localStorage.setItem('iydu.storage-notice.v1','test')},{db,session});
   const actions=[],requests=[];let closed=false;
   await page.route('https://flcfqwndqfmbritaywfb.supabase.co/**',async route=>{
    const url=route.request().url();requests.push(url);
    let data=null;
    if(url.endsWith('/auth/v1/user'))data={id:'fixture-user',email:record.email,email_confirmed_at:'2026-11-01T00:00:00Z',user_metadata:{},app_metadata:{providers:['google']}};
    else if(url.endsWith('/rpc/iydu_quick_resume_status'))data={allowed:true};
    else if(url.endsWith('/rpc/iydu_account_status'))data={user_id:'fixture-user',email:record.email,email_verified:true,state:closed?'deactivated':'active',has_password:false,password_required:false,server_time:'2026-11-17T00:00:00Z'};
    else if(url.endsWith('/rpc/iydu_load'))data=[{data:record}];
    else if(url.endsWith('/rpc/iydu_progress_policy'))data='daily';
    else if(url.endsWith('/rpc/iydu_save'))data=null;
    else if(url.endsWith('/functions/v1/account-security')){
     const b=route.request().postDataJSON();actions.push(b.action);
     if(b.action==='request_deactivate')data={ok:true,id:'b04146d1-f2a4-4a04-bd46-70159554b90f'};
     else if(b.action==='confirm_deactivate'){assert.equal(b.token,'123456');closed=true;data={ok:true,user_id:'fixture-user',state:'deactivated'}}
     else throw Error('Unexpected mock lifecycle action '+b.action);
    }else throw Error('Unexpected cloud request '+url);
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
   });
   await page.goto('http://127.0.0.1:4173/');
   await page.locator('#welcome-continue').click();
   await page.waitForSelector('.shell');
   assert.equal(await page.evaluate(()=>view),'app','home opens while greeting is active');
   assert.equal(await page.locator('#login-portal').count(),1,'greeting accompanies home reveal');
   await page.locator('#login-portal').waitFor({state:'detached'});
   await page.evaluate(()=>goTo('app','set'));
   await page.locator('.security-summary').waitFor();
   assert.ok((await page.locator('#security-content').innerText()).includes(record.email),'settings shows the verified server email');
   await page.getByText('Hesabı geçici olarak kapat',{exact:true}).click();
   await page.getByRole('button',{name:'Onay kodu gönder',exact:true}).click();
   await page.locator('#account-code-input').fill('123456');
   await page.locator('#account-code button').filter({hasText:'Onayla'}).click();
   await page.waitForFunction(()=>view==='welcome'&&A===null);
   assert.deepEqual(actions,['request_deactivate','confirm_deactivate']);
   assert.equal(await page.evaluate(()=>Object.values(DB.accounts).some(x=>x.authUid==='fixture-user')),false,'closed identity removed from browser');
   assert.equal(await page.evaluate(()=>localStorage.getItem('b1sb')),'','closed session cleared');
   await page.close();
   console.log('PASS '+engine+': mocked remembered entry, real-email UI and email-code deactivation');


   const removal=await browser.newPage({viewport:{width:390,height:844}});
   await removal.addInitScript(()=>localStorage.setItem('iydu.storage-notice.v1','test'));
   const deletionCalls=[];
   await removal.route('https://flcfqwndqfmbritaywfb.supabase.co/functions/v1/account-security',async route=>{
    const body=route.request().postDataJSON();deletionCalls.push(body);
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({ok:true,user_id:'fixture-user',state:'pending_delete',delete_after:'2026-12-17T00:00:00Z'})});
   });
   await removal.goto('http://127.0.0.1:4173/#account-action=delete&id=b04146d1-f2a4-4a04-bd46-70159554b90f&token='+'a'.repeat(64));
   await removal.locator('#delete-reason').selectOption('other');
   await removal.locator('#delete-other').fill('I want to take a break');
   await removal.locator('#account-delete-reasons').getByRole('button',{name:'Continue',exact:true}).click();
   assert.equal(deletionCalls.length,0,'reason selection must not close an account');
   await removal.locator('#account-delete-final').getByRole('button',{name:'No',exact:true}).click();
   assert.equal(deletionCalls.length,0,'No must not mutate the account');
   await removal.locator('#account-delete-reasons').getByRole('button',{name:'Continue',exact:true}).click();
   await removal.locator('#account-delete-final').getByRole('button',{name:'Yes, close my account',exact:true}).click();
   await removal.locator('#account-delete-scheduled').waitFor();
   assert.equal(deletionCalls.length,1);assert.equal(deletionCalls[0].confirmation,'YES_DELETE_IN_30_DAYS');
   assert.equal(deletionCalls[0].reason,'other');assert.equal(deletionCalls[0].other,'I want to take a break');
   assert.ok((await removal.locator('#account-delete-scheduled').innerText()).includes('Dec'));
   await removal.close();
   console.log('PASS '+engine+': deletion email link, Other, No and explicit Yes confirmation');

   await browser.close();console.log('PASS '+engine+': date form at six widths and manual welcome entry');
  }
 }finally{server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
