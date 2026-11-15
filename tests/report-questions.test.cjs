'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function extract(from,to){const start=source.indexOf(from),end=source.indexOf(to,start+from.length);assert.ok(start>=0&&end>start,from);return source.slice(start,end)}
function fixture(){
 const context={DB:{lang:'en'},A:{qs:{},planningQs:{},ql:{}},current:'2026-11-30',P:{rep(){}},
  esc:s=>String(s),tr:()=>context.DB.lang==='tr',t:key=>key,save(){},fmt:s=>s,today:()=>context.current,
  st:()=>({t:2,d:1,p:50,by:{}}),reportPeriodEnded:(now,end)=>now>=end,reportDetail:'answers',
  answerArchiveUnlocked:(now,key)=>Number(now.slice(0,4))>Number(key.slice(0,4)),
  Math:Object.assign(Object.create(Math),{random:()=>0}),$:()=>({value:'A custom question'}),
 };
 vm.createContext(context);
 vm.runInContext(`
 ${extract('const RQ_EN=','const NAV_KEYS=')}
 function rqFor(){return DB.lang==='tr'?RQ_TR:RQ_EN}
 ${extract('function reportQuestionId(text){','/* Weekly/monthly reports')}
 ${extract('function repCard(title,per,a,b,pa,pb,key,nk,defs)','/* ---- gecmis raporlar')}
 ${extract('function reportDetailView(){','P.rep=()=>{')}
 this.f={reportQuestionText,makeReportQuestion,qa,finishReportAnswer,commitReportGroup,addQ,addRandQ,delQ,repCard,reportDetailView,
  banks:REPORT_QUESTION_BANKS,defaults:DEFQ_EN,plans:PLANQ_EN};`,context);
 const f=context.f;
 const render=(kind='week',key=kind==='week'?'2026-11-23':'2026-11',next=kind==='week'?'2026-11-30':'2026-12')=>
  f.repCard(kind,kind,'2026-11-01','2026-11-29','2026-10-01','2026-10-31',key,next,f.defaults[kind]);
 return {context,f,render};
}
test('every built-in question has aligned English and Turkish translations',()=>{
 const {f}=fixture();
 for(const [key,bank] of Object.entries(f.banks)){
  assert.equal(bank.en.length,bank.tr.length,key);
  for(let i=0;i<bank.en.length;i++){
   assert.equal(f.reportQuestionText({q:bank.en[i],qid:key+':'+i},'tr'),bank.tr[i]);
   assert.equal(f.reportQuestionText({q:bank.tr[i],qid:key+':'+i},'en'),bank.en[i]);
  }
 }
});
test('legacy text-only questions translate without rewriting questions, answers or locks',()=>{
 const {context,f}=fixture();
 context.A.qs.old=Object.values(f.banks).flatMap(bank=>Array.from(bank.en,text=>({q:text,a:'Keep this answer exactly.'})));
 context.A.ql.old=1;const before=JSON.stringify(context.A);
 for(const q of context.A.qs.old)assert.notEqual(f.reportQuestionText(q,'tr'),q.q);
 assert.equal(JSON.stringify(context.A),before);
});
test('custom and unknown questions stay in the language written by the user',()=>{
 const {f}=fixture();
 const custom=f.makeReportQuestion(f.defaults.week[0],true);
 assert.equal(f.reportQuestionText(custom,'tr'),f.defaults.week[0]);
 assert.equal(f.reportQuestionText({q:'A question I wrote myself',a:'My answer'},'tr'),'A question I wrote myself');
 assert.equal(f.reportQuestionText({q:'Keep unknown ID',qid:'missing:99'},'tr'),'Keep unknown ID');
});
test('week and month planning each have three questions different from period reviews',()=>{
 const {f}=fixture();
 for(const kind of ['week','month']){
  assert.equal(f.plans[kind].length,3);
  for(const lang of ['en','tr']){
   const review=new Set(f.banks['review.'+kind][lang]);
   for(const q of f.banks['plan.'+kind][lang])assert.equal(review.has(q),false,q);
  }
 }
});
test('both report UIs change language while preserving current and future answers',()=>{
 for(const kind of ['week','month']){
  const {context,f,render}=fixture(),key=kind==='week'?'2026-11-23':'2026-11',next=kind==='week'?'2026-11-30':'2026-12';
  const english=render(kind,key,next);
  assert.ok(english.includes(f.defaults[kind][0]));assert.ok(english.includes(f.plans[kind][0]));
  context.A.qs[key][0].a='Review answer';context.A.planningQs[next][0].a='Future answer';
  const before=JSON.stringify(context.A);context.DB.lang='tr';
  const turkish=render(kind,key,next);
  assert.ok(turkish.includes(f.banks['review.'+kind].tr[0]));
  assert.ok(turkish.includes(f.banks['plan.'+kind].tr[0]));
  assert.equal(turkish.includes(f.defaults[kind][0]),false);
  assert.equal(JSON.stringify(context.A),before);
  context.DB.lang='en';assert.ok(render(kind,key,next).includes('Future answer'));
 }
});
test('planning answer input writes to its own period and leaves review drafts intact',()=>{
 const {context,f,render}=fixture();render();
 const input={value:'My next-week plan',parentElement:{nextElementSibling:{textContent:''}}};
 f.qa('2026-11-30',0,input,'plan');
 assert.equal(context.A.planningQs['2026-11-30'][0].a,input.value);
 assert.equal(context.A.qs['2026-11-30'][0].a,'');
 assert.equal(input.parentElement.nextElementSibling.textContent,input.value.length+'/400');
});
test('random future questions keep their identity and translate without being reselected',()=>{
 for(const kind of ['week','month']){
  const {context,f,render}=fixture(),next=kind==='week'?'2026-11-30':'2026-12';render(kind);
  f.addRandQ(next,'plan');const question=context.A.planningQs[next][3];
  assert.equal(question.qid,'plan.random.'+kind+':0');
  assert.equal(f.reportQuestionText(question,'tr'),f.banks['plan.random.'+kind].tr[0]);
  assert.equal(f.reportQuestionText(question,'en'),question.q);
 }
});
test('deleting all future questions does not silently recreate them on render',()=>{
 const {context,f,render}=fixture();render();
 while(context.A.planningQs['2026-11-30'].length)f.delQ('2026-11-30',0,'plan');
 render();assert.equal(context.A.planningQs['2026-11-30'].length,0);
});
test('completed-period planning answers survive rollover alongside distinct review answers',()=>{
 const {context,render}=fixture();render();
 context.A.planningQs['2026-11-30'][0].a='Plan made a week ago';
 context.current='2026-12-06';
 const result=render('week','2026-11-30','2026-12-07');
 assert.ok(result.includes('Your earlier plans for this period'));
 assert.ok(result.includes('Plan made a week ago'));
 assert.equal(context.A.qs['2026-11-30'][0].a,'');
 context.A.ql['2026-11-30']=1;
 assert.equal(render('week','2026-11-30','2026-12-07').includes('Plan made a week ago'),false);
});
test('year-end answer archive translates both groups and respects existing locks',()=>{
 const {context,f,render}=fixture();render('month');
 context.A.qs['2026-11'][0].a='Private review';
 context.A.planningQs['2026-11']=[{q:f.plans.month[0],qid:'plan.month:0',a:'Private plan'}];
 context.A.ql['2026-11']=1;
 assert.equal(f.reportDetailView().includes('Private plan'),false);
 context.current='2027-01-01';context.DB.lang='tr';const archive=f.reportDetailView();
 assert.ok(archive.includes(f.banks['review.month'].tr[0]));
 assert.ok(archive.includes(f.banks['plan.month'].tr[0]));
 assert.ok(archive.includes('Private review'));assert.ok(archive.includes('Private plan'));
});

