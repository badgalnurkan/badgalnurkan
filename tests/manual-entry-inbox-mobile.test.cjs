'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function extract(from,to){
 const a=source.indexOf(from),b=source.indexOf(to,a+from.length);
 assert.ok(a>=0&&b>a,'Cannot extract '+from);
 return source.slice(a,b);
}
test('remembered Google entry offers a separate manual Sign in route',()=>{
 const context={rememberedSignInBusy:false,t:()=> 'Sign in'};
 vm.createContext(context);
 vm.runInContext(extract('function manualSignInButton(remembered){','function welcomeScreen(){')+'this.button=manualSignInButton;',context);
 assert.match(context.button(true),/welcome-manual-signin/);
 assert.match(context.button(true),/manualSignInFromWelcome\(\)/);
 assert.match(context.button(true),/>Sign in<\/button>/);
 assert.equal(context.button(false),'');
 const flow={rememberedGoogleAccount:()=>({email:'person@example.com'}),goTo:(view,page)=>{flow.target=[view,page]},loginDat:{}};
 vm.createContext(flow);
 vm.runInContext('let welcomeEntryBusy=false;let rememberedSignInBusy=false;let skipRem=false;'+extract('function manualSignInFromWelcome(){','function continueFromWelcome(){')+'this.manual=manualSignInFromWelcome;this.skipped=()=>skipRem;',flow);
 flow.manual();
 assert.equal(flow.skipped(),true);
 assert.equal(flow.loginDat.u,'person@example.com');
 assert.equal(flow.loginDat.p,'');
 assert.deepEqual(flow.target,['login','home']);
});
test('greeting starts at valid manual auth submissions, without bypassing validation',async()=>{
 const signIn=extract('async function login(){','async function setup(){');
 const signUp=extract('async function setup(){','/* gercek sifre sifirlama');
 assert.match(signIn,/if\(!password\)[\s\S]*?const entryTransition=new Promise\(resolve=>playWelcomeTransition\(resolve\)\)/);
 assert.match(signIn,/activateCloudUser\(j,raw,'password',\{entryTransition\}\)/);
 assert.match(signUp,/if\(msg\)\{[\s\S]*?const entryTransition=new Promise\(resolve=>playWelcomeTransition\(resolve\)\)/);
 assert.match(signUp,/activateCloudUser\(j,u,'password',\{entryTransition\}\)/);
 assert.match(extract('async function activateCloudUser(','async function login(){'),/if\(options.entryTransition\)await options.entryTransition;\s*goTo\('app','home'\)/);
 let complete;
 const context={authBusy:false,loginDat:{u:'',p:''},DB:{accounts:{}},tr:()=>true,findUser:()=>null,
  $:id=>({value:id==='#u'?'person@example.com':'wrong-password'}),playWelcomeTransition:cb=>{context.entries++;complete=cb},entries:0,
  loginBusy:()=>{},sbSignIn:async()=>{throw Error('invalid login credentials')},authErrorMessage:()=> 'credentials',
  renderAppOrAuth:()=>{context.renders++},renders:0,goTo:()=>{context.navigations++},navigations:0};
 vm.createContext(context);
 vm.runInContext(signIn+'this.run=login;',context);
 const pending=context.run();
 assert.equal(context.entries,1,'animation should begin before server authentication finishes');
 complete();
 await pending;
 assert.equal(context.navigations,0,'rejected credentials must not enter the app');
 assert.ok(context.renders>=1);
});
function inboxFixture(reduced=false){
 const timers=[],names=new Set(),classes={add:k=>names.add(k),remove:k=>names.delete(k),contains:k=>names.has(k)};
 const button={disabled:false,classList:classes},list={innerHTML:'initial'};
 const account={notifications:[{id:'a'},{id:'b'}],noticeDelivered:{a:1,b:1}};
 const context={A:account,tr:()=>true,save:()=>{context.saves++},saves:0,updateNotificationBadge:()=>{context.badges++},badges:0,
  ensureNoticeState:()=>context.A,notificationList:()=>'<p>empty or entries</p>',motionReveal:()=>{},
  window:{matchMedia:()=>({matches:reduced})},
  document:{getElementById:id=>id==='notification-clear'?button:id==='notification-list'?list:null,querySelectorAll:()=>[]},
  setTimeout:(cb,delay)=>{timers.push({cb,delay})},dismissTopNotification:()=>{},openModal:()=>{}};
 vm.createContext(context);
 vm.runInContext(extract('function notificationClearButton(){','function setNotificationPreference(key,enabled){')+'this.clear=clearNotifications;this.buttonHTML=notificationClearButton;',context);
 return {context,button,list,names,timers};
}
test('notification inbox has one accessible bin, no per-item bins',()=>{
 const {context}=inboxFixture();
 const markup=context.buttonHTML();
 assert.equal((markup.match(/id="notification-clear"/g)||[]).length,1);
 assert.match(markup,/aria-label="Tüm bildirimleri sil"/);
 assert.match(markup,/class="bin-lid"/);
 assert.doesNotMatch(extract('function notificationList(){','function notificationClearButton(){'),/notification-delete/);
});
test('bin opens, deletes only current entries, and closes after the update',()=>{
 const {context,button,list,names,timers}=inboxFixture();
 context.clear();
 assert.equal(button.disabled,true);
 assert.ok(names.has('is-emptying'));
 assert.equal(context.A.notifications.length,2,'records remain until bin opens');
 assert.equal(timers[0].delay,360);
 context.A.notifications.push({id:'c'}); // notification arriving while the lid is opening is not cleared
 timers.shift().cb();
 assert.deepEqual(context.A.notifications.map(n=>n.id),['c']);
 assert.equal(context.A.noticeDelivered.a,1,'delivery history is preserved');
 assert.ok(names.has('is-finishing'));
 assert.equal(names.has('is-emptying'),false);
 assert.ok(list.innerHTML.length>0);
 assert.equal(timers[0].delay,280);
 timers.shift().cb();
 assert.equal(names.has('is-finishing'),false);
 assert.equal(button.disabled,false,'new notifications can be cleared later');
});
test('reduced motion immediately clears the inbox without visual delay',()=>{
 const {context,button,timers}=inboxFixture(true);
 context.clear();
 assert.deepEqual(context.A.notifications,[]);
 assert.equal(button.disabled,true);
 assert.equal(timers.length,0);
});
test('mobile project date and long project names stay in constrained card columns',()=>{
 assert.match(html,/class="project-date-field"><label for="pd">/);
 assert.match(html,/\.project-add #pd\{[^}]*max-width:100%!important/);
 assert.match(html,/\.project-task>span\{[^}]*overflow-wrap:anywhere/);
 assert.match(html,/@media\(max-width:600px\)\{\s*\.project-add\{grid-template-columns:minmax\(0,1fr\)!important/);
});
