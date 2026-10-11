import {chromium,webkit,firefox} from '@playwright/test';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322';
const out=new URL('../artifacts/cover-editorial/',import.meta.url);await mkdir(out,{recursive:true});
const covers=(await readdir(new URL('../public/covers/posts/',import.meta.url))).filter(n=>n.endsWith('.svg'));
for(const name of covers){
 const svg=await readFile(new URL(`../public/covers/posts/${name}`,import.meta.url),'utf8');
 assert(!/ARTICLE_COVER|STANDALONE|BASE_|>SEQ |>CRC |>TID |0x[0-9A-Fa-f]{4,}/.test(svg),`fabricated UI metadata ${name}`);
 assert(svg.includes('sleep4r / Notes')&&svg.includes('Concept sketch'),`identity/sketch label ${name}`);
 assert(svg.includes('id="wash"')&&svg.includes('stop-opacity="0.64"'),`color missing ${name}`);
 assert(!svg.includes('font-weight="760"'),`heavy title ${name}`);
 assert(/<text class="sans" font-size="\d+" font-weight="400"/.test(svg),`regular cover title ${name}`);
 assert(svg.includes("'Helvetica Neue', 'PingFang SC'"),`cover font ${name}`);
}
const cases=[];
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const b=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{});
 try {for(const width of [390,1440]){
  const p=await b.newPage({viewport:{width,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`${origin}/archive/`);await p.evaluate(()=>document.fonts.ready);
  const row=p.locator('[data-post-id="android-vpn-capture"]');await row.scrollIntoViewIfNeeded();
  const title=row.locator('.entry-title-link');assert.equal(await title.evaluate(el=>getComputedStyle(el).fontWeight),'400');
  assert((await title.evaluate(el=>getComputedStyle(el).fontFamily)).includes('-apple-system'));
  if(width>1000){await title.hover();await p.locator('[data-preview-image]').evaluate(img=>img.decode());assert.equal(await p.locator('[data-preview-image]').getAttribute('src'),await row.getAttribute('data-cover'));
   assert.equal(await p.locator('[data-preview-image]').evaluate(img=>getComputedStyle(img).filter),'none');}
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${engine} ${width} overflow`);
  await p.screenshot({path:new URL(`${engine}-${width}.png`,out).pathname});assert.deepEqual(errors,[]);
  cases.push({engine,width,titleWeight:400,overflow:false,errors});await p.close();
 }}finally{await b.close();}
}
await writeFile(new URL('verification.json',out),JSON.stringify({covers:covers.length,cases,limits:['Browser engines in local automation; not physical devices or human visual acceptance','Concept illustrations are decorative, not article measurements']},null,2));
console.log(`${covers.length} cover assets and ${cases.length} browser/viewport cases passed`);
