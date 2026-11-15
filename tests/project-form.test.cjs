'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function extract(from,to){const a=source.indexOf(from),b=source.indexOf(to,a+from.length);assert.ok(a>=0&&b>a,from);return source.slice(a,b)}
function fixture(name='Yeni proje',date='2026-11-16',turkish=true){
 const field=value=>({value,attributes:{},focus(){this.focused=true},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]}});
 const controls={'#pn':field(name),'#pd':field(date),'#project-add-error':{textContent:''}};
 const existing={id:'existing',n:'Existing project',d:'2026-11-20'};
 const context={A:{projects:[existing]},$:selector=>controls[selector],tr:()=>turkish,today:()=> '2026-11-15',
  projectId:p=>{p.id='new-project'},recordActivity:()=>{context.saved=(context.saved||0)+1},checkAppReminders:()=>{context.reminders=(context.reminders||0)+1},
  P:{home:()=>{context.rendered=(context.rendered||0)+1;controls['#pn']=field('');controls['#pd']=field('')}},
 };
 vm.createContext(context);
 vm.runInContext(extract('function validProgressDate(','function progressDayDistance(')+extract('function addProj(){','/* eski/bozuk kayitlar')+'\nthis.add=addProj;',context);
 return {context,controls,existing};
}
test('a valid project keeps existing data, schedules 09:00 Türkiye time and focuses the new field',()=>{
 const {context,controls,existing}=fixture('  Küçük & iyi bir adım  ');const oldField=controls['#pn'];context.add();
 assert.equal(context.A.projects.length,2);assert.equal(context.A.projects[0],existing);
 assert.equal(context.A.projects[1].n,'Küçük & iyi bir adım');assert.equal(context.A.projects[1].d,'2026-11-16');
 assert.equal(context.A.projects[1].reminderAt,'2026-11-16T06:00:00.000Z');assert.equal(context.A.projects[1].reminderEnabled,true);
 assert.equal(context.saved,1);assert.equal(context.reminders,1);assert.equal(context.rendered,1);
 assert.notEqual(controls['#pn'],oldField);assert.equal(controls['#pn'].focused,true);
});
test('an empty name explains the error, focuses it and cannot create or save a project',()=>{
 const {context,controls}=fixture('  ');context.add();
 assert.equal(context.A.projects.length,1);assert.equal(context.saved,undefined);assert.equal(context.rendered,undefined);
 assert.equal(controls['#project-add-error'].textContent,'Proje adını yaz.');assert.equal(controls['#pn'].attributes['aria-invalid'],'true');assert.equal(controls['#pn'].focused,true);
});
test('missing, impossible and past dates do not save or trigger a reminder',()=>{
 for(const date of ['','not-a-date','2026-02-31','2027-02-29','2026-11-14']){
  const {context,controls}=fixture('Valid name',date);context.add();
  assert.equal(context.A.projects.length,1,date);assert.equal(context.saved,undefined);assert.equal(context.reminders,undefined);
  assert.equal(controls['#pd'].attributes['aria-invalid'],'true');assert.equal(controls['#pd'].focused,true);assert.match(controls['#project-add-error'].textContent,/geçerli/);
 }
});
test('today and valid leap-day dates remain accepted',()=>{
 for(const date of ['2026-11-15','2028-02-29']){const {context}=fixture('Project',date);context.add();assert.equal(context.A.projects.length,2);assert.equal(context.A.projects[1].d,date)}
});
test('English validation clears when corrected and only one project is added',()=>{
 const {context,controls}=fixture('','2026-11-16',false);context.add();assert.equal(controls['#project-add-error'].textContent,'Enter a project name.');
 controls['#pn'].value='Corrected';context.add();assert.equal(controls['#project-add-error'].textContent,'');assert.equal(context.A.projects.length,2);assert.equal(context.saved,1);
 const invalid=fixture('Project','',false);invalid.context.add();assert.match(invalid.controls['#project-add-error'].textContent,/today or later/);
});
test('a signed-out account cannot create a project',()=>{
 const {context}=fixture();context.A=null;assert.doesNotThrow(()=>context.add());assert.equal(context.saved,undefined);
});
