'use strict';
const assert=require('node:assert/strict');

module.exports=async function verifyGrowingText(browser,engine){
  const page=await browser.newPage({reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // Every account interaction in this scenario is confined to the isolated preview.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173(?:\/|$))/,route=>route.abort());
  const fits=async field=>assert.ok(await field.evaluate(el=>
    el.clientHeight>=el.scrollHeight-1&&el.clientWidth>=el.scrollWidth-1),engine+' text should fit '+await field.getAttribute('id'));
  const write=async(field,value)=>{
    await field.fill('');
    const initial=await field.evaluate(el=>el.clientHeight);
    await field.fill(value);
    await fits(field);
    assert.ok(await field.evaluate(el=>el.clientHeight)>initial,engine+' field should grow '+await field.getAttribute('id'));
    assert.equal(await field.inputValue(),value);
  };
  const long=Array.from({length:24},(_,i)=>'Satır '+(i+1)+' · çalışmaya devam').join('\n');
  const task='Görev satırı\n'.repeat(7)+'bitti';
  const note='Geleceğe bir satır\n'.repeat(18)+'son';
  try{
    for(const width of [320,768,1440]){
      console.log(engine+' writing fields at '+width+' px');
      await page.setViewportSize({width,height:800});
      await page.goto('http://127.0.0.1:4173/review-app.html?page=home&lang=tr');
      if(width===320){
        await page.locator('#storage-notice button').click();
        await page.locator('#storage-notice').waitFor({state:'detached'});
      }
      const journal=page.locator('#journal-input');
      await write(journal,long);
      assert.ok(await journal.evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight+2),'last journal line stays visible');
      await journal.evaluate(el=>el.setSelectionRange(5,5));await page.keyboard.insertText('Z');
      assert.equal(await journal.evaluate(el=>el.selectionStart),6,'editing in the middle keeps the caret');
      await journal.fill('Kısa');
      assert.ok(await journal.evaluate(el=>el.clientHeight<180),'field shrinks after text is removed');
      await write(page.locator('#pn'),'Bir\niki\nüç\ndört');
      await page.evaluate(value=>{A.journal[today()]={text:value};openJournalEntry(today(),true)},long);
      await fits(page.locator('#journal-edit'));
      assert.equal(await page.locator('#journal-edit').inputValue(),long);
      await page.evaluate(()=>closeModal('journal-modal'));await page.locator('#journal-modal').waitFor({state:'detached'});
      await page.evaluate(()=>goTo('app','todo'));
      const field=page.locator('#nt');await write(field,task);
      await field.press('Enter');
      const stored=page.locator('#tl .task').last();
      assert.equal(await stored.locator('.task-label').textContent(),task);
      const edit=stored.getByRole('button',{name:'Düzenle'});
      await edit.evaluate(button=>button.scrollIntoView({block:'center',behavior:'instant'}));
      await edit.click();
      await fits(page.locator('#task-edit-text'));
      assert.equal(await page.locator('#task-edit-text').inputValue(),task);
      await page.locator('#task-edit-text').press('Escape');
      await page.locator('#task-edit-modal').waitFor({state:'detached'});
      await page.evaluate(value=>{A.completedBatches[A.day]=[{t:'Bitti',s:'done'}];A.tasks=[];A.backlog=[value];P.todo()},task);
      await write(page.locator('#plan-input'),task);
      await page.locator('#plan-input').press('Enter');
      assert.equal(await page.locator('#tomorrow-plans .task span').last().textContent(),task);
      assert.deepEqual(await page.evaluate(()=>A.backlog),[task]);
      await page.evaluate(()=>goTo('app','pc'));
      await write(page.locator('#fn-text'),note);
      await page.locator('#fnd').fill(await page.evaluate(()=>addD(today(),3)));
      await page.locator('.future-note-compose button').click();
      await fits(page.locator('#dn'));assert.equal(await page.locator('#dn').inputValue(),note);
      await page.evaluate(()=>closeModal('day-modal'));await page.locator('#day-modal').waitFor({state:'detached'});
      await page.evaluate(()=>openProfile());await write(page.locator('#prof-b'),'Benim\nhakkımda\nuzun\nbir\naçıklama');
      await page.evaluate(()=>closeModal('profile-modal'));await page.locator('#profile-modal').waitFor({state:'detached'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),engine+' no horizontal overflow at '+width);
    }
    assert.deepEqual(errors,[]);
  }catch(error){
    console.error(engine+' writing scenario',await page.evaluate(()=>({
      width:innerWidth,page:pg,focused:document.activeElement?.outerHTML?.slice(0,140),
      dialogs:[...document.querySelectorAll('[role="dialog"]')].map(el=>el.id)
    })),errors);
    throw error;
  }finally{await page.close()}
  console.log('PASS '+engine+': existing and new multi-line entries fit at 320, 768 and 1440 px; text, caret and task ordering retained');
};
