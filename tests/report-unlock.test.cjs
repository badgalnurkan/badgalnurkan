'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fixture=require('./report-calendar.fixture.cjs');
function active(){const x=fixture();x.context.A.hist={'2026-11-18':[{t:'Study',done:true}]};return x.context}
test('weekly opens Sunday only and closes at Istanbul Monday boundary',()=>{
 const c=active();assert.equal(c.reportQuestionsOpen('week','2026-11-21'),false);assert.equal(c.reportQuestionsOpen('week','2026-11-22'),true);assert.equal(c.reportQuestionsOpen('week','2026-11-23'),false);
});
test('monthly opens on the last day only for this month’s activity',()=>{
 const c=active();
 assert.equal(c.reportQuestionsOpen('month','2026-11-29'),false);
 assert.equal(c.reportQuestionsOpen('month','2026-11-30'),true);
 assert.equal(c.reportQuestionsOpen('month','2026-12-01'),false);
 assert.equal(c.reportQuestionsOpen('month','2026-12-31'),false);
});
test('new accounts qualify in their signup month and the following week with activity in each',()=>{
 const c=active();c.A.reportStart='2026-11-18';c.A.reportJoinedAt='2026-11-18T10:00:00Z';
 assert.equal(c.reportQuestionsOpen('week','2026-11-22'),false);
 assert.equal(c.reportQuestionsOpen('month','2026-11-30'),true);
 assert.equal(c.reportQuestionsOpen('week','2026-11-29'),false);
 c.A.hist['2026-11-25']=[{t:'Task'}];assert.equal(c.reportQuestionsOpen('week','2026-11-29'),true);
 assert.equal(c.reportQuestionsOpen('month','2026-12-31'),false);
 c.A.journal['2026-12-01']={text:'Entry'};assert.equal(c.reportQuestionsOpen('month','2026-12-31'),true);
});
test('joining at midnight targets this month-end and the following week-end',()=>{
 const c=active();c.A.reportStart='2026-11-16';c.A.reportJoinedAt='2026-11-16T00:00:00+03:00';
 assert.equal(c.reportAvailability('week').unlock,'2026-11-29');
 c.A.reportStart='2026-11-01';c.A.reportJoinedAt='2026-11-01T00:00:00+03:00';
 assert.equal(c.reportAvailability('month').unlock,'2026-11-30');
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
test('annual summary and historical answers open only December 31 for a full active year',()=>{
 const c=active();c.current='2026-12-31';assert.equal(c.annualReportOpen(),true);assert.equal(c.answerArchiveUnlocked('2026-12-31','2026-11'),true);assert.equal(c.answerArchiveUnlocked('2027-01-01','2026-11'),false);c.current='2027-01-01';assert.equal(c.annualReportOpen(),false);
 c.current='2026-12-31';c.A.reportStart='2026-02-01';assert.equal(c.annualReportOpen(),false);c.A.reportStart='2025-01-01';c.A.hist={};assert.equal(c.annualReportOpen(),false);
});
test('monthly defaults and next-month plans remain separate and retain three questions',()=>{
 const c=active();c.current='2026-11-30';c.reportPlanningOverview();assert.equal(c.A.qs['2026-11'].length,3);assert.equal(c.A.planningQs['2026-11'].length,3);assert.equal(c.A.planningQs['2026-12'].length,3);assert.equal(c.canAnswerReport('2026-12','plan'),true);assert.equal(c.canAnswerReport('2026-12','review'),false);
});

test('joining November 30 and recording a first entry opens November before Istanbul midnight',()=>{
 const c=fixture().context;c.current='2026-11-30';c.DB.lang='tr';c.A.reportStart=c.current;
 c.A.reportJoinedAt='2026-11-30T23:45:00+03:00';
 assert.equal(c.reportQuestionsOpen('month'),false);
 c.A.journal[c.current]={text:'Kayıt'};
 assert.equal(c.reportQuestionsOpen('month'),true);
 assert.match(c.periodReportDetail('month'),/data-period="2026-11"/);
 assert.doesNotMatch(c.reportSummaryCard('month'),/31 Aralık/);
 c.current='2026-12-01';assert.equal(c.reportQuestionsOpen('month'),false);
 assert.equal(c.canAnswerReport('2026-11'),false);
 c.current='2026-12-31';assert.equal(c.reportQuestionsOpen('month'),false);
 c.A.journal[c.current]={text:'Aralık günlüğü'};assert.equal(c.reportQuestionsOpen('month'),true);
});
test('all twelve calendar months, leap February and Gregorian century boundaries close at the next midnight',()=>{
 const c=fixture().context;c.A.reportStart='1900-01-01';
 for(const year of [2000,2027,2028,2100]){
  for(let m=1;m<=12;m++){
   const end=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);
   const nextEnd=new Date(Date.UTC(year,m+1,0)).toISOString().slice(0,10);
   const next=c.addD(end,1),key=end.slice(0,7);c.A.hist[end]=[{t:'Task'}];c.current=end;
   assert.equal(c.reportWindow('month',end).opens,end);
   assert.equal(c.reportQuestionsOpen('month',c.addD(end,-1)),false);
   assert.equal(c.reportQuestionsOpen('month'),true,end);
   c.A.ql[key]=1;
   assert.equal(c.canAnswerReport(key),false);
   assert.match(c.reportSummaryCard('month'),new RegExp('datetime="'+nextEnd+'"'));
   assert.equal(c.reportQuestionsOpen('month',next),false);
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
 const c=active();c.current='2026-11-30';
 c.A.qs['2026-11']=[{q:'Legacy question',a:'Keep me'}];c.A.ql['2026-11']=1;
 c.A.planningQs['2026-12']=[{q:'Plan',a:'Unchanged'}];
 const before=JSON.stringify(c.A);
 assert.equal(c.reportQuestionsOpen('month'),false);
 assert.equal(c.canAnswerReport('2026-12','plan'),false);
 assert.equal(c.reportPlanningOverview(),'');
 assert.doesNotMatch(c.periodReportForm('month','2026-11','2026-12'),/<textarea/);
 assert.match(c.periodReportDetail('month'),/datetime="2026-12-31"/);
 assert.equal(JSON.stringify(c.A),before);
});

test('the annual summary and answer archive select just the current active year at Istanbul midnight',()=>{
 const c=active();
 c.A.hist['2025-12-31']=[{t:'Older history'}];c.A.hist['2027-12-31']=[{t:'Later history'}];
 for(const year of [2025,2026,2027]){
  const k=year+'-11';c.A.ql[k]=1;c.A.qs[k]=[{q:'Question',a:'Answer for '+year}];
 }
 const before=JSON.stringify(c.A);
 for(const [instant,expected] of [['2026-12-30T20:59:59Z',false],['2026-12-30T21:00:00Z',true],['2026-12-31T20:59:59Z',true],['2026-12-31T21:00:00Z',false]]){
  c.current=c.istanbulDayKey(new Date(instant));assert.equal(c.annualReportOpen(),expected);
  c.reportDetail='answers';const archive=c.reportDetailView();
  assert.equal(archive.includes('Answer for 2026'),expected);
  assert.doesNotMatch(archive,/Answer for (2025|2027)/);
  c.reportDetail='summary';const summary=c.reportDetailView();
  assert.equal(summary.includes('2026-11-18'),expected);
  assert.doesNotMatch(summary,/openDay\('(?:2025|2027)-12-31/);
  c.reportDetail='answers-older';assert.equal(c.reportDetailView().includes('Answer for 2025'),expected);
  c.reportDetail='summary-older';assert.equal(c.reportDetailView().includes('2025-12-31'),expected);
 }
 c.current='2027-12-31';c.reportDetail='answers';
 assert.match(c.reportDetailView(),/Answer for 2027/);assert.doesNotMatch(c.reportDetailView(),/Answer for 2026/);
 assert.equal(JSON.stringify(c.A),before);
});

test('completed current-day batches and legacy task text qualify without rewriting stored records',()=>{
 const c=fixture().context;c.current='2026-11-30';
 for(const data of [{completedBatches:{'2026-11-30':[{t:'Done'}]}},{hist:{'2026-11-30':['Saved task']}},{hist:{'2026-11-30':[{title:'Saved title'}]}}]){
  Object.assign(c.A,{hist:{},completedBatches:{}},data);
  const before=JSON.stringify(c.A);assert.equal(c.reportQuestionsOpen('month'),true);assert.equal(JSON.stringify(c.A),before);
 }
});

test('a submitted week belongs to its owner and is readable in their first year-end archive',()=>{
 const c=active();c.A.reportStart='2026-11-01';c.current='2026-11-22';
 const key='2026-11-16',next='2026-11-23';
 c.A.authUid='owner-one';c.periodReportForm('week',key,next);
 for(const questions of [c.A.qs[key],c.A.planningQs[key],c.A.planningQs[next]])questions.forEach(q=>q.a='My week');
 assert.equal(c.submitPeriodReport('week',key,true),true);
 c.current='2026-12-31';c.reportDetail='answers';assert.equal(c.annualReportOpen(),false);
 assert.match(c.reportDetailView(),/My week/);
 const form={dataset:{reportOwner:'owner-one'},isConnected:true},control={closest:()=>form};
 assert.equal(c.currentReportForm(control),true);
 c.A=fixture().context.A;c.A.authUid='owner-two';
 assert.equal(c.currentReportForm(control),false);assert.doesNotMatch(c.reportDetailView(),/My week/);
});

test('journal-only and focus-only summaries describe records for that user and month',()=>{
 const c=fixture().context;c.current='2026-11-30';c.st=()=>({t:0,d:0,p:0});
 c.A.journal={'2026-10-31':{text:'Prior month'},'2026-11-01':{text:'Journal'}};
 assert.match(c.reportSummaryCard('month'),/1 journal entry/);assert.doesNotMatch(c.reportSummaryCard('month'),/0\/0|focus session/);
 c.A.journal={};c.A.focusHistory=[{at:Date.parse('2026-11-30T18:00:00Z'),seconds:1000,completed:true},{at:Date.parse('2026-11-30T21:00:00Z'),seconds:1000,completed:true}];
 assert.match(c.reportSummaryCard('month'),/1 completed focus session/);assert.doesNotMatch(c.reportSummaryCard('month'),/journal entry/);
});

test('midnight archives a completed last field before blur, keeps incomplete drafts and isolates accounts',()=>{
 const c=active(),key='2026-11',next='2026-12';
 c.current='2026-11-30';c.periodReportForm('month',key,next);
 const one=c.A;
 for(const group of [one.qs[key],one.planningQs[key],one.planningQs[next]])for(const q of group)q.a='Done';
 c.qa(key,2,{value:'My last sentence'},'review',key);
 assert.equal(one.ql[key],undefined);
 c.A=fixture().context.A;c.current='2026-12-01';assert.equal(c.finishPendingReport(true),false);
 c.A=one;assert.equal(c.finishPendingReport(),true);assert.equal(one.ql[key],1);
 assert.equal(one.qs[key][2].a,'My last sentence');assert.equal(c.finishPendingReport(),false);
 const d=active();d.current='2026-11-30';d.periodReportForm('month',key,next);d.qa(key,0,{value:'My draft'},'review',key);
 d.current='2026-12-01';assert.equal(d.finishPendingReport(),false);assert.equal(d.A.ql[key],undefined);assert.equal(d.A.qs[key][0].a,'My draft');
});


test('the monthly card always names the current month and its Istanbul midnights',()=>{
 const c=fixture().context;c.DB.lang='tr';c.current='2026-11-23';
 for(const signup of ['2025-08-12','2026-11-14','2026-11-23']){
  c.A.reportStart=signup;c.A.reportJoinedAt=signup+'T10:00:00+03:00';
  const before=JSON.stringify(c.A),card=c.reportSummaryCard('month');
  assert.match(card,/data-month="2026-11"/);assert.match(card,/Kasım 2026<\/h2>/);
  assert.match(card,/Açılış · <time datetime="2026-11-30T00:00:00\+03:00">30 Kasım 2026 00\.00<\/time>/);
  assert.match(card,/Kapanış · <time datetime="2026-12-01T00:00:00\+03:00">1 Aralık 2026 00\.00<\/time>/);
  assert.doesNotMatch(card,/report-more/);
  assert.equal(JSON.stringify(c.A),before);
 }
});
test('monthly cards roll from each last day to the next first without skipping a month',()=>{
 const c=fixture().context;c.A.reportStart='1900-01-01';
 for(const year of [2026,2028,2100]){
  for(let month=1;month<=12;month++){
   const end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
   const first=c.addD(end,1),key=end.slice(0,7);
   c.A.journal[end]={text:'My entry'};c.current=end;
   let card=c.reportSummaryCard('month');
   assert.ok(card.includes('data-month="'+key+'"'));assert.ok(card.includes('datetime="'+end+'T00:00:00+03:00"'));
   assert.ok(card.includes('datetime="'+first+'T00:00:00+03:00"'));assert.match(card,/report-more/);
   c.A.ql[key]=1;assert.doesNotMatch(c.reportSummaryCard('month'),/report-more/);
   c.current=first;card=c.reportSummaryCard('month');
   assert.ok(card.includes('data-month="'+first.slice(0,7)+'"'));assert.doesNotMatch(card,/report-more/);
   assert.equal(c.canAnswerReport(key),false);assert.equal(c.A.journal[end].text,'My entry');
  }
 }
});
test('a previously eligible account can start recording on the final day and unlock that same month',()=>{
 const c=fixture().context;c.current='2028-02-29';c.DB.lang='tr';
 assert.match(c.reportSummaryCard('month'),/Bu ay için henüz/);
 assert.doesNotMatch(c.reportSummaryCard('month'),/Soruları yanıtla/);
 c.A.journal[c.current]={text:'Son gün'};
 assert.match(c.reportSummaryCard('month'),/Soruları yanıtla/);
 c.current='2028-03-01';assert.doesNotMatch(c.reportSummaryCard('month'),/Soruları yanıtla/);
});

test('first-month eligibility and summary use only this account’s records since joining',()=>{
 const c=fixture().context;c.current='2026-11-30';c.A.reportStart='2026-11-11';
 c.A.reportJoinedAt='2026-11-11T16:00:00+03:00';
 c.A.journal={'2026-11-10':{text:'Earlier'},'2026-12-01':{text:'New month'}};
 assert.equal(c.reportQuestionsOpen('month'),false);
 c.A.journal['2026-11-11']={text:'My first entry'};assert.equal(c.reportQuestionsOpen('month'),true);
 assert.match(c.reportSummaryCard('month'),/1 journal entry/);
 const first=c.A,pristine=JSON.stringify(first);
 c.A={...fixture().context.A,reportStart:'2026-11-11'};assert.equal(c.reportQuestionsOpen('month'),false);
 assert.equal(JSON.stringify(first),pristine);
});

test('joining on any month-end includes a completed focus before midnight and closes at midnight',()=>{
 for(const year of [2026,2028,2100])for(let month=1;month<=12;month++){
  const c=fixture().context,end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  c.A.reportStart=end;c.A.reportJoinedAt=end+'T23:40:00+03:00';
  c.A.focusHistory=[{at:Date.parse(end+'T23:59:59+03:00'),completed:true,seconds:900}];
  c.current=c.istanbulDayKey(new Date(end+'T23:59:59+03:00'));
  assert.equal(c.reportQuestionsOpen('month'),true,end);
  const next=c.addD(end,1);c.current=c.istanbulDayKey(new Date(next+'T00:00:00+03:00'));
  assert.equal(c.current,next);assert.equal(c.reportQuestionsOpen('month'),false);
  assert.equal(c.canAnswerReport(end.slice(0,7)),false);
 }
});

test('monthly correction preserves locks, rejects stale edits and closes at midnight',()=>{
 const c=active();c.current='2026-11-30';
 const key='2026-11',next='2026-12';c.periodReportForm('month',key,next);
 for(const group of [c.A.qs[key],c.A.planningQs[key],c.A.planningQs[next]])for(const q of group)q.a='Original';
 assert.equal(c.submitPeriodReport('month',key),true);
 assert.match(c.reportSummaryCard('month'),/openMonthlyEdit/);
 const fields=c.monthlyEditGroups(key),draft={owner:c.A,key,fields,original:fields.map(f=>f.question.a)};
 assert.equal(c.applyMonthlyEdit(draft,fields.map(()=> 'Corrected')),true);
 assert.equal(c.A.ql[key],1);assert.equal(c.A.planningLocks[next],1);
 assert.equal(c.applyMonthlyEdit(draft,fields.map(()=> 'Stale')),false);
 const updated=c.monthlyEditGroups(key),fresh={owner:c.A,key,fields:updated,original:updated.map(f=>f.question.a)};
 c.current='2026-12-01';assert.equal(c.applyMonthlyEdit(fresh,updated.map(()=> 'Too late')),false);
 assert.equal(c.A.qs[key][0].a,'Corrected');
});
