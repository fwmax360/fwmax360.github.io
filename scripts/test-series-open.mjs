import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PREVIEW_URL || 'http://127.0.0.1:4322';
const out=new URL('../artifacts/series-open/',import.meta.url);await mkdir(out,{recursive:true});
const b=await chromium.launch(process.env.CI?{}:{channel:'chrome'});const errors=[];const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
try {
 await p.goto(origin+'/series/');await p.evaluate(()=>document.fonts.ready);
 const paths=await p.locator('.path-entry').evaluateAll(items=>items.map(el=>({href:el.querySelector('h2 a').getAttribute('href'),title:el.querySelector('h2 a').textContent.replace('↗','').trim(),chapters:[...el.querySelectorAll('.path-chapters a')].map(a=>a.getAttribute('href'))})));
 assert(paths.length>0);assert.equal(new Set(paths.map(x=>x.href)).size,paths.length);
 const routes=['/series/',...paths.map(x=>x.href)];
 for(const route of routes){await p.goto(origin+route);await p.evaluate(()=>document.fonts.ready);assert.equal(await p.locator('h1').count(),1);assert.equal(await p.locator('link[href*="site-editorial"]').count(),0);for(const width of [320,390,640,700,768,1000,1280,1440]){await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}: ${route}`)}
 if(route!=='/series/'){const chapters=await p.locator('[data-series-post]').evaluateAll(items=>items.map(el=>({id:el.dataset.seriesPost,order:Number(el.dataset.seriesOrder),href:el.querySelector('h3 a').getAttribute('href')})));assert(chapters.length>0);assert.equal(new Set(chapters.map(x=>x.id)).size,chapters.length);const matching=paths.find(x=>x.href===route);assert.deepEqual(chapters.slice(0,3).map(x=>x.href),matching.chapters);assert(!chapters.some(x=>x.id.includes('silicon-trust-boundary')));}
 }
 for(const width of [390,1440]){await p.setViewportSize({width,height:1000});await p.goto(origin+'/series/');await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:new URL(`index-${width}.png`,out).pathname});await p.goto(origin+paths[0].href);await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:new URL(`detail-${width}.png`,out).pathname});}
 await p.goto(origin+'/series/');const first=p.locator('.path-copy h2 a').first();await first.focus();assert(await first.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));await first.click();await p.waitForURL(origin+paths[0].href);const article=p.locator('.route-chapter h3 a').first();await article.click();await p.waitForURL('**/posts/**');await p.goBack();await p.waitForSelector('.route-chapters');assert.equal(new URL(p.url()).pathname,new URL(origin+paths[0].href).pathname);
 const nojs=await b.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});await nojs.goto(origin+paths[0].href);assert(await nojs.locator('.route-chapter h3 a').first().isVisible());
 assert.deepEqual(errors,[]);const result={routes,viewports:[320,390,640,700,768,1000,1280,1440],checks:['Published series and unique chapters','Index preview matches detail chapter order','No legacy companion style dependency','Keyboard focus and client article navigation with Back','No-JS reading links','No horizontal overflow'],errors,scope:'Desktop Chromium; no real-device or Safari claim'};await writeFile(new URL('verification.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await b.close()}
