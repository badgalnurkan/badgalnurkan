'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fixture=require('./report-calendar.fixture.cjs');

function submitted(){
 const c=fixture().context;
 c.current='2026-11-30';
 c.A.hist={'2026-11-18':[{t:'Study',done:true}]};
 c.A.ql={'2026-11':1};
 c.A.qs={'2026-11':[{q:'Review',a:'Previous review'}]};
 c.A.planningQs={
  '2026-11':[{q:'Current plan',a:'Previous plan'}],
  '2026-12':[{q:'Next plan',a:'Previous next plan'}]
 };
 c.openModal=(id,markup)=>{c.modal={id,markup}};
 c.closeModal=id=>{c.closed=id};
 c.toast=()=>{};
 c.document={getElementById(id){
  return {value:c.values[id]||'',focus(){}};
 }};
 c.values={'report-edit-0-0':'Edited review','report-edit-1-0':'Edited plan','report-edit-2-0':'Edited next plan'};
 return c;
}
test('monthly report stays locked after submission but can be explicitly edited on final day',()=>{
 const c=submitted();
 assert.equal(c.reportQuestionsOpen('month'),false);
 assert.equal(c.canEditSubmittedReport('month','2026-11'),true);
 assert.equal(c.startSubmittedReportEdit('month','2026-11'),true);
 assert.equal(c.modal.id,'submitted-report-edit');
 assert.match(c.modal.markup,/Previous review/);
 assert.equal(c.saveSubmittedReportEdit(),true);
 assert.equal(c.A.qs['2026-11'][0].a,'Edited review');
 assert.equal(c.A.planningQs['2026-11'][0].a,'Edited plan');
 assert.equal(c.A.planningQs['2026-12'][0].a,'Edited next plan');
 assert.equal(c.A.ql['2026-11'],1);
 assert.equal(c.reportQuestionsOpen('month'),false);
});
test('editing is closed at Istanbul midnight and does not change submitted answers',()=>{
 const c=submitted();
 c.startSubmittedReportEdit('month','2026-11');
 c.current='2026-12-01';
 assert.equal(c.canEditSubmittedReport('month','2026-11'),false);
 assert.equal(c.saveSubmittedReportEdit(),false);
 assert.equal(c.A.qs['2026-11'][0].a,'Previous review');
 assert.equal(c.A.ql['2026-11'],1);
});
test('a stale editor cannot write into a different account',()=>{
 const c=submitted(),owner=c.A;
 c.startSubmittedReportEdit('month','2026-11');
 c.A={...owner,qs:{'2026-11':[{q:'Review',a:'Second account'}]}};
 assert.equal(c.saveSubmittedReportEdit(),false);
 assert.equal(c.A.qs['2026-11'][0].a,'Second account');
 assert.equal(owner.qs['2026-11'][0].a,'Previous review');
});
test('an empty answer aborts atomically instead of partially saving',()=>{
 const c=submitted();
 c.startSubmittedReportEdit('month','2026-11');
 c.values['report-edit-1-0']=' ';
 assert.equal(c.saveSubmittedReportEdit(),false);
 assert.equal(c.A.qs['2026-11'][0].a,'Previous review');
 assert.equal(c.A.planningQs['2026-11'][0].a,'Previous plan');
});
