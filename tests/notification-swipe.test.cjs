'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const start=source.indexOf('function removeTopNotification('),end=source.indexOf('function showTopNotification(',start);
function fixture({touch=false,reduced=false}={}){
 const handlers={},timers=new Map(),classes=new Set(),styles={},stack={children:[],remove(){this.removed=true}};let next=0;
 const banner={offsetWidth:300,parentElement:stack,classList:{contains:k=>classes.has(k),add:(...values)=>values.forEach(v=>classes.add(v)),remove:(...values)=>values.forEach(v=>classes.delete(v))},
  style:{setProperty:(k,v)=>styles[k]=v},addEventListener:(type,fn)=>{handlers[type]=fn},remove(){this.removed=true;stack.children=stack.children.filter(x=>x!==this)},
  setPointerCapture(id){this.captured=id},hasPointerCapture(id){return this.captured===id},releasePointerCapture(){this.captured=null},
 };stack.children=[banner];
 const context={window:{innerWidth:390,matchMedia:()=>({matches:reduced})},setTimeout:(fn,delay)=>{timers.set(++next,{fn,delay});return next},clearTimeout:id=>timers.delete(id)};
 if(!touch)context.window.PointerEvent=function(){};vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.f={bindNotificationSwipe,dismissTopNotification,notificationSwipeDirection};',context);context.f.bindNotificationSwipe(banner);
 const event=(x,y)=>({clientX:x,clientY:y,pointerId:1,button:0,isPrimary:true});
 return {context,banner,classes,styles,timers,handlers,stack,down:(x=150,y=20)=>handlers.pointerdown(event(x,y)),move:(x,y=20)=>handlers.pointermove(event(x,y)),up:(x,y=20)=>handlers.pointerup(event(x,y)),flush:()=>{for(const [id,timer] of [...timers]){timers.delete(id);timer.fn()}}};
}
test('both left and right drags dismiss the banner and remove the empty stack',()=>{
 for(const dx of [-100,100]){const f=fixture();f.down();f.move(150+dx);f.up(150+dx);assert.ok(f.classes.has('is-swiped'));assert.equal(Math.sign(parseFloat(f.styles['--notice-exit-x'])),Math.sign(dx));f.flush();assert.equal(f.banner.removed,true);assert.equal(f.stack.removed,true)}
});
test('short drags snap back instead of dismissing',()=>{
 const f=fixture();f.down();f.move(175);f.up(175);assert.equal(f.classes.has('is-leaving'),false);assert.equal(f.banner.style.transform,'');assert.equal([...f.timers.values()][0].delay,8000);
});
test('vertical and diagonal scrolling cannot become a dismissal',()=>{
 for(const [x,y] of [[152,100],[195,100]]){const f=fixture();f.down();f.move(x,y);f.up(300,120);assert.equal(f.classes.has('is-leaving'),false);assert.equal(f.banner.removed,undefined)}
});
test('a swipe blocks the following synthetic click, while an ordinary tap stays clickable',()=>{
 const f=fixture();f.down();f.move(250);f.up(250);let prevented=0,stopped=0;f.handlers.click({preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++});assert.equal(prevented,1);assert.equal(stopped,1);
 const tap=fixture();tap.down();tap.up(150);tap.handlers.click({preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++});assert.equal(prevented,1);
});
test('a held alert pauses expiry and a cancelled gesture restores its timer',()=>{
 const f=fixture();assert.equal(f.timers.size,1);f.down();assert.equal(f.timers.size,0);f.move(200);f.handlers.pointercancel();assert.equal(f.classes.has('is-dragging'),false);assert.equal(f.banner.style.transform,'');assert.equal(f.timers.size,1);
});
test('a second pointer cancels the gesture rather than dismissing',()=>{
 const f=fixture();f.down();f.move(220);f.handlers.pointerdown({isPrimary:false});f.up(300);assert.equal(f.classes.has('is-leaving'),false);assert.equal(f.banner.style.transform,'');
});
test('the touch fallback handles left and right swipes when Pointer Events are unavailable',()=>{
 for(const dx of [-100,100]){const f=fixture({touch:true}),p=x=>({clientX:x,clientY:20,identifier:3});f.handlers.touchstart({touches:[p(150)]});f.handlers.touchmove({touches:[p(150+dx)]});f.handlers.touchend({changedTouches:[p(150+dx)]});assert.ok(f.classes.has('is-swiped'));f.flush();assert.equal(f.banner.removed,true)}
});
test('multitouch and touch cancellation leave no swipe behind',()=>{
 const f=fixture({touch:true}),p={clientX:150,clientY:20,identifier:1};f.handlers.touchstart({touches:[p]});f.handlers.touchmove({touches:[p,{...p,identifier:2}]});f.handlers.touchend({changedTouches:[{...p,clientX:300}]});assert.equal(f.classes.has('is-leaving'),false);
 f.handlers.touchstart({touches:[p]});f.handlers.touchcancel();assert.equal(f.classes.has('is-dragging'),false);
});
test('reduced motion removes a dismissed banner without an animation delay',()=>{
 const f=fixture({reduced:true});f.down();f.move(250);f.up(250);assert.equal(f.banner.removed,true);assert.equal(f.timers.size,0);
});
test('automatic expiry keeps the previous eight-second visibility window',()=>{
 const f=fixture();assert.equal([...f.timers.values()][0].delay,8000);f.flush();assert.ok(f.classes.has('is-leaving'));f.flush();assert.equal(f.banner.removed,true);
});
test('up files the alert without deleting the inbox item, and only right invokes deletion',()=>{
 for(const [x,y,deletions] of [[150,-100,0],[38,20,0],[280,20,1]]){
  const f=fixture();let removed=0;f.banner._deleteNotice=()=>removed++;f.down();f.move(x,y);f.up(x,y);f.flush();
  assert.equal(removed,deletions);assert.equal(f.banner.removed,true);
 }
});
