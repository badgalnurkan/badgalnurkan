'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(source,'The deployed entrypoint has a JS script');

function extract(from,to){
  const start=source.indexOf(from),end=source.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,'Missing testable report section '+from);
  return source.slice(start,end);
}

// Run the ACTUAL UI date and report functions, not a reimplementation.
const code=`
const pad=n=>String(n).padStart(2,'0');
const D=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
function mon(d){const x=new Date(d+'T00:00');x.setDate(x.getDate()-((x.getDay()+6)%7));return D(x)}
function addD(d,n){const x=new Date(d+'T00:00');x.setDate(x.getDate()+n);return D(x)}
const dd=(a,b)=>Math.round((new Date(b+'T00:00')-new Date(a+'T00:00'))/864e5);
${extract('function reportPeriodEnded(now,end)','function answerArchiveUnlocked')}
${extract('function repCard(title,per,a,b,pa,pb,key,nk,defs)','/* ---- gecmis raporlar')}
${extract('P.rep=()=>{','let pm=')}
this.fixture={reportPeriodEnded,latestUnlockedReportPeriod,reportInitialUnlockDate,
  pendingReportCard,repCard};
`;
const context={
  A:{qs:{},ql:{},pctFrom:'2026-11-09'},tr:()=>false,t:x=>x,fmt:x=>x,
  P:{},reportDetail:'',reportDetailView:()=>'',historySection:()=>'',
  defQ:()=>['Review question'],M:h=>{context.rendered=h},
  st:()=>({t:2,d:1,p:50,by:{}}),qb:()=>'',esc:x=>x,today:()=>context.current,
};
vm.createContext(context);
vm.runInContext(code,context);
const {reportPeriodEnded,latestUnlockedReportPeriod,reportInitialUnlockDate,repCard}=context.fixture;

const same=(period,expected)=>{
  for(const [k,v] of Object.entries(expected))assert.equal(period[k],v,k+' differs');
};

test('weekly is available on Sunday (day seven), not incorrectly kept locked',()=>{
  assert.equal(reportPeriodEnded('2026-11-14','2026-11-15'),false);
  assert.equal(reportPeriodEnded('2026-11-15','2026-11-15'),true);
  same(latestUnlockedReportPeriod('week','2026-11-15'),{
    a:'2026-11-09',b:'2026-11-15',pa:'2026-11-02',pb:'2026-11-08',
    key:'2026-11-09',nk:'2026-11-16'
  });
});

test('next Monday still shows the completed week rather than a newly locked week',()=>{
  same(latestUnlockedReportPeriod('week','2026-11-16'),{
    a:'2026-11-09',b:'2026-11-15',key:'2026-11-09',nk:'2026-11-16'
  });
  same(latestUnlockedReportPeriod('week','2026-11-21'),{
    a:'2026-11-09',b:'2026-11-15'
  });
  same(latestUnlockedReportPeriod('week','2026-11-22'),{
    a:'2026-11-16',b:'2026-11-22',nk:'2026-11-23'
  });
});

test('monthly reports appear on the last day and remain accessible next month',()=>{
  same(latestUnlockedReportPeriod('month','2026-11-29'),{
    a:'2026-10-01',b:'2026-10-31',key:'2026-10',nk:'2026-11'
  });
  same(latestUnlockedReportPeriod('month','2026-11-30'),{
    a:'2026-11-01',b:'2026-11-30',key:'2026-11',nk:'2026-12'
  });
  same(latestUnlockedReportPeriod('month','2026-12-01'),{
    a:'2026-11-01',b:'2026-11-30',key:'2026-11',nk:'2026-12'
  });
});

test('year boundary and leap-year month use correct previous-period keys',()=>{
  same(latestUnlockedReportPeriod('month','2027-01-01'),{
    a:'2026-12-01',b:'2026-12-31',key:'2026-12',nk:'2027-01'
  });
  same(latestUnlockedReportPeriod('month','2028-02-29'),{
    a:'2028-02-01',b:'2028-02-29',key:'2028-02',nk:'2028-03'
  });
  same(latestUnlockedReportPeriod('month','2028-03-01'),{
    a:'2028-02-01',b:'2028-02-29',key:'2028-02',nk:'2028-03'
  });
  same(latestUnlockedReportPeriod('week','2027-01-01'),{
    a:'2026-12-21',b:'2026-12-27',nk:'2026-12-28'
  });
});

