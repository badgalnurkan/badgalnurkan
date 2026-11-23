'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fixture=require('./report-calendar.fixture.cjs');
function active(){const x=fixture();x.context.A.hist={'2026-11-18':[{t:'Study',done:true}]};return x.context}
test('weekly opens Sunday only and closes at Istanbul Monday boundary',()=>{
 const c=active();assert.equal(c.reportQuestionsOpen('week','2026-11-21'),false);assert.equal(c.reportQuestionsOpen('week','2026-11-22'),true);assert.equal(c.reportQuestionsOpen('week','2026-11-23'),false);
});
test('monthly reviews the preceding month throughout the answering month until submitted',()=>{
 const c=active();assert.equal(c.reportQuestionsOpen('month','2026-11-30'),false);assert.equal(c.reportQuestionsOpen('month','2026-12-01'),true);assert.equal(c.reportQuestionsOpen('month','2026-12-02'),true);assert.equal(c.reportWindow('month','2026-12-01').period.key,'2026-11');
});
test('leap days and December rollover use the correct completed month',()=>{
 const c=active();assert.equal(c.reportWindow('month','2028-03-01').period.b,'2028-02-29');assert.equal(c.reportWindow('month','2027-01-01').period.key,'2026-12');assert.equal(c.reportWindow('month','2027-01-01').next,'2027-02-01');
});
test('a partial signup week stays closed and November signup activity qualifies for December',()=>{
 const c=active();c.A.reportStart='2026-11-18';c.A.reportJoinedAt='2026-11-18T10:00:00Z';assert.equal(c.reportQuestionsOpen('week','2026-11-22'),false);assert.equal(c.reportQuestionsOpen('month','2026-12-01'),true);
 c.A.hist['2026-11-25']=[{t:'Next week'}];assert.equal(c.reportQuestionsOpen('week','2026-11-29'),true);c.A.hist['2026-12-12']=[{t:'Next month'}];assert.equal(c.reportQuestionsOpen('month','2027-01-01'),true);
});
test('signup on period day one after midnight also skips that incomplete period',()=>{
 const c=active();c.A.reportStart='2026-11-16';c.A.reportJoinedAt='2026-11-16T00:00:00+03:00';assert.equal(c.reportQuestionsOpen('week','2026-11-22'),true);c.A.reportJoinedAt='2026-11-16T00:00:01+03:00';assert.equal(c.reportQuestionsOpen('week','2026-11-22'),false);
});
test('empty and unrelated activity cannot unlock reports for existing users',()=>{
 const c=fixture().context;c.A.activeDays={'2026-11-18':true};c.A.future={'2026-11-18':'a note'};assert.equal(c.reportQuestionsOpen('week','2026-11-22'),false);c.A.hist={'2026-11-10':[{t:'Old'}]};assert.equal(c.reportQuestionsOpen('week','2026-11-22'),false);
});
test('a task, a journal or a completed focus record can each qualify its own period',()=>{
 const c=fixture().context;for(const [field,value] of [['hist',{'2026-11-18':[{t:'Task'}]}],['journal',{'2026-11-18':{text:'Journal'}}],['focusHistory',[{at:Date.parse('2026-11-18T12:00:00Z'),seconds:1500,completed:true}]]]){c.A[field]=value;assert.equal(c.reportQuestionsOpen('week','2026-11-22'),true,field);c.A[field]=field==='focusHistory'?[]:{}}
});
test('submission locks the period; old or out-of-window answer actions are rejected',()=>{
 const c=active(),key='2026-11-16',next='2026-11-23';c.periodReportForm('week',key,next);
 for(const arr of [c.A.qs[key],c.A.planningQs[key],c.A.planningQs[next]])for(const q of arr)q.a='Answered';
 assert.equal(c.submitPeriodReport('week',key),true);assert.equal(c.A.ql[key],1);assert.equal(c.submitPeriodReport('week',key),false);assert.doesNotMatch(c.reportSummaryCard('week'),/Answer questions/);
 c.current='2026-11-23';assert.equal(c.canAnswerReport(key),false);assert.doesNotMatch(c.periodReportDetail('week',true),/period-questionnaire/);
});
test('annual summary and historical answers open only January first for a full active year',()=>{
 const c=active();c.current='2027-01-01';assert.equal(c.annualReportOpen(),true);assert.equal(c.answerArchiveUnlocked('2027-01-01','2026-11'),true);assert.equal(c.answerArchiveUnlocked('2027-01-02','2026-11'),false);c.current='2027-01-02';assert.equal(c.annualReportOpen(),false);
 c.current='2027-01-01';c.A.reportStart='2026-02-01';assert.equal(c.annualReportOpen(),false);c.A.reportStart='2025-01-01';c.A.hist={};assert.equal(c.annualReportOpen(),false);
});
test('monthly defaults and next-month plans remain separate and retain three questions',()=>{
 const c=active();c.current='2026-12-01';c.reportPlanningOverview();assert.equal(c.A.qs['2026-11'].length,3);assert.equal(c.A.planningQs['2026-11'].length,3);assert.equal(c.A.planningQs['2026-12'].length,3);assert.equal(c.canAnswerReport('2026-12','plan'),true);assert.equal(c.canAnswerReport('2026-12','review'),false);
});

