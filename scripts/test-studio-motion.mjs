import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322';
const routes = ['/', '/archive/', '/series/', '/tags/', '/map/', '/about/'];
const checks = [];
await mkdir('artifacts/studio-motion', { recursive: true });
for (const [engine, type] of Object.entries({chromium, firefox, webkit})) {
 const browser = await type.launch(engine === 'chromium' && !process.env.CI ? {channel:'chrome'} : {});
 try {
  const page = await browser.newPage({viewport:{width:390,height:900}});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  for (const route of routes) {
   await page.goto(origin+route);
   await page.waitForSelector('[data-studio-light="running"]');
   assert.equal(await page.locator('[data-studio-light]').count(),1);
   const light=page.locator('[data-studio-light]');
   const animation=await light.evaluate(e=>({name:getComputedStyle(e,'::before').animationName,duration:getComputedStyle(e,'::before').animationDuration,state:getComputedStyle(e,'::before').animationPlayState}));
   assert.deepEqual(animation,{name:'studio-title-light',duration:'22s',state:'running'});
   const before=await light.evaluate(e=>e.getAnimations({subtree:true}).find(a=>a.animationName==='studio-title-light').currentTime);
   await page.waitForTimeout(120);
   const after=await light.evaluate(e=>e.getAnimations({subtree:true}).find(a=>a.animationName==='studio-title-light').currentTime);
   assert(after>before,`${engine} ${route}: actual light clock moves`);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('.footer').scrollIntoViewIfNeeded();
   await page.waitForSelector('[data-studio-light="paused"]');
   await page.waitForTimeout(100);
   const stopped=await light.evaluate(e=>e.getAnimations({subtree:true}).find(a=>a.animationName==='studio-title-light').currentTime);
   await page.waitForTimeout(120);
   assert.equal(await light.evaluate(e=>e.getAnimations({subtree:true}).find(a=>a.animationName==='studio-title-light').currentTime),stopped,'Offscreen clock frozen');
   checks.push({engine,route,normal:true,offscreenPaused:true});
  }
  const toggle=page.locator('[data-studio-light-toggle]');
  await toggle.click(); assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  await page.goto(origin+'/');
  await page.waitForSelector('[data-studio-light="paused"]');
  assert.equal(await toggle.getAttribute('aria-pressed'),'false','Pause preference survives navigation');
  await page.locator('.footer').scrollIntoViewIfNeeded(); await toggle.click();
  await page.locator('.research-opening').scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-studio-light="running"]');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>document.querySelector('[data-studio-light]').dataset.studioLight==='paused');
  assert.equal(await lightName(page),'none');
  assert(!(await toggle.isVisible()));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForSelector('[data-studio-light="running"]');
  // Real client navigation must replace, not accumulate, the enhancement.
  await page.setViewportSize({width:1440,height:900});
  await page.locator('.nav-link[href="/archive"]').click(); await page.waitForURL(/\/archive\/?$/);
  await page.waitForSelector('[data-studio-light="running"]');
  assert.equal(await page.locator('[data-studio-light]').count(),1);
  await page.goto(origin+'/posts/abl-android-handoff/');
  assert.equal(await page.locator('[data-studio-light]').count(),0,'Article has no ambient title animation');
  assert(!(await toggle.isVisible()));
  assert.deepEqual(errors,[]);
  const nojs=await browser.newPage({javaScriptEnabled:false});await nojs.goto(origin);
  assert.equal(await nojs.locator('[data-studio-light]').count(),0);
  assert(!(await nojs.locator('[data-studio-light-toggle]').isVisible()));
  const low=await browser.newPage();await low.addInitScript(()=>Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2}));await low.goto(origin);
  await low.waitForFunction(()=>document.documentElement.dataset.motion==='off');
  assert.equal(await low.locator('.research-opening').evaluate(e=>getComputedStyle(e,'::before').animationName),'none');
  checks.push({engine,pausePreference:true,liveReducedMotion:true,clientNavigation:true,articleStatic:true,noJavaScript:true,lowPower:true});
 } finally { await browser.close(); }
}
async function lightName(page) {return page.locator('[data-studio-light]').evaluate(e=>getComputedStyle(e,'::before').animationName)}
await writeFile('artifacts/studio-motion/verification.json',JSON.stringify({checks},null,2));
console.log(`${checks.length} studio motion cases passed in 3 engines; single light, clock, offscreen pause, preferences, reduced motion, low-power, navigation and static reading.`);
