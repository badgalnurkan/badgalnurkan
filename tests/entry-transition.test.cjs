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
 vm.runInContext(extract('function uiMotionTime(name,fallback){','const feedbackAnimations=')+extract('const greetKey=','const RANDOM_Q=')+extract('let welcomeEntryBusy=false;','function goHome(){')+'\nthis.f={greetKey,greetText,playWelcomeTransition,continueFromWelcome,uiMotionTime};',context);
 return {context,f:context.f,roots,timers,navigations};
}
test('Turkish greetings keep the afternoon until 18:00 and handle every boundary',()=>{
 const {f}=fixture();
 for(const [hour,expected] of [[0,'İyi geceler'],[4,'İyi geceler'],[5,'Günaydın'],[11,'Günaydın'],[12,'İyi günler'],[15,'İyi günler'],[16,'İyi günler'],[17,'İyi günler'],[18,'İyi akşamlar'],[21,'İyi akşamlar'],[22,'İyi geceler'],[23,'İyi geceler']])
  assert.equal(f.greetText(f.greetKey(hour)),expected);
});
test('English greetings use the same afternoon and evening boundaries',()=>{
 const {f,context}=fixture();context.tr=()=>false;
 for(const [hour,expected] of [[5,'Good morning'],[11,'Good morning'],[12,'Good afternoon'],[16,'Good afternoon'],[17,'Good afternoon'],[18,'Good evening'],[21,'Good evening'],[22,'Good night']])
  assert.equal(f.greetText(f.greetKey(hour)),expected);
});
test('real instants use the Türkiye clock, including midnight and the 18:00 boundary',()=>{
 const context={tr:()=>true};vm.createContext(context);
 vm.runInContext(extract('const greetingHour=','const RANDOM_Q=')+'\nthis.f={greetingHour,greetKey,greetText};',context);
 for(const [instant,hour,expected] of [
  ['2026-11-15T13:00:00Z',16,'İyi günler'],
  ['2026-11-15T14:59:59Z',17,'İyi günler'],
  ['2026-11-15T15:00:00Z',18,'İyi akşamlar'],
  ['2026-11-15T21:00:00Z',0,'İyi geceler'],
  ['2026-11-16T02:00:00Z',5,'Günaydın']
 ]){
  const actual=context.f.greetingHour(new Date(instant));assert.equal(actual,hour);
  assert.equal(context.f.greetText(context.f.greetKey(actual)),expected);
 }
});
test('Continue opens manual sign-in directly; the greeting is reserved for auth submission',()=>{
 const {f,context,roots,navigations}=fixture();context.A=null;context.view='welcome';assert.equal(roots.length,0);
 f.continueFromWelcome();assert.equal(roots.length,0);
 assert.deepEqual(navigations,[['login','home']]);
});
test('the branded transition still includes the time-based greeting',()=>{
 const {f,context,roots}=fixture();context.A=null;context.view='login';f.playWelcomeTransition();
 assert.ok(roots[0].innerHTML.includes('Günaydın'));
});
test('repeated Continue taps cannot navigate twice',()=>{
 const {f,roots,navigations}=fixture();f.continueFromWelcome();f.continueFromWelcome();
 assert.equal(roots.length,0);assert.equal(navigations.length,1);
});
test('animation end and timeout cannot invoke the completion twice',()=>{
 const {f,roots,timers}=fixture();let calls=0;f.playWelcomeTransition(()=>calls++);const root=roots[0],timeout=[...timers.values()][0];
 root.listeners.animationend({target:root,animationName:'entryPortalOut'});timeout.fn();
 assert.equal(calls,1);assert.equal(timers.size,0);
});
test('animation fallback still completes if the browser omits animationend',()=>{
 const {f,roots,timers}=fixture();let calls=0;f.playWelcomeTransition(()=>calls++);[...timers.values()][0].fn();
 assert.equal(calls,1);assert.equal(roots[0].removed,true);
});
test('reduced motion bypasses the animated overlay and completes immediately',()=>{
 const {f,roots,timers}=fixture(true);let calls=0;f.playWelcomeTransition(()=>calls++);
 assert.equal(roots.length,0);assert.equal(timers.size,0);assert.equal(calls,1);
});
test('the 1.6-second entry eases forward for 340ms and back for 240ms',()=>{
 assert.match(html,/--entry-total-ms:1600/);
 assert.match(html,/#login-portal\.entry-portal \.portal-disc\{[^}]*animation:entryCirclePass \.58s linear \.18s both!important/);
 const frames=html.match(/@keyframes entryCirclePass\{([^\n]+)\}/)[1];
 assert.match(frames,/58\.62069%\{transform:translate\(-50%,-50%\) scale\(1\.5\);animation-timing-function:var\(--motion-return\)\}/);
 assert.match(frames,/100%\{transform:translate\(-50%,-50%\) scale\(0\)\}/);
 assert.ok(Math.abs(580*.5862069-340)<.001);assert.ok(Math.abs(580*(1-.5862069)-240)<.001);
 assert.ok(Math.abs(.18+.58+.84-1.6)<.001);
});
test('JavaScript completion uses the duration configured in CSS',()=>{
 const {f,context,timers}=fixture();
 context.getComputedStyle=()=>({getPropertyValue:()=> '2600'});
 assert.equal(f.uiMotionTime('--entry-total-ms',2000),2600);
 f.playWelcomeTransition();assert.equal([...timers.values()][0].delay,2800);
 context.getComputedStyle=()=>({getPropertyValue:()=> 'invalid'});
 assert.equal(f.uiMotionTime('--entry-total-ms',2000),2000);
});