test('November signup gets December 1 on the card and in the form, including a signup on the last day',()=>{
 const c=fixture().context;
 c.current='2026-11-30';c.A.reportStart=c.current;c.A.reportJoinedAt='2026-11-30T23:45:00+03:00';c.DB.lang='tr';
 c.A.journal[c.current]={text:'İlk günüm'};
 assert.match(c.reportSummaryCard('month'),/<time datetime="2026-12-01">1 Aralık 2026<\/time>/);
 assert.equal(c.reportQuestionsOpen('month'),false);
 c.current='2026-12-01';
 assert.equal(c.reportQuestionsOpen('month'),true);
 assert.match(c.periodReportDetail('month'),/data-period="2026-11"/);
 c.A.journal={'2026-11-29':{text:'Before signup'}};
 assert.equal(c.reportQuestionsOpen('month'),false);
 c.A.reportStart=c.current;c.A.reportJoinedAt='2026-12-01T00:00:00+03:00';
 assert.equal(c.reportQuestionsOpen('month'),false,'no report on the day a new account is created');
});

test('every calendar month rolls directly to the following first, including leap February and December',()=>{
 const c=fixture().context;
 for(const year of [2027,2028]){
  for(let m=1;m<=12;m++){
   const day=new Date(Date.UTC(year,m-1,1)).toISOString().slice(0,10);
   const last=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);
   const next=new Date(Date.UTC(year,m,1)).toISOString().slice(0,10);
   const priorEnd=c.addD(day,-1),key=priorEnd.slice(0,7);
   c.A.hist[priorEnd]=[{t:'Session'}];c.A.hist[last]=[{t:'Next session'}];
   c.current=day;
   assert.equal(c.reportWindow('month',day).period.b,priorEnd);
   assert.equal(c.reportQuestionsOpen('month'),true,day);
   c.current=last;assert.equal(c.reportQuestionsOpen('month'),true,last);
   c.A.ql[key]=1;
   assert.equal(c.canAnswerReport(key),false);
   assert.match(c.reportSummaryCard('month'),new RegExp('datetime="'+next+'"'));
   c.current=next;assert.equal(c.canAnswerReport(day.slice(0,7)),true);
  }
 }
});

