'use strict';
const assert=require('node:assert/strict');
module.exports=async(browser,engine)=>{
 const page=await browser.newPage({reducedMotion:'reduce'});
 const posts=[];
 await page.addInitScript(()=>localStorage.setItem('iydu.storage-notice.v1','test'));
 await page.route('**/rest/v1/rpc/iydu_username_available',route=>route.fulfill({json:true,headers:{'access-control-allow-origin':'*'}}));
 await page.route('**/auth/v1/signup**',route=>{
  posts.push(route.request().postDataJSON());
  return route.fulfill({status:422,json:{code:'user_already_exists',message:'User already registered'},headers:{'access-control-allow-origin':'*'}});
 });
 try{
  for(const width of [320,768,1440]){
   await page.setViewportSize({width,height:840});await page.goto('http://127.0.0.1:4173/');
   await page.evaluate(()=>{DB.lang='tr';view='forgot';renderAppOrAuth()});
   const bounds=await page.locator('.auth-recovery .box').boundingBox();
   assert.ok(bounds&&bounds.width<=480&&bounds.x>=0&&bounds.x+bounds.width<=width+1);
   assert.ok(Math.abs(bounds.x+bounds.width/2-width/2)<4,engine+' reset form centered at '+width);
  }
  await page.evaluate(()=>goTo('setup','home'));
  await page.locator('#register-submit').click();
  assert.equal(await page.locator('#signup-form [aria-invalid="true"]').count(),6);
  assert.ok(await page.locator('#u').evaluate(el=>document.activeElement===el));
  assert.equal(await page.locator('#b').getAttribute('aria-invalid'),null);
  await page.locator('#u').fill('demo_user');await page.locator('#n').fill('Deniz');
  await page.locator('#e').fill('person@example.invalid');
  await page.locator('#p').fill('Mint-blue-7!');await page.locator('#p2').fill('Mint-blue-7!');
  await page.locator('#register-submit').click();assert.equal(posts.length,0);
  assert.ok(await page.locator('#signup-terms').evaluate(el=>document.activeElement===el));
  await page.locator('#signup-terms').check();
  await page.locator('#register-submit').click();
  await page.locator('#error-e').filter({hasText:'zaten kayıtlı'}).waitFor();
  assert.equal(posts.length,1);assert.equal(posts[0].data.terms_version,'2026-11-23');assert.ok(Date.parse(posts[0].data.terms_acknowledged_at));
  assert.equal(await page.locator('#p').inputValue(),'Mint-blue-7!');
  assert.equal(await page.locator('#login-portal').count(),0);
 }finally{await page.close()}
 console.log('PASS '+engine+': balanced password recovery, inline signup feedback, document acknowledgement and existing-email handling');
};
