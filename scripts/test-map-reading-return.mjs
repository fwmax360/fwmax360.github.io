import {publishedStats} from './lib/published-stats.mjs';
import{chromium,webkit,firefox}from '@playwright/test';
import assert from 'node:assert/strict';
import{mkdir,writeFile}from 'node:fs/promises';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322';
const out=new URL('../artifacts/map-reading-return/',import.meta.url);await mkdir(out,{recursive:true});
const cases=[];
for(const [engine,type]of Object.entries({chromium,webkit,firefox})){
 const b=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{});
 try{for(const width of [390,1440])for(const motion of ['reduce','no-preference']){
  const p=await b.newPage({viewport:{width,height:1000},reducedMotion:motion});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const published=await publishedStats(p,origin);
  const navigate=async(action,url)=>{await p.evaluate(()=>{window.__navFinished=false;document.addEventListener('astro:page-load',()=>window.__navFinished=true,{once:true});});await action();await p.waitForURL(url);await p.waitForFunction(()=>window.__navFinished);};
  await p.goto(origin+'/map/?fixture=keep#main');await p.locator('[data-map-ready]').waitFor();
  const base=await p.evaluate(()=>({index:history.state.index,length:history.length,url:location.href}));
  await p.locator('[data-map-query]').fill('VPN');await p.locator('[data-map-category]').selectOption('Android');
  const expected=await p.locator('[data-map-results]').innerText();assert(expected.startsWith('2 /'));
  assert.deepEqual(await p.evaluate(()=>({index:history.state.index,length:history.length,url:location.href})),base);
  const node=p.locator('.node--post:not(.is-filtered)').first();
  const link=width===390?p.locator('.tree-post:not([hidden]) a').first():node;
  const nodeId=await link.getAttribute(width===390?'data-map-node-ref':'data-node-id');
  const href=await link.getAttribute('href');await link.focus();await link.scrollIntoViewIfNeeded();
  await p.evaluate(()=>document.fonts.ready);
  await p.evaluate(()=>document.addEventListener('astro:before-preparation',()=>{window.__departure=scrollY;},{once:true}));
  await navigate(()=>link.click(),'**/posts/**');const departure=await p.evaluate(()=>window.__departure);
  await navigate(()=>p.goBack(),base.url);await p.waitForFunction(y=>Math.abs(scrollY-y)<8,departure,{timeout:5000});
  assert.equal(await p.locator('[data-map-query]').inputValue(),'VPN');assert.equal(await p.locator('[data-map-category]').inputValue(),'Android');assert.equal(await p.locator('[data-map-results]').innerText(),expected);
  assert(await p.locator(`[data-node-id="${nodeId}"]`).evaluate(el=>el.classList.contains('is-active')));
  assert.equal(await p.locator('[data-inspector-link]').getAttribute('href'),href);
  const restored=await p.evaluate(()=>scrollY);
  await navigate(()=>p.goForward(),'**/posts/**');await navigate(()=>p.goBack(),base.url);
  await p.reload();await p.locator('[data-map-ready]').waitFor();assert.equal(await p.locator('[data-map-query]').inputValue(),'VPN');assert.equal(await p.locator('[data-map-results]').innerText(),expected);
  await p.locator('[data-map-clear]').click();assert((await p.locator('[data-map-results]').innerText()).startsWith(`${published.routes.length} /`));assert.equal(await p.locator('[data-map-query]').inputValue(),'');
  const groups=p.locator('[data-tree-category]');await groups.evaluateAll(items=>items.forEach(el=>{el.open=false;}));await p.waitForTimeout(50);
  await navigate(()=>p.locator('.brand').click(),origin+'/');await navigate(()=>p.goBack(),base.url);assert.equal(await p.locator('[data-tree-category][open]').count(),0,'Native disclosure state lost');
  await p.locator('[data-map-query]').fill('no-matching-fixture-997');assert(await p.locator('[data-tree-empty]').isVisible());
  await navigate(()=>p.locator('.brand').click(),origin+'/');await navigate(()=>p.goBack(),base.url);assert(await p.locator('[data-tree-empty]').isVisible());assert.equal(await p.locator('.node--post:not(.is-filtered)').count(),0);
  await p.locator('[data-map-clear]').click();await navigate(()=>p.locator('.brand').click(),origin+'/');await navigate(()=>p.locator('.home a[href="/map/"]').first().click(),'**/map/');assert.equal(await p.locator('[data-map-query]').inputValue(),'');assert.equal(await p.locator('[data-map-category]').inputValue(),'');
  await p.evaluate(()=>history.replaceState({...history.state,blogKnowledgeMap:{version:1,query:null,category:'unknown',selection:'unknown',openCategories:['unknown',null]}},''));await p.reload();await p.locator('[data-map-ready]').waitFor();assert.equal(await p.locator('[data-map-query]').inputValue(),'');assert.equal(await p.locator('[data-map-category]').inputValue(),'');assert((await p.locator('[data-map-results]').innerText()).startsWith(`${published.routes.length} /`));
  assert.deepEqual(errors,[]);cases.push({engine,width,motion,expected,nodeId,href,departure,restored,errors});await p.close();
 }}finally{await b.close();}
}
await writeFile(new URL('verification.json',out),JSON.stringify({cases,checks:['History entry retains filters, selected node, reading position and native disclosure state','Back/Forward and reload restoration','Empty results survive return; reset restores all posts','Fresh client entry starts unfiltered','Invalid state normalizes without exceptions','Astro history index, length and unrelated URL preserved'],limits:['Local engines/viewports, not physical devices']},null,2));console.log('Map reading return: 12 engine/viewport/motion cases passed');
