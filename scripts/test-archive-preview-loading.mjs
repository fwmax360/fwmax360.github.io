import {chromium,webkit,firefox} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322';
const out=new URL('../artifacts/archive-preview-loading/',import.meta.url);await mkdir(out,{recursive:true});
const cases=[];
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const b=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{});
 const held=new Map(),errors=[];const p=await b.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(`${origin}/archive/`);await p.waitForSelector('[data-preview-state="ready"]');
  const entries=await p.locator('[data-archive-item]').evaluateAll(els=>els.slice(0,5).map(el=>({cover:el.dataset.cover,title:el.dataset.title,href:el.dataset.href})));
  const first=entries[1],second=entries[2],failed=entries[3];
  const delayOnce=new Set([first.cover,second.cover]);
  await p.route('**/covers/posts/*.svg',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path===failed.cover){await route.fulfill({status:404,body:'missing cover'});return;}
   if(delayOnce.delete(path)){await new Promise(resolve=>held.set(path,resolve));}
   try{await route.continue();}catch{/* Navigation may cancel a deliberately held request. */}
  });
  const select=async i=>p.locator('[data-archive-item]').nth(i).locator('.entry-title-link').focus();
  await select(1);await p.waitForSelector('[data-preview-state="loading"]');
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('[data-preview-image]')).opacity==='0');
  assert.equal(await p.locator('[data-preview-title]').textContent(),first.title);
  const height=await p.locator('.inspector-cover').evaluate(el=>el.getBoundingClientRect().height);
  assert(height>150,'loading reserves the cover frame');
  await select(2);await p.waitForFunction(title=>document.querySelector('[data-preview-title]').textContent===title,second.title);
  // Wait for requests rather than a guessed sleep, then complete the obsolete request first.
  const waitHeld=async path=>{for(let i=0;i<100&&!held.has(path);i++)await new Promise(r=>setTimeout(r,20));assert(held.has(path),`request not observed: ${path}`);};
  await waitHeld(first.cover);await waitHeld(second.cover);held.get(first.cover)();held.delete(first.cover);
  await p.waitForTimeout(200);assert.equal(await p.locator('[data-archive-preview]').getAttribute('data-preview-state'),'loading');
  assert.equal(await p.locator('[data-preview-title]').textContent(),second.title);
  await p.screenshot({path:new URL(`${engine}-loading.png`,out).pathname});
  held.get(second.cover)();held.delete(second.cover);await p.waitForSelector('[data-preview-state="ready"]');
  assert.equal(await p.locator('[data-preview-image]').getAttribute('src'),second.cover);
  await select(3);await p.waitForSelector('[data-preview-state="error"]');
  assert.equal(await p.locator('[data-archive-preview]').getAttribute('aria-busy'),'false');
  assert(await p.locator('[data-preview-fallback]').isVisible());assert(!await p.locator('.inspector-cover').isVisible());
  assert.equal(await p.locator('.inspector-read').getAttribute('href'),failed.href);
  await p.screenshot({path:new URL(`${engine}-error.png`,out).pathname});
  await select(0);await p.waitForSelector('[data-preview-state="ready"]');assert(!await p.locator('[data-preview-fallback]').isVisible());assert(await p.locator('.inspector-cover').isVisible());
  await p.locator('.nav-link[href="/"]').click();await p.waitForURL(origin+'/');await p.goBack();await p.waitForSelector('[data-archive-ready]');await select(2);await p.waitForSelector('[data-preview-state="ready"]');
  assert.equal(await p.locator('[data-preview-title]').textContent(),second.title);assert.deepEqual(errors,[]);
  cases.push({engine,checks:['Reserved-size pending frame hides stale image','Obsolete decode does not reveal pending new image','404 has text fallback and working article link','Next selection recovers','Client Back rebinds'],errors});
 }finally{for(const release of held.values())release();await b.close();}
}
await writeFile(new URL('verification.json',out),JSON.stringify({cases,scope:'Local browser engines with controlled image network delays and 404; not real mobile networks'},null,2));console.log('Archive preview slow loading, races, failure and Back passed in three engines');
