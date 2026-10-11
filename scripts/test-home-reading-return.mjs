import {chromium,webkit,firefox} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322';
const out=new URL('../artifacts/home-reading-return/',import.meta.url);await mkdir(out,{recursive:true});
const cases=[];
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const browser=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{});
 try{for(const width of [390,1440]){for(const motion of ['reduce','no-preference']){
  const p=await browser.newPage({viewport:{width,height:1000},reducedMotion:motion});
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const count=()=>p.locator('#recent-posts > li:not([hidden])').count();
  const ready=()=>p.locator('[data-more-posts]').waitFor({state:'visible'});
  const navigate=async(action,url)=>{
   await p.evaluate(()=>{window.__navFinished=false;document.addEventListener('astro:page-load',()=>{window.__navFinished=true;},{once:true});});
   await action();await p.waitForURL(url);await p.waitForFunction(()=>window.__navFinished);
  };

  await p.goto(origin+'/');await ready();const initial=await count();
  const base=await p.evaluate(()=>({length:history.length,index:history.state.index}));
  await p.locator('[data-more-posts]').click();await p.locator('[data-more-posts]').click();
  const expanded=await count();assert.equal(expanded,initial+8);
  assert.deepEqual(await p.evaluate(()=>({length:history.length,index:history.state.index})),base,'Expansion must not add history or overwrite Astro index');
  const link=p.locator('#recent-posts > li:not([hidden])').last().locator('h3 a');
  const href=await link.getAttribute('href');await link.scrollIntoViewIfNeeded();
  await p.evaluate(()=>document.fonts.ready);
  await link.hover();await link.evaluate(el=>el.focus({preventScroll:true}));await p.waitForTimeout(350);
  await p.evaluate(href=>{
   document.addEventListener('astro:before-preparation',()=>{window.__homeDeparture={y:scrollY,top:document.querySelector(`h3 a[href="${href}"]`).getBoundingClientRect().top};},{once:true});
   document.addEventListener('astro:page-load',()=>{window.__loadedPath=location.pathname;});
  },href);
  await link.click();await p.waitForURL('**/posts/**');await p.waitForFunction(()=>window.__loadedPath===location.pathname);
  const {y:scroll,top}=await p.evaluate(()=>window.__homeDeparture);
  await navigate(()=>p.goBack(),origin+'/');await ready();await p.waitForFunction(y=>Math.abs(scrollY-y)<8,scroll,{timeout:5000}).catch(async error=>{console.error(JSON.stringify({engine,width,motion,expectedScroll:scroll,actual:await p.evaluate(()=>({y:scrollY,state:history.state,visible:document.querySelectorAll('#recent-posts > li:not([hidden])').length}))}));throw error});
  assert.equal(await count(),expanded);const returned=p.locator(`h3 a[href="${href}"]`);assert(await returned.isVisible());
  const restored=await p.evaluate(()=>scrollY);const restoredTop=await returned.evaluate(el=>el.getBoundingClientRect().top);
  assert(Math.abs(restored-scroll)<8,`${engine} ${width}: scroll ${scroll} -> ${restored}`);
  assert(Math.abs(restoredTop-top)<8,`${engine} ${width}: reading target shifted`);
  await navigate(()=>p.goForward(),'**/posts/**');await navigate(()=>p.goBack(),origin+'/');await ready();assert.equal(await count(),expanded);
  await p.reload();await ready();assert.equal(await count(),expanded,'Same entry reload keeps expansion');
  await p.locator('[data-more-posts]').click();assert.equal(await count(),expanded+4,'Exactly one handler after return/reload');
  const total=await p.locator('#recent-posts > li').count();
  while(await count()<total){const before=await count();await p.locator('[data-more-posts]').click();assert.equal(await count(),Math.min(total,before+4),'Each expansion reveals exactly four or the remaining rows');}
  assert.equal(await count(),total);assert(await p.locator('[data-more-posts]').isDisabled());
  await navigate(()=>p.locator(`h3 a[href="${href}"]`).click(),'**/posts/**');
  await navigate(()=>p.goBack(),origin+'/');await ready();assert.equal(await count(),total);assert(await p.locator('[data-more-posts]').isDisabled());
  await navigate(()=>p.goForward(),'**/posts/**');
  // Native nav creates a fresh Home history entry rather than restoring the old one.
  await navigate(()=>p.locator('.brand').click(),origin+'/');await ready();assert.equal(await count(),initial);
  for(const value of [{version:1,count:-2},{version:1,count:'12'},{version:2,count:12}]){
   await p.evaluate(saved=>history.replaceState({...history.state,blogHomeNotes:saved},''),value);await p.reload();await ready();assert.equal(await count(),initial);
  }
  await p.evaluate(()=>history.replaceState({...history.state,blogHomeNotes:{version:1,count:999999}},''));await p.reload();await ready();assert.equal(await count(),total);assert(await p.locator('[data-more-posts]').isDisabled());
  assert.deepEqual(errors,[]);cases.push({engine,width,motion,initial,expanded,total,scroll,restored,readingTargetDelta:restoredTop-top,errors});await p.close();
 }}}finally{await browser.close();}
}
await writeFile(new URL('verification.json',out),JSON.stringify({cases,checks:['Back/Forward retain expanded rows and actual reading position','Same history entry reload retains rows; fresh visit starts collapsed','Expansion merges Astro history state and does not add entries','After navigation/reload click expands once','Invalid state ignored; oversized count clamped','All-expanded button remains disabled'],limits:['Local browser engines, not physical devices']},null,2));
console.log('Home reading return: 12 engine/viewport/motion cases passed');