test('report cards render an unlocked completed period on both Sunday and Monday',()=>{
  for(const day of ['2026-11-15','2026-11-16']){
    context.current=day;
    const w=latestUnlockedReportPeriod('week',day);
    const rendered=repCard('Weekly report','week',w.a,w.b,w.pa,w.pb,w.key,w.nk,[
      'What worked this week?'
    ]);
    assert.match(rendered,/Weekly report/);
    assert.match(rendered,/2026-11-09 – 2026-11-15/);
    assert.doesNotMatch(rendered,/🔒 Weekly report/);
    assert.ok(context.A.qs['2026-11-09'],'Answers kept in original period');
    assert.ok(context.A.qs['2026-11-16'],'Next-week questions prepared');
  }
});

test('month rollover also renders the last unlocked month, not a lock',()=>{
  for(const day of ['2026-11-30','2026-12-01']){
    context.current=day;
    const m=latestUnlockedReportPeriod('month',day);
    const rendered=repCard('Monthly report','month',m.a,m.b,m.pa,m.pb,m.key,m.nk,[
      'What did you achieve?'
    ]);
    assert.match(rendered,/2026-11-01 – 2026-11-30/);
    assert.doesNotMatch(rendered,/🔒 Monthly report/);
  }
});

test('report page is wired to the latest unlocked week and month, not current week locks',()=>{
  const renderer=extract('P.rep=()=>{','let pm=');
  assert.match(renderer,/latestUnlockedReportPeriod\('week',td\)/);
  assert.match(renderer,/latestUnlockedReportPeriod\('month',td\)/);
  assert.doesNotMatch(renderer,/wb=addD\(wa,6\)/);
});

test('first weekly report requires seven tracked dates, even if a calendar week just ended',()=>{
  assert.equal(reportInitialUnlockDate('week','2026-11-09'),'2026-11-15');
  assert.equal(reportInitialUnlockDate('week','2026-11-10'),'2026-11-16');
  assert.equal(reportInitialUnlockDate('month','2026-11-01'),'2026-11-30');
  assert.equal(reportInitialUnlockDate('month','2026-11-10'),'2026-12-09');
  assert.equal(reportInitialUnlockDate('month','2028-01-31'),'2028-02-28');
});

test('actual report UI unlocks Weekly for an established user on Sunday while Monthly stays locked',()=>{
  context.current='2026-11-15';
  context.A.pctFrom='2026-11-09';
  context.P.rep();
  assert.match(context.rendered,/Weekly report/);
  assert.doesNotMatch(context.rendered,/🔒 Weekly report/);
  assert.match(context.rendered,/2026-11-09 – 2026-11-15/);
  assert.match(context.rendered,/🔒 Monthly report/);
  assert.match(context.rendered,/opensOn 2026-12-08/); // One calendar month from 9 November
});

test('actual report UI keeps completed week available on Monday after rollover',()=>{
  context.current='2026-11-16';
  context.A.pctFrom='2026-11-09';
  context.P.rep();
  assert.doesNotMatch(context.rendered,/🔒 Weekly report/);
  assert.match(context.rendered,/2026-11-09 – 2026-11-15/);
  assert.match(context.rendered,/🔒 Monthly report/);
});

test('new accounts do not see empty reports from before they started tracking',()=>{
  context.current='2026-11-15';
  context.A.pctFrom='2026-11-15';
  context.P.rep();
  assert.match(context.rendered,/🔒 Weekly report/);
  assert.match(context.rendered,/🔒 Monthly report/);
});

test('actual report UI shows an unlocked month after tracking a full calendar month',()=>{
  context.current='2026-11-30';
  context.A.pctFrom='2026-11-01';
  context.P.rep();
  assert.doesNotMatch(context.rendered,/🔒 Monthly report/);
  assert.match(context.rendered,/2026-11-01 – 2026-11-30/);
  context.current='2026-12-01';
  context.P.rep();
  assert.doesNotMatch(context.rendered,/🔒 Monthly report/);
  assert.match(context.rendered,/2026-11-01 – 2026-11-30/);
});