test('a rollover keeps drafts, historical locks, tasks, journals and future plans intact',()=>{
 const c=active();c.current='2026-12-31';
 c.A.tasks=[{t:'Today',s:'miss'}];c.A.backlog=['Later'];c.A.projects=[{n:'Project'}];
 c.A.hist[c.current]=[{t:'December'}];c.A.journal[c.current]={text:'End of the year'};
 c.A.qs['2026-10']=[{q:'Question',a:'Historical answer'}];c.A.ql['2026-10']=1;
 c.A.qs['2026-11']=[{q:'Draft',a:'Still writing'}];c.A.planningQs['2026-12']=[{q:'Plan',a:'My saved plan'}];
 const saved=JSON.parse(JSON.stringify(c.A));
 c.periodReportDetail('month');
 c.current='2027-01-01';c.periodReportDetail('month');
 // A stale December form still in the DOM cannot edit, remove, submit or append to January's plan.
 c.qa('2026-12',0,{value:'Changed'},'plan','2026-11');
 c.delQ('2026-12',0,'plan','2026-11');c.addRandQ('2026-12','plan','2026-11');
 assert.equal(c.submitPeriodReport('month','2026-11',true),false);
 for(const k of Object.keys(saved)){
  if(['qs','planningQs'].includes(k)){
   for(const [key,items] of Object.entries(saved[k]))assert.deepEqual(JSON.parse(JSON.stringify(c.A[k][key])),items);
  }else assert.deepEqual(JSON.parse(JSON.stringify(c.A[k])),saved[k],k);
 }
});

test('a saved monthly submission cannot create extra questions or reopen after reload',()=>{
 const c=active();c.current='2026-12-10';
 c.A.qs['2026-11']=[{q:'Legacy question',a:'Keep me'}];c.A.ql['2026-11']=1;
 c.A.planningQs['2026-12']=[{q:'Plan',a:'Unchanged'}];
 const before=JSON.stringify(c.A);
 assert.equal(c.reportQuestionsOpen('month'),false);
 assert.equal(c.canAnswerReport('2026-12','plan'),false);
 assert.equal(c.reportPlanningOverview(),'');
 assert.doesNotMatch(c.periodReportForm('month','2026-11','2026-12'),/<textarea/);
 assert.match(c.periodReportDetail('month'),/datetime="2027-01-01"/);
 assert.equal(JSON.stringify(c.A),before);
});

test('the annual summary and answer archive select just the preceding active year at Istanbul midnight',()=>{
 const c=active();
 c.A.hist['2025-12-31']=[{t:'Older history'}];c.A.hist['2027-12-31']=[{t:'Later history'}];
 for(const year of [2025,2026,2027]){
  const k=year+'-11';c.A.ql[k]=1;c.A.qs[k]=[{q:'Question',a:'Answer for '+year}];
 }
 const before=JSON.stringify(c.A);
 for(const [instant,expected] of [['2026-12-31T20:59:59Z',false],['2026-12-31T21:00:00Z',true],['2027-01-01T20:59:59Z',true],['2027-01-01T21:00:00Z',false]]){
  c.current=c.istanbulDayKey(new Date(instant));assert.equal(c.annualReportOpen(),expected);
  c.reportDetail='answers';const archive=c.reportDetailView();
  assert.equal(archive.includes('Answer for 2026'),expected);
  assert.doesNotMatch(archive,/Answer for (2025|2027)/);
  c.reportDetail='summary';const summary=c.reportDetailView();
  assert.equal(summary.includes('2026-11-18'),expected);
  assert.doesNotMatch(summary,/2025-12-31|2027-12-31/);
  c.reportDetail='answers-older';assert.equal(c.reportDetailView().includes('Answer for 2025'),expected);
  c.reportDetail='summary-older';assert.equal(c.reportDetailView().includes('2025-12-31'),expected);
 }
 c.current='2028-01-01';c.reportDetail='answers';
 assert.match(c.reportDetailView(),/Answer for 2027/);assert.doesNotMatch(c.reportDetailView(),/Answer for 2026/);
 assert.equal(JSON.stringify(c.A),before);
});

test('completed current-day batches and legacy task text qualify without rewriting stored records',()=>{
 const c=fixture().context;c.current='2026-12-03';
 for(const data of [{completedBatches:{'2026-11-30':[{t:'Done'}]}},{hist:{'2026-11-30':['Saved task']}},{hist:{'2026-11-30':[{title:'Saved title'}]}}]){
  Object.assign(c.A,{hist:{},completedBatches:{}},data);
  const before=JSON.stringify(c.A);assert.equal(c.reportQuestionsOpen('month'),true);assert.equal(JSON.stringify(c.A),before);
 }
});
