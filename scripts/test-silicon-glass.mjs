import { chromium, webkit, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322';
const out=new URL('../artifacts/silicon-glass/',import.meta.url);await mkdir(out,{recursive:true});
const source=await readFile(new URL('../src/components/ChipExperience.astro',import.meta.url),'utf8');
assert(source.includes('@supports not (-webkit-backdrop-filter:blur(1px))'),'Prefixed Safari blur must not trigger the opaque fallback');
assert(source.includes('@media(prefers-reduced-transparency:reduce)'),'Retain an opaque surface when reduced transparency is requested');
const cases=[];
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const browser=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{});
 try{for(const [width,height] of [[393,852],[320,740],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/silicon/');await page.waitForFunction(()=>window.chipPreview?.getState().ready&&document.querySelector('.stage').dataset.boot==='ready');
  await page.evaluate(()=>{window.chipPreview.seek(.19);document.querySelector('.atmosphere-toggle')?.click();});
  const inspect=()=>page.evaluate(()=>{
   const css=s=>getComputedStyle(document.querySelector(s));const controls=css('.controls'),panel=css('.tool-panel');
   return {gradient:controls.backgroundImage,background:controls.backgroundColor,panel:panel.backgroundColor,blur:controls.backdropFilter&&controls.backdropFilter!=='none'?controls.backdropFilter:controls.webkitBackdropFilter,overflow:document.documentElement.scrollWidth>innerWidth,phase:document.querySelector('.phase').getBoundingClientRect().toJSON(),controls:document.querySelector('.controls').getBoundingClientRect().toJSON(),targets:[...document.querySelectorAll('.scene-tools summary,#structure-select,#labels-toggle,.chapters button')].map(el=>el.getBoundingClientRect().height)};
  });
  const closed=await inspect();await page.locator('.scene-tools summary').click();const open=await inspect();
  assert.equal(open.gradient,closed.gradient,'Opening the mobile panel must not replace its glass surface with a solid fill');
  if(width<760){
   const alphas=[...open.gradient.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map(m=>Number(m[1]));
   assert.equal(alphas.length,2);assert(alphas.every(a=>a>=.4&&a<=.55),'Single translucent glass surface remains visible');
   assert.match(open.panel,/rgba\([^)]*,\s*0\.12\d*\)/,'Nested panel must not mask the glass');assert.equal(open.blur,'blur(10px)');
   assert(open.targets.every(h=>h>=44));assert(open.phase.bottom<=open.controls.top+1);assert(!open.overflow);
  }
  await page.locator('#structure-select').selectOption('4');await page.waitForFunction(()=>window.chipPreview.getState().selected===4);
  await page.locator('#labels-toggle').click();assert.equal(await page.locator('#labels-toggle').getAttribute('aria-pressed'),'false');await page.locator('#labels-toggle').click();
  await page.locator('#structure-select').selectOption('-1');
  if(width===393){await page.locator('.scene-tools summary').scrollIntoViewIfNeeded();await page.screenshot({path:new URL(`${engine}-iphone-open.png`,out).pathname});}
  await page.locator('.scene-tools summary').click();assert.equal(await page.locator('.scene-tools').getAttribute('open'),null);
  assert.deepEqual(errors,[]);cases.push({engine,width,height,closed,open,errors});await page.close();
 }}finally{await browser.close();}
}
await writeFile(new URL('verification.json',out),JSON.stringify({cases,limits:['Installed WebKit/Chromium/Firefox, not a physical iPhone Safari test','Fallback and reduced-transparency policy source checks; no claim of OS accessibility-setting emulation']},null,2));console.log('Silicon glass: 9 engine/viewport cases passed');
