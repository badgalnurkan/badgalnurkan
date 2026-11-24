'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function part(a,b){const from=html.indexOf(a),to=html.indexOf(b,from+a.length);assert.ok(from>=0&&to>from,'Missing '+a);return html.slice(from,to)}
function context(extra={}){const c={DB:{lang:'en'},A:{day:'2026-11-24',tasks:[],plans:{},hist:{},focusHistory:[]},P:{todo(){}},today:()=> '2026-11-24',
 tr:()=>c.DB.lang==='tr',t:key=>key,esc:x=>String(x),recordActivity(){c.saves++},saves:0,
 allTodayTasksArchived:()=>false,ensurePlans(){c.A.plans||={}},toast(){},Math:Object.assign(Object.create(Math),{random:()=>0}),
 addD:(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),
 istanbulDayKey:d=>d?new Date(new Date(d).getTime()+10800000).toISOString().slice(0,10):'2026-11-24',
 rndHex:()=>String(Math.random()),...extra};vm.createContext(c);return c}
test('daily fact is stable within a day and comes with a source URL',()=>{
 const c=context();vm.runInContext(part('const DAILY_FACTS=[','P.home=()=>{')+'this.fact=dailyFactFor;',c);
 const one=c.fact('2026-11-24'),two=c.fact('2026-11-24');
 assert.equal(one,two);assert.match(one.url,/^https:\/\//);assert.ok(one.en&&one.tr&&one.source);
 c.DB.lang='tr';assert.match(c.dailyFactCard(),/Günün bilgisi/);
});
test('random suggestions avoid duplicates without editing existing tasks',()=>{
 const c=context();c.A.tasks=[{t:'Keep',s:'done'}];
 vm.runInContext(part('const TASK_SUGGESTIONS=','/* sis: tamamlanmamis gecmis gunler */'),c);
 assert.equal(c.suggestRandomTask(),true);
 assert.equal(c.A.tasks[0].t,'Keep');assert.equal(c.A.tasks.length,2);
 assert.equal(c.A.tasks[1].s,'');assert.equal(c.saves,1);
 assert.equal(c.suggestRandomTask(),true);assert.notEqual(c.A.tasks[1].t,c.A.tasks[2].t);
});
test('suggestions go to tomorrow only after today has been archived',()=>{
 const c=context({allTodayTasksArchived:()=>true});
 vm.runInContext(part('const TASK_SUGGESTIONS=','/* sis: tamamlanmamis gecmis gunler */'),c);
 assert.equal(c.suggestRandomTask(),true);
 assert.equal(c.A.tasks.length,0);assert.equal(c.A.plans['2026-11-25'].length,1);
});
test('focus insights count completed sessions only and stay within the last thirty days',()=>{
 const c=context();vm.runInContext(part('function focusPatternSummary(','function focusHistoryCard(){'),c);
 const current=Date.parse('2026-11-24T12:00:00+03:00'),old=Date.parse('2026-10-01T12:00:00+03:00');
 const records=[{at:current,seconds:900,completed:true},{at:current,seconds:900,completed:false},{at:old,seconds:1000,completed:true}];
 const pattern=c.focusPatternSummary(records);
 assert.equal(pattern.hour[1],1);
 c.A.hist={'2026-11-20':[{t:'one',done:false},{t:'two',done:true},{t:'three',done:false}]};
 assert.equal(c.focusPatternSummary(records).heavy.unfinished,2);
});
