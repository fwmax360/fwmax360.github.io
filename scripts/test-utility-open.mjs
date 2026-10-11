import {publishedStats} from './lib/published-stats.mjs';
import {chromium,webkit,firefox} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322';const out=new URL('../artifacts/utility-open/',import.meta.url);await mkdir(out,{recursive:true});const results=[];
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const b=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{});const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{window.copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.copyFailure)throw new Error('fixture: clipboard denied');window.copied.push(value)}}});});
 try{const published=await publishedStats(p,origin);
  for(const path of ['/rss/','/404.html'])for(const width of [320,390,768,1440]){
   await p.setViewportSize({width,height:1000});await p.goto(origin+path);await p.evaluate(()=>document.fonts.ready);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${engine} ${path} ${width}`);
   assert.equal(await p.locator('.feed-box,.nf-art').count(),0);assert.equal(await p.locator('link[href*="site-editorial"]').count(),0);
   if(width===390||width===1440)await p.screenshot({path:new URL(`${engine}-${path.includes('rss')?'rss':'404'}-${width}.png`,out).pathname});
  }
  assert((await p.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'));
  const search=p.locator('.missing-page [data-search-open]');await search.click();await p.waitForSelector('[data-search][open]');await p.locator('[data-search-input]').fill('Android');await p.waitForSelector('.search-item');await p.keyboard.press('Escape');assert(await search.evaluate(el=>document.activeElement===el));
  await p.goto(origin+'/rss/');const copy=p.locator('[data-copy-feed]');await copy.click();const url=await copy.getAttribute('data-feed-url');assert.deepEqual(await p.evaluate(()=>window.copied),[url]);assert.equal(url,url.trim());assert((await p.locator('[data-feed-status]').textContent()).includes('已复制'));
  await p.evaluate(()=>window.copyFailure=true);await copy.click();assert((await p.locator('[data-feed-status]').textContent()).includes('手动复制'));assert(await copy.isEnabled());await p.evaluate(()=>window.copyFailure=false);
  const links=await p.locator('[data-rss-posts] a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));assert.equal(links.length,published.routes.length);assert(links.every(h=>h.startsWith('/posts/')&&!h.includes('silicon-trust-boundary')));
  const xml=await (await p.request.get(origin+'/rss.xml')).text();const feedLinks=await p.evaluate(xml=>[...new DOMParser().parseFromString(xml,'text/xml').querySelectorAll('item > link')].map(el=>new URL(el.textContent).pathname),xml);assert.deepEqual(links,feedLinks);
  await p.locator('[data-rss-posts] a').first().click();await p.waitForURL('**/posts/**');await p.goBack();await copy.waitFor({state:'visible'});await copy.click();assert.equal(await p.evaluate(()=>window.copied.length),2,'Single listener after Back');
  const noJs=await b.newPage({javaScriptEnabled:false,viewport:{width:390,height:1000}});for(const path of ['/rss/','/404.html']){await noJs.goto(origin+path);assert(!await noJs.locator('[data-search-open]').first().isVisible());if(path.includes('rss')){assert(!await noJs.locator('[data-copy-feed]').isVisible());assert(await noJs.locator('.feed-address').isVisible());assert.equal(await noJs.locator('[data-rss-posts] a').count(),published.routes.length);}else assert(await noJs.locator('.utility-actions a[href="/archive/"]').isVisible());}await noJs.close();
  assert.deepEqual(errors,[]);results.push({engine,widths:[320,390,768,1440],checks:['Open layout no overflow','404 noindex and keyboard search','Exact canonical clipboard value, denied fallback, single Back listener','All published internal article links match RSS XML','No-JS useful links and no inert copy/search actions'],errors});
 }finally{await b.close();}
}
await writeFile(new URL('verification.json',out),JSON.stringify({results,scope:'Local three engines and viewport emulation; clipboard stub tests UI state, not OS clipboard permissions; 404.html fixture does not verify deployed HTTP404 routing'},null,2));console.log('RSS and 404 layouts, feed contents, copy/failure, search, Back and no-JS passed');
