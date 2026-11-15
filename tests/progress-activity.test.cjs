'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const extract=(from,to)=>{const a=source.indexOf(from),b=source.indexOf(to,a+from.length);assert.ok(a>=0&&b>a,from);return source.slice(a,b)};
function fixture(account={}){const context={A:account,day:'2026-11-15',today:()=>context.day,save(){}};vm.createContext(context);vm.runInContext(extract('const PROGRESS_CUTOVER=','function stopwatchFormat(ms){')+extract('function recordActivity(){','const pct=')+'\nthis.f={progressPercent,hasProgressActivity,ensureProgressState,accountProgressPercent,recordActivity};',context);return {context,f:context.f}}
test('a legacy account without user data stays at 1% on every date',()=>{const a={pctFrom:'2026-10-01',activeDays:{}};const {f}=fixture(a);for(const day of ['2026-11-15','2026-11-16','2026-12-31'])assert.equal(f.accountProgressPercent(a,day),1)});
test('identity, themes, notifications and generated unanswered questions do not earn progress',()=>{const a={pctFrom:'2026-10-01',email:'sample@example.invalid',nick:'Sample',theme:'black',notifications:[{type:'release'}],noticeDelivered:{x:1},qs:{week:[{q:'Generated',a:'  '}]}};const {f}=fixture(a);assert.equal(f.hasProgressActivity(a,'2026-11-15'),false);assert.equal(f.accountProgressPercent(a,'2026-11-15'),1)});
test('first activity does not retroactively award old idle calendar days',()=>{const a={pctFrom:'2026-10-01',activeDays:{}};const {f}=fixture(a);f.ensureProgressState(a,'2026-11-15');a.tasks=[{t:'Read'}];f.recordActivity();assert.equal(f.accountProgressPercent(a,'2026-11-15'),2)});
test('multiple activities in one day earn only one increase',()=>{const a={pctFrom:'2026-11-15',activeDays:{}};const {f}=fixture(a);f.ensureProgressState(a,'2026-11-15');for(let i=0;i<12;i++)f.recordActivity();assert.equal(f.accountProgressPercent(a,'2026-11-15'),2)});
test('daily growth continues after the first interaction even without activity on later days',()=>{const a={pctFrom:'2026-11-15',activeDays:{}};const {context,f}=fixture(a);f.ensureProgressState(a,'2026-11-15');f.recordActivity();context.day='2026-11-16';assert.equal(f.accountProgressPercent(a,context.day),3);context.day='2026-11-17';assert.equal(f.accountProgressPercent(a,context.day),4);f.recordActivity();assert.equal(f.accountProgressPercent(a,context.day),4)});
test('genuine legacy progress is snapshotted and preserved without rewriting history',()=>{const a={pctFrom:'2026-11-01',hist:{'2026-11-01':[{t:'Existing task',done:true}]},activeDays:{'2026-11-14':true}};const {context,f}=fixture(a),before=JSON.stringify(a.hist),earned=f.progressPercent(a.activeDays,a.pctFrom,'2026-11-15');assert.equal(f.accountProgressPercent(a,'2026-11-15'),earned);context.day='2026-11-16';f.recordActivity();assert.equal(f.accountProgressPercent(a,context.day),earned+1);assert.equal(JSON.stringify(a.hist),before)});
test('tasks, plans, projects, notes, journal answers and focus data count as real usage',()=>{const variants=[{tasks:[{t:'Task'}]},{plans:{'2026-11-16':['Plan']}},{projects:[{n:'Project'}]},{future:{'2026-12-01':'Note'}},{journal:{'2026-11-15':{text:'Journal'}}},{qs:{month:[{a:'Answer'}]}},{planningQs:{week:[{a:'Future answer'}]}},{pomo:{n:1}},{stopwatch:{elapsed:4000}}];const {f}=fixture();for(const a of variants)assert.equal(f.hasProgressActivity(a,'2026-11-15'),true,JSON.stringify(a))});
test('future and malformed activity dates never earn points',()=>{const a={pctFrom:'2026-11-15',activeDays:{'2026-11-19':true,'bad':true,'2026-02-30':true}};const {f}=fixture(a);assert.equal(f.accountProgressPercent(a,'2026-11-15'),1)});

