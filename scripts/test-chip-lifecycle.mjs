import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322'
const out = new URL('../artifacts/chip-lifecycle/', import.meta.url)
await mkdir(out, { recursive:true })
const browser = await chromium.launch(process.env.CI ? {} : { channel:'chrome' })
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1})
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.addInitScript(() => {
  const contexts=new WeakMap(), records=[], handles=new WeakMap();let serial=0
  const original=HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext=function(...args){
   const gl=original.apply(this,args)
   if(gl instanceof WebGL2RenderingContext && !contexts.has(gl)){
    const record={id:records.length,created:{},deleted:{},live:{},draws:0,lost:false};records.push(record);contexts.set(gl,record)
    this.addEventListener('webglcontextlost',()=>{record.lost=true},{once:true})
   }
   return gl
  }
  for(const kind of ['Buffer','Texture','Framebuffer','Renderbuffer','Program','Shader','VertexArray','Query','Sampler','TransformFeedback']){
   const create=WebGL2RenderingContext.prototype['create'+kind],remove=WebGL2RenderingContext.prototype['delete'+kind]
   WebGL2RenderingContext.prototype['create'+kind]=function(...args){
    const handle=create.apply(this,args),record=contexts.get(this)
    if(handle&&record){handles.set(handle,{id:++serial,kind,context:record.id});record.created[kind]=(record.created[kind]??0)+1;record.live[kind]=(record.live[kind]??0)+1}
    return handle
   }
   WebGL2RenderingContext.prototype['delete'+kind]=function(handle){
    const tracked=handle&&handles.get(handle),record=contexts.get(this)
    if(tracked&&record){handles.delete(handle);record.deleted[kind]=(record.deleted[kind]??0)+1;record.live[kind]--}
    return remove.call(this,handle)
   }
  }
  for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
   const original=WebGL2RenderingContext.prototype[name]
   WebGL2RenderingContext.prototype[name]=function(...args){const record=contexts.get(this);if(record)record.draws++;return original.apply(this,args)}
  }
  // Only numbers survive snapshots; WeakMaps do not retain GL handles or contexts.
  window.chipLifecycleRecords=()=>structuredClone(records)
 })
 await page.goto(origin+'/silicon/')
 await page.waitForFunction(()=>window.chipPreview?.getState().ready && document.querySelector('.stage').dataset.boot==='ready')
 const moduleURL=await page.evaluate(()=>performance.getEntriesByType('resource').find(r=>/\/chip-preview\.[^/]+\.js/.test(r.name))?.name)
 assert(moduleURL,'Built lazy scene module located from actual resource request')
 await page.evaluate(()=>document.dispatchEvent(new Event('astro:before-swap')))
 assert.equal(await page.evaluate(()=>typeof window.chipPreview),'undefined')
 const client=await page.context().newCDPSession(page)
 await client.send('Performance.enable')
 const cycles=[]
 for(let cycle=0;cycle<6;cycle++){
  const active=await page.evaluate(async url=>{
   const {initChipExperience}=await import(url)
   window.lifecycleAbort=new AbortController()
   await initChipExperience({tier:'full',manual:false,dpr:2,fps:60},window.lifecycleAbort.signal)
   for(const progress of [0.05,0.35,0.65,0.99]){
    const before=window.chipPreview.getState().renderedFrames
    window.chipPreview.setProgress(progress)
    for(let n=0;window.chipPreview.getState().renderedFrames===before&&n<120;n++)await new Promise(r=>requestAnimationFrame(r))
    if(window.chipPreview.getState().renderedFrames===before)throw new Error('No requested render')
   }
   return window.chipPreview.getState()
  },moduleURL)
  assert.equal(await page.locator('.viewport canvas').count(),1)
  await page.evaluate(()=>{window.lifecycleAbort.abort();delete window.lifecycleAbort})
  assert.equal(await page.locator('.viewport canvas').count(),0)
  assert.equal(await page.evaluate(()=>typeof window.chipPreview),'undefined')
  const disposed=await page.evaluate(()=>window.chipLifecycleRecords())
  await page.setViewportSize({width:1440,height:1001+cycle})
  await page.evaluate(()=>{window.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('resize'))})
  await page.waitForTimeout(200)
  const idle=await page.evaluate(()=>window.chipLifecycleRecords())
  assert.deepEqual(idle.map(r=>({draws:r.draws,created:r.created,deleted:r.deleted})),disposed.map(r=>({draws:r.draws,created:r.created,deleted:r.deleted})),'No post-disposal draws or GL allocation after resize/scroll')
  assert(idle.every(record=>record.lost),'Every retired context has actually received context loss')
  for(const record of idle)for(const kind of ['Program','VertexArray','Renderbuffer'])assert.equal(record.live[kind]??0,0,`Explicit ${kind} cleanup for context ${record.id}`)
  await page.setViewportSize({width:1440,height:1000})
  await client.send('HeapProfiler.collectGarbage')
  const metrics=(await client.send('Performance.getMetrics')).metrics
  const metric=name=>metrics.find(m=>m.name===name)?.value
  const record={cycle,active,lastContext:idle.at(-1),postGc:{heapBytes:metric('JSHeapUsedSize'),nodes:metric('Nodes'),listeners:metric('JSEventListeners'),documents:metric('Documents')}}
  cycles.push(record);console.log(JSON.stringify(record))
 }
 const warm=cycles.slice(1)
 assert.equal(new Set(warm.map(c=>JSON.stringify(c.lastContext.live))).size,1,'Warm remaining GL handle counts plateau')
 assert.equal(new Set(warm.map(c=>c.active.geometries)).size,1)
 assert.equal(new Set(warm.map(c=>c.active.textures)).size,1)
 assert.deepEqual(errors,[])
 await writeFile(new URL('verification.json',out),JSON.stringify({measuredAt:new Date().toISOString(),fixture:{width:1440,height:1000,dpr:1,tier:'full'},cycles,errors,limits:['Local Chrome; direct repeated init/AbortSignal disposal against the actual built module in one document, not native route navigation or physical mobile testing.','GL counters track explicit create/delete calls; context loss retires remaining context-owned resources. Neither is a GPU byte measurement.','WeakMap instrumentation does not retain handles; CDP requested garbage collection changes natural lifetime behavior.','Heap and DOM trends are reported, not an exact leak-free guarantee; no arbitrary universal memory threshold. The original before fixture had persistent instrumentation loss listeners; its heap/listener counts are not a clean causal before/after comparison.']},null,2))
}finally{await browser.close()}
