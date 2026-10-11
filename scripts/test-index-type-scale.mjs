import {chromium,webkit,firefox} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322';
const out=new URL('../artifacts/index-type-scale/',import.meta.url);await mkdir(out,{recursive:true});
const cases=[];
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const b=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{});
 try{
 const p=await b.newPage({reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/series/');const details=await p.locator('.path-copy h2 a').evaluateAll(nodes=>nodes.map(el=>el.getAttribute('href')));
 await p.goto(origin+'/tags/');const topic=await p.locator('[data-tag-item]').first().getAttribute('href');const category=await p.locator('#categories a').first().getAttribute('href');
 for(const route of ['/series/',...details,'/map/','/archive/','/','/tags/',topic,category])for(const width of [320,390,1440])for(const scale of [1,2]){
  await p.setViewportSize({width,height:1000});await p.goto(origin+route);await p.evaluate(()=>document.fonts.ready);
  await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,16*scale);
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${engine} ${route} ${width} ${scale}: page overflow`);
  const selector=route==='/'?'.home .list h3':route==='/tags/'?'.term-flow a':(route===topic||route===category)?'.topic-posts h2 a':route==='/archive/'?'.entry-title-link':route==='/map/'?(width<=720?'.tree-post-copy strong':'.map-inspector h2'):(route==='/series/'?'.path-chapters a':'.route-chapter h3 a');
  const expected=(route==='/'?(width<=700?20:24):route==='/tags/'?(width<=700?18:20):(route===topic||route===category)?(width<=700?20:24):route==='/archive/'?(width<=700?20:22):route==='/map/'?(width<=720?16:22):(route==='/series/'?16:(width<=700?21:26)))*scale;
  await p.waitForFunction(({selector,expected})=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)===expected,{selector,expected});
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${engine} ${route} ${width} ${scale}: settled page overflow`);
  const font=await p.locator(selector).first().evaluate(el=>{const c=getComputedStyle(el);return {size:parseFloat(c.fontSize),weight:c.fontWeight,family:c.fontFamily};});
  assert(font.family.includes('Helvetica Neue'),`${selector}: inconsistent font`);assert.equal(font.weight,'400');
  assert.equal(font.size,expected,`${engine} ${route} ${width}: text scaling`);
  if(route==='/map/'&&width>720)assert.equal(await p.locator('.article-label').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)),11.5,'SVG graph font must not be doubled independently of its geometry');
  const boxes=await p.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width).map(n=>({scroll:n.scrollWidth,width:n.clientWidth,clamp:getComputedStyle(n).webkitLineClamp})));
  assert(boxes.every(x=>x.width===0||x.scroll<=x.width+1),`${engine} ${route} ${width} ${scale}: clipped text`);
  if(route==='/'||route===topic||route===category){
   const copies=route==='/'?['.home .row-desc','.home .feature-desc']:['.topic-posts article > p'];
   for(const selector of copies){
    await p.waitForFunction(({selector,size})=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)===size,{selector,size:15*scale});
    assert.equal(await p.locator(selector).first().evaluate(el=>getComputedStyle(el).webkitLineClamp),'none');
   }
  }
  if(route==='/archive/'){
   const copy=p.locator('.entry-copy > p').first();
   await p.waitForFunction(size=>parseFloat(getComputedStyle(document.querySelector('.entry-copy > p')).fontSize)===size,15*scale);
   assert.equal(await copy.evaluate(el=>getComputedStyle(el).webkitLineClamp),'none','Short summaries should not be cut mid-sentence');
   assert((await copy.evaluate(el=>getComputedStyle(el).fontFamily)).includes('Helvetica Neue'));
   await p.locator('.archive-tools').evaluate(el=>{el.open=true;});
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Opened archive controls overflow');
   await p.locator('[data-density="compact"]').click();
   assert.equal(await p.locator('[data-archive]').getAttribute('data-archive-density'),'compact');assert(!await copy.isVisible());
   await p.locator('[data-density="editorial"]').click();assert(await copy.isVisible());
   await p.waitForFunction(({selector,expected})=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)===expected,{selector,expected});
   await p.locator('.archive-tools').evaluate(el=>{el.open=false;});
  }
  if(route==='/series/'){
   const numbers=await p.locator('.path-number,.path-chapters li > span').evaluateAll(nodes=>nodes.map(n=>{const r=document.createRange();r.selectNodeContents(n);const b=n.getBoundingClientRect();const ink=r.getBoundingClientRect();return {width:b.width,ink:ink.width,nowrap:getComputedStyle(n).whiteSpace,lines:r.getClientRects().length};}));
   assert(numbers.every(x=>x.nowrap==='nowrap'&&x.ink<=x.width+1&&x.lines===1),'Path number wraps or enters title');
  }
  if(engine==='chromium'&&width===390&&['/series/','/map/','/archive/','/','/tags/'].includes(route))await p.screenshot({path:new URL(`${route==='/'?'home':route.slice(1,-1)}-${scale===1?'after':'large-text'}.png`,out).pathname});
  cases.push({engine,route,width,scale,font,overflow:false});
 }
 assert.deepEqual(errors,[]);await p.close();
 }finally{await b.close();}
}
await writeFile(new URL('verification.json',out),JSON.stringify({cases,scope:'Local engines, CSS root-font scaling at 100%/200%; not OS accessibility text settings or physical-device proof',checks:['Native regular-weight note typography across home, topics, series, map and archive reading entries','Series mobile chapters at 16px default','Actual computed font sizes double with root text preference','No horizontal page/text overflow','Single-line series numbers stay within their rail','SVG graph labels retain their existing geometry','Archive 15px full summaries scale with text; density switch and expanded controls remain usable']},null,2));
console.log(`${cases.length} Index typography and text-scale cases passed`);
