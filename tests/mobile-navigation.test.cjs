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
 const main={isConnected:true,classList:{add(){},remove(){}},setAttribute(){},
  style:{setProperty(key,value){main.navShift={key,value}}}};
 const links=navigation.map(([key])=>({dataset:{k:key},classList:{toggle(){}},setAttribute(){},removeAttribute(){}}));
 const aside={querySelectorAll:()=>links};
 const context={A:{},view:'app',pg:'home',msg:'',selDay:null,pm:{run:false},TITLE:'App',NAV:navigation,
  setTimeout:fn=>{timers.set(++nextId,fn);return nextId},clearTimeout:id=>timers.delete(id),
  document:{getElementById:id=>id==='mn'?main:null,querySelector:selector=>selector==='main'?main:aside},
  window:{scrollY:0,matchMedia:()=>({matches:reduced}),scrollTo(){}},history:{pushState(){}},
  renderPage:()=>renders.push(context.pg),centerNav(){},softPaint(){renders.push('auth')},navLabel:key=>key,
  resetMobileDockForPage(){context.dockResets=(context.dockResets||0)+1},
 };
 vm.createContext(context);vm.runInContext(section('function uiMotionTime(name,fallback){','const feedbackAnimations=')+section('let pageSwapTimer=0;','/* mobil/tablet: secilen sekme'),context);
 return {context,main,renders,timers,flush:()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn()}}};
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
 const f=transitionFixture();f.context.goTo('app','pc');f.context.document.getElementById('mn').isConnected=false;f.flush();
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

test('menu closing waits for its exit animation and ignores duplicate close requests',()=>{
 const classes=new Set(),timers=new Map(),events={};let closes=0;
 const dialog={open:true,classList:{contains:x=>classes.has(x),add:x=>classes.add(x)},
  addEventListener:(name,fn)=>{events[name]=fn},close(){closes++;this.open=false}};
 const context={document:{getElementById:()=>dialog},window:{matchMedia:()=>({matches:false})},
  setTimeout:fn=>{timers.set(1,fn);return 1},clearTimeout:id=>timers.delete(id)};
 vm.createContext(context);vm.runInContext(section('function uiMotionTime(name,fallback){','const feedbackAnimations=')+section('function closeNavMenu(){','function selectNavPage('),context);
 context.closeNavMenu();context.closeNavMenu();assert.equal(closes,0);assert.equal(timers.size,1);
 events.animationend({target:dialog,animationName:'mobileMenuOut'});
 assert.equal(closes,1);assert.equal(timers.size,0);
});
test('reduced motion closes a menu immediately without delaying focus restoration',()=>{
 let closed=false;const dialog={open:true,classList:{contains:()=>false},close:()=>{closed=true}};
 const context={document:{getElementById:()=>dialog},window:{matchMedia:()=>({matches:true})},setTimeout:()=>assert.fail('Reduced motion must not wait')};
 vm.createContext(context);vm.runInContext(section('function closeNavMenu(){','function selectNavPage('),context);
 context.closeNavMenu();assert.equal(closed,true);
});

