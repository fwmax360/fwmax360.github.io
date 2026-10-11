import {chromium,webkit,firefox} from '@playwright/test';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {wrapTitle} from './cover-title.mjs';
const out=new URL('../artifacts/cover-layout/',import.meta.url);await mkdir(out,{recursive:true});
const names=(await readdir(new URL('../public/covers/posts/',import.meta.url))).filter(n=>n.endsWith('.svg'));
const fixtures=['W'.repeat(64),'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(3),'深入理解可信执行环境与启动链'.repeat(5),'TEE、XBL 与 ABL：从启动链到可信执行环境'];
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const rows=[];
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const b=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{});const p=await b.newPage({viewport:{width:1200,height:630}});
 try {for(const name of [...names,...fixtures.map((_,i)=>`fixture-${i}`)]){
  let svg;
  if(name.startsWith('fixture-')){const r=wrapTitle(fixtures[Number(name.slice(8))]);svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><text class="sans" font-family="-apple-system,BlinkMacSystemFont,Helvetica Neue,PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif" font-size="${r.fontSize}" font-weight="500">${r.lines.map((s,i)=>`<tspan x="72" y="${202+i*r.lineHeight}">${xml(s)}</tspan>`).join('')}</text></svg>`;}
  else svg=await readFile(new URL(`../public/covers/posts/${name}`,import.meta.url),'utf8');
  await p.setContent(svg);await p.evaluate(()=>document.fonts.ready);
  const measured=await p.evaluate(()=>[...document.querySelectorAll('text.sans tspan')].map(el=>{const r=el.getBBox();return {text:el.textContent,left:r.x,right:r.x+r.width,top:r.y,bottom:r.y+r.height}}));
  const tags=await p.evaluate(()=>[...document.querySelectorAll('text.chip')].map(el=>{const r=el.getBBox();const container=el.previousElementSibling.previousElementSibling.getBBox();return {text:el.textContent,right:r.x+r.width,limit:container.x+container.width-8}}));
  const failures=[...measured.filter(m=>m.right>804||m.left<71||m.top<150||m.bottom>408),...tags.filter(t=>t.right>t.limit)];rows.push({engine,name,measured,tags,failures});
 }}finally{await b.close();}
}
await writeFile(new URL('verification.json',out),JSON.stringify({cases:rows.length,rows,scope:'Actual SVG glyph geometry in local engines with available system fonts, not every operating system font'},null,2));
const failed=rows.filter(r=>r.failures.length);if(failed.length)console.log(JSON.stringify(failed,null,2));assert.equal(failed.length,0,'Cover title or tag exceeds its reserved bounds');console.log(`${rows.length} actual SVG title layout cases passed`);
