import {chromium,webkit,firefox} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322'
const phase=process.env.TEST_PHASE||'current'
const out=new URL('../artifacts/chip-reading-anchor/',import.meta.url)
await mkdir(out,{recursive:true})
const cases=[]
for(const [engine,type] of Object.entries({chromium,webkit,firefox})){
 const browser=await type.launch(engine==='chromium'&&!process.env.CI?{channel:'chrome'}:{})
 try{for(const scale of [1,2])for(const offset of [0,280]){
  const page=await browser.newPage({viewport:{width:390,height:844}})
  let release;const gate=new Promise(resolve=>{release=resolve});let held=false
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>{
   Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:false,effectiveType:'4g'}})
   Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,value:8});Object.defineProperty(navigator,'deviceMemory',{configurable:true,value:8})
  })
  await page.route('**/*chip-preview*.js',async route=>{held=true;await gate;try{await route.abort()}catch{/* Disposing a fixture can cancel its held request. */}})
  try{
   // Keep navigation independent of the deliberately held module request.
   await page.goto(origin+'/silicon/',{waitUntil:'domcontentloaded'})
   await page.evaluate(scale=>document.documentElement.style.fontSize=16*scale+'px',scale)
   for(let n=0;n<100&&!held;n++)await new Promise(r=>setTimeout(r,25));assert(held)
   await page.locator('.read-notes').scrollIntoViewIfNeeded();await page.locator('.read-notes').click();await page.waitForURL('**/silicon/#topics')
   await page.evaluate(offset=>{window.scrollBy({top:offset,behavior:'instant'});document.querySelector('.silicon-reading').focus({preventScroll:true})},offset)
   await page.waitForTimeout(100)
   const state=()=>page.evaluate(()=>({top:document.querySelector('#topics').getBoundingClientRect().top,focus:document.activeElement?.getAttribute('href'),scroll:scrollY,hash:location.hash,journey:document.querySelector('.journey').getBoundingClientRect().height}))
   const before=await state();release()
   await page.waitForSelector('.stage[data-boot="failed"]');await page.waitForTimeout(150)
   const after=await state()
   cases.push({engine,scale,offset,before,after,delta:after.top-before.top,errors})
   if(phase!=='before'){
    assert(Math.abs(after.top-before.top)<=2,`${engine} ${scale}/${offset}: reading anchor shifted ${after.top-before.top}px`)
    assert.equal(after.focus,before.focus);assert.equal(after.hash,before.hash)
   }
   assert.deepEqual(errors,[])
  }finally{release();await page.close()}
 }}finally{await browser.close()}
}
await writeFile(new URL(`${phase}.json`,out),JSON.stringify({cases,scope:'Real delayed and aborted scene-module request while user enters/scrolls notes, local engines and CSS font scaling. Not real mobile networks.'},null,2))
console.log(JSON.stringify(cases.map(({engine,scale,offset,delta})=>({engine,scale,offset,delta}))))
