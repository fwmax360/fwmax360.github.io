import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322'
const phase = process.env.PROFILE_PHASE || 'current'
const out = new URL('../artifacts/chip-boot-profile/', import.meta.url)
await mkdir(out, {recursive:true})
const browser = await chromium.launch(process.env.CI ? {} : {channel:'chrome'})
const runs=[]
try {
 for(let run=0;run<5;run++){
  const context=await browser.newContext({viewport:{width:390,height:1000},deviceScaleFactor:3})
  const page=await context.newPage()
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  const client=await context.newCDPSession(page)
  await client.send('Emulation.setCPUThrottlingRate',{rate:4})
  await client.send('Network.setCacheDisabled',{cacheDisabled:true})
  await page.addInitScript(()=>{
   Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,value:8})
   Object.defineProperty(navigator,'deviceMemory',{configurable:true,value:8})
   Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:false,effectiveType:'4g'}})
   window.bootLongTasks=[]
   new PerformanceObserver(list=>window.bootLongTasks.push(...list.getEntries().map(entry=>({start:entry.startTime,duration:entry.duration})))).observe({type:'longtask',buffered:true})
  })
  await page.goto(origin+'/silicon/')
  await page.waitForFunction(()=>document.querySelector('.stage').dataset.boot==='ready'&&window.chipPreview?.getState().ready)
  const result=await page.evaluate(()=>{
   const stage=document.querySelector('.stage')
   return {bootMs:Number(stage.dataset.bootMs),boot:JSON.parse(stage.dataset.bootTimings),scene:JSON.parse(stage.dataset.sceneTimings),longTasks:window.bootLongTasks,resources:performance.getEntriesByType('resource').filter(entry=>/\.js($|\?)/.test(entry.name)).map(entry=>({name:entry.name.split('/').pop(),bytes:entry.decodedBodySize,duration:entry.duration})),state:window.chipPreview.getState()}
  })
  assert.equal(result.state.quality,'balanced');assert.deepEqual(errors,[])
  result.longTaskBlockingMs=result.longTasks.reduce((total,task)=>total+Math.max(0,task.duration-50),0)
  runs.push(result)
  console.log(`run ${run+1}: boot ${result.bootMs}ms; blocking ${result.longTaskBlockingMs}ms; ${JSON.stringify(result.scene)}`)
  await context.close()
 }
 await writeFile(new URL(`${phase}.json`,out),JSON.stringify({phase,runs,limits:['Chrome headless, 390x1000 DPR3, CDP CPU4x, cache disabled; localhost uncompressed network','One browser with five fresh contexts; driver/shader caches may remain warm','Long-task blocking here is not Lighthouse TBT or field INP','Scene timestamps are cumulative wall time, not GPU timer queries']},null,2))
}finally{await browser.close()}
