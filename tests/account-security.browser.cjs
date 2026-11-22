// Read-only local review: no real credentials, emails, or production writes.
const { chromium, webkit, firefox }=require('playwright');
const verifyRecovery=require('./recovery-browser.browser.cjs');
const {mockSupabaseOrigin}=require('./mock-supabase-origin.cjs');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict');
(async()=>{
 const mockedBackend=mockSupabaseOrigin();
 const server=spawn(process.env.PYTHON||'python3',['-m','http.server','4173','--directory','dist'],{stdio:'ignore'});
 let browser;
 try{
  for(let n=0;n<50;n++){try{if((await fetch('http://127.0.0.1:4173')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  const suite=process.env.IYD_BROWSER_SUITE;
  const uiEngines=[['chromium',chromium],['webkit',webkit]];
  const engines=suite==='firefox'?[['firefox',firefox]]:suite==='ui'?uiEngines:[...uiEngines,['firefox',firefox]];
  for(const [engine,type] of engines){
   browser=await type.launch();
   await verifyRecovery(browser,engine);
   if(engine==='firefox'){await browser.close();continue}
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
   // Regression: a remembered Google identity must never crush the nickname into
   // a one-character column or cause an overflowing sign-in button.
   const rememberedLayout=await browser.newPage({viewport:{width:390,height:844}});
   const rememberedErrors=[];
   rememberedLayout.on('pageerror',error=>rememberedErrors.push(error.message));
   await rememberedLayout.goto('http://127.0.0.1:4173/');
   await rememberedLayout.waitForSelector('#welcome-continue');
   await rememberedLayout.evaluate(()=>{
     const key='fixturegoogleuser';
     const email='very.long.google.connected.account.for.layout.test@example.invalid';
     DB.accounts[key]={
       u:key,nick:'A long Google connected display name for layout regression',
       email,mail:email,authUid:'fixture-remembered-google-id',
       loginMethod:'google',googleConnected:true
     };
     DB.lastUser=key;
     view='login';
     A=null;
     skipRem=false;
     renderAppOrAuth();
   });
   await rememberedLayout.locator('.auth-google-remembered .remember').waitFor();
   for(const width of [205,260,320,375,390,430,768,1440]){
     await rememberedLayout.setViewportSize({width,height:844});
     const metrics=await rememberedLayout.evaluate(()=>{
       const card=document.querySelector('.auth-google-remembered .remember');
       const form=document.querySelector('.auth-google-remembered .box');
       const name=card.querySelector('.sp b');
       const user=card.querySelector('.sp small:nth-of-type(2)');
       const button=card.querySelector('.remember-continue');
       const manual=card.querySelector('.remember-manual');
       const email=button.querySelector('.remember-continue-email');
       const rect=e=>e.getBoundingClientRect();
       return {
         bodyScrollWidth:document.documentElement.scrollWidth,
         viewportWidth:window.innerWidth,
         cardFits:card.scrollWidth<=card.clientWidth+1,
         formFits:form.scrollWidth<=form.clientWidth+1,
         buttonFits:rect(button).left>=rect(card).left-1&&rect(button).right<=rect(card).right+1,
         buttonOnNewRow:rect(button).top>=rect(name).bottom,
         manualFits:manual&&rect(manual).left>=rect(card).left-1&&rect(manual).right<=rect(card).right+1,
         manualBelowGoogle:manual&&rect(manual).top>=rect(button).bottom-1,
         manualAction:manual?.getAttribute('onclick')||'',
         nameWidth:rect(name).width,
         nameSingleLine:getComputedStyle(name).whiteSpace==='nowrap',
         usernameSingleLine:getComputedStyle(user).whiteSpace==='nowrap',
         emailSingleLine:getComputedStyle(email).whiteSpace==='nowrap',
         emailEllipsis:getComputedStyle(email).textOverflow==='ellipsis',
         emailUnmodified:email.textContent==='very.long.google.connected.account.for.layout.test@example.invalid',
         loginAction:button.getAttribute('onclick')
       };
     });
     assert.ok(metrics.cardFits&&metrics.formFits,engine+' Google account card overflow at '+width);
     assert.ok(metrics.buttonFits&&metrics.buttonOnNewRow,engine+' Google sign-in action squeezes identity at '+width);
     assert.ok(metrics.manualFits&&metrics.manualBelowGoogle,engine+' manual sign-in is unavailable or squeezed at '+width);
     assert.match(metrics.manualAction,/useAccount/,engine+' remembered Google login must allow an independent password option');
     assert.ok(metrics.nameWidth>=60,engine+' remembered account name has no readable width at '+width);
     assert.ok(metrics.nameSingleLine&&metrics.usernameSingleLine&&metrics.emailSingleLine,engine+' remembered text breaks into vertical letters at '+width);
     assert.ok(metrics.emailEllipsis&&metrics.emailUnmodified,engine+' account email needs a readable, intact truncation at '+width);
     assert.ok(metrics.bodyScrollWidth<=metrics.viewportWidth+1,engine+' document overflows at '+width);
     assert.match(metrics.loginAction,/continueWithRememberedGoogle/,engine+' Google login callback preserved');
   }
   const beforeManualUrl=rememberedLayout.url();
   await rememberedLayout.locator('.auth-google-remembered .remember-manual').click();
   const manualState=await rememberedLayout.evaluate(()=>({
     input:document.querySelector('#u')?.value,
     view,
     noGoogleRedirect:location.href
   }));
   assert.equal(manualState.input,'fixturegoogleuser',engine+' manual Google account username not prefilled');
   assert.equal(manualState.view,'login',engine+' manual login must stay in password form');
   assert.equal(manualState.noGoogleRedirect,beforeManualUrl,engine+' manual login must not start Google OAuth');
   assert.deepEqual(rememberedErrors,[],engine+' Google remembered screen JS errors');
   await rememberedLayout.close();
   console.log('PASS '+engine+': remembered Google account labels and continue action fit 205–1440px');
   // Browser regression: a password recovery in one tab must not broadcast
   // account deletion and clear the newly minted recovery JWT in another tab.
   const recoveryContext=await browser.newContext({viewport:{width:390,height:844}});
   await recoveryContext.addInitScript(()=>{
    if(localStorage.getItem('b1'))return;
    const account={u:'recoverfixture',nick:'Recover fixture',authUid:'fixture-recover-user',email:'recover@example.invalid',mail:'recover@example.invalid',accountOrigin:'cloud'};
    localStorage.setItem('b1',JSON.stringify({accounts:{recoverfixture:account},lastUser:'recoverfixture',last:account.nick,lang:'en',beige:false}));
    localStorage.setItem('b1sb',JSON.stringify({access_token:'fixture-recovery-jwt',refresh_token:'fixture-recovery-refresh',user:{id:'fixture-recover-user',email:account.email}}));
    localStorage.setItem('iydu.storage-notice.v1','test');
   });
   const accountRequests=[];
   await recoveryContext.route(mockedBackend+'/**',async route=>{
    const endpoint=new URL(route.request().url()).pathname;
    accountRequests.push(endpoint);
    if(endpoint==='/rest/v1/rpc/iydu_account_status'){
     await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({user_id:'fixture-recover-user',email:'recover@example.invalid',state:'active',has_password:true,email_verified:true,server_time:'2026-11-19T18:48:28Z'})});
    } else await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'MOCK_ONLY'})});
   });
   const otherTab=await recoveryContext.newPage();
   await otherTab.goto('http://127.0.0.1:4173/');
   const recoveringTab=await recoveryContext.newPage();
   await recoveringTab.goto('http://127.0.0.1:4173/');
   await otherTab.evaluate(()=>{A=DB.accounts.recoverfixture;view='app'});
   await recoveringTab.evaluate(()=>{A=DB.accounts.recoverfixture;view='app'});
   await recoveringTab.evaluate(async()=>IYAccount.recovery({id:'fixture-recover-user'}));
   await recoveringTab.locator('#security-gate').waitFor({state:'visible'});
   await otherTab.waitForTimeout(150);
   const recoveryState=await recoveringTab.evaluate(()=>({
    activeUi:A!==null,
    session:sbSession()?.access_token,
    locallyRemembered:!!DB.accounts.recoverfixture
   }));
   const otherState=await otherTab.evaluate(()=>({
    stillSignedIn:A?.authUid==='fixture-recover-user',
    session:sbSession()?.access_token,
    locallyRemembered:!!DB.accounts.recoverfixture
   }));
   assert.deepEqual(recoveryState,{activeUi:false,session:'fixture-recovery-jwt',locallyRemembered:true},engine+' recovery is gated but keeps the verified session');
   assert.deepEqual(otherState,{stillSignedIn:true,session:'fixture-recovery-jwt',locallyRemembered:true},engine+' second tab must not globally revoke recovery session');
   assert.deepEqual(accountRequests,['/rest/v1/rpc/iydu_account_status'],engine+' recovery fixture has exactly one mocked API request');
   await recoveryContext.close();
   console.log('PASS '+engine+': password recovery retains session with two open tabs');
   const seed=await browser.newPage();
   await seed.goto('http://127.0.0.1:4173/review-app.html?lang=tr');
   const record=await seed.evaluate(()=>JSON.parse(JSON.stringify(A)));await seed.close();
   record.authUid='fixture-user';record.email='owner@example.invalid';record.mail=record.email;record.loginMethod='google';record.googleConnected=true;record.accountOrigin='cloud';
   // Independent local account. No real sign-in, network writes or production data.
   const productivity=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
   const productivityErrors=[];
   productivity.on('pageerror',error=>productivityErrors.push(error.message));
   await productivity.goto('http://127.0.0.1:4173/review-app.html?lang=tr');
   await productivity.locator('#storage-notice button').click();
   await productivity.locator('#storage-notice').waitFor({state:'detached'});

    // Real browser regression: scroll DOWN keeps only the active page icon,
    // scroll UP restores all six links. No unrequested action control exists.
    for(const width of [320,375,390,430,768]){
      await productivity.setViewportSize({width,height:844});
      const layout=await productivity.evaluate(()=>{
        const bar=document.querySelector('.shell .nav-shell'),aside=document.getElementById('nav-aside');
        const box=aside.getBoundingClientRect(),dock=bar.getBoundingClientRect();
        return {position:getComputedStyle(bar).position,
          tabs:aside.querySelectorAll('a[data-k]').length,
          pencilAbsent:!document.getElementById('mobile-quick-task'),
          left:box.left,right:box.right,bottom:dock.bottom,
          screenWidth:innerWidth,screenHeight:innerHeight,
          overflow:document.documentElement.scrollWidth-innerWidth};
      });
      assert.equal(layout.position,'fixed',engine+' dock position '+width);
      assert.equal(layout.tabs,6,engine+' all six original sections '+width);
      assert.equal(layout.pencilAbsent,true,engine+' no unrequested pencil '+width);
      assert.ok(layout.left>=0&&layout.right<=width+1,engine+' dock horizontally contained '+width);
      assert.ok(layout.bottom<=layout.screenHeight+1,engine+' dock vertically contained '+width);
      assert.ok(layout.overflow<=1,engine+' no horizontal body overflow '+width);
    }
    await productivity.setViewportSize({width:390,height:844});
    await productivity.evaluate(()=>{
      const main=document.getElementById('mn');
      main.style.minHeight='1600px';
      window.scrollTo({top:0,behavior:'instant'});
    });
    await productivity.waitForFunction(()=>window.scrollY===0);
    await productivity.evaluate(()=>resetMobileDockForPage());
    await productivity.evaluate(()=>window.scrollTo({top:260,behavior:'instant'}));
    await productivity.waitForFunction(()=>window.scrollY>=200);
    await productivity.waitForFunction(()=>document.querySelector('.nav-shell')?.classList.contains('is-collapsed'));
    await productivity.waitForFunction(()=>document.getElementById('nav-aside')?.getBoundingClientRect().width<=55);
    const small=await productivity.evaluate(()=>{
      const nav=document.querySelector('.nav-shell'),aside=document.getElementById('nav-aside');
      const shown=[...aside.querySelectorAll('a[data-k]')].filter(a=>getComputedStyle(a).display!=='none');
      const a=aside.getBoundingClientRect(),b=nav.getBoundingClientRect();
      return {shown:shown.length,current:shown[0]?.dataset.k,collapsed:nav.classList.contains('is-collapsed'),
        left:a.left,width:a.width,right:a.right,screenWidth:innerWidth,bottom:b.bottom};
    });
    assert.equal(small.shown,1,engine+' downward scroll shows only current icon');
    assert.equal(small.current,'home',engine+' sole icon must be current page');
    assert.ok(small.width<=55&&small.left>=0&&small.right<=small.screenWidth+1,
      engine+' collapsed circle stays within viewport');
    await productivity.evaluate(()=>window.scrollTo({top:180,behavior:'instant'}));
    await productivity.waitForFunction(()=>!document.querySelector('.nav-shell')?.classList.contains('is-collapsed'));
    const restored=await productivity.evaluate(()=>[...document.querySelectorAll('#nav-aside a[data-k]')]
      .filter(a=>getComputedStyle(a).display!=='none').length);
    assert.equal(restored,6,engine+' upward scroll restores all six icons');
    await productivity.evaluate(()=>window.scrollTo({top:300,behavior:'instant'}));
    await productivity.waitForFunction(()=>document.querySelector('.nav-shell')?.classList.contains('is-collapsed'));
    await productivity.locator('#nav-aside a.on').click();
    await productivity.waitForFunction(()=>!document.querySelector('.nav-shell')?.classList.contains('is-collapsed'));
    await productivity.evaluate(()=>{document.getElementById('mn').style.minHeight='';goTo('app','pc')});
    await productivity.waitForFunction(()=>pg==='pc'&&document.querySelector('#mn')?.getAttribute('aria-label')===navLabel('pc'));
    await productivity.locator('#nav-aside a[data-k="todo"]').click();
    await productivity.waitForFunction(()=>pg==='todo'&&document.querySelector('#mn')?.getAttribute('aria-label')===navLabel('todo'));
    const reverse=await productivity.evaluate(()=>({
      direction:document.querySelector('#mn').style.getPropertyValue('--iydu-nav-dir'),
      indicator:document.querySelector('#nav-aside').style.getPropertyValue('--nav-indicator-x')
    }));
    assert.equal(reverse.direction,'-14px',engine+' Progress backwards transition');
    assert.equal(reverse.indicator,'200%',engine+' Tasks highlight after backwards navigation');
    await productivity.evaluate(()=>goTo('app','home'));
    await productivity.waitForFunction(()=>pg==='home'&&document.querySelector('#mn')?.getAttribute('aria-label')===navLabel('home'));
    console.log('PASS '+engine+': scroll-down collapse, scroll-up expand, no pencil, reverse navigation');

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
   if(engine==='chromium'){
    const touch=await productivity.context().newCDPSession(productivity);
    await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true});
    const first=productivity.locator('#tl .task-grip').first(),neighbour=productivity.locator('#tl .task-grip').nth(1);
    await first.scrollIntoViewIfNeeded();
    const a=await first.boundingBox(),b=await neighbour.boundingBox();
    const point=(box)=>({x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2)});
    const gesture=(type,points)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    await gesture('touchStart',[point(a)]);await gesture('touchMove',[point(b)]);
    await productivity.waitForFunction(()=>taskReorder?.active&&taskReorder.destination===1);
    await gesture('touchCancel',[]);
    await productivity.waitForFunction(()=>!taskReorder);
    assert.deepEqual(await productivity.evaluate(()=>A.tasks.map(task=>task.t)),['İkinci görev','Üçüncü görev','Güncellenmiş görev'],'cancelled touch keeps saved order');
    await touch.detach();
   }
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
   for(const lang of ['en','tr']){
    await productivity.goto('http://127.0.0.1:4173/review-app.html?page=rep&lang='+lang);
    for(const width of [320,375,390,430]){
     await productivity.setViewportSize({width,height:844});
     const wholeWords=await productivity.locator('.report-archives button').evaluateAll(buttons=>buttons.every(button=>{
      const text=button.firstChild;
      return getComputedStyle(button).textAlign==='center'&&Array.from(text.textContent.matchAll(/\S+/g)).every(match=>{
       const r=document.createRange();r.setStart(text,match.index);r.setEnd(text,match.index+match[0].length);
       return r.getClientRects().length===1;
      });
     }));
     assert.equal(wholeWords,true,engine+' archive label wraps inside a word at '+width+' '+lang);
    }
   }
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
   const monthly=productivity.locator('.period-questionnaire');
   await monthly.locator('.report-send').click();
   assert.ok(await monthly.locator('textarea').count()>0,engine+' incomplete report remains editable');
   for(const field of await monthly.locator('textarea').all())await field.fill('Kasım yanıtım');
   await monthly.locator('.report-send').click();
   await productivity.locator('.report-submitted').waitFor();
   assert.equal(await productivity.locator('.report-planning-overview textarea').count(),0);
   await productivity.evaluate(()=>showReportDetail('month'));
   assert.equal(await productivity.locator('textarea[id^="report-"]').count(),0);
   await productivity.evaluate(()=>reportBack());
   await changeDay('2026-12-01');assert.equal(await productivity.locator('.report-planning-overview').count(),0);
   await productivity.evaluate(()=>showReportDetail('month-previous'));
   assert.equal(await productivity.locator('textarea[id^="report-"]').count(),0,engine+' previous month is read-only statistics');
   await productivity.goto('http://127.0.0.1:4173/review-app.html?page=pomo&lang=en&date=2026-11-18');
   await productivity.evaluate(()=>{A.focusHistory=Array.from({length:6},(_,i)=>({at:new Date(2026,i===5?9:10,i===5?31:18-i,12).getTime(),seconds:(i+1)*60,completed:true}));P.pomo()});
   const analysis=productivity.locator('.focus-history'),more=analysis.locator('summary'),dateRows=analysis.locator('.focus-day:visible');
   const totals=await analysis.locator('.focus-history-totals').innerText();assert.equal(await dateRows.count(),3);
   assert.deepEqual(await dateRows.evaluateAll(rows=>rows.map(el=>el.dataset.focusDay)),['2026-11-18','2026-11-17','2026-11-16']);
   await more.click();assert.equal(await dateRows.count(),6);assert.equal(await dateRows.last().getAttribute('data-focus-day'),'2026-10-31',engine+' older month retained');assert.equal(await analysis.locator('.focus-history-totals').innerText(),totals);
   await more.click();assert.equal(await dateRows.count(),3);assert.ok(await productivity.evaluate(()=>A.focusHistory.length===6));
   await productivity.evaluate(()=>{A.focusHistory=A.focusHistory.slice(0,3);P.pomo()});assert.equal(await dateRows.count(),3);assert.equal(await more.count(),0);
   await productivity.evaluate(()=>{A.focusHistory.push({at:new Date(2026,10,12,12).getTime(),seconds:300,completed:true});P.pomo()});assert.equal(await dateRows.count(),3);assert.equal(await more.count(),1);await more.click();assert.equal(await dateRows.count(),4);
   await productivity.evaluate(()=>{A.focusHistory=[{at:Date.now(),seconds:60,completed:false}];P.pomo()});assert.equal(await dateRows.count(),0);assert.equal(await more.count(),0);
   assert.deepEqual(productivityErrors,[]);
   await productivity.close();
   console.log('PASS '+engine+': task edit, keyboard and pointer reorder, future countdown and mobile report widths');
   const page=await browser.newPage({viewport:{width:390,height:844}});
   const session={user:{id:'fixture-user',email:record.email},access_token:'fixture-access-token',refresh_token:'fixture-refresh-token'};
   const db={accounts:{[record.u]:record},lastUser:record.u,last:record.nick,lang:'tr',beige:false};
   await page.addInitScript(({db,session})=>{localStorage.setItem('b1',JSON.stringify(db));localStorage.setItem('b1sb',JSON.stringify(session));localStorage.setItem('iydu.storage-notice.v1','test')},{db,session});
   const actions=[],requests=[];let closed=false,hasPassword=false;
   let cloudProfile=JSON.parse(JSON.stringify(record));
   await page.route(mockedBackend+'/**',async route=>{
    const url=route.request().url();requests.push(url);
    let data=null;
    if(url.endsWith('grant_type=password')){assert.equal(route.request().postDataJSON().email,record.email);data=session}
    else if(url.endsWith('/auth/v1/user')&&route.request().method()==='PUT'){
     assert.equal(route.request().postDataJSON().password,'Example3-Only');data={id:'fixture-user'};
    }
    else if(url.endsWith('/auth/v1/user'))data={id:'fixture-user',email:record.email,email_confirmed_at:'2026-11-01T00:00:00Z',user_metadata:{},app_metadata:{providers:['google']}};
    else if(new URL(url).pathname==='/auth/v1/recover'){
     assert.equal(route.request().postDataJSON().email,record.email);
     const redirect=new URL(new URL(url).searchParams.get('redirect_to'));
     assert.equal(redirect.origin,'http://127.0.0.1:4173');assert.match(redirect.searchParams.get('iyd_recovery'),/^[a-f0-9]{32}$/);
     assert.equal(route.request().postDataJSON().code_challenge_method,'s256');assert.match(route.request().postDataJSON().code_challenge,/^[a-zA-Z0-9_-]{43}$/);
     data={};
    }
    else if(url.endsWith('/rpc/iydu_quick_resume_status'))data={allowed:true};
    else if(url.endsWith('/rpc/iydu_account_status'))data={user_id:'fixture-user',email:record.email,email_verified:true,state:closed?'deactivated':'active',has_password:hasPassword,password_required:false,server_time:'2026-11-17T00:00:00Z'};
    else if(url.endsWith('/rpc/iydu_load'))data=[{data:cloudProfile}];
    else if(url.endsWith('/rpc/iydu_save_cas')){
     const {p_expected_data,p_data}=route.request().postDataJSON();
     assert.equal(p_data.authUid,session.user.id,'CAS may only write the signed-in identity');
     assert.equal(p_data.u,record.u,'CAS may not switch username');
     data=JSON.stringify(p_expected_data)===JSON.stringify(cloudProfile);
     if(data)cloudProfile=JSON.parse(JSON.stringify(p_data));
    }
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
   await page.evaluate(()=>openProfile());
   await page.locator('#profile-modal .profile-change-password').click();
   await page.locator('#password-renewal[open]').waitFor();
   const sent=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/v1/recover');
   await page.getByRole('button',{name:'Şifre yenileme bağlantısı gönder'}).click();assert.equal((await sent).status(),200);
   await page.locator('#recovery-browser-wait').getByRole('button',{name:'Kapat',exact:true}).click();
   await page.locator('#recovery-browser-wait').waitFor({state:'detached'});
   assert.equal(await page.locator('#security-old').count(),0);
   hasPassword=true;await page.evaluate(()=>IYAccount.refresh());
   await page.locator('#security-old').fill('Example2-Only');
   await page.locator('#security-new').fill('Example3-Only');
   await page.locator('#security-confirm').fill('Example3-Only');
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/v1/user'&&r.request().method()==='PUT');
   await page.getByRole('button',{name:'Şifreyi kaydet'}).click();assert.equal((await saved).status(),200);
   await page.waitForFunction(()=>document.getElementById('security-new')?.value==='');
   assert.equal(await page.locator('#mn .profile-change-password').count(),1);

   await page.locator('.security-summary').waitFor();
   assert.ok((await page.locator('#security-content').innerText()).includes(record.email),'settings shows the verified server email');
   await page.getByText('Hesabı geçici olarak kapat',{exact:true}).click();
   await page.getByRole('button',{name:'Onay kodu gönder',exact:true}).click();
   await page.locator('#account-code-input').fill('123456');
   await page.locator('#account-code button').filter({hasText:'Onayla'}).click();
   await page.locator('#account-deactivate-final').waitFor();
   assert.deepEqual(actions,['request_deactivate'],'entering the code must not deactivate before final confirmation');
   await page.locator('#account-deactivate-final').getByRole('button',{name:'Evet, hesabımı geçici kapat'}).click();
   await page.waitForFunction(()=>view==='welcome'&&A===null);
   assert.deepEqual(actions,['request_deactivate','confirm_deactivate']);
   assert.equal(await page.evaluate(()=>Object.values(DB.accounts).some(x=>x.authUid==='fixture-user')),false,'closed identity removed from browser');
   assert.equal(await page.evaluate(()=>localStorage.getItem('b1sb')),'','closed session cleared');
   await page.close();
   console.log('PASS '+engine+': mocked remembered entry, real-email UI and email-code deactivation');


   const removal=await browser.newPage({viewport:{width:390,height:844}});
   await removal.addInitScript(()=>localStorage.setItem('iydu.storage-notice.v1','test'));
   const deletionCalls=[];
   await removal.route(mockedBackend+'/functions/v1/account-security',async route=>{
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
   assert.equal(deletionCalls.length,1);assert.equal(deletionCalls[0].confirmation,'YES_DELETE_IN_60_DAYS');
   assert.equal(deletionCalls[0].reason,'other');assert.equal(deletionCalls[0].other,'I want to take a break');
   assert.ok((await removal.locator('#account-delete-scheduled').innerText()).includes('Dec'));
   await removal.close();
   console.log('PASS '+engine+': deletion email link, Other, No and explicit Yes confirmation');

   const standalone=await browser.newPage({viewport:{width:375,height:844}});
   const posted=[];
   await standalone.route(mockedBackend+'/functions/v1/account-security',async route=>{
     posted.push(route.request().postDataJSON());
     await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({ok:true,state:'pending_delete',delete_after:'2027-01-18T00:00:00Z'})});
   });
   await standalone.goto('http://127.0.0.1:4173/account-close.html#id=b04146d1-f2a4-4a04-bd46-70159554b90f&token='+'b'.repeat(64));
   await standalone.locator('#deletion-reason').waitFor({state:'visible'});
   assert.equal(await standalone.evaluate(()=>location.hash),'');
   assert.equal(posted.length,0);
   await standalone.locator('#deletion-reason').selectOption('other');
   await standalone.locator('#deletion-other').fill('I want to change my routine');
   await standalone.locator('#review-deletion').click();
   assert.equal(posted.length,0);
   await standalone.locator('#return-to-reasons').click();
   assert.equal(posted.length,0);
   await standalone.locator('#review-deletion').click();
   await standalone.locator('#finalize-deletion').click();
   await standalone.locator('#done-step').waitFor({state:'visible'});
   assert.equal(posted.length,1);
   assert.equal(posted[0].reason,'other');
   assert.equal(posted[0].confirmation,'YES_DELETE_IN_60_DAYS');
   await standalone.close();
   console.log('PASS '+engine+': separate email-link reason form, No cancellation and final Yes');
   await browser.close();console.log('PASS '+engine+': date form at six widths and manual welcome entry');
  }
 }finally{try{await browser?.close()}finally{server.kill()}}
})().catch(e=>{console.error(e);process.exitCode=1});
