import {chromium,firefox,webkit} from '@playwright/test'
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322'
const out=new URL('../artifacts/chip-journey/',import.meta.url);await mkdir(out,{recursive:true})
const checks=[];const gpu=process.argv.includes('--gpu')
for(const [engine,type] of Object.entries({chromium,firefox,webkit})){
 const browser=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{})
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin+'/silicon/',{waitUntil:'domcontentloaded'})
  const shelf=page.locator('#research-shelf');await shelf.scrollIntoViewIfNeeded()
  await page.locator('.shelf-controls:not([hidden])').waitFor()
  assert(await page.locator('[data-shelf-step="-1"]').isDisabled())
  await page.locator('[data-shelf-step="1"]').click()
  await page.waitForFunction(()=>document.querySelector('#research-shelf').scrollLeft>100)
  await shelf.focus();await page.keyboard.press('End')
  await page.waitForFunction(()=>document.querySelector('[data-shelf-step="1"]').disabled)
  await page.keyboard.press('Home');await page.waitForFunction(()=>document.querySelector('#research-shelf').scrollLeft<2)
  assert.equal(await shelf.locator('a').count(),7)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.equal(await page.locator('.digital-cut').evaluate(e=>getComputedStyle(e).display),'none')
  await page.screenshot({path:new URL(`${engine}-shelf.png`,out).pathname})
  await shelf.locator('a[href="/posts/abl-android-handoff/"]').focus();await page.keyboard.press('Enter')
  await page.waitForURL('**/posts/abl-android-handoff/')
  assert.equal(await page.locator('.digital-cut, .structure-hotspots, canvas').count(),0)
  assert.deepEqual(errors,[]);checks.push(`${engine}: native shelf, boundaries, keyboard, article route, reduced motion`)
  const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}})
  await nojs.goto(origin+'/silicon/');await nojs.locator('#research-shelf').scrollIntoViewIfNeeded()
  assert.equal(await nojs.locator('#research-shelf a').count(),7)
  assert.equal(await nojs.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await nojs.screenshot({path:new URL(`${engine}-mobile-static.png`,out).pathname});await nojs.close()
  if(gpu && engine==='chromium'){
   await page.emulateMedia({reducedMotion:'no-preference'})
   await page.goto(origin+'/silicon/');await page.waitForFunction(()=>window.chipPreview?.getState().ready,{},{timeout:60000})
   const frame=await page.evaluate(()=>({canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),stage:document.querySelector('.stage').getBoundingClientRect().toJSON(),headline:document.querySelector('h1').getBoundingClientRect().toJSON()}));
   assert(Math.abs(frame.canvas.height-frame.stage.height)<2 && Math.abs(frame.canvas.width-frame.stage.width)<2,'Canvas fills the product stage');
   assert(frame.headline.height<90,'Editorial headline stays secondary');
   assert.equal(await page.locator('.phase').evaluate(el=>getComputedStyle(el).visibility),'hidden','First shot has one headline, not overlapping phase copy');
   await page.screenshot({path:new URL('desktop-overview.png',out).pathname});
   const scrollRange=await page.locator('.journey').evaluate(el=>el.getBoundingClientRect().height-innerHeight);
   const nativeScroll=[];
   await page.mouse.move(30,300);
   for(const p of [.2,.25,.3,.35]){
    const current=await page.evaluate(()=>scrollY);
    await page.mouse.wheel(0,scrollRange*p-current);
    await page.waitForFunction(p=>Math.abs(window.chipPreview.getState().progress-p)<.01,p);
    nativeScroll.push(await page.evaluate(()=>({y:scrollY,progress:window.chipPreview.getState().progress,spread:window.chipPreview.getState().spread})));
   }
   assert(nativeScroll[3].spread-nativeScroll[2].spread>nativeScroll[1].spread-nativeScroll[0].spread,'Native wheel scroll accelerates disassembly');
   await writeFile(new URL('native-scroll.json',out),JSON.stringify(nativeScroll,null,2));
   const acceleration=[];for(const p of [.2,.25,.3,.35])acceleration.push(await page.evaluate(p=>{window.chipPreview.setProgress(p);return window.chipPreview.getState().spread},p));
   assert(acceleration[3]-acceleration[2]>acceleration[1]-acceleration[0],'Equal scroll distance produces faster later disassembly');
   await page.evaluate(()=>window.chipPreview.seek(.36));
   await page.locator('[data-structure="3"]').focus();await page.keyboard.press('Enter')
   await page.waitForFunction(()=>window.chipPreview.getState().selected===3)
   await page.waitForTimeout(250)
   assert.equal(await page.locator('[data-structure="3"]').getAttribute('aria-pressed'),'true')
   const raised=await page.evaluate(()=>window.chipPreview.getState().layerY[3])
   await page.keyboard.press('Enter');await page.waitForTimeout(250)
   const normal=await page.evaluate(()=>window.chipPreview.getState().layerY[3]);assert(Math.abs(raised-normal-.13)<.01)
   await page.screenshot({path:new URL('desktop-layers.png',out).pathname})
   const box=await page.locator('canvas').boundingBox();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.6)
   await page.waitForFunction(()=>Math.abs(window.chipPreview.getState().orbit[0])>.1)
   // Probe rendered geometry rather than assuming a pixel corresponds to a layer.
   let found=false;for(const x of [.4,.5,.6])for(const y of [.35,.5,.65]){await page.mouse.move(box.x+box.width*x,box.y+box.height*y);await page.waitForTimeout(40);if(await page.evaluate(()=>window.chipPreview.getState().hovered>=0))found=true;}
   assert(found,'Visible chip geometry offers a raycast hotspot');
   await page.mouse.move(5,5);await page.waitForFunction(()=>Math.abs(window.chipPreview.getState().orbit[0])<.001)
   await page.evaluate(()=>window.chipPreview.seek(.70));await page.waitForTimeout(100)
   await page.screenshot({path:new URL('desktop-inside.png',out).pathname})
   await page.evaluate(()=>window.chipPreview.seek(.77));assert.equal(await page.evaluate(()=>window.chipPreview.getState().cutPlayed),true)
   await page.waitForTimeout(250);assert.equal(await page.locator('.digital-cut').getAttribute('data-active'),'false')
   await page.evaluate(()=>{window.chipPreview.seek(.7);window.chipPreview.seek(.77)})
   assert.equal(await page.locator('.digital-cut').getAttribute('data-active'),'false')
   await page.evaluate(()=>window.chipPreview.seek(1));await page.waitForTimeout(150)
   await page.screenshot({path:new URL('desktop-worlds.png',out).pathname})
   await shelf.scrollIntoViewIfNeeded();await page.waitForTimeout(200)
   const frames=await page.evaluate(()=>window.chipPreview.getState().renderedFrames);await page.waitForTimeout(500)
   assert.equal(await page.evaluate(()=>window.chipPreview.getState().renderedFrames),frames)
   checks.push('Full viewport product composition and slow-to-fast disassembly curve');
   const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   await mobile.goto(origin+'/silicon/');await mobile.waitForFunction(()=>window.chipPreview?.getState().ready,{},{timeout:60000});
   await mobile.evaluate(()=>window.chipPreview.seek(.36));await mobile.waitForTimeout(200);
   await mobile.screenshot({path:new URL('mobile-layers.png',out).pathname});
   await mobile.locator('.scene-tools summary').click();await mobile.locator('#structure-select').selectOption('3');
   await mobile.waitForFunction(()=>window.chipPreview.getState().selected===3);
   assert.deepEqual(await mobile.evaluate(()=>window.chipPreview.getState().orbit),[0,0]);await mobile.close();
   assert.deepEqual(errors,[]);checks.push('Chromium GPU: layer lift, cursor orbit/reset, one cut, offscreen idle')
  }
  await page.close()
 }finally{await browser.close()}
}
await writeFile(new URL(gpu?'gpu-verification.json':'verification.json',out),JSON.stringify({checks,scope:'Local installed engines and optional desktop GPU; not physical mobile hardware or Linux CI'},null,2))
console.log(checks.join('\n'))
