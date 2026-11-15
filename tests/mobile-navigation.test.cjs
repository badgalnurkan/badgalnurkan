'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(source); // Parse the complete real entrypoint, including inline templates.
function section(from,to){
 const start=source.indexOf(from),end=source.indexOf(to,start+from.length);
 assert.ok(start>=0&&end>start,'Missing application section: '+from);
 return source.slice(start,end);
}
const navigation=[['home'],['pomo'],['todo'],['pc'],['rep'],['set']];
function gestureFixture(){
 const handlers={},changes=[];
 let time=1000,modal=false,selection=false;
 const context={
  A:{},view:'app',pg:'pomo',innerWidth:390,NAV:navigation,
  Date:{now:()=>time},
  document:{addEventListener:(type,fn)=>{handlers[type]=fn},querySelector:()=>modal?{}:null},
  window:{scrollY:0,getSelection:()=>({isCollapsed:!selection})},
  navGo:(_el,_view,key)=>{changes.push(key);context.pg=key},
 };
 vm.createContext(context);
 vm.runInContext(section('let swipeStart=null;','function renderPage()')+'\nthis.direction=pageSwipeDirection;',context);
 const target={closest:selector=>selector==='main'?{}:null};
 const point=(x,y)=>({clientX:x,clientY:y});
 return {context,changes,direction:context.direction,
  start:(x=180,y=200,custom=target,count=1)=>handlers.touchstart({target:custom,touches:Array.from({length:count},()=>point(x,y))}),
  move:(x,y,count=1)=>handlers.touchmove({touches:Array.from({length:count},()=>point(x,y))}),
  end:(x,y)=>handlers.touchend({changedTouches:[point(x,y)],touches:[]}),
  cancel:()=>handlers.touchcancel(),
  time:value=>{time=value},modal:value=>{modal=value},selection:value=>{selection=value},
 };
}

test('short intentional horizontal swipes work in either direction',()=>{
 const f=gestureFixture();
 f.start();f.move(136,203);f.end(136,203);
 assert.deepEqual(f.changes,['todo']);
 f.start();f.move(225,202);f.end(225,202);
 assert.deepEqual(f.changes,['todo','pomo']);
});
test('small drags, diagonal movements and long presses do not navigate',()=>{
 for(const [x,y,at] of [[150,200,1001],[120,260,1001],[120,200,1901]]){
  const f=gestureFixture();f.start();f.time(at);f.end(x,y);assert.equal(f.changes.length,0);
 }
});
test('a vertical scroll cannot become a page swipe after the finger turns',()=>{
 const f=gestureFixture();f.start();f.move(182,225);f.move(100,204);f.end(100,204);
 assert.equal(f.changes.length,0);
});
test('actual page scrolling cancels a swipe even if final finger movement is horizontal',()=>{
 const f=gestureFixture();f.start();f.context.window.scrollY=15;f.end(100,200);
 assert.equal(f.changes.length,0);
});
test('edge gestures are left to browser Back and Forward',()=>{
 for(const x of [12,378]){const f=gestureFixture();f.start(x);f.end(x===12?100:290,200);assert.equal(f.changes.length,0)}
});
test('multitouch and touch cancellation leave no stale gesture',()=>{
 const f=gestureFixture();f.start();f.move(100,200,2);f.end(100,200);
 f.start();f.cancel();f.end(100,200);
 f.start();f.start(180,200,undefined,2);f.end(100,200);
 assert.equal(f.changes.length,0);
});
test('forms, calendar, stopwatch and menu track do not change pages',()=>{
 for(const kind of ['input','textarea','.cal','[data-swipe-stopwatch]','aside']){
  const f=gestureFixture();
  const target={closest:selector=>selector==='main'?(kind==='aside'?null:{}):selector.includes(kind)?{}:null};
  f.start(180,200,target);f.end(100,200);assert.equal(f.changes.length,0,kind);
 }
});
test('open dialogs and text selection suppress page gestures',()=>{
 const f=gestureFixture();f.modal(true);f.start();f.end(100,200);f.modal(false);
 f.selection(true);f.start();f.end(100,200);
 assert.equal(f.changes.length,0);
});
test('navigation stops at the first and last page instead of wrapping',()=>{
 const f=gestureFixture();f.context.pg='home';f.start();f.end(240,200);
 f.context.pg='set';f.start();f.end(100,200);
 assert.equal(f.changes.length,0);
});
test('desktop-sized viewports do not turn touch gestures into page navigation',()=>{
 const f=gestureFixture();f.context.innerWidth=1024;f.start();f.end(100,200);
 assert.equal(f.changes.length,0);
});
test('a gesture cannot finish on a different page from the one where it started',()=>{
 const f=gestureFixture();f.start();f.context.pg='home';f.end(100,200);
 assert.equal(f.changes.length,0);
});

