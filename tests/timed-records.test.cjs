'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const s=fs.readFileSync('index.html','utf8');
function fixture(){const c={A:{projects:[],future:{},futureMeta:{},journal:{'2026-11-18':{text:'Keep'}}},Date,save(){c.saves++},saves:0,istanbulDayKey:at=>new Date(at.getTime()+10800000).toISOString().slice(0,10)};vm.createContext(c);vm.runInContext(s.slice(s.indexOf('function projectReminderTime('),s.indexOf('function checkAppReminders(')),c);return c}
test('expired project reminder is disabled, while its project and tasks survive',()=>{const c=fixture(),now=Date.parse('2026-11-23T09:00:00+03:00');c.A.projects=[{id:'one',n:'Keep project',d:'2026-11-23',tasks:[{t:'Keep task'}]}];c.expireTimedRecords(now);assert.equal(c.A.projects.length,1);assert.equal(c.A.projects[0].reminderEnabled,false);assert.equal(c.A.projects[0].tasks.length,1);assert.equal(c.expireTimedRecords(now),false)});
test('future note lasts through its target day and expires exactly at Istanbul midnight',()=>{const c=fixture();c.A.future={'2026-11-23':'Expire'};c.A.futureMeta={'2026-11-23':{expireAfterDay:'2026-11-23'}};c.expireTimedRecords(Date.parse('2026-11-23T23:59:59+03:00'));assert.equal(c.A.future['2026-11-23'],'Expire');c.expireTimedRecords(Date.parse('2026-11-24T00:00:00+03:00'));assert.equal(c.A.future['2026-11-23'],undefined);assert.equal(c.A.journal['2026-11-18'].text,'Keep')});
test('ordinary historical calendar notes are preserved and future-intent legacy metadata is recognized',()=>{const c=fixture();c.A.future={'2026-11-18':'Daily note','2026-11-19':'Old future note'};c.A.futureMeta={'2026-11-19':{createdAt:Date.parse('2026-11-17T12:00Z')}};c.expireTimedRecords(Date.parse('2026-11-23T12:00Z'));assert.equal(c.A.future['2026-11-18'],'Daily note');assert.equal(c.A.future['2026-11-19'],undefined)});

test('expired records are archived exactly once, preserving note metadata and project content',()=>{
 const c=fixture(),now=Date.parse('2026-11-24T00:00:00+03:00');
 c.A.future={'2026-11-23':'Archive me'};c.A.futureMeta={'2026-11-23':{expireAfterDay:'2026-11-23',editedAt:42}};
 c.A.projects=[{n:'Project',d:'2026-11-23',tasks:[{t:'Keep'}]}];
 assert.equal(c.expireTimedRecords(now),true);
 assert.equal(c.A.timedNoteArchive[0].text,'Archive me');
 assert.equal(c.A.timedNoteArchive[0].meta.editedAt,42);
 assert.equal(c.A.projects[0].tasks[0].t,'Keep');
 assert.ok(c.A.projects[0].reminderArchive);
 assert.equal(c.expireTimedRecords(now),false);
 assert.equal(c.A.timedNoteArchive.length,1);
 c.validProgressDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d);
 const list=c.A.timedNoteArchive,edit={owner:c.A,kind:'note',item:list[0],list};
 c.A.future['2026-11-25']='Existing';
 assert.equal(c.applyTimedArchive(edit,'New','2026-11-25',true,now),false);
 assert.equal(c.A.future['2026-11-25'],'Existing');
 assert.equal(c.applyTimedArchive(edit,'Restored','2026-11-26',true,now),true);
 assert.equal(c.A.future['2026-11-26'],'Restored');assert.equal(list.length,0);
});
