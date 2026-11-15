'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function extract(from,to){const a=source.indexOf(from),b=source.indexOf(to,a+from.length);assert.ok(a>=0&&b>a,from);return source.slice(a,b)}
function fixture(reduced=false){
 const roots=[],timers=new Map(),navigations=[];let nextId=0;
 const media=()=>({matches:reduced});
 const context={window:{matchMedia:media},matchMedia:media,tr:()=>true,esc:s=>s,greetingHour:()=>10,A:{},view:'app',
  goTo:(...args)=>navigations.push(args),setTimeout:(fn,delay)=>{timers.set(++nextId,{fn,delay});return nextId},clearTimeout:id=>timers.delete(id),
  document:{getElementById:()=>roots.find(r=>!r.removed)||null,
   createElement:()=>({listeners:{},setAttribute(){},addEventListener(name,fn){this.listeners[name]=fn},remove(){this.removed=true}}),
   body:{appendChild:root=>roots.push(root)}},
 };
 vm.createContext(context);
 vm.runInContext(extract('function uiMotionTime(name,fallback){','const feedbackAnimations=')+extract('const greetKey=','const RANDOM_Q=')+extract('function continueFromWelcome(){','function goHome(){')+'\nthis.f={greetKey,greetText,greetThen,continueFromWelcome,uiMotionTime};',context);
 return {context,f:context.f,roots,timers,navigations};
}
test('Turkish greetings follow the time of day and use İyi günler at midday',()=>{
 const {f}=fixture();
 for(const [hour,expected] of [[5,'Günaydın'],[10,'Günaydın'],[11,'İyi günler'],[15,'İyi günler'],[16,'İyi akşamlar'],[20,'İyi akşamlar'],[21,'İyi geceler'],[0,'İyi geceler']])
  assert.equal(f.greetText(f.greetKey(hour)),expected);
});
test('Continue opens sign-in directly without the authenticated greeting',()=>{
 const {f,context,roots,navigations}=fixture();context.A=null;context.view='welcome';f.continueFromWelcome();
 assert.equal(roots.length,0);assert.deepEqual(navigations,[['login','home']]);
});
test('the greeting runs only after successful account activation',()=>{
 const {f,context,roots}=fixture();context.A=null;context.view='login';f.greetThen();assert.equal(roots.length,0);
 context.A={};context.view='app';f.greetThen();const root=roots[0];assert.ok(root.innerHTML.includes('Günaydın'));
 root.listeners.animationend({target:{},animationName:'entryCirclePass'});assert.equal(root.removed,undefined);
 root.listeners.animationend({target:root,animationName:'entryPortalOut'});assert.equal(root.removed,true);
});
test('duplicate requests do not restart an animation; a later sign-in can replay it',()=>{
 const {f,roots}=fixture();f.greetThen();f.greetThen();assert.equal(roots.length,1);
 roots[0].listeners.animationend({target:roots[0],animationName:'entryPortalOut'});f.greetThen();assert.equal(roots.length,2);
});
test('animation end and timeout cannot invoke the completion twice',()=>{
 const {f,roots,timers}=fixture();let calls=0;f.greetThen(()=>calls++);const root=roots[0],timeout=[...timers.values()][0];
 root.listeners.animationend({target:root,animationName:'entryPortalOut'});timeout.fn();
 assert.equal(calls,1);assert.equal(timers.size,0);
});
test('animation fallback still completes if the browser omits animationend',()=>{
 const {f,roots,timers}=fixture();let calls=0;f.greetThen(()=>calls++);[...timers.values()][0].fn();
 assert.equal(calls,1);assert.equal(roots[0].removed,true);
});
test('reduced motion bypasses the animated overlay and completes immediately',()=>{
 const {f,roots,timers}=fixture(true);let calls=0;f.greetThen(()=>calls++);
 assert.equal(roots.length,0);assert.equal(timers.size,0);assert.equal(calls,1);
});
test('the circular pass eases forward for 420ms and back for 300ms',()=>{
 assert.match(html,/#login-portal\.entry-portal \.portal-disc\{[^}]*animation:entryCirclePass \.72s linear \.24s both!important/);
 const frames=html.match(/@keyframes entryCirclePass\{([^\n]+)\}/)[1];
 assert.match(frames,/58\.333333%\{transform:translate\(-50%,-50%\) scale\(1\.5\);animation-timing-function:var\(--motion-return\)\}/);
 assert.match(frames,/100%\{transform:translate\(-50%,-50%\) scale\(0\)\}/);
 assert.ok(Math.abs(720*.58333333-420)<.001);assert.ok(Math.abs(720*(1-.58333333)-300)<.001);
});
test('JavaScript completion uses the duration configured in CSS',()=>{
 const {f,context,timers}=fixture();
 context.getComputedStyle=()=>({getPropertyValue:()=> '2600'});
 assert.equal(f.uiMotionTime('--entry-total-ms',2000),2600);
 f.greetThen();assert.equal([...timers.values()][0].delay,2800);
 context.getComputedStyle=()=>({getPropertyValue:()=> 'invalid'});
 assert.equal(f.uiMotionTime('--entry-total-ms',2000),2000);
});