test('last answer stays editable while typing; field exit locks only that group',()=>{
 const {context,f,render}=fixture();render();const key='2026-11-23',plan='2026-11-30';context.A.qs[key].forEach((q,i)=>q.a=i<2?'Answered':'');
 const input={value:'Still composing',parentElement:{nextElementSibling:{textContent:''}}};f.qa(key,2,input);assert.equal(context.A.ql[key],undefined);
 f.finishReportAnswer(key,2,input);assert.equal(context.A.ql[key],1);assert.equal(context.A.planningLocks[plan],undefined);
 input.value='Overwrite';f.qa(key,2,input);f.delQ(key,0);f.addRandQ(key);f.addQ(key);assert.equal(context.A.qs[key].length,3);assert.equal(context.A.qs[key][2].a,'Still composing');
});
test('empty, partial and whitespace answers never lock; custom questions participate',()=>{
 const {context,f,render}=fixture();render();const key='2026-11-30';context.A.planningQs[key].forEach(q=>q.a='Done');f.addQ(key,'plan');assert.equal(f.commitReportGroup(key,'plan'),false);
 context.A.planningQs[key][3].a='  ';assert.equal(f.commitReportGroup(key,'plan'),false);context.A.planningQs[key][3].a='Custom';assert.equal(f.commitReportGroup(key,'plan'),true);assert.equal(context.A.planningLocks[key],1);
 context.A.planningQs.empty=[];assert.equal(f.commitReportGroup('empty','plan'),false);
});
test('future plans unlock after their own year; partial reviews do not leak into their archive entry',()=>{
 const {context,f,render}=fixture();render('month','2026-12','2027-01');context.A.planningQs['2027-01'].forEach(q=>q.a='Private future plan');f.commitReportGroup('2027-01','plan');context.A.qs['2027-01']=[{q:'Partial review',a:'Keep draft private'}];
 context.current='2027-12-31';assert.equal(f.reportDetailView().includes('Private future plan'),false);context.current='2028-01-01';const result=f.reportDetailView();assert.ok(result.includes('Private future plan'));assert.equal(result.includes('Keep draft private'),false);
});
