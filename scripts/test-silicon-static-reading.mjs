import {chromium,webkit,firefox} from '@playwright/test'
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322'
const out=new URL('../artifacts/silicon-static-reading/',import.meta.url)
await mkdir(out,{recursive:true})
const cases=[]
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const browser=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{})
 try{for(const mode of ['nojs','blocked','manual'])for(const width of [320,390])for(const scale of [1,2]){
  console.log(`Checking ${engine} ${mode} ${width}/${scale}`)
  const page=await browser.newPage({viewport:{width,height:740},javaScriptEnabled:mode!=='nojs'})
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()))
  if(mode==='blocked')await page.route('**/silicon/',async route=>{
   const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'content-security-policy':"script-src 'none'"}})
  })
  if(mode==='manual')await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:true,effectiveType:'4g'}}))
  await page.goto(origin+'/silicon/')
  if(mode==='manual')await page.waitForSelector('.stage[data-boot="poster"]')
  await page.evaluate(scale=>document.documentElement.style.fontSize=16*scale+'px',scale)
  for(let n=0;n<100&&await page.evaluate(()=>document.fonts.status)!=='loaded';n++)await new Promise(resolve=>setTimeout(resolve,25))
  assert.equal(await page.evaluate(()=>document.fonts.status),'loaded','Font status reached loaded within bounded external wait')
  await page.waitForTimeout(100)
  const metrics=await page.evaluate(()=>{
   const box=s=>document.querySelector(s).getBoundingClientRect().toJSON()
   return {description:box('.description'),copy:box('.copy'),poster:box('.scene-poster'),stage:box('.stage'),journey:box('.journey'),topics:box('#topics'),fallback:box('.fallback'),overflow:document.documentElement.scrollWidth>innerWidth,skip:box('.skip'),status:document.querySelector('[data-status]').textContent,posterLoaded:document.querySelector('.scene-poster').complete&&document.querySelector('.scene-poster').naturalWidth>0}
  })
  assert(metrics.posterLoaded);assert(!metrics.overflow)
  assert(metrics.skip.bottom<=1,'Unfocused skip link remains fully offscreen at enlarged type')
  assert(metrics.poster.top>=metrics.copy.bottom-1,`${engine} ${mode} ${width}/${scale}: poster overlaps introduction ${metrics.poster.top} < ${metrics.copy.bottom}`)
  assert(metrics.topics.top>=metrics.stage.bottom-1,`${engine} ${mode} ${width}/${scale}: next section overlaps stage`)
  assert(metrics.status.includes('STATIC'),'Dormant scene must not claim real-time rendering')
  assert.equal(await page.locator('canvas').count(),0)
  assert.equal(await page.evaluate(()=>typeof window.chipPreview),'undefined')
  assert(!requests.some(url=>/\/chip-preview\.[^/]+\.js/.test(url)),'Dormant state does not request scene runtime')
  const staticSheet=requests.some(url=>/silicon-static\.[^/]+\.css/.test(url))
  assert.equal(staticSheet,mode==='nojs','Static-flow stylesheet only downloads when page scripts are disabled')
  if(mode==='nojs')assert(await page.locator('.noscript-note').isVisible())
  if(mode==='manual'){
   assert(await page.locator('[data-start-3d]').isVisible())
   assert(Math.abs(metrics.journey.height-metrics.stage.height)<1,'Manual static entry adds no empty animation scroll')
  }
  if(engine==='chromium'&&width===320)await page.screenshot({path:new URL(`${mode}-${scale}.png`,out).pathname})
  await page.locator('.read-notes').scrollIntoViewIfNeeded();await page.locator('.read-notes').click()
  await page.waitForURL('**/silicon/#topics');assert(await page.locator('#topics').isVisible())
  await page.locator('.skip').focus()
  assert(await page.locator('.skip').evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight}),'Keyboard skip link is fully visible when focused')
  assert.deepEqual(errors,[])
  cases.push({engine,mode,width,scale,metrics,staticSheet,errors})
  await page.close()
 }
  console.log(`Checking ${engine} slow module 320/2`)
  const pending=await browser.newPage({viewport:{width:320,height:740}})
  let release;const gate=new Promise(resolve=>{release=resolve})
  let held=false
  await pending.route('**/*chip-preview*.js',async route=>{held=true;await gate;try{await route.abort()}catch{/* Page disposal may cancel the held request. */}})
  try{
   await pending.goto(origin+'/silicon/')
   await pending.evaluate(()=>document.documentElement.style.fontSize='32px')
   for(let n=0;n<100&&!held;n++)await new Promise(resolve=>setTimeout(resolve,25))
   assert(held,'Actual scene-module request observed before pending-state assertions')
   await pending.waitForSelector('.stage[data-boot="loading"]')
   const metrics=await pending.evaluate(()=>({copy:document.querySelector('.copy').getBoundingClientRect().toJSON(),poster:document.querySelector('.scene-poster').getBoundingClientRect().toJSON(),fallback:document.querySelector('.fallback').getBoundingClientRect().toJSON()}))
   assert(metrics.poster.top>=metrics.copy.bottom,'Slow module poster stays below enlarged introduction')
   assert(metrics.fallback.top>=metrics.poster.bottom,'Preparation message stays below poster')
   assert.equal(await pending.locator('canvas').count(),0)
   if(engine==='chromium')await pending.screenshot({path:new URL('slow-2.png',out).pathname})
   release()
   await pending.waitForSelector('.stage[data-boot="failed"]')
   assert(await pending.locator('.scene-poster').isVisible())
   assert(await pending.locator('[data-start-3d]').isVisible())
   await pending.locator('.read-notes').scrollIntoViewIfNeeded();await pending.locator('.read-notes').click();await pending.waitForURL('**/silicon/#topics')
   cases.push({engine,mode:'slow-module-then-network-failure',width:320,scale:2,metrics,checks:['Actual lazy module held before assertions','Poster and message below enlarged title','Network failure retains static poster and reading anchor'],limits:['Module retry recovery is not asserted here; existing startup tests cover their own retry fixture.']})
  }finally{release();await pending.close()}
 }finally{await browser.close()}
}
await writeFile(new URL('verification.json',out),JSON.stringify({cases,scope:'Local engines with disabled scripts, CSP script blocking and save-data fixture, root-font 100/200%; not physical device or OS text scaling.'},null,2))
console.log(`Silicon static reading: ${cases.length} fixtures passed`)
