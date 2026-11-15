'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function extract(from,to){const a=source.indexOf(from),b=source.indexOf(to,a+from.length);assert.ok(a>=0&&b>a,from);return source.slice(a,b)}
function fixture(reduced=false){
 const roots=[],timers=new Map(),navigations=[];let nextId=0;
 const media=()=>({matches:reduced});
 const context={window:{matchMedia:media},matchMedia:media,tr:()=>true,esc:s=>s,greetingHour:()=>10,
  goTo:(...args)=>navigations.push(args),setTimeout:(fn,delay)=>{timers.set(++nextId,{fn,delay});return nextId},clearTimeout:id=>timers.delete(id),
  document:{getElementById:()=>roots.find(r=>!r.removed)||null,
   createElement:()=>({listeners:{},setAttribute(){},addEventListener(name,fn){this.listeners[name]=fn},remove(){this.removed=true}}),
   body:{appendChild:root=>roots.push(root)}},
 };
 vm.createContext(context);
 vm.runInContext(extract('const greetKey=','const RANDOM_Q=')+extract('let entryIntroSeen=false;','function goHome(){')+'\nthis.f={greetKey,greetText,greetThen,continueFromWelcome};',context);
 return {context,f:context.f,roots,timers,navigations};
}
test('Turkish greetings follow the time of day and use İyi günler at midday',()=>{
 const {f}=fixture();
 for(const [hour,expected] of [[5,'Günaydın'],[10,'Günaydın'],[11,'İyi günler'],[15,'İyi günler'],[16,'İyi akşamlar'],[20,'İyi akşamlar'],[21,'İyi geceler'],[0,'İyi geceler']])
  assert.equal(f.greetText(f.greetKey(hour)),expected);
});
test('welcome waits for the full greeting, not the earlier circle animation',()=>{
 const {f,roots,navigations}=fixture();f.continueFromWelcome();const root=roots[0];
 assert.ok(root.innerHTML.includes('Günaydın'));assert.equal(root.className,'entry-portal');
 root.listeners.animationend({target:{},animationName:'entryCirclePass'});assert.equal(navigations.length,0);
 root.listeners.animationend({target:root,animationName:'entryPortalOut'});
 assert.equal(root.removed,true);assert.deepEqual(navigations,[['login','home']]);
});
test('repeated Continue activation cannot skip a running entry transition',()=>{
 const {f,roots,navigations}=fixture();f.continueFromWelcome();f.continueFromWelcome();
 assert.equal(roots.length,1);assert.equal(navigations.length,0);
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
 const {f,roots,timers,navigations}=fixture(true);f.continueFromWelcome();
 assert.equal(roots.length,0);assert.equal(timers.size,0);assert.deepEqual(navigations,[['login','home']]);
});
test('the circular pass assigns 30ms forward and 20ms reverse within 50ms',()=>{
 assert.match(html,/#login-portal\.entry-portal \.portal-disc\{[^}]*animation:entryCirclePass \.05s linear \.18s both!important/);
 const frames=html.match(/@keyframes entryCirclePass\{([^\n]+)\}/)[1];
 assert.match(frames,/60%\{transform:translate\(-50%,-50%\) scale\(1\)\}/);
 assert.match(frames,/100%\{transform:translate\(-50%,-50%\) scale\(0\)\}/);
 assert.equal(50*.6,30);assert.equal(50*(1-.6),20);
});
