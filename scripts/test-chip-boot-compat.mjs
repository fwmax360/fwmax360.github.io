import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322';
const out=new URL('../artifacts/chip-boot-profile/',import.meta.url);await mkdir(out,{recursive:true});
const b=await chromium.launch(process.env.CI?{}:{channel:'chrome'});const cases=[];
try{for(const forceTimer of [false,true]){
 const p=await b.newPage({viewport:{width:390,height:1000},deviceScaleFactor:3});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(forceTimer=>{
  if(forceTimer)Object.defineProperty(window,'scheduler',{configurable:true,value:undefined});
  Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,value:8});Object.defineProperty(navigator,'deviceMemory',{configurable:true,value:8});
  Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:false,effectiveType:'4g'}});
 },forceTimer);
 await p.goto(origin+'/silicon/');await p.waitForFunction(()=>document.querySelector('.stage').dataset.boot==='ready'&&window.chipPreview?.getState().ready);
 const strategy=await p.locator('.stage').getAttribute('data-task-yield');if(forceTimer)assert.equal(strategy,'timer');
 await p.evaluate(()=>window.chipPreview.seek(.36));await p.waitForTimeout(250);await p.evaluate(()=>document.fonts.ready);
 const image=await p.locator('.viewport').screenshot({path:new URL(`geometry-${forceTimer?'timer':'current'}.png`,out).pathname});
 const state=await p.evaluate(()=>window.chipPreview.getState());assert.equal(state.quality,'balanced');assert.equal(state.progress,.36);
 await p.locator('.scene-tools summary').click();await p.locator('#structure-select').selectOption('4');await p.waitForFunction(()=>window.chipPreview.getState().selectionVisible);assert.deepEqual(errors,[]);
 cases.push({forceTimer,strategy,state,hash:createHash('sha256').update(image).digest('hex'),errors});await p.close();
 }}finally{await b.close();}
assert.equal(cases[0].hash,cases[1].hash,'Task-yield fallback must preserve a fixed rendered frame');
const baseline=new URL('geometry-before.png',out);let comparison;
try{const bytes=await readFile(baseline);const hash=createHash('sha256').update(bytes).digest('hex');comparison={baselineHash:hash,currentHash:cases[0].hash,samePixels:hash===cases[0].hash};}catch(e){if(e.code!=='ENOENT')throw e;comparison={baselineAvailable:false};}
await writeFile(new URL('compatibility.json',out),JSON.stringify({cases,comparison,limits:['Headless Chrome fixed-frame and forced timer feature-unavailable fixture','Archived baseline if present; this test does not regenerate a historical baseline','Not GPU frame timing or physical Safari coverage']},null,2));console.log(JSON.stringify(comparison));console.log('Native and forced timer yield: startup, same frame and selection passed');
