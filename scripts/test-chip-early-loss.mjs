import {chromium,webkit,firefox} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322';const out=new URL('../artifacts/chip-early-loss/',import.meta.url);await mkdir(out,{recursive:true});const cases=[];
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const b=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{});
 try{for(const phase of ['renderer','environment','geometry']){
  const p=await b.newPage({viewport:{width:390,height:1000},deviceScaleFactor:3});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(phase=>{
   Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,value:8});Object.defineProperty(navigator,'deviceMemory',{configurable:true,value:8});Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:false,effectiveType:'4g'}});
   const observer=new MutationObserver(()=>{
    const stage=document.querySelector('.stage');const timings=stage?.dataset.sceneTimings?JSON.parse(stage.dataset.sceneTimings):{};
    if(timings[phase]===undefined)return;
    const canvas=stage.querySelector('canvas');if(!canvas)return;observer.disconnect();
    const record={requestedPhase:phase,bootAtRequest:stage.dataset.boot,timingsAtRequest:timings,readyAtRequest:stage.dataset.ready??null};window.earlyLoss=record;
    canvas.addEventListener('webglcontextlost',()=>{record.timingsAtDelivery=JSON.parse(stage.dataset.sceneTimings);record.bootAtDelivery=stage.dataset.boot;},{once:true,capture:true});
    const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');const extension=gl?.getExtension('WEBGL_lose_context');
    if(extension){record.kind='WEBGL_lose_context';extension.loseContext();}else{record.kind='synthetic event';canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));}
   });observer.observe(document,{subtree:true,attributes:true,attributeFilter:['data-scene-timings']});
  },phase);
  await p.goto(origin+'/silicon/');await p.waitForSelector('.stage[data-boot="failed"]');
  const loss=await p.evaluate(()=>({...window.earlyLoss,timingsAfterFallback:JSON.parse(document.querySelector('.stage').dataset.sceneTimings)}));await writeFile(new URL(`${engine}-${phase}-loss.json`,out),JSON.stringify(loss,null,2));assert.equal(loss.bootAtRequest,'loading');assert.equal(loss.readyAtRequest,null);assert.equal(loss.timingsAtRequest.firstRender,undefined);assert.equal(loss.timingsAfterFallback.firstRender,undefined,'Lost contexts must never publish a first rendered frame');
  assert.equal(await p.locator('canvas').count(),0);assert(await p.locator('.scene-poster').isVisible());assert(await p.locator('[data-start-3d]').isVisible());assert.equal(await p.evaluate(()=>typeof window.chipPreview),'undefined');
  assert(await p.locator('.controls :is(button,input,select)').evaluateAll(els=>els.every(el=>el.disabled)));
  if(phase==='geometry')await p.screenshot({path:new URL(`${engine}-fallback.png`,out).pathname});
  // Retry immediately: a late rejection from the interrupted initializer must not tear down this instance.
  await p.locator('[data-start-3d]').click();await p.waitForFunction(()=>document.querySelector('.stage').dataset.boot==='ready'&&window.chipPreview?.getState().ready,{}, {timeout:60000});
  const restored=await p.evaluate(()=>window.chipPreview.getState());assert.equal(await p.locator('canvas').count(),1);assert.equal(restored.quality,'balanced');
  await p.locator('.scene-tools summary').click();await p.locator('#structure-select').selectOption('4');await p.waitForFunction(()=>window.chipPreview.getState().selectionVisible);
  await p.waitForTimeout(200);assert.equal(await p.locator('.stage').getAttribute('data-boot'),'ready');assert.deepEqual(errors,[]);
  cases.push({engine,phase,loss,restored,errors});await p.close();
 }}finally{await b.close();}
}
await writeFile(new URL('verification.json',out),JSON.stringify({cases,scope:'Local engines, actual context-loss extension where available, before first frame; not physical GPU/Safari or memory telemetry'},null,2));console.log('Nine pre-first-frame interruptions, immediate retries and layer selections passed');
