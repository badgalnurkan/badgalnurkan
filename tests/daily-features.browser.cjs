'use strict';
const assert=require('node:assert/strict');
module.exports=async function verifyDailyFeatures(browser,engine){
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:4173/review-app.html?lang=tr');
  await page.locator('#daily-fact a').first().waitFor();
  assert.ok((await page.locator('#daily-fact a').first().getAttribute('href')).startsWith('https://'));
  await page.evaluate(()=>goTo('app','todo'));const field=page.locator('#nt');await field.fill('Kendi taslağım');
  await page.locator('[onclick="IYDayTools.showSuggestion()"]').click();
  const suggested=await page.locator('#task-suggestion span').innerText();assert.ok(suggested.length>5);
  await page.locator('[onclick="IYDayTools.addSuggestion()"]').click();assert.equal(await field.inputValue(),'Kendi taslağım');
  assert.ok(await page.evaluate(text=>A.tasks.some(task=>task.t===text),suggested));
  await page.evaluate(()=>{
   A.future={'2000-06-14':'Arşiv örneği'};A.futureMeta={'2000-06-14':{expireAfterDay:'2000-06-14'}};
   A.projects=[{id:'keep',n:'Korunan proje',d:'2000-06-14',tasks:[{t:'Projede kalan görev'}]}];
   expireTimedRecords();goTo('app','home');
  });
  await page.locator('[onclick="IYDayTools.openArchive()"]').first().click();
  const archive=page.locator('#timed-archive');
  await archive.locator('[data-key^="note:"]').click();await archive.locator('#archive-text').fill('Düzeltilmiş not');
  await archive.locator('[data-action="save"]').click();await archive.getByText('Düzeltilmiş not',{exact:true}).waitFor();
  await archive.locator('[data-key^="note:"]').click();
  const day=await page.evaluate(()=>addD(istanbulDayKey(),3));await archive.locator('#archive-when').fill(day);
  await archive.locator('[data-action="restore"]').click();assert.equal(await page.evaluate(d=>A.future[d],day),'Düzeltilmiş not');
  await archive.locator('[data-key^="reminder:"]').click();page.once('dialog',dialog=>dialog.accept());
  await archive.locator('[data-action="delete"]').click();await archive.getByText('Arşiv boş.').waitFor();
  assert.deepEqual(await page.evaluate(()=>[A.projects[0].n,A.projects[0].tasks[0].t]),['Korunan proje','Projede kalan görev']);
  await page.evaluate(()=>{document.getElementById('timed-archive')?.remove();goTo('app','pomo')});
  await page.getByRole('heading',{name:'Kişisel odak istatistikleri'}).waitFor();
  assert.deepEqual(errors,[]);
 }finally{await page.close()}
 console.log('PASS '+engine+': daily discovery, suggested and manual task, focus statistics, archive editing/restoring/deleting');
};
