import {chromium,webkit,firefox} from '@playwright/test'
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322',phase=process.env.TEST_PHASE||'current',out=new URL('../artifacts/note-preview-placement/',import.meta.url);await mkdir(out,{recursive:true});const cases=[]
for(const [engine,type]of Object.entries({chromium,webkit,firefox})){
 const browser=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{});
 try{for(const width of [901,1440])for(const [height,scale]of [[240,1],[360,1],[1000,1],[1000,2]])for(const mode of ['pointer','focus']){
 const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.evaluate(()=>document.fonts.ready);await page.evaluate(scale=>document.documentElement.style.fontSize=16*scale+'px',scale);
 const row=page.locator('[data-note-hover]').first();await row.scrollIntoViewIfNeeded();await page.waitForTimeout(350);
 await row.evaluate(el=>window.scrollBy({top:el.getBoundingClientRect().top-(document.querySelector('.nav').getBoundingClientRect().bottom+24),behavior:'instant'}));await page.waitForTimeout(100);
 if(mode==='focus')await row.locator('h3 a').evaluate(el=>el.focus({preventScroll:true}));else {const r=await row.boundingBox();await page.mouse.move(r.x+100,r.y+20)}
 await page.waitForTimeout(550);
 const measured=await row.evaluate(el=>{const preview=document.querySelector('[data-note-preview]'),art=preview.querySelector('.note-preview-art'),box=el.getBoundingClientRect(),r=art.getBoundingClientRect(),nav=document.querySelector('.nav').getBoundingClientRect(),visible=preview.hasAttribute('data-visible');return {visible,row:{top:box.top,bottom:box.bottom,left:box.left,right:box.right},art:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},navBottom:nav.bottom,overlap:visible&&r.left<box.right&&r.right>box.left&&r.top<box.bottom&&r.bottom>box.top,overflow:visible&&(r.left<0||r.right>innerWidth||r.bottom>innerHeight||r.top<nav.bottom),focus:document.activeElement?.getAttribute('href')}});
 cases.push({engine,width,height,scale,mode,...measured,errors});if(phase!=='before'){assert(!measured.overlap,`${engine} ${width}/${height}/${scale}/${mode}: preview obscures active note`);assert(!measured.overflow,'Rotated preview must remain below nav and in viewport');if(height===1000)assert(measured.visible,'Spacious view retains preview');if(mode==='focus')assert.equal(measured.focus,await row.locator('h3 a').getAttribute('href'));assert.deepEqual(errors,[])}
 if(engine==='chromium'&&width===1440&&height===1000&&scale===1&&mode==='focus')await page.screenshot({path:new URL(`${phase}.png`,out).pathname});await page.close();
 }}finally{await browser.close()}
}
await writeFile(new URL(`${phase}.json`,out),JSON.stringify({cases,scope:'Local engines, real pointer/focus, constrained desktop heights and root text scaling; decorative preview may hide when no reading-safe space exists.'},null,2));console.log(JSON.stringify({cases:cases.length,overlaps:cases.filter(c=>c.overlap).length,overflow:cases.filter(c=>c.overflow).length,hidden:cases.filter(c=>!c.visible).length}))
