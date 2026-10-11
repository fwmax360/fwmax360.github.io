import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {INPUT_SCOPE,digest,verifyBuild} from './lib/release-inputs.mjs';
import {resolve} from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname),out=resolve(root,'artifacts/release-check');await mkdir(out,{recursive:true});
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4322';const gpu=process.argv.includes('--include-gpu');
const report={snapshotScope:INPUT_SCOPE,startedAt:new Date().toISOString(),origin,gpu,checks:[],limits:['Local production build and installed browser engines, not deployed CI/HTTP routing or physical device acceptance','Exit status is evidence for each named test scope, not human aesthetic acceptance']};
const save=()=>writeFile(resolve(out,'verification.json'),JSON.stringify(report,null,2)+'\n');
try{
 const verified=await verifyBuild(root),before=verified.inputs,builtBefore=verified.build;report.source=before;report.build=builtBefore;report.provenance={stampHash:verified.stampHash,startedAt:verified.stamp.startedAt,finishedAt:verified.stamp.finishedAt,runtime:verified.stamp.runtime};
 report.preview=[];
 const queue=Object.entries(builtBefore.files);
 await Promise.all(Array.from({length:4},async()=>{
  while(queue.length){
   const [file,built]=queue.shift();
   const relative=file.slice('dist/'.length),parts=relative.split('/');
   if(parts.at(-1)==='index.html')parts.pop();
   const url='/'+parts.map(encodeURIComponent).join('/')+(relative.endsWith('index.html')&&parts.length?'/':'');
   const response=await fetch(origin+url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error(`Preview ${url}: HTTP${response.status}`);
   const served=digest(Buffer.from(await response.arrayBuffer()));
   if(served!==built)throw new Error(`Preview differs from dist: ${url}`);
   report.preview.push({url,sha256:built});
  }
 }));
 report.preview.sort((a,b)=>a.url.localeCompare(b.url));
 console.log(`Preview matches all ${report.preview.length} build files`);
 const tests=['check','test:build-inputs','covers:check','test:publication','test:chip-quality','test:archive-state','test:map-reading-state','test:cover-title','test:quality','test:archive','test:archive-preview-loading','test:index-type-scale','test:type-hierarchy','test:series','test:map','test:map-reading-return','test:map-input-stress','test:reader','test:note-hover','test:note-preview-loading','test:note-color-coherence','test:note-polish','test:note-preview-placement','test:navigation-glow','test:taxonomy','test:about','test:utility-open','test:native-nav','test:home-reading-return','test:home-static-entry','test:fonts','test:article-font-budget','test:style-boundaries','test:cover-editorial','test:cover-layout','test:cross-browser','test:chip-startup','test:silicon-static-reading','test:chip-reading-anchor','test:chip-journey',...(gpu?['test:chip-journey-gpu','test:chip-preview','test:silicon','test:silicon-mobile-reading','test:chip-cross-browser','test:chip-antialias','test:chip-boot-compat','test:chip-early-loss','test:chip-lifecycle','test:chip-runtime-retry']:[])];
 for(const name of tests){const started=Date.now(),log=resolve(out,name.replaceAll(':','-')+'.log');const stream=createWriteStream(log);console.log(`Running ${name}`);
  const code=await new Promise((res,rej)=>{const child=spawn('npm',['run',name],{cwd:root,env:{...process.env,PREVIEW_URL:origin},stdio:['ignore','pipe','pipe']});child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});child.once('error',rej);child.once('exit',(code,signal)=>res({code,signal}));});await new Promise(resolve=>stream.end(resolve));
  report.checks.push({name,...code,elapsedMs:Date.now()-started,log});await save();if(code.code!==0)throw new Error(`${name} failed; inspect ${log}`);console.log(`Passed ${name}`);
 }
 const linksLog=resolve(out,'internal-links.log');const links=await new Promise((res,rej)=>{const child=spawn('python3',['scripts/check-internal-links.py'],{cwd:root});let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);child.once('error',rej);child.once('exit',code=>res({code,output}));});await writeFile(linksLog,links.output);report.checks.push({name:'internal-links',code:links.code,log:linksLog});if(links.code!==0)throw new Error('Internal links failed');
 const verifiedAfter=await verifyBuild(root);if(verifiedAfter.stampHash!==verified.stampHash)throw new Error('Build stamp changed during verification');
 const after=verifiedAfter.inputs;if(after.hash!==before.hash)throw new Error('Source changed during verification; rerun against one immutable state');
 const builtAfter=verifiedAfter.build;if(builtAfter.hash!==builtBefore.hash)throw new Error('Build output changed during verification');
 report.sourceAfterHash=after.hash;report.buildAfterHash=builtAfter.hash;report.status='passed-local-scope';report.finishedAt=new Date().toISOString();await save();console.log(`Local release checks passed: ${report.checks.length} commands`);
}catch(error){report.status='failed';report.error=error.message;report.finishedAt=new Date().toISOString();await save();console.error(error.message);process.exitCode=1;}
