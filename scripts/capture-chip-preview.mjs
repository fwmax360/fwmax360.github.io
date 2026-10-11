import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
const output=new URL(`../artifacts/chip-preview/${process.env.CAPTURE_NAME||'chip-preview.mp4'}`,import.meta.url).pathname;
await mkdir(new URL('../artifacts/chip-preview/',import.meta.url),{recursive:true});
const encoder=spawn('ffmpeg',['-y','-f','image2pipe','-vcodec','mjpeg','-framerate','24','-i','pipe:0','-an','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',output],{stdio:['pipe','ignore','pipe']});
let encoderLog='';encoder.stderr.on('data',d=>encoderLog+=d);const finished=once(encoder,'close');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await page.goto(`${process.env.PREVIEW_URL||'http://127.0.0.1:4322'}/chip-preview/`);
 await page.waitForFunction(()=>window.chipPreview?.getState().ready);await page.evaluate(()=>document.fonts.ready);
 // 16 seconds: one second of context, fourteen seconds of continuous reveal, one second of hold.
 for(let frame=0;frame<384;frame++){
  const progress=Math.max(0,Math.min(1,(frame-24)/335));
  await page.evaluate(async p=>{window.chipPreview.setProgress(p);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},progress);
  const buffer=await page.screenshot({type:'jpeg',quality:95});
  if(!encoder.stdin.write(buffer))await once(encoder.stdin,'drain');
  if(frame%96===0)console.log(`Captured ${frame}/384 frames`);
 }
 encoder.stdin.end();const [code]=await finished;if(code!==0)throw Error(encoderLog);
 console.log(output);
}finally{await browser.close();if(!encoder.stdin.writableEnded)encoder.kill();}
