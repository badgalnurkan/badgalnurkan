// Read-only local review: no real credentials, emails, or production writes.
const { chromium, webkit }=require('playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict');
(async()=>{
 const server=spawn('python',['-m','http.server','4173','--directory','dist'],{stdio:'ignore'});
 try{
  for(let n=0;n<50;n++){try{if((await fetch('http://127.0.0.1:4173')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
   const browser=await type.launch();
   for(const width of [320,375,390,430,768,1440]){
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:2});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/review-app.html?lang=tr&theme=black');await page.waitForSelector('#pd');
    const box=await page.locator('#pd').boundingBox(),parent=await page.locator('.project-date-field').boundingBox();
    assert.ok(box.x>=parent.x-1&&box.x+box.width<=parent.x+parent.width+1,engine+' date overflow at '+width);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),engine+' document overflow '+width);
    await page.locator('#pd').fill('2027-04-30');assert.equal(await page.locator('#pd').inputValue(),'2027-04-30');
    assert.deepEqual(errors,[],engine+' JS errors');
    await page.close();
   }
   const welcome=await browser.newPage({viewport:{width:390,height:844}});
   await welcome.goto('http://127.0.0.1:4173/');await welcome.waitForSelector('#welcome-continue');
   await welcome.locator('#welcome-continue').click();await welcome.waitForSelector('#u');
   assert.equal(await welcome.locator('#login-portal').count(),0,'Continue opens manual sign-in directly');
   await welcome.close();await browser.close();console.log('PASS '+engine+': date form at six widths and manual welcome entry');
  }
 }finally{server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
