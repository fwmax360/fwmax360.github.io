import {chromium,webkit,firefox} from '@playwright/test'
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322';const out=new URL('../artifacts/note-polish/',import.meta.url);await mkdir(out,{recursive:true});const results=[]
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const browser=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{});
 try{const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(origin+'/archive/');await page.waitForSelector('[data-archive-ready]');await page.evaluate(()=>document.fonts.ready);
 const target=page.locator('[data-archive-item]').filter({has:page.locator('a[href="/posts/android-vpn-capture/"]')}).first();await target.scrollIntoViewIfNeeded();await target.locator('.entry-title-link').hover();await page.waitForTimeout(300);
 const styles=await target.evaluate(el=>{const row=el.querySelector('.archive-entry'),title=el.querySelector('.entry-title-link'),preview=document.querySelector('[data-archive-preview]');return {accent:getComputedStyle(row).getPropertyValue('--note-color').trim(),preview:getComputedStyle(preview).getPropertyValue('--preview-color').trim(),font:getComputedStyle(title).fontFamily,weight:getComputedStyle(title).fontWeight,marker:getComputedStyle(row,'::before').opacity,color:getComputedStyle(title).color,border:getComputedStyle(preview.querySelector('.inspector-cover')).borderLeftColor}});
 assert.equal(styles.accent,styles.preview);assert.equal(styles.weight,'400');assert(styles.font.replace(/["']/g,'').startsWith('Helvetica Neue'));assert.equal(styles.marker,'1');assert.equal(styles.color,styles.border);assert.equal(await page.locator('[data-preview-image]').getAttribute('src'),await target.getAttribute('data-cover'));await page.screenshot({path:new URL(`${engine}-after.png`,out).pathname});results.push({engine,...styles});
 }finally{await browser.close()}
}
await writeFile(new URL('verification.json',out),JSON.stringify({results,scope:'Desktop browser engine checks; human typography preference remains subjective.'},null,2));console.log(JSON.stringify(results))
