import {chromium,webkit,firefox} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322'
const phase=process.env.TEST_PHASE||'current'
const out=new URL('../artifacts/chip-runtime-retry/',import.meta.url)
await mkdir(out,{recursive:true})
const cases=[]
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const browser=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{})
 try{for(const manual of [false,true]){
  const page=await browser.newPage({viewport:{width:390,height:844}})
  let requests=0,documents=0
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('framenavigated',frame=>{if(frame===page.mainFrame())documents++})
  await page.addInitScript(manual=>{
   Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:manual,effectiveType:'4g'}})
   Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,value:8})
   Object.defineProperty(navigator,'deviceMemory',{configurable:true,value:8})
  },manual)
  await page.route('**/*chip-preview*.js',async route=>{requests++;if(requests===1)await route.abort();else await route.continue()})
  await page.goto(origin+'/silicon/?entry=runtime-retry#top')
  if(manual){await page.waitForSelector('.stage[data-boot="poster"]');assert.equal(requests,0);await page.locator('[data-start-3d]').click()}
  await page.waitForSelector('.stage[data-boot="failed"]')
  assert.equal(await page.locator('canvas').count(),0)
  assert(await page.locator('.scene-poster').isVisible())
  const label=await page.locator('[data-start-3d]').textContent()
  const failure=await page.locator('.stage').getAttribute('data-failure')
  const oldDocuments=documents
  await page.locator('[data-start-3d]').click()
  if(phase==='before'){
   await page.waitForTimeout(1200)
   cases.push({engine,manual,label,failure,requests,documents,recovered:await page.evaluate(()=>document.querySelector('.stage').dataset.boot==='ready'),errors})
  }else{
   await page.waitForFunction(()=>performance.getEntriesByType('navigation')[0]?.type==='reload')
   assert(documents>oldDocuments,'Runtime failure recovery starts a new document, not a cached failed import')
   assert.equal(page.url(),origin+'/silicon/?entry=runtime-retry#top','Reload preserves current URL/query/fragment')
   if(manual){await page.waitForSelector('.stage[data-boot="poster"]');assert.equal(requests,1,'Manual reload retains save-data gate');await page.locator('[data-start-3d]').click()}
   await page.waitForFunction(()=>document.querySelector('.stage').dataset.boot==='ready'&&window.chipPreview?.getState().ready)
   assert.equal(requests,2,'Only the failed request and the successful new-document request')
   assert.equal(await page.locator('.viewport canvas').count(),1)
   assert.equal(await page.locator('.stage').getAttribute('data-failure'),null)
   assert.equal(failure,'runtime');assert.match(label,/Reload page/)
   await page.locator('.scene-tools').evaluate(el=>{el.open=true})
   await page.locator('#structure-select').selectOption('4')
   await page.waitForFunction(()=>window.chipPreview.getState().selected===4)
   cases.push({engine,manual,label,failure,requests,documents,recovered:true,errors})
  }
  assert.deepEqual(errors,[])
  await page.close()
 }
  if(phase!=='before'){
   const page=await browser.newPage({viewport:{width:390,height:844}})
   let requests=0,documents=0;const errors=[]
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/chip-preview.*\.js/.test(r.url()))requests++});page.on('framenavigated',f=>{if(f===page.mainFrame())documents++})
   await page.addInitScript(()=>{
    Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:false,effectiveType:'4g'}})
    Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,value:8});Object.defineProperty(navigator,'deviceMemory',{configurable:true,value:8})
    window.denyWebGL=true;const get=HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext=function(type,...args){if(window.denyWebGL&&/webgl/.test(type))return null;return get.call(this,type,...args)}
   })
   await page.goto(origin+'/silicon/')
   await page.waitForSelector('.stage[data-boot="failed"][data-failure="renderer"]')
   assert.match(await page.locator('[data-start-3d]').textContent(),/Retry interactive/)
   await page.evaluate(()=>{window.denyWebGL=false})
   await page.locator('[data-start-3d]').click()
   await page.waitForFunction(()=>window.chipPreview?.getState().ready&&document.querySelector('.stage').dataset.boot==='ready')
   assert.equal(documents,1);assert.equal(requests,1)
   const loss=await page.evaluate(()=>{const gl=document.querySelector('.viewport canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_lose_context');if(ext){ext.loseContext();return 'actual context loss'}throw new Error('Context loss extension unavailable in this fixture')})
   await page.waitForSelector('.stage[data-boot="failed"][data-failure="renderer"]')
   await page.locator('[data-start-3d]').click()
   await page.waitForFunction(()=>window.chipPreview?.getState().ready&&document.querySelector('.stage').dataset.boot==='ready')
   assert.equal(documents,1);assert.equal(requests,1);assert.equal(await page.locator('.viewport canvas').count(),1)
   assert.deepEqual(errors,[])
   cases.push({engine,case:'constructor-and-context-recovery',requests,documents,loss,recovered:true,errors})
   await page.close()
  }
 }finally{await browser.close()}
}
await writeFile(new URL(`${phase}.json`,out),JSON.stringify({cases,scope:'Actual module request aborted once, then allowed; local three-engine fixture. Manual reload deliberately preserves save-data opt-in instead of forcing automatic download.'},null,2))
console.log(JSON.stringify(cases))
