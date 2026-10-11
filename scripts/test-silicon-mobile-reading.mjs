import { chromium, webkit, firefox } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322'
const out=new URL('../artifacts/silicon-mobile-reading/',import.meta.url)
await mkdir(out,{recursive:true})
const cases=[]
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const browser=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{})
 try{
  for(const [width,height] of [[320,740],[390,844],[720,1000]])for(const scale of [1,2]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1})
   const errors=[];page.on('pageerror',error=>errors.push(error.message))
   await page.goto(origin+'/silicon/')
   await page.waitForFunction(()=>window.chipPreview?.getState().ready&&document.querySelector('.stage').dataset.boot==='ready')
   await page.evaluate(scale=>{document.documentElement.style.fontSize=16*scale+'px'},scale)
   await page.waitForTimeout(150)
   for(const [name,progress] of [['intro',0],['layers',.36],['inside',.7],['worlds',1]]){
    const before=await page.evaluate(()=>window.chipPreview.getState().renderedFrames)
    await page.evaluate(progress=>window.chipPreview.setProgress(progress),progress)
    await page.waitForFunction(before=>window.chipPreview.getState().renderedFrames>before,before)
    const metrics=await page.evaluate(()=>{
     const box=selector=>document.querySelector(selector).getBoundingClientRect().toJSON()
     const font=selector=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)
     return {overflow:document.documentElement.scrollWidth>innerWidth,phase:box('.phase'),controls:box('.controls'),worlds:box('.dual-captions'),stage:box('.stage'),descriptionFont:font('.phase-description'),captionFont:font('.dual-captions small'),chapterFont:font('.chapters button'),actionFont:font('.scene-tools>summary')}
    })
    assert(!metrics.overflow,`${engine} ${width}/${scale} ${name}: page overflow`)
    assert.equal(metrics.descriptionFont,14*scale);assert.equal(metrics.captionFont,12*scale);assert.equal(metrics.chapterFont,12*scale);assert.equal(metrics.actionFont,14*scale)
    assert(metrics.phase.bottom<=metrics.controls.top+1,`${engine} ${width}/${scale} ${name}: phase overlaps controls ${metrics.phase.bottom} > ${metrics.controls.top}`)
    if(name==='worlds')assert(metrics.worlds.bottom<=metrics.phase.top+1,'Execution captions must remain above narrative')
    if(engine==='chromium'&&width===390&&scale===1)await page.screenshot({path:new URL(`after-${name}.png`,out).pathname})
   }
   await page.locator('.scene-tools').evaluate(el=>{el.open=true})
   await page.waitForTimeout(100)
   const open=await page.evaluate(()=>({phase:document.querySelector('.phase').getBoundingClientRect().toJSON(),controls:document.querySelector('.controls').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('#labels-toggle,#structure-select,.scene-tools>summary,.chapters button')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),overflow:document.documentElement.scrollWidth>innerWidth}))
   assert(!open.overflow)
   assert(open.phase.bottom<=open.controls.top+1,`${engine} ${width}/${scale}: open controls overlap narrative`)
   assert(open.buttons.every(box=>box.height>=43.99&&box.width>=43.99),`${engine} ${width}/${scale}: Native control targets at least 44px: ${JSON.stringify(open.buttons)}`)
   await page.locator('.scene-tools summary').scrollIntoViewIfNeeded()
   assert(await page.locator('.scene-tools summary').evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight}),'Tall stage controls scroll into the viewport')
   if(engine==='chromium'&&width===390&&scale===1)await page.screenshot({path:new URL('after-tools.png',out).pathname})
   assert.deepEqual(errors,[])
   cases.push({engine,width,height,scale,errors,checks:['Readable rem-based copy and labels','Narrative separated from closed/open controls','World captions above narrative','44px native control targets','Enlarged-stage controls reachable by scrolling','No page overflow']})
   await page.close()
  }
  for(const scale of [1,2]){
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'})
   const errors=[];page.on('pageerror',error=>errors.push(error.message))
   await page.goto(origin+'/silicon/')
   await page.waitForFunction(()=>window.chipPreview?.getState().ready&&document.querySelector('.stage').dataset.boot==='ready')
   await page.evaluate(scale=>{document.documentElement.style.fontSize=16*scale+'px'},scale)
   await page.waitForTimeout(200)
   assert(await page.locator('#play').isDisabled())
   assert(await page.evaluate(()=>document.querySelector('.journey').getBoundingClientRect().height>=document.querySelector('.stage').getBoundingClientRect().height),'Reduced-motion journey contains enlarged stage')
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
   await page.locator('.scene-tools').evaluate(el=>{el.open=true})
   await page.locator('#structure-select').selectOption('3')
   assert.equal(await page.evaluate(()=>window.chipPreview.getState().selected),3)
   assert.equal(await page.locator('.dual-captions').evaluate(el=>getComputedStyle(el).visibility),'hidden')
   await page.locator('#structure-select').selectOption('-1')
   await page.locator('.scene-tools').evaluate(el=>{el.open=false})
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.dual-captions')).opacity==='1')
   assert.equal(await page.locator('.dual-captions').evaluate(el=>getComputedStyle(el).visibility),'visible')
   await page.locator('.read-notes').scrollIntoViewIfNeeded()
   await page.locator('.read-notes').click()
   await page.waitForURL('**/silicon/#topics')
   assert(await page.locator('#topics').isVisible())
   assert.deepEqual(errors,[])
   cases.push({engine,width:390,height:844,scale,reduced:true,errors,checks:['No autoplay','Enlarged journey contains stage','Inspection remains functional','Auxiliary captions recover after panel closes','Reading anchor remains reachable']})
   await page.close()
  }
 }finally{await browser.close()}
}
await writeFile(new URL('verification.json',out),JSON.stringify({cases,scope:'Three local engines, six viewport/root-font fixtures each. CSS root scaling is not physical OS text scaling; not human aesthetic acceptance.'},null,2))
console.log(`Silicon mobile reading: ${cases.length} fixtures passed`)
