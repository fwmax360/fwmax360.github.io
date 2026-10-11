import {publishedStats} from './lib/published-stats.mjs';
import{chromium,webkit,firefox}from '@playwright/test';
import assert from 'node:assert/strict';
import{mkdir,writeFile}from 'node:fs/promises';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322',out=new URL('../artifacts/map-input-stress/',import.meta.url);await mkdir(out,{recursive:true});
const cases=[];
for(const[engine,type]of Object.entries({chromium,webkit,firefox})){
 const b=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{});
 try{const p=await b.newPage({viewport:{width:390,height:1000},reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const published=await publishedStats(p,origin);
  const ready=()=>p.locator('[data-map-ready]').waitFor();
  const navigate=async(action,url)=>{await p.evaluate(()=>{window.__done=false;document.addEventListener('astro:page-load',()=>window.__done=true,{once:true});});await action();await p.waitForURL(url);await p.waitForFunction(()=>window.__done);};
  await p.goto(origin+'/');await navigate(()=>p.locator('.home a[href="/map/"]').first().click(),'**/map/');await ready();
  await p.evaluate(()=>{window.__historyWrites=0;const original=history.replaceState.bind(history);history.replaceState=(...args)=>{window.__historyWrites++;return original(...args);};});
  const aesCount=await p.locator('.node--post').evaluateAll(nodes=>nodes.filter(node=>(node.dataset.search??'').toLocaleLowerCase('zh-CN').includes('aes')).length);assert(aesCount>0);
  const burst=async(final)=>p.evaluate(last=>{const q=document.querySelector('[data-map-query]');for(let i=0;i<200;i++){q.value=i===199?last:`query-${i}`;q.dispatchEvent(new Event('input',{bubbles:true}));}},final);
  await burst('VPN');await p.waitForFunction(()=>history.state.blogKnowledgeMap?.query==='VPN');const writes=await p.evaluate(()=>window.__historyWrites);assert(writes<=5,`${engine}: ${writes} writes for one input burst`);assert((await p.locator('[data-map-results]').innerText()).startsWith('2 /'));
  // Popstate arrives before the debounce interval: latest memory state must win.
  await burst('AES');await navigate(()=>p.goBack(),origin+'/');await navigate(()=>p.goForward(),'**/map/');await ready();assert.equal(await p.locator('[data-map-query]').inputValue(),'AES');assert((await p.locator('[data-map-results]').innerText()).startsWith(`${aesCount} /`));
  await p.reload();await ready();assert.equal(await p.locator('[data-map-query]').inputValue(),'AES','Immediate reload after memory restore loses latest input');
  await burst('VPN');await p.reload();await ready();assert.equal(await p.locator('[data-map-query]').inputValue(),'VPN','Pagehide must flush latest pending query');
  // Simulate browser native quota rejection without disturbing the live filter.
  await p.evaluate(()=>{window.__originalReplace=history.replaceState.bind(history);history.replaceState=()=>{throw new DOMException('Synthetic history quota','SecurityError');};});
  await burst('AES');await p.waitForTimeout(250);assert.equal(await p.locator('[data-map-query]').inputValue(),'AES');assert((await p.locator('[data-map-results]').innerText()).startsWith(`${aesCount} /`));
  await p.evaluate(()=>history.replaceState=window.__originalReplace);await p.waitForFunction(()=>history.state.blogKnowledgeMap?.query==='AES',null,{timeout:4000});
  await p.locator('[data-map-clear]').click();assert((await p.locator('[data-map-results]').innerText()).startsWith(`${published.routes.length} /`));assert.deepEqual(errors,[]);
  await p.evaluate(()=>Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('Synthetic unavailable storage','SecurityError');}}));
  await burst('AES');await p.waitForFunction(()=>history.state.blogKnowledgeMap?.query==='AES');assert.equal(await p.locator('[data-map-query]').inputValue(),'AES');
  await navigate(()=>p.locator('.brand').click(),origin+'/');await navigate(()=>p.goBack(),'**/map/');assert.equal(await p.locator('[data-map-query]').inputValue(),'AES');
  await navigate(()=>p.locator('.brand').click(),origin+'/');await p.goto(origin+'/map/');await ready();assert.equal(await p.locator('[data-map-query]').inputValue(),'','Native fresh entry must not reuse a stale journal from index zero');
  assert.deepEqual(errors,[]);
  cases.push({engine,eventsPerBurst:200,coalescedWrites:writes,errors,checks:['Rapid input stores final value','Fast native Back/Forward restores pending state','Immediate reload flushes newest state','Synthetic native quota keeps filter usable and retries after release','Reset remains functional','Unavailable storage falls back to memory/history','Native fresh entry does not reuse old tab journal']});await p.close();
 }finally{await b.close();}
}
await writeFile(new URL('verification.json',out),JSON.stringify({cases,limits:['Local browser engines and synthetic burst/quota fixture, not OS Safari or physical-device performance']},null,2));console.log('Map input stress and history quota recovery passed in three engines');