test('a paused partial focus session counts, while an untouched saved timer does not',()=>{const {f}=fixture();assert.equal(f.hasProgressActivity({pomo:{w:25,ph:'w',left:1200,run:false,n:0}},'2026-11-15'),true);assert.equal(f.hasProgressActivity({pomo:{w:25,ph:'w',left:1500,run:false,n:0}},'2026-11-15'),false)});

test('existing v2 accounts keep their earned base and gain every calendar day',()=>{
 const a={pctFrom:'2026-10-01',activeDays:{'2026-11-14':true},hist:{'2026-11-14':[{t:'Read',done:true}]},progressState:{version:2,base:20,through:'2026-11-15'}};
 const {f}=fixture(a),history=JSON.stringify(a.hist);assert.equal(f.accountProgressPercent(a,'2026-11-15'),20);assert.equal(f.accountProgressPercent(a,'2026-11-16'),21);assert.equal(f.accountProgressPercent(a,'2026-11-30'),35);assert.equal(JSON.stringify(a.hist),history);assert.equal(a.progressState.version,3);
});
test('a synthetic old counter is not evidence of interaction for a never-used account',()=>{
 const a={pctFrom:'2026-10-01',activeDays:{},theme:'black',progressState:{version:2,base:45,through:'2026-11-15'}};const {f}=fixture(a);
 for(const date of ['2026-11-16','2026-12-01','2027-01-01'])assert.equal(f.accountProgressPercent(a,date),1);assert.equal(a.progressState.startedOn,'');
});
test('a long idle signup period is excluded when the first interaction happens much later',()=>{
 const a={pctFrom:'2026-10-01',activeDays:{},progressState:{version:2,base:1,through:'2026-10-01'}};const {context,f}=fixture(a);
 assert.equal(f.accountProgressPercent(a,'2026-11-15'),1);context.day='2026-11-16';a.tasks=[{t:'First real task',s:''}];f.recordActivity();assert.equal(f.accountProgressPercent(a,context.day),2);assert.equal(f.accountProgressPercent(a,'2026-11-17'),3);assert.equal(f.accountProgressPercent(a,'2026-11-30'),16);
});
test('v2 first-interaction history excludes idle days before that interaction',()=>{
 const a={pctFrom:'2026-11-15',activeDays:{'2026-11-17':true},progressState:{version:2,base:1,through:'2026-11-14'}};const {f}=fixture(a);
 assert.equal(f.accountProgressPercent(a,'2026-11-20'),5);assert.equal(a.progressState.startedOn,'2026-11-17');assert.equal(a.progressState.through,'2026-11-16');
});
test('clearing normal usage data does not erase the fact that the account has interacted',()=>{
 const a={activeDays:{}};const {f}=fixture(a);f.ensureProgressState(a,'2026-11-15');f.recordActivity();a.activeDays={};a.tasks=[];
 assert.equal(f.accountProgressPercent(a,'2026-11-16'),3);assert.equal(f.accountProgressPercent(a,'2026-11-18'),5);
});
test('a fresh reset state stays at 1% again until another real interaction',()=>{
 const a={pctFrom:'2026-11-16',tasks:[],hist:{},activeDays:{}};const {f}=fixture(a);assert.equal(f.accountProgressPercent(a,'2026-11-16'),1);assert.equal(f.accountProgressPercent(a,'2026-12-01'),1);
});
test('repeated reads and saves on the same day never multiply daily growth',()=>{
 const a={activeDays:{'2026-11-15':true},progressState:{version:2,base:20,through:'2026-11-15'}};const {context,f}=fixture(a);context.day='2026-11-16';
 for(let i=0;i<10;i++){assert.equal(f.accountProgressPercent(a,context.day),21);f.recordActivity();assert.equal(f.accountProgressPercent(a,context.day),21)}assert.equal(f.accountProgressPercent(a,'2026-11-17'),22);
});
test('calendar growth crosses month ends, leap days and year ends without skipped or duplicate days',()=>{
 const {f}=fixture();for(const [from,to] of [['2026-11-30','2026-12-01'],['2026-12-31','2027-01-01'],['2028-02-28','2028-02-29'],['2028-02-29','2028-03-01']]){const a={activeDays:{[from]:true},progressState:{version:2,base:20,through:from}};assert.equal(f.accountProgressPercent(a,to),21)}
});