test('video-inspired mobile tabs emphasize selection while swipe navigation remains supported',()=>{
 assert.match(html,/\.nav-shell aside a\.on\{[^}]*font-weight:850/s);
 assert.match(html,/\.nav-shell aside a\.on::after\{transform:scaleX\(1\)\}/);
 assert.match(html,/\.nav-shell aside a\.on \.nav-icon svg\{stroke-width:2\.5/);
 assert.match(html,/@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.nav-shell aside a::after/);
 const f=gestureFixture();f.start();f.end(100,201);assert.deepEqual(f.changes,['todo']);
});
test('page transition movement tracks previous and newly selected menu item',()=>{
 const f=transitionFixture();
 f.context.NAV=navigation;
 f.context.goTo('app','pc');assert.equal(f.main.navShift.value,'14px');
 f.flush();
 f.context.goTo('app','pomo');assert.equal(f.main.navShift.value,'-14px');
});

test('reference-video navigation is fixed at the bottom on small viewports, not in top menu',()=>{
  assert.match(html,/\.shell \.nav-shell\{[\s\S]*?position:fixed;[\s\S]*?top:auto;[\s\S]*?bottom:calc\(\.65rem \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(html,/\.shell \.nav-shell aside\{[\s\S]*?grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.ok(html.includes('.shell .nav-shell .mobile-menu-toggle,.shell .nav-shell aside .lg{display:none}'));
  assert.ok(html.includes('.shell{padding-bottom:calc(7.25rem + env(safe-area-inset-bottom,0px))}'));
});
test('all six pages remain directly reachable with compact TR/EN labels and accessible full labels',()=>{
  for(const [page,label] of Object.entries({home:'Ana',pomo:'Odak',todo:'Görevler',pc:'İlerleme',rep:'Rapor',set:'Ayarlar'})){
    assert.match(html,new RegExp(page+':\\\''+label+'\\\''));
  }
  assert.match(html,/aria-label="\$\{esc\(navLabel\(k\)\)\}"/);
  assert.match(html,/class="nav-label-mobile" aria-hidden="true"/);
  assert.match(html,/\.shell \.nav-shell aside a\.on\{[\s\S]*?font-weight:850/);
  assert.ok(html.includes('stroke-width:2.6;transform:scale(1.1)'));
});
test('bottom tab bar remains usable with a virtual keyboard or reduced motion',()=>{
  assert.match(html,/\.shell:has\(main :is\(input,textarea,select\):focus\) \.nav-shell/);
  assert.match(html,/@media\(max-width:900px\) and \(prefers-reduced-motion:reduce\)/);
  const f=gestureFixture();f.start();f.move(136,203);f.end(136,203);
  assert.deepEqual(f.changes,['todo']);
});

test('theme-aware mobile dock retains the sliding active indicator',()=>{
 assert.match(html,/\.shell \.nav-shell\{[\s\S]*?position:fixed;[\s\S]*?bottom:calc\(\.65rem \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(html,/\.shell \.nav-shell aside\{[\s\S]*?background:var\(--card\);border:1px solid var\(--ln\)/);
  assert.match(html,/\.shell \.nav-shell aside::before\{[\s\S]*?background:var\(--acc\)/);
 assert.match(html,/\.shell \.nav-shell aside::before\{[\s\S]*?transform:translate3d\(var\(--nav-indicator-x,0%\),0,0\)/);
 assert.match(html,/transition:transform \.3s var\(--motion-spring\)/);
 assert.match(html,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(html,/\.shell \.nav-shell aside a\.on\{[\s\S]*?font-weight:850/);
});
test('all selectable themes supply a palette to the same mobile dock',()=>{
 const names=[...source.match(/const THEMES=\[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
 assert.equal(names.length,17);
 for(const name of names)assert.ok(html.includes(':root[data-t='+name+']{'),'theme variables missing: '+name);
 const dock=html.split('/* Bottom navigation uses theme tokens; preserve the six-tab dock and scroll behavior. */')[1]?.split('@media(max-width:360px)')[0];
 assert.ok(dock,'mobile dock rules exist');
 for(const token of ['background:var(--card)','border:1px solid var(--ln)','background:var(--acc)','color:var(--ink)','color:var(--on-acc)']){
  assert.ok(dock.includes(token),'missing theme token: '+token);
 }
 assert.doesNotMatch(dock,/(?:background|border(?:-color)?|color|outline):#[0-9a-f]{3,8}/i);
});
test('collapsed mobile icon uses the accent surface and accessible contrast color',()=>{
 const collapsed=html.match(/\.shell \.nav-shell\.is-collapsed aside\{[\s\S]*?\n  \}/)?.[0];
 assert.ok(collapsed,'collapsed menu style exists');
 assert.ok(collapsed.includes('background:var(--acc)'));
 assert.ok(collapsed.includes('border-color:var(--acc)'));
 assert.match(html,/\.shell \.nav-shell aside a\.on\{\s*background:transparent!important;color:var\(--on-acc\)/);
 assert.match(html,/\.shell \.nav-shell aside a\.on:focus-visible\{outline-color:var\(--on-acc\)\}/);
 assert.match(html,/\.shell \.nav-shell\.is-collapsed aside a:not\(\.on\)\{display:none!important\}/);
});

test('initial render and navigation both advance the sliding indicator without removing swipe controls',()=>{
 assert.match(html,/style="--nav-indicator-x:\$\{Math\.max\(0,NAV\.findIndex/);
 assert.match(html,/aside\.style\?\.setProperty\('--nav-indicator-x'/);
 assert.match(html,/bar\?\.style\?\.setProperty\('--nav-indicator-x'/);
 assert.match(html,/function pageSwipeDirection\(/);
 const f=gestureFixture();f.start();f.end(105,201);assert.deepEqual(f.changes,['todo']);
});
test('bottom navigation keeps accessible full labels, reduced motion and safe area',()=>{
 assert.match(html,/aria-label="\$\{esc\(navLabel\(k\)\)\}"/);
 assert.match(html,/padding-bottom:calc\(7\.25rem \+ env\(safe-area-inset-bottom,0px\)\)/);
 assert.match(html,/prefers-reduced-motion:reduce\)[\s\S]*?aside::before\{transition:none\}/);
});

test('mobile navigation keeps six original pages but no invented blue pencil',()=>{
 assert.ok(html.includes('width:min(69vw,15.6rem)'));
 assert.ok(html.includes('grid-template-columns:repeat(6,minmax(0,1fr))'));
 assert.ok(html.includes('overflow:hidden!important'));
 assert.doesNotMatch(html,/mobile-quick-task|openQuickTask|quickTaskFocusPending/);
 assert.ok(html.includes('justify-content:flex-start'));
 assert.ok(html.includes('aside a:not(.on){display:none!important}'));
});
test('moving back from Progress cancels pending animations and resets mobile scroll without smooth movement',()=>{
 const f=transitionFixture();
 f.context.pg='pc';f.context.innerWidth=390;f.context.window.scrollY=320;
 const scroll=[];f.context.window.scrollTo=(...args)=>scroll.push(args);
 f.context.goTo('app','todo');
 assert.equal(f.main.navShift.value,'-14px');
 f.context.goTo('app','home');
 assert.equal(f.timers.size,1);
 f.flush();
 assert.deepEqual(f.renders,['home']);
 assert.deepEqual(scroll,[[0,0]]);
});

test('scroll direction collapses to the active icon, expands on upward movement',()=>{
 const classes=new Set(),labels=[],handlers={};
 const selected={setAttribute:(k,v)=>labels.push({key:k,value:v})};
 const dock={classList:{toggle:(key,on)=>{if(on)classes.add(key);else classes.delete(key)}},
  querySelector:selector=>selector==='#nav-aside a.on'?selected:null};
 const context={A:{},view:'app',pg:'pc',window:{scrollY:0,innerWidth:390,
  addEventListener:(name,fn)=>{handlers[name]=fn}},
  document:{querySelector:()=>dock},tr:()=>false,navLabel:key=>key};
 vm.createContext(context);
 vm.runInContext(section('let mobileDockLastY=0;','const NAV_ICON_PATHS='),context);
 context.window.scrollY=90;handlers.scroll();
 assert.equal(classes.has('is-collapsed'),true);
 assert.equal(labels.at(-1).value,'Expand menu: pc');
 context.window.scrollY=60;handlers.scroll();
 assert.equal(classes.has('is-collapsed'),false);
 assert.equal(labels.at(-1).value,'pc');
});
test('short scroll jitter does not collapse, returning to top expands',()=>{
 const classes=new Set(),handlers={};
 const dock={classList:{toggle:(k,on)=>on?classes.add(k):classes.delete(k)},
  querySelector:()=>({setAttribute(){}})};
 const context={A:{},view:'app',pg:'home',window:{scrollY:0,innerWidth:390,
   addEventListener:(name,fn)=>{handlers[name]=fn}},
   document:{querySelector:()=>dock},tr:()=>true,navLabel:key=>key};
 vm.createContext(context);
 vm.runInContext(section('let mobileDockLastY=0;','const NAV_ICON_PATHS='),context);
 for(const y of [5,9,11,13,11,14,16,17]){context.window.scrollY=y;handlers.scroll()}
 assert.equal(classes.has('is-collapsed'),false);
 context.window.scrollY=75;handlers.scroll();
 assert.equal(classes.has('is-collapsed'),true);
 context.window.scrollY=0;handlers.scroll();
 assert.equal(classes.has('is-collapsed'),false);
});
test('desktop never collapses; width changes reset mobile view only once',()=>{
 const classes=new Set(),handlers={},labels=[];
 const dock={classList:{toggle:(k,on)=>on?classes.add(k):classes.delete(k)},
  querySelector:()=>({setAttribute:(k,v)=>labels.push(v)})};
 const context={A:{},view:'app',pg:'rep',
   window:{scrollY:0,innerWidth:1000,addEventListener:(n,fn)=>handlers[n]=fn},
   document:{querySelector:()=>dock},tr:()=>false,navLabel:x=>x};
 vm.createContext(context);
 vm.runInContext(section('let mobileDockLastY=0;','const NAV_ICON_PATHS='),context);
 context.window.scrollY=250;handlers.scroll();
 assert.equal(classes.size,0);
 context.window.innerWidth=390;handlers.resize();
 context.window.scrollY=315;handlers.scroll();
 assert.equal(classes.has('is-collapsed'),true);
 context.window.innerWidth=390;handlers.resize();
 assert.equal(classes.has('is-collapsed'),true,'height-only viewport changes cannot reopen the dock');
 context.window.innerWidth=400;handlers.resize();
 assert.equal(classes.has('is-collapsed'),false);
});
test('tapping the only visible current icon expands without changing page',()=>{
 let resets=0,routes=0;
 const context={view:'app',pg:'pc',
  document:{querySelector:s=>s==='.nav-shell.is-collapsed'?{}:null},
  resetMobileDockForPage:()=>{resets++},pressTo:()=>{routes++}};
 vm.createContext(context);
 vm.runInContext(section('function navGo(el,v,p){','/* Scroll-sensitive mobile dock:'),context);
 context.navGo(null,'app','pc');
 assert.equal(resets,1);assert.equal(routes,0);
});

test('the bottom bounce keeps the dock collapsed until a real upward movement',()=>{
 const classes=new Set(),handlers={};
 const dock={classList:{toggle:(k,on)=>on?classes.add(k):classes.delete(k)},querySelector:()=>null};
 const context={A:{},view:'app',pg:'home',window:{scrollY:0,innerWidth:390,addEventListener:(k,fn)=>handlers[k]=fn},
  document:{querySelector:()=>dock,scrollingElement:{scrollHeight:1400,clientHeight:800}}};
 vm.runInNewContext(section('let mobileDockLastY=0;','const NAV_ICON_PATHS='),context);
 for(const y of [80,580,600,640,600,595]){context.window.scrollY=y;handlers.scroll();assert.equal(classes.has('is-collapsed'),true)}
 context.window.scrollY=552;handlers.scroll();assert.equal(classes.has('is-collapsed'),false);
});
