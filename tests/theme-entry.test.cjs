'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const start=source.indexOf('const THEMES='),end=source.indexOf('function themePick(',start);
function fixture(session=new Map(),local=new Map(),blocked=false){
 const context={A:null,DB:{themeChoice:'mint',beige:false},view:'welcome',pg:'home',
  document:{documentElement:{dataset:{}}},getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,value),sysTheme:()=> 'light',
  sessionStorage:{getItem:key=>{if(blocked)throw Error('unavailable');return session.get(key)||null},setItem:(key,value)=>{if(blocked)throw Error('unavailable');session.set(key,value)},removeItem:key=>{if(blocked)throw Error('unavailable');session.delete(key)}},
  save:()=>{context.saves=(context.saves||0)+1},renderAppOrAuth(){},$:()=>null,
 };
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.f={applyTheme,setTheme,curTheme};',context);return {context,f:context.f,session,local};
}
test('an explicit welcome choice overrides an existing account theme on activation',()=>{
 const {context,f,session}=fixture();f.setTheme('black');assert.equal(f.curTheme(),'black');
 const account={theme:'mint'};context.A=account;f.applyTheme();assert.equal(account.theme,'black');assert.equal(context.DB.themeChoice,'black');assert.equal(f.curTheme(),'black');assert.equal(session.has('b1.entry-theme'),false);
});
test('the choice survives a redirect and applies before the loaded account can repaint it',()=>{
 const session=new Map(),local=new Map();fixture(session,local).f.setTheme('white');const after=fixture(session,local);after.f.applyTheme();assert.equal(after.f.curTheme(),'white');
 after.context.A={theme:'midnightblue'};after.f.applyTheme();assert.equal(after.context.A.theme,'white');assert.equal(session.size,0);
});
test('each user can choose a new welcome theme without modifying another account',()=>{
 const {context,f}=fixture();const first={theme:'mint'},second={theme:'forest'};f.setTheme('black');context.A=first;f.applyTheme();context.A=null;f.setTheme('white');context.A=second;f.applyTheme();
 assert.equal(first.theme,'black');assert.equal(second.theme,'white');
});
test('a consumed entry choice does not overwrite another account without a new choice',()=>{
 const {context,f}=fixture();f.setTheme('black');context.A={theme:'mint'};f.applyTheme();context.A={theme:'forest'};f.applyTheme();assert.equal(context.A.theme,'forest');assert.equal(f.curTheme(),'forest');
});
test('an account theme stays intact when there was no explicit pre-login selection',()=>{
 const {context,f}=fixture();context.A={theme:'orchid'};f.applyTheme();assert.equal(f.curTheme(),'orchid');assert.equal(context.A.theme,'orchid');
});
test('theme changes inside an account still save normally and clear any pending choice',()=>{
 const {context,f,session}=fixture();f.setTheme('black');context.A={theme:'mint'};context.view='app';f.setTheme('sapphire');assert.equal(context.A.theme,'sapphire');assert.equal(context.saves,1);assert.equal(session.size,0);
});
test('storage-blocked sessions use the existing storage fallback across the entry flow',()=>{
 const local=new Map();const before=fixture(new Map(),local,true);before.f.setTheme('black');const after=fixture(new Map(),local,true);after.context.A={theme:'white'};after.f.applyTheme();assert.equal(after.context.A.theme,'black');assert.equal(local.get('b1.entry-theme'),'');
});
test('invalid theme values never overwrite account data',()=>{
 const {context,f}=fixture(new Map([['b1.entry-theme','invalid']]));context.A={theme:'forest'};f.setTheme('invalid');f.applyTheme();assert.equal(context.A.theme,'forest');assert.equal(f.curTheme(),'forest');
});
