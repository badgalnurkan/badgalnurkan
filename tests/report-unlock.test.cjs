'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fixture=require('./report-calendar.fixture.cjs');
function active(){const x=fixture();x.context.A.hist={'2026-11-18':[{t:'Study',done:true}]};return x.context}
test('weekly opens Sunday only and closes at Istanbul Monday boundary',()=>{
 const c=active();assert.equal(c.reportQuestionsOpen('week','2026-11-21'),false);assert.equal(c.reportQuestionsOpen('week','2026-11-22'),true);assert.equal(c.reportQuestionsOpen('week','2026-11-23'),false);
});
test('monthly reviews the preceding month on the first, never on month end or day two',()=>{
 const c=active();assert.equal(c.reportQuestionsOpen('month','2026-11-30'),false);assert.equal(c.reportQuestionsOpen('month','2026-12-01'),true);assert.equal(c.reportQuestionsOpen('month','2026-12-02'),false);assert.equal(c.reportWindow('month','2026-12-01').period.key,'2026-11');
});
test('leap days and December rollover use the correct completed month',()=>{
 const c=active();assert.equal(c.reportWindow('month','2028-03-01').period.b,'2028-02-29');assert.equal(c.reportWindow('month','2027-01-01').period.key,'2026-12');assert.equal(c.reportWindow('month','2027-01-01').next,'2027-02-01');
});
test('new users cannot answer a partial signup week or month',()=>{
 const c=active();c.A.reportStart='2026-11-18';c.A.reportJoinedAt='2026-11-18T10:00:00Z';assert.equal(c.reportQuestionsOpen('week','2026-11-22'),false);assert.equal(c.reportQuestionsOpen('month','2026-12-01'),false);
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
