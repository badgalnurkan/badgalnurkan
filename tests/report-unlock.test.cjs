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
${extract('function qa(k,i,el)','/* Weekly/monthly reports')} 
${extract('function newAcc(u,n,b,pw,em,ph)','const findUser=')}
${extract('P.rep=()=>{','let pm=')}
this.fixture={reportPeriodEnded,latestUnlockedReportPeriod,reportInitialUnlockDate,
  pendingReportCard,repCard,newAcc,norm,qa,addRandQ,lockQ};
`;
const context={
  A:{qs:{},ql:{},pctFrom:'2026-11-09',reportStart:'2026-11-09'},
  tr:()=>false,t:x=>({weeklyReport:'Weekly report',monthlyReport:'Monthly report'})[x]||x,fmt:x=>x,
  P:{},reportDetail:'',reportDetailView:()=>'',historySection:()=>'',
  defQ:kind=>kind==='week'?['Weekly 1','Weekly 2','Weekly 3']:['Monthly 1','Monthly 2','Monthly 3'],
  rqFor:()=>['A random follow-up question'],save:()=>{context.saves=(context.saves||0)+1},
  sysTheme:()=> 'light',M:h=>{context.rendered=h},
  st:()=>({t:2,d:1,p:50,by:{}}),qb:()=>'',esc:x=>x,today:()=>context.current,
};
vm.createContext(context);
vm.runInContext(code,context);
const {reportPeriodEnded,latestUnlockedReportPeriod,reportInitialUnlockDate,
  repCard,newAcc,norm,qa,addRandQ,lockQ}=context.fixture;

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

test('first report requires a complete calendar week/month after signup',()=>{
  assert.equal(reportInitialUnlockDate('week','2026-11-09',true),'2026-11-15');
  assert.equal(reportInitialUnlockDate('week','2026-11-08',true),'2026-11-15'); // Sunday signup -> next full week
  assert.equal(reportInitialUnlockDate('week','2026-11-10',true),'2026-11-22'); // Tuesday signup -> next full week
  assert.equal(reportInitialUnlockDate('week','2026-11-15',true),'2026-11-22');
  assert.equal(reportInitialUnlockDate('week','2026-11-16',true),'2026-11-22');
  assert.equal(reportInitialUnlockDate('month','2026-11-01',true),'2026-11-30');
  assert.equal(reportInitialUnlockDate('month','2026-11-10',true),'2026-12-31');
  assert.equal(reportInitialUnlockDate('month','2026-11-30',true),'2026-12-31');
  assert.equal(reportInitialUnlockDate('month','2028-01-31',true),'2028-02-29');
  assert.equal(reportInitialUnlockDate('month','2027-01-31',true),'2027-02-28');
});

test('actual report UI unlocks Weekly for an established user on Sunday while Monthly stays locked',()=>{
  context.current='2026-11-15';
  context.A.pctFrom='2026-11-09';
  context.A.reportStart='2026-11-09';
  context.P.rep();
  assert.match(context.rendered,/Weekly report/);
  assert.doesNotMatch(context.rendered,/🔒 Weekly report/);
  assert.match(context.rendered,/2026-11-09 – 2026-11-15/);
  assert.match(context.rendered,/🔒 Monthly report/);
  assert.match(context.rendered,/opensOn 2026-11-30/); // Existing accounts must keep November
});

test('actual report UI keeps completed week available on Monday after rollover',()=>{
  context.current='2026-11-16';
  context.A.pctFrom='2026-11-09';
  context.A.reportStart='2026-11-09';
  context.P.rep();
  assert.doesNotMatch(context.rendered,/🔒 Weekly report/);
  assert.match(context.rendered,/2026-11-09 – 2026-11-15/);
  assert.match(context.rendered,/🔒 Monthly report/);
});

test('new accounts do not see empty reports from before they started tracking',()=>{
  context.current='2026-11-15';
  context.A.pctFrom='2026-11-15';
  context.A.reportStart='2026-11-15';
  context.P.rep();
  assert.match(context.rendered,/🔒 Weekly report/);
  assert.match(context.rendered,/🔒 Monthly report/);
});

test('actual report UI shows an unlocked month after tracking a full calendar month',()=>{
  context.current='2026-11-30';
  context.A.pctFrom='2026-11-01';
  context.A.reportStart='2026-11-01';
  context.P.rep();
  assert.doesNotMatch(context.rendered,/🔒 Monthly report/);
  assert.match(context.rendered,/2026-11-01 – 2026-11-30/);
  context.current='2026-12-01';
  context.P.rep();
  assert.doesNotMatch(context.rendered,/🔒 Monthly report/);
  assert.match(context.rendered,/2026-11-01 – 2026-11-30/);
});


test('new accounts keep a stable reporting start, legacy history is preserved',()=>{
  context.current='2026-11-15';
  const account=newAcc('example','Name','','','', '');
  assert.equal(account.reportStart,'2026-11-15');
  assert.equal(account.reportCalendarRule,'full-period-v1');
  const old=norm({pctFrom:'2026-11-08',qs:{'2026-11-09':[{q:'Keep me',a:'answer'}]},ql:{'2026-11-09':1}});
  assert.equal(old.reportStart,'2026-11-08');
  assert.equal(old.reportCalendarRule,undefined);
  assert.equal(old.qs['2026-11-09'][0].a,'answer');
  assert.equal(old.ql['2026-11-09'],1);
  old.pctFrom='2026-11-15'; // percentage origin changing must not move report start
  norm(old);
  assert.equal(old.reportStart,'2026-11-08');
});

test('signing up late in the week skips the incomplete week',()=>{
  context.A={pctFrom:'2026-11-15',reportStart:'2026-11-15',reportCalendarRule:'full-period-v1',qs:{},ql:{}};
  context.current='2026-11-15';
  context.P.rep();
  assert.match(context.rendered,/🔒 Weekly report/);
  assert.match(context.rendered,/opensOn 2026-11-22/);
  context.current='2026-11-22';
  context.P.rep();
  assert.doesNotMatch(context.rendered,/🔒 Weekly report/);
  assert.match(context.rendered,/2026-11-16 – 2026-11-22/);
});

test('joining on the last day of the month starts with the next full month',()=>{
  context.A={pctFrom:'2026-11-30',reportStart:'2026-11-30',reportCalendarRule:'full-period-v1',qs:{},ql:{}};
  context.current='2026-11-30';
  context.P.rep();
  assert.match(context.rendered,/🔒 Monthly report/);
  assert.match(context.rendered,/opensOn 2026-12-31/);
  context.current='2026-12-31';
  context.P.rep();
  assert.doesNotMatch(context.rendered,/🔒 Monthly report/);
  assert.match(context.rendered,/2026-12-01 – 2026-12-31/);
});

test('both reports retain three defaults, random question addition and two-step answer locking',()=>{
  context.A={pctFrom:'2026-11-01',reportStart:'2026-11-01',qs:{},ql:{}};
  context.current='2026-11-30';
  context.P.rep();
  assert.deepEqual(Array.from(context.A.qs['2026-11-30'].map(x=>x.q)),
    ['Weekly 1','Weekly 2','Weekly 3']);
  assert.deepEqual(Array.from(context.A.qs['2026-11'].map(x=>x.q)),
    ['Monthly 1','Monthly 2','Monthly 3']);
  assert.equal(context.A.qs['2026-12'].length,3); // Monthly keys are YYYY-MM
  const nextWeek=latestUnlockedReportPeriod('week',context.current).nk;
  const nextMonth=latestUnlockedReportPeriod('month',context.current).nk;
  assert.equal(context.A.qs[nextWeek].length,3);
  assert.equal(context.A.qs[nextMonth].length,3);
  addRandQ(nextWeek);
  addRandQ(nextMonth);
  assert.equal(context.A.qs[nextWeek].length,4);
  assert.equal(context.A.qs[nextMonth].length,4);
  assert.equal(context.A.qs[nextWeek][3].q,'A random follow-up question');
  assert.equal(context.A.qs[nextMonth][3].q,'A random follow-up question');
  const input={value:'A durable answer',parentElement:{nextElementSibling:{textContent:''}}};
  qa(nextMonth,0,input);
  assert.equal(context.A.qs[nextMonth][0].a,'A durable answer');
  const button={dataset:{},textContent:''};
  lockQ('2026-11',button);
  assert.equal(context.A.ql['2026-11'],undefined,'First tap must ask for confirmation');
  lockQ('2026-11',button);
  assert.equal(context.A.ql['2026-11'],1);
  assert.equal(context.A.qs[nextMonth][0].a,'A durable answer',
    'Locking an old month must not erase next-month draft answers');
});


test('regression: 15 November legacy account restores Weekly immediately and Monthly on 30 Nov',()=>{
  // This mimics the user screenshot after the mistaken rollout: reportStart was
  // previously backfilled from pctFrom, but there is no explicit new-rule marker.
  context.A={
    pctFrom:'2026-11-08',reportStart:'2026-11-08',qs:{},ql:{},
  };
  context.current='2026-11-15';
  context.P.rep();
  assert.match(context.rendered,/Weekly report/);
  assert.doesNotMatch(context.rendered,/🔒 Weekly report/);
  assert.match(context.rendered,/2026-11-09 – 2026-11-15/);
  assert.match(context.rendered,/🔒 Monthly report/);
  assert.match(context.rendered,/opensOn 2026-11-30/);
  assert.doesNotMatch(context.rendered,/opensOn 2026-12-31/);
  assert.equal(context.A.qs['2026-11-09'].length,3);
  context.current='2026-11-16';
  context.P.rep();
  assert.doesNotMatch(context.rendered,/🔒 Weekly report/);
  assert.match(context.rendered,/2026-11-09 – 2026-11-15/);
  context.current='2026-11-30';
  context.P.rep();
  assert.doesNotMatch(context.rendered,/🔒 Monthly report/);
  assert.match(context.rendered,/2026-11-01 – 2026-11-30/);
});

test('legacy and new calendar policies diverge only where a signup marker authorizes it',()=>{
  assert.equal(reportInitialUnlockDate('week','2026-11-08'),'2026-11-15');
  assert.equal(reportInitialUnlockDate('month','2026-11-08'),'2026-11-30');
  assert.equal(reportInitialUnlockDate('week','2026-11-10'),'2026-11-15');
  assert.equal(reportInitialUnlockDate('month','2026-11-10'),'2026-11-30');
  assert.equal(reportInitialUnlockDate('week','2026-11-10',true),'2026-11-22');
  assert.equal(reportInitialUnlockDate('month','2026-11-10',true),'2026-12-31');
});

test('legacy question drafts and answer locks remain intact through the unlock fix',()=>{
  const existing={pctFrom:'2026-11-08',reportStart:'2026-11-08',
    qs:{'2026-11-09':[{q:'Written before release',a:'Do not erase'}]},
    ql:{'2026-11-09':1}};
  context.A=norm(existing);
  context.current='2026-11-15';
  context.P.rep();
  assert.equal(context.A.qs['2026-11-09'][0].a,'Do not erase');
  assert.equal(context.A.ql['2026-11-09'],1);
});
