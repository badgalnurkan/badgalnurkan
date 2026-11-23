'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const extract=(from,to)=>{const a=source.indexOf(from),b=source.indexOf(to,a+from.length);assert.ok(a>=0&&b>a,from);return source.slice(a,b)};
module.exports=()=>{
 const context={A:{reportStart:'2025-01-01',hist:{},journal:{},focusHistory:[],qs:{},planningQs:{},ql:{},planningLocks:{}},current:'2026-11-22',DB:{lang:'en'},P:{rep(){}},reportDetail:'',
  tr:()=>context.DB.lang==='tr',t:x=>x,esc:x=>String(x),fmt:x=>x,recordActivity(){context.saves++},save(){context.saves++},saves:0,
  today:()=>context.current,istanbulDayKey:at=>at?new Date(at.getTime()+10800000).toISOString().slice(0,10):context.current,
  D:date=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0'),addD:(day,n)=>new Date(Date.parse(day+'T00:00Z')+n*86400000).toISOString().slice(0,10),dd:(a,b)=>(Date.parse(b)-Date.parse(a))/86400000,
  st:()=>({t:2,d:1,p:50,by:{}}),items:()=>[],M:h=>{context.rendered=h},reportRenderedDay:'',
  $:()=>null,historySection:()=>'',rqFor:()=>context.DB.lang==='tr'?context.RQ_TR:context.RQ_EN,
 };
 context.mon=day=>context.addD(day,-((new Date(day+'T12:00Z').getUTCDay()+6)%7));
 vm.createContext(context);vm.runInContext(extract('const RQ_EN=','const NAV_KEYS=')+"function rqFor(){return DB.lang==='tr'?RQ_TR:RQ_EN}\n"+extract("function periodDefaultQuestions(kind,key,scope='review'){",'/* ---- gecmis raporlar')+extract('function reportDetailView(){','P.rep=()=>{'),context);
 return {context,extract,source};
};