function transitionFixture(reduced=false){
 const timers=new Map(),renders=[];let nextId=0;
 const main={isConnected:true,classList:{add(){},remove(){}},setAttribute(){}};
 const links=navigation.map(([key])=>({dataset:{k:key},classList:{toggle(){}},setAttribute(){},removeAttribute(){}}));
 const aside={querySelectorAll:()=>links};
 const context={A:{},view:'app',pg:'home',msg:'',selDay:null,pm:{run:false},TITLE:'App',
  setTimeout:fn=>{timers.set(++nextId,fn);return nextId},clearTimeout:id=>timers.delete(id),
  document:{getElementById:()=>main,querySelector:selector=>selector==='main'?main:aside},
  window:{scrollY:0,matchMedia:()=>({matches:reduced}),scrollTo(){}},history:{pushState(){}},
  renderPage:()=>renders.push(context.pg),centerNav(){},softPaint(){renders.push('auth')},navLabel:key=>key,
 };
 vm.createContext(context);vm.runInContext(section('let pageSwapTimer=0;','/* mobil/tablet: secilen sekme'),context);
 return {context,renders,timers,flush:()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn()}}};
}
test('rapid menu taps render only the most recently selected page',()=>{
 const f=transitionFixture();f.context.goTo('app','pomo');f.context.goTo('app','pc');f.context.goTo('app','set');
 assert.equal(f.timers.size,1);f.flush();assert.deepEqual(f.renders,['set']);
});
test('leaving the app cancels an unfinished page transition',()=>{
 const f=transitionFixture();f.context.goTo('app','pc');f.context.goTo('login','home');f.flush();
 assert.deepEqual(f.renders,['auth']);
});
test('reduced motion renders immediately without a transition timer',()=>{
 const f=transitionFixture(true);f.context.goTo('app','pc');assert.equal(f.timers.size,0);assert.deepEqual(f.renders,['pc']);
});
test('a detached main element never receives a delayed page render',()=>{
 const f=transitionFixture();f.context.goTo('app','pc');f.context.document.getElementById().isConnected=false;f.flush();
 assert.deepEqual(f.renders,[]);
});

test('keyboard arrows, Home and End activate and focus navigation links',()=>{
 const focus=[],chosen=[];
 const links=navigation.map(([key])=>({dataset:{k:key},focus:()=>focus.push(key)}));
 const context={navGo:(_el,_view,key)=>chosen.push(key)};vm.createContext(context);
 vm.runInContext(section('function navKeydown(event){','/* header\'a dokununca'),context);
 for(const [key,index,expected] of [['ArrowRight',0,'pomo'],['ArrowLeft',2,'pomo'],['End',0,'set'],['Home',4,'home']]){
  let prevented=false;
  context.navKeydown({key,target:links[index],currentTarget:{querySelectorAll:()=>links},preventDefault:()=>{prevented=true}});
  assert.equal(prevented,true);assert.equal(focus.at(-1),expected);assert.equal(chosen.at(-1),expected);
 }
 context.navKeydown({key:'Tab',target:links[0],currentTarget:{querySelectorAll:()=>links},preventDefault:()=>assert.fail('Tab must retain normal keyboard behavior')});
 assert.equal(chosen.length,4);
});
