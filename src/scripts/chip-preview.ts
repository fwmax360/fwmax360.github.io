import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import type { ChipQuality } from '../lib/chip-quality';

export async function initChipExperience(quality: ChipQuality, signal?: AbortSignal) {
gsap.registerPlugin(ScrollTrigger);
const host = document.querySelector<HTMLElement>('.viewport')!;
const stage = document.querySelector<HTMLElement>('.stage')!;
const sceneStarted=performance.now();const sceneTimings:Record<string,number>={};
const checkpoint=(name:string)=>{sceneTimings[name]=Math.round((performance.now()-sceneStarted)*10)/10;stage.dataset.sceneTimings=JSON.stringify(sceneTimings);};
const slider = document.querySelector<HTMLInputElement>('#progress')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const number = document.querySelector<HTMLElement>('.phase-number')!;
const title = document.querySelector<HTMLElement>('.phase h2')!;
const description = document.querySelector<HTMLElement>('.phase-description')!;
const output = document.querySelector<HTMLOutputElement>('#percent')!;
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const abort = new AbortController();
const listen = (el: EventTarget, type: string, fn: EventListener) => el.addEventListener(type, fn, { signal: abort.signal });
const owned: (() => void)[] = [];
let released = false;
const release = () => { if(released)return;released=true;signal?.removeEventListener('abort', release); abort.abort(); delete stage.dataset.ready;stage.classList.remove('ready');Reflect.deleteProperty(window,'chipPreview'); for(const dispose of owned.splice(0).reverse()) { try { dispose(); } catch {} } };
let contextLost = () => false;
const ensureActive = () => { if(signal?.aborted||abort.signal.aborted||contextLost())throw new DOMException('Aborted','AbortError'); };
stage.dataset.taskYield=typeof globalThis.scheduler?.yield==='function'?'scheduler':'timer';
const yieldTask = async () => { if(globalThis.scheduler?.yield)await globalThis.scheduler.yield();else await new Promise<void>(resolve => setTimeout(resolve, 0)); ensureActive(); };
signal?.addEventListener('abort', release, { once: true });
const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
try {
await yieldTask();
let destroyed = false;
let renderer: THREE.WebGLRenderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
catch { document.querySelector('.fallback p')!.textContent = 'The static preview is available. Explore the topics below.'; slider.disabled = true; throw new Error('WebGL initialization failed'); }
contextLost = () => renderer.getContext().isContextLost();
// Register renderer first: reverse ownership disposal frees materials/targets while
// renderer properties still identify their GL resources, then retires the context.
owned.push(() => {
 renderer.setAnimationLoop(null);
 renderer.dispose();
 if(!renderer.getContext().isContextLost())renderer.forceContextLoss();
 renderer.domElement.remove();
});
owned.push(() => { resources.forEach(resource => resource.dispose()); resources.clear(); });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.dpr));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
listen(renderer.domElement,'webglcontextlost',(e)=>{
 e.preventDefault();destroyed=true;release();stage.dispatchEvent(new CustomEvent('chip:unavailable'));
});
host.appendChild(renderer.domElement);checkpoint('renderer');
await yieldTask();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const pmrem = new THREE.PMREMGenerator(renderer);owned.push(() => pmrem.dispose());
// A black photographic studio: reflections come from shaped softboxes,
// not an evenly illuminated room. The cards exist only in the environment map.
const studio = new THREE.Scene();studio.background = new THREE.Color(0x20242c);
const cards:THREE.Mesh[]=[];
function softbox(w:number,h:number,x:number,y:number,z:number,color:number,power:number){
 const geometry=new THREE.PlaneGeometry(w,h);
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=16;
 const c=canvas.getContext('2d')!,g=c.createLinearGradient(0,0,128,0);
 g.addColorStop(0,'#090909');g.addColorStop(.25,'#a0a0a0');g.addColorStop(.5,'#ffffff');g.addColorStop(.75,'#a0a0a0');g.addColorStop(1,'#090909');
 c.fillStyle=g;c.fillRect(0,0,128,16);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 const material=new THREE.MeshBasicMaterial({color,map,side:THREE.DoubleSide});material.color.multiplyScalar(power);
 const card=new THREE.Mesh(geometry,material);card.position.set(x,y,z);card.lookAt(0,0,0);studio.add(card);cards.push(card);owned.push(() => {geometry.dispose();map.dispose();material.dispose();});
}
softbox(3,11,-5,6,3,0xe1eaff,5);
softbox(10,4,-5,3,-9,0xe6edfa,3);
softbox(12,8,-3,8,-9,0xdce6f5,3);
softbox(9,6,1,0,10,0xb5c6df,2);
softbox(1.2,9,5,3,-3,0x9ebbe5,3);
softbox(7,2,0,7,-2,0xffffff,3.5);
softbox(2,6,-4,1,7,0xffffff,2.5);
softbox(1,5,6,0,5,0x9fadd8,1.8);
const env=pmrem.fromScene(studio,.035);scene.environment=env.texture;owned.push(() => env.dispose());
cards.forEach(c=>{c.geometry.dispose();(c.material as THREE.MeshBasicMaterial).map?.dispose();(c.material as THREE.Material).dispose();});pmrem.dispose();checkpoint('environment');
await yieldTask();
const key=new THREE.DirectionalLight(0xe9efff,1.8);key.position.set(-4,7,4);scene.add(key);
const rim=new THREE.DirectionalLight(0xb5c9ef,.7);rim.position.set(4,2,-3);scene.add(rim);
const fill=new THREE.HemisphereLight(0xaebbcf,0x020304,.12);scene.add(fill);
const assembly = new THREE.Group(); scene.add(assembly);
const mats = {
  body: new THREE.MeshStandardMaterial({ color: 0x454951, metalness: 0.96, roughness: 0.29 }),
  edge: new THREE.MeshStandardMaterial({ color: 0x8b94a0, metalness: 1, roughness: 0.2 }),
  board: new THREE.MeshStandardMaterial({ color: 0x10211f, metalness: 0.45, roughness: 0.38 }),
  gold: new THREE.MeshStandardMaterial({ color: 0x8f8b7d, metalness: 1, roughness: 0.24 }),
  die: new THREE.MeshPhysicalMaterial({ color: 0x537a83, metalness: 0.92, roughness: 0.24, clearcoat: 0.55, clearcoatRoughness: 0.2 }),
  black: new THREE.MeshStandardMaterial({ color: 0x13171e, metalness: 0.55, roughness: 0.34 }),
  trace: new THREE.MeshStandardMaterial({ color: 0x6f929a, metalness: 0.95, roughness: 0.3, emissive: 0x14262c, emissiveIntensity: 0.08 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x6a9ca9, metalness: 0.8, emissive: 0x347488, emissiveIntensity: 0.3, roughness: 0.28 }),
};
// Sub-pixel brushed grain breaks up plastic-looking, perfectly smooth highlights.
const grainData=new Uint8Array(256*256*4);let seed=17;
for(let y=0;y<256;y++)for(let x=0;x<256;x++){
 seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const value=175+(seed>>>28)*3+Math.round(Math.sin(y*2.1)*8),i=(y*256+x)*4;
 grainData[i]=grainData[i+1]=grainData[i+2]=value;grainData[i+3]=255;
}
const grain=new THREE.DataTexture(grainData,256,256);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.repeat.set(4,4);grain.needsUpdate=true;resources.add(grain);
mats.body.roughnessMap=grain;mats.edge.roughnessMap=grain;mats.gold.roughnessMap=grain;
// Fine, regular lithography-like detail is generated locally rather than a flat slab.
const waferCanvas=document.createElement('canvas');waferCanvas.width=1024;waferCanvas.height=1024;
const wafer=waferCanvas.getContext('2d')!;wafer.fillStyle='#35424b';wafer.fillRect(0,0,1024,1024);
// A fine routing texture, without a second competing grid of identical blocks.
wafer.fillStyle='#283a43';wafer.fillRect(0,0,1024,1024);
for(let k=0;k<128;k++){
 wafer.strokeStyle=k%8===0?'#536974':'#354d58';wafer.lineWidth=1;
 const v=4+k*8;wafer.beginPath();wafer.moveTo(v,8);wafer.lineTo(v,1016);wafer.stroke();
 wafer.beginPath();wafer.moveTo(8,v);wafer.lineTo(1016,v);wafer.stroke();
}
const waferTexture=new THREE.CanvasTexture(waferCanvas);waferTexture.colorSpace=THREE.SRGBColorSpace;waferTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());resources.add(waferTexture);
mats.die.map=waferTexture;
const bankMaterial=new THREE.MeshStandardMaterial({map:waferTexture,color:0x637b88,metalness:.85,roughness:.27});resources.add(bankMaterial);
Object.values(mats).forEach(m=>resources.add(m));
// Repeated contacts share an immutable exact-size template during construction.
// Merge copies carry transforms; retain each template until its last consumer is gone.
const roundedGeometries=new Map<string,RoundedBoxGeometry>();
const rounded = (parent: THREE.Object3D, x:number, y:number, z:number, w:number, h:number, d:number, mat:THREE.Material, radius=0.035) => {
  const r=Math.min(radius,h/3),key=`${w}|${h}|${d}|${r}`;
  let geo=roundedGeometries.get(key);
  if(!geo){geo=new RoundedBoxGeometry(w,h,d,2,r);roundedGeometries.set(key,geo);resources.add(geo);}
  const mesh=new THREE.Mesh(geo,mat); mesh.position.set(x,y,z); parent.add(mesh); return mesh;
};
checkpoint('materials');await yieldTask();
const layers=Array.from({length:5},()=>{ const g=new THREE.Group(); assembly.add(g); return g; });
const [base, substrate, interposer, silicon, lid]=layers;
silicon.userData.isDie=true;
const heights=[-0.4,-0.24,-0.08,0.12,0.38];
layers.forEach((g,i)=>{g.position.y=heights[i];g.userData.structure=i;});
rounded(base,0,0,0,3.8,.15,3.8,mats.black);
rounded(base,0,.085,0,3.72,.025,3.72,mats.gold,.008);
rounded(base,0,.101,0,3.58,.014,3.58,mats.black,.004);
// Hundreds of solder contacts are one instanced draw, not individual meshes.
const ballGeo=new THREE.SphereGeometry(.045,8,6);resources.add(ballGeo);
const balls=new THREE.InstancedMesh(ballGeo,mats.gold,225);const dummy=new THREE.Object3D();
for(let i=0;i<225;i++){dummy.position.set((i%15-7)*.23,-.14,(Math.floor(i/15)-7)*.23);dummy.updateMatrix();balls.setMatrixAt(i,dummy.matrix);}base.add(balls);
rounded(substrate,0,0,0,3.65,.12,3.65,mats.board);
rounded(interposer,0,0,0,3.22,.1,3.22,mats.black);
rounded(interposer,0,.056,0,3.12,.012,3.12,mats.body,.003);
rounded(silicon,0,0,0,2.63,.13,2.63,mats.black);
rounded(silicon,0,.075,0,2.38,.025,2.38,mats.gold,.005);
rounded(silicon,0,.1,0,2.32,.035,2.32,mats.die,.009);
// Asymmetric visual floorplan: different scales, buses, and shallow etched regions.
// This is intentionally not mapped to a real CPU, GPU, cache, or security partition.
const bankCanvas=document.createElement('canvas');bankCanvas.width=512;bankCanvas.height=512;
const bankCtx=bankCanvas.getContext('2d')!;bankCtx.fillStyle='#394951';bankCtx.fillRect(0,0,512,512);
for(let y=10;y<502;y+=8)for(let x=8;x<504;x+=14){
 bankCtx.fillStyle=(x+y)%5===0?'#82929b':'#586d76';bankCtx.fillRect(x,y,10,2);bankCtx.fillRect(x,y+3,2,3);
}
const bankTexture=new THREE.CanvasTexture(bankCanvas);bankTexture.colorSpace=THREE.SRGBColorSpace;bankTexture.anisotropy=waferTexture.anisotropy;resources.add(bankTexture);bankMaterial.map=bankTexture;
const regions=[
 [-.69,-.83,.73,.34],[-.69,-.4,.73,.36],[-.69,.08,.73,.44],[-.69,.67,.73,.59],
 [-.17,-.69,.21,.62],[-.17,.02,.21,.61],[-.17,.74,.21,.4],
 [.28,.38,.46,.3],[.83,.38,.42,.3],[.28,.8,.46,.44],[.83,.8,.42,.44],
 [.13,-.86,.24,.24],[.5,-.86,.38,.24],[.94,-.79,.19,.38],
];
regions.forEach(([x,z,w,d],i)=>{
 rounded(silicon,x,.128,z,w,.006,d,bankMaterial,.002);
 // Thin perimeter contacts instead of chunky blocks.
 for(let k=0;k<Math.floor(w/.045);k++){
  const px=x-w/2+.024+k*.045;
  rounded(silicon,px,.133,z-d/2+.012,.009,.002,.018,i%3===0?mats.gold:mats.trace,.0005);
 }
});
const core=rounded(silicon,.5,.13,-.26,.95,.009,.69,mats.die,.003);
for(let row=0;row<5;row++)for(let col=0;col<7;col++){
 const w=col%3===0?.065:.1;
 rounded(silicon,.1+col*.13,.137,-.5+row*.12,w,.003,row%2===0?.072:.045,(row+col)%7===0?mats.glow:mats.trace,.001);
}
const busPositions:number[]=[];
for(let i=0;i<18;i++){
 const z=-1.02+i*.115;
 busPositions.push(-.28,.14,z,-.23,.14,z,.01,.14,z,.06,.14,z);
}
const busGeometry=new THREE.BufferGeometry();busGeometry.setAttribute('position',new THREE.Float32BufferAttribute(busPositions,3));resources.add(busGeometry);
const busMaterial=new THREE.LineBasicMaterial({color:0x7f9ba6,transparent:true,opacity:.45});resources.add(busMaterial);silicon.add(new THREE.LineSegments(busGeometry,busMaterial));
// Routed traces with chamfered bends on two visible substrates.
for(const [li,extent] of [[1,1.7],[2,1.45]] as const){
 const positions:number[]=[];
 for(let side=0;side<4;side++)for(let i=0;i<22;i++){
  const offset=(i-10.5)*.133;const turn=.92+(i%4)*.09;
  const points=[[offset,extent],[offset,turn],[offset*.72,turn-.18],[offset*.72,.5]];
  const angle=side*Math.PI/2;
  for(let k=0;k<3;k++)for(const [x,z] of [points[k],points[k+1]]) positions.push(x*Math.cos(angle)-z*Math.sin(angle),.069,x*Math.sin(angle)+z*Math.cos(angle));
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));resources.add(geo);
 const mat=new THREE.LineBasicMaterial({color:li===1?0x45685e:0x727d89,transparent:true,opacity:.5});resources.add(mat);layers[li].add(new THREE.LineSegments(geo,mat));
}
// Decoupling components and copper pads around the package.
for(let side=0;side<4;side++)for(let i=0;i<12;i++){
 const a=side*Math.PI/2,x=(i-5.5)*.255,z=1.55;
 const m=rounded(substrate,x*Math.cos(a)-z*Math.sin(a),.09,x*Math.sin(a)+z*Math.cos(a),.14,.065,.085,mats.black,.01);m.rotation.y=-a;
}
rounded(lid,0,0,0,3.24,.24,3.24,mats.body,.07);
rounded(lid,0,-.125,0,3.32,.035,3.32,mats.edge,.008);
rounded(lid,0,.125,0,2.95,.015,2.95,mats.black,.004);
checkpoint('geometry');
// An etched package label is generated locally; all navigation remains HTML.
const labelCanvas=document.createElement('canvas');labelCanvas.width=1024;labelCanvas.height=1024;
const ctx=labelCanvas.getContext('2d')!;ctx.fillStyle='#3e4652';ctx.fillRect(0,0,1024,1024);ctx.fillStyle='#bcc5ca';ctx.font='500 144px sans-serif';ctx.fillText('S4',110,275);ctx.font='26px monospace';ctx.fillStyle='#7f949e';ctx.fillText('S I L I C O N   S T U D Y',115,345);ctx.fillText('SYSTEMS / SECURITY',115,850);ctx.strokeStyle='#53676d';ctx.lineWidth=2;ctx.strokeRect(115,470,190,190);ctx.strokeRect(130,485,160,160);ctx.beginPath();for(let i=0;i<8;i++){const v=140+i*20;ctx.moveTo(v,450);ctx.lineTo(v,470);ctx.moveTo(v,660);ctx.lineTo(v,680);}ctx.stroke();
const labelTex=new THREE.CanvasTexture(labelCanvas);labelTex.colorSpace=THREE.SRGBColorSpace;labelTex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());resources.add(labelTex);
const labelMat=new THREE.MeshStandardMaterial({map:labelTex,roughness:.33,metalness:.78,roughnessMap:grain});resources.add(labelMat);
const labelGeo=new THREE.PlaneGeometry(2.9,2.9);resources.add(labelGeo);const label=new THREE.Mesh(labelGeo,labelMat);label.rotation.x=-Math.PI/2;label.position.y=.136;lid.add(label);
// Technical guide lines clarify separation without pretending to depict an SoC architecture.
const guideGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.8,-1.4,-1.8),new THREE.Vector3(-1.8,2.7,-1.8),new THREE.Vector3(1.8,-1.4,1.8),new THREE.Vector3(1.8,2.7,1.8)]);resources.add(guideGeo);
const guideMat=new THREE.LineDashedMaterial({color:0x57766d,dashSize:.045,gapSize:.085,transparent:true,opacity:0});resources.add(guideMat);const guides=new THREE.LineSegments(guideGeo,guideMat);guides.computeLineDistances();assembly.add(guides);
await yieldTask();
// Merge static detail by material and layer, retaining precise raycast roots.
for(const layer of layers){
 const buckets=new Map<THREE.Material,THREE.Mesh[]>();
 for(const child of [...layer.children])if(child instanceof THREE.Mesh && child.geometry instanceof RoundedBoxGeometry && child!==core){const mat=child.material as THREE.Material;const list=buckets.get(mat)||[];list.push(child);buckets.set(mat,list);}
 for(const [material,meshes] of buckets){
  const copies:THREE.BufferGeometry[]=[];let chunkStarted=performance.now();
  for(const mesh of meshes){
   mesh.updateMatrix();const copy=mesh.geometry.clone().applyMatrix4(mesh.matrix);resources.add(copy);copies.push(copy);
   if(performance.now()-chunkStarted>=8){await yieldTask();chunkStarted=performance.now();}
  }
  const merged=mergeGeometries(copies);copies.forEach(g=>{resources.delete(g);g.dispose();});
  if(merged){resources.add(merged);layer.add(new THREE.Mesh(merged,material));meshes.forEach(m=>layer.remove(m));}
  await yieldTask();
 }
}
const retainedGeometries=new Set<THREE.BufferGeometry>();
assembly.traverse(child=>{if(child instanceof THREE.Mesh)retainedGeometries.add(child.geometry);});
for(const geo of roundedGeometries.values())if(!retainedGeometries.has(geo)){resources.delete(geo);geo.dispose();}
roundedGeometries.clear();
// A thin, oriented perimeter follows the actual layer, not its world-axis bounding box.
const perimeterGeometry=new THREE.BufferGeometry().setFromPoints([
 new THREE.Vector3(-.48,0,-.5),new THREE.Vector3(.48,0,-.5),new THREE.Vector3(.5,0,-.48),new THREE.Vector3(.5,0,.48),
 new THREE.Vector3(.48,0,.5),new THREE.Vector3(-.48,0,.5),new THREE.Vector3(-.5,0,.48),new THREE.Vector3(-.5,0,-.48),
]);resources.add(perimeterGeometry);
const perimeterMaterial=new THREE.LineBasicMaterial({color:0xb0e3d3,transparent:true,opacity:.8,toneMapped:false});resources.add(perimeterMaterial);
const selection=new THREE.LineLoop(perimeterGeometry,perimeterMaterial);selection.visible=false;selection.raycast=()=>{};
checkpoint('merge');
const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});target.samples=quality.tier==='full'?4:0;
const composer=new EffectComposer(renderer,target);let compositionDpr=renderer.getPixelRatio();renderer.info.autoReset=false;composer.addPass(new RenderPass(scene,camera));
owned.push(() => { composer.passes.forEach(pass => pass.dispose()); composer.dispose(); });
await yieldTask();
const ao=quality.tier==='full'?new SSAOPass(scene,camera,1,1,16):null;if(ao){
 ao.kernelRadius=6;ao.minDistance=.002;ao.maxDistance=.055;composer.addPass(ao);
 // Three r186 SSAOPass.dispose omits its AO material and noise texture.
 owned.push(() => { ao.ssaoMaterial.dispose(); ao.noiseTexture.dispose(); });
}
const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.12,.25,2.5);
// r186 bloom disposal omits the high-pass shader material.
owned.push(() => bloom.materialHighPassFilter.dispose());
if(quality.tier!=='economy')composer.addPass(bloom);else owned.push(() => bloom.dispose());composer.addPass(new OutputPass());
// Canvas MSAA does not affect the offscreen composer. Low-DPR tiers use one
// edge pass after tone mapping/sRGB conversion; full keeps its existing 4x MSAA.
const fxaa=quality.tier==='full'?null:new FXAAPass();if(fxaa)composer.addPass(fxaa);
checkpoint('postprocessing');
// One reversible editorial timeline: edge reveal → exploded orbit → die macro → two worlds.
const editorial=document.body.classList.contains('silicon-editorial');
const state={spread:0,turn:-.7,reveal:0,progress:0,camX:5.5,camY:2.8,camZ:7.5,aimY:1.1,scale:1.15,bright:.35,focus:0,dual:0,intro:1};
if(editorial)Object.assign(state,{camX:3.8,camY:4.8,camZ:5.2,aimY:.08,scale:1.08,bright:.8,turn:-.45});
const timeline=gsap.timeline({paused:true});owned.push(() => timeline.kill());
if(editorial){
 timeline
 .to(state,{camX:4.1,camY:5.2,camZ:5.8,turn:-.2,bright:1,aimY:.12,scale:1.2,duration:2,ease:"power2.in"},0)
 .to(state,{intro:0,duration:1,ease:"power2.inOut"},1.3)
 .to(state,{spread:1,turn:.55,reveal:1,camX:6,camY:6,camZ:10,scale:1,aimY:.55,duration:3,ease:"power2.in"},2)
 .to(state,{focus:1,turn:.1,camX:.8,camY:7.2,camZ:3.2,aimY:1,scale:1.15,bright:.85,duration:3,ease:"power3.inOut"},5)
 .to(state,{dual:1,focus:0,turn:0,camX:0,camY:2,camZ:8.8,aimY:.25,scale:1.2,bright:1,duration:4,ease:"power3.inOut"},8);
}else timeline
 .to(state,{camX:5.8,camY:5.2,camZ:9.3,scale:1.05,bright:1,aimY:.55,duration:2,ease:'power2.inOut'},0)
 .to(state,{intro:0,duration:1,ease:'power2.inOut'},1.3)
 .to(state,{spread:1,turn:.55,reveal:1,camX:6,camY:6,camZ:10,scale:1,aimY:.55,duration:3,ease:'power3.inOut'},2)
 .to(state,{focus:1,turn:.1,camX:.8,camY:7.2,camZ:3.2,aimY:1,scale:1.35,bright:.85,duration:3,ease:'power3.inOut'},5)
 .to(state,{dual:1,focus:0,turn:0,camX:0,camY:2,camZ:8.8,aimY:.25,scale:1.2,bright:1,duration:4,ease:'power3.inOut'},8);
const phases=[['Precision, revealed.','Follow the light. Discover what lies beneath.'],['Layer by layer.','Package, interconnects, silicon. A system, unfolded.'],['A closer look.','Explore a conceptual landscape of circuit regions.'],['Two worlds. One boundary.','A conceptual view of normal and secure execution.']];
// Soft light fields express execution contexts on ONE shared piece of silicon.
// Their overlap and soft edges deliberately avoid claiming a physical boundary.
const domainGeometry=new THREE.PlaneGeometry(2.28,2.28);resources.add(domainGeometry);
const domainMaterial=new THREE.ShaderMaterial({
 uniforms:{amount:{value:0}},transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,toneMapped:false,
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`varying vec2 vUv;uniform float amount;
 void main(){float a=exp(-5.*distance(vUv,vec2(.2,.4)));float b=exp(-6.*distance(vUv,vec2(.8,.6)));
 float fade=smoothstep(0.,.08,vUv.x)*smoothstep(0.,.08,vUv.y)*smoothstep(0.,.08,1.-vUv.x)*smoothstep(0.,.08,1.-vUv.y);
 vec3 color=(vec3(.18,.65,.78)*a+vec3(.55,.36,.85)*b)/max(.01,a+b);
 gl_FragColor=vec4(color,amount*(a+b)*fade*.2);}`
});resources.add(domainMaterial);
const domainField=new THREE.Mesh(domainGeometry,domainMaterial);domainField.rotation.x=-Math.PI/2;domainField.position.y=.151;domainField.raycast=()=>{};silicon.add(domainField);
const copy=document.querySelector<HTMLElement>('.copy')!;
const bigHeadline=document.querySelector<HTMLElement>('.copy h1')!;
const introDescription=document.querySelector<HTMLElement>('.copy > .description')!;
const eyebrow=document.querySelector<HTMLElement>('.copy > .eyebrow')!;
const dualCaptions=document.querySelector<HTMLElement>('.dual-captions')!;
// These names describe the abstract geometry, not a specific chip floorplan.
let labelsVisible=true;
const labelsToggle=document.querySelector<HTMLButtonElement>('#labels-toggle')!;
labelsToggle.setAttribute('aria-pressed','true');labelsToggle.querySelector('span')!.textContent='On';
listen(labelsToggle,'click',()=>{labelsVisible=!labelsVisible;labelsToggle.setAttribute('aria-pressed',String(labelsVisible));labelsToggle.querySelector('span')!.textContent=labelsVisible?'On':'Off';dirty=true;});
const calloutSvg=document.querySelector<SVGSVGElement>('.annotation-lines')!;
const parts=[
 {name:'lid',root:lid,point:new THREE.Vector3(1.45,.13,.8)},
 {name:'silicon',root:silicon,point:new THREE.Vector3(1.2,.12,.85)},
 {name:'interposer',root:interposer,point:new THREE.Vector3(1.45,.07,1)},
 {name:'substrate',root:substrate,point:new THREE.Vector3(1.65,.09,1.25)},
 {name:'banks',root:silicon,point:new THREE.Vector3(-.69,.135,.08)},
 {name:'core',root:silicon,point:new THREE.Vector3(.5,.14,-.26)},
].map(part=>({...part,element:document.querySelector<HTMLElement>(`[data-part="${part.name}"]`)!}));
function updateAnnotations(mobile:boolean){
 const w=host.clientWidth,h=host.clientHeight,macro=state.focus>.5;
 const active=(editorial && state.progress<.12)||!labelsVisible||state.dual>.15?[]:macro?['banks','core']:state.spread>.15?['lid','silicon','interposer','substrate']:['lid'];
 const left=macro,tx=left?(mobile?16:80):w-(mobile?112:235);
 const rows=active.length===4?[.16,.35,.55,.75]:macro?[.55,.28]:[.6];
 let paths='';
 parts.forEach(part=>{
  const index=active.indexOf(part.name);part.element.hidden=true;if(index<0||!part.root.visible)return;
  const world=part.root.localToWorld(part.point.clone());const v=world.project(camera);
  if(v.z < -1||v.z>1||Math.abs(v.x)>.98||Math.abs(v.y)>.98)return;
  const x=(v.x+1)*w/2,y=(1-v.y)*h/2,ty=h*rows[index];
  part.element.hidden=false;part.element.style.left=`${tx}px`;part.element.style.top=`${ty-15}px`;
  const endX=left?tx+(mobile?104:180):tx-10,elbowX=left?endX+18:endX-18;
  paths+=`<path d="M ${x} ${y} L ${elbowX} ${ty} L ${endX} ${ty}"/><circle cx="${x}" cy="${y}" r="2"/>`;
 });
 calloutSvg.setAttribute('viewBox',`0 0 ${w} ${h}`);calloutSvg.innerHTML=paths;
}
let auto:gsap.core.Tween|null=null;owned.push(() => auto?.kill());
let selected=-1;
let phase=-1;
let dirty=true;
const finePointer=matchMedia('(hover:hover) and (pointer:fine)');
const orbit={x:0,y:0,targetX:0,targetY:0};
let pointerInside=false;let hovered=-1;
const lifts=layers.map(()=>({amount:0}));
const liftTweens:(gsap.core.Tween|undefined)[]=[];
owned.push(()=>liftTweens.forEach(t=>t?.kill()));
function setLayerLift(index:number){
 if(!editorial)return;
 lifts.forEach((lift,i)=>{liftTweens[i]?.kill();liftTweens[i]=gsap.to(lift,{amount:i===index && !reducedQuery.matches ? .13 : 0,duration:reducedQuery.matches?0:.18,ease:'power2.out',onUpdate:()=>{dirty=true;}});});
}
let inView=true;
const visibilityObserver=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;dirty=true;},{rootMargin:'80px'});
visibilityObserver.observe(host);owned.push(()=>visibilityObserver.disconnect());
const cut=document.querySelector<HTMLElement>('.digital-cut');
let cutPlayed=false;let cutTimer:ReturnType<typeof setTimeout>|undefined;
owned.push(()=>clearTimeout(cutTimer));

function setProgress(p:number){
 if(Math.abs(p-state.progress)>.002 && selected>=0)clearSelection();
 if(editorial && !cutPlayed && !reducedQuery.matches && state.progress<.76 && p>=.76 && p-state.progress<.15){
  cutPlayed=true;if(cut){cut.dataset.active='true';cutTimer=setTimeout(()=>{cut.dataset.active='false';},180);}
 }
 state.progress=THREE.MathUtils.clamp(p,0,1);timeline.progress(state.progress);slider.value=String(Math.round(state.progress*1000));output.value=`${Math.round(state.progress*100).toString().padStart(2,'0')}%`;
 const idx=state.progress<.18?0:state.progress<.43?1:state.progress<.76?2:3;
 if(idx!==phase){phase=idx;number.textContent=`0${idx+1} / 04`;title.textContent=phases[idx][0];description.textContent=phases[idx][1];document.querySelectorAll('.chapters button').forEach((b,i)=>{if(i===idx)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});}stage.dataset.shot=String(phase);dirty=true;
}
function stop(){auto?.kill();auto=null;play.innerHTML=`Play ${play.dataset.playLabel || 'Preview'} <span aria-hidden="true">▷</span>`;}
function seek(p:number){stop();if(reducedQuery.matches){setProgress(p);return;}const section=document.querySelector<HTMLElement>('.journey')!;window.scrollTo({top:section.offsetTop+p*(section.offsetHeight-stage.offsetHeight),behavior:'instant'});setProgress(p);}
listen(slider,'input',()=>seek(Number(slider.value)/1000));
const sceneTools=document.querySelector<HTMLDetailsElement>('.scene-tools');
if(sceneTools)listen(sceneTools,'toggle',()=>{if(!sceneTools.open)stop();});
listen(play,'click',()=>{if(auto){stop();return;}const start=state.progress>.98?0:state.progress;seek(start);play.innerHTML=`Pause ${play.dataset.playLabel || 'Preview'} <span aria-hidden="true">Ⅱ</span>`;const v={p:start};auto=gsap.to(v,{p:1,duration:18*(1-start),ease:'none',onUpdate:()=>{const section=document.querySelector<HTMLElement>('.journey')!;window.scrollTo({top:section.offsetTop+v.p*(section.offsetHeight-stage.offsetHeight),behavior:'instant'});setProgress(v.p);},onComplete:stop});});
listen(window,'wheel',()=>stop());listen(window,'touchstart',()=>stop());
document.querySelectorAll<HTMLButtonElement>('[data-progress]').forEach(b=>listen(b,'click',()=>seek(Number(b.dataset.progress))));
const structureSelect=document.querySelector<HTMLSelectElement>('#structure-select')!;
const structureInfo=[
 ['Package contacts','The lower contact structure links the package to a circuit board.'],
 ['Package substrate','Supports the die and carries connections outward.'],
 ['Interconnect layer','A conceptual routing layer between the die and substrate.'],
 ['Silicon die','The silicon surface carries circuits. This layout is conceptual.'],
 ['Package lid','Protects the internal structure and helps transfer heat.'],
];
function clearSelection(){setLayerLift(-1);selected=-1;phase=-1;structureSelect.value='-1';document.querySelectorAll('[data-structure]').forEach(b=>b.setAttribute('aria-pressed','false'));}
function select(i:number){
 stop();if(!Number.isInteger(i)||i<0||i>=layers.length){clearSelection();setProgress(state.progress);return;}
 selected=i;setLayerLift(i);structureSelect.value=String(i);document.querySelectorAll<HTMLElement>('[data-structure]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.structure)===i)));title.textContent=structureInfo[i][0];description.textContent=structureInfo[i][1];dirty=true;
}
listen(structureSelect,'change',()=>select(Number(structureSelect.value)));
document.querySelectorAll<HTMLButtonElement>('[data-structure]').forEach(button=>{
 button.disabled=false;listen(button,'click',()=>{const i=Number(button.dataset.structure);if(selected===i){select(-1);return;}seek(.36);select(i);});
});
listen(renderer.domElement,'pointermove',((event:PointerEvent)=>{
 if(!editorial || !finePointer.matches || reducedQuery.matches || event.pointerType==='touch')return;
 pointerInside=true;const box=host.getBoundingClientRect();mouse.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);orbit.targetX=THREE.MathUtils.clamp((event.clientX-box.left)/box.width*2-1,-1,1)*.28;
 orbit.targetY=THREE.MathUtils.clamp((event.clientY-box.top)/box.height*2-1,-1,1)*.16;dirty=true;
}) as EventListener);
listen(renderer.domElement,'pointerleave',()=>{pointerInside=false;orbit.targetX=0;orbit.targetY=0;dirty=true;});

const topicNames=['Silicon & Connections','XBL / ABL','Android Internals','TEE'];
const topicStatus=document.querySelector<HTMLElement>('#topic-status');
document.querySelectorAll<HTMLButtonElement>('[data-module]').forEach(b=>listen(b,'click',()=>{
 const i=Number(b.dataset.module);if(!topicStatus)return;topicStatus.textContent=`${topicNames[i]} — article content is coming later. This topic is not a physical chip layer.`;
 document.querySelectorAll('[data-module]').forEach((button,j)=>button.setAttribute('aria-pressed',String(i===j)));
}));
const ray=new THREE.Raycaster();const mouse=new THREE.Vector2();let pointerStart={x:0,y:0};
listen(renderer.domElement,'pointerdown',((e:PointerEvent)=>{pointerStart={x:e.clientX,y:e.clientY};}) as EventListener);
listen(renderer.domElement,'pointerup',((event:PointerEvent)=>{if(Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>8)return;const box=host.getBoundingClientRect();mouse.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(layers,true).find(h=>{let o:THREE.Object3D|null=h.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});if(hit){let parent:THREE.Object3D|null=hit.object;while(parent && parent.userData.structure===undefined)parent=parent.parent;if(parent)select(parent.userData.structure);}else select(-1);}) as EventListener);
let trigger:ScrollTrigger|undefined;owned.push(() => trigger?.kill());
function configureMotion(){stop();setLayerLift(selected);trigger?.kill();if(reducedQuery.matches){play.disabled=true;setProgress(1);document.querySelector('[data-status]')!.textContent='REDUCED MOTION';}else{play.disabled=false;trigger=ScrollTrigger.create({trigger:'.journey',start:'top top',end:'bottom bottom',onUpdate:s=>{if(!auto)setProgress(s.progress);}});setProgress(trigger.progress);document.querySelector('[data-status]')!.textContent='REAL-TIME 3D';}resize();}
function resize(){
 const ratio=Math.min(devicePixelRatio,quality.dpr,innerWidth<760?1.5:2);
 renderer.setPixelRatio(ratio);const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);
 if(compositionDpr!==ratio){composer.setPixelRatio(ratio);compositionDpr=ratio;}
 // Match the actual integer drawing buffer, including odd CSS widths at 1.5 DPR.
 composer.setSize(renderer.domElement.width/ratio,renderer.domElement.height/ratio);
 camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;
}
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);owned.push(() => resizeObserver.disconnect());
listen(reducedQuery,'change',configureMotion);
let lastRender=0;let renderedFrames=0;let lastSubmitMs=0;
function render(time:number){
 if(destroyed||contextLost()||document.hidden||!inView||!dirty||time-lastRender<1000/quality.fps)return;
 lastRender=time;const mobile=host.clientWidth<760;
 const orbitEnabled=editorial && finePointer.matches && !reducedQuery.matches;
 orbit.x=THREE.MathUtils.lerp(orbit.x,orbitEnabled?orbit.targetX:0,.22);orbit.y=THREE.MathUtils.lerp(orbit.y,orbitEnabled?orbit.targetY:0,.22);
 if(Math.abs(orbit.x-(orbitEnabled?orbit.targetX:0))<.0005)orbit.x=orbitEnabled?orbit.targetX:0;
 if(Math.abs(orbit.y-(orbitEnabled?orbit.targetY:0))<.0005)orbit.y=orbitEnabled?orbit.targetY:0;
 camera.position.set(state.camX+orbit.x,state.camY+orbit.y,state.camZ);
 if(mobile)camera.position.multiplyScalar(editorial?Math.max(1,.85/camera.aspect):1.4+state.intro*.6);
 camera.lookAt(0,state.aimY,0);
 camera.clearViewOffset();
 assembly.rotation.set(0,state.turn,0);assembly.position.y=mobile?0:.08;assembly.scale.setScalar(state.scale);
 const expanded=[-1.2,-.55,.14,1,2.4];
 layers.forEach((g,i)=>{
   g.visible=state.dual<.99||i===3;
   const spreadY=THREE.MathUtils.lerp(heights[i],expanded[i],state.spread);
   g.position.set((i-2)*.22*state.spread,spreadY,0);
   g.rotation.set(0,(i-2)*.065*state.spread,0);g.scale.setScalar(1);
   if(i!==3){g.position.y-=state.focus*4.2;g.scale.setScalar(1-state.focus*.35);g.position.y-=state.dual*7;}
 });
 lid.position.set(.3*state.reveal,THREE.MathUtils.lerp(heights[4],2.6,state.spread)+state.focus*4+state.dual*6,-.8*state.reveal);
 lid.rotation.z=-.1*state.reveal;
 silicon.position.x=THREE.MathUtils.lerp(.22*state.spread,0,state.dual);
 silicon.position.y=THREE.MathUtils.lerp(THREE.MathUtils.lerp(heights[3],1,state.spread),.7,state.dual);
 silicon.rotation.x=state.dual*(Math.PI/2-.12);
 silicon.rotation.y=THREE.MathUtils.lerp(.065*state.spread,.1,state.dual);
 if(editorial && !reducedQuery.matches)layers.forEach((g,i)=>{if(g.visible)g.position.y+=lifts[i].amount;});
 domainField.visible=state.dual>.001;domainMaterial.uniforms.amount.value=state.dual;
 guideMat.opacity=0;
 // A slow reflection sweep, kept coherent across the reversible camera move.
 key.position.set(-4+state.progress*2,7,4);key.intensity=1.1+state.bright*.7;
 rim.intensity=.65+state.focus*.35;
 scene.environmentRotation.set(0,-.25+state.progress*.45,0);
 scene.environmentIntensity=.65+state.bright*.35+state.intro*.15;
 renderer.toneMappingExposure=.95;
 mats.glow.emissiveIntensity=.2+state.focus*.15;
 bloom.strength=.12;
 bigHeadline.style.opacity=String(state.intro);introDescription.style.opacity=String(state.intro);eyebrow.style.opacity=String(state.intro);
 bigHeadline.style.transform=`translateY(${-state.progress*45}px)`;
 copy.style.setProperty('--intro',String(state.intro));
 dualCaptions.style.opacity=String(selected>=0?0:THREE.MathUtils.smoothstep(state.dual,.8,1));
 stage.dataset.inspecting=String(selected>=0);
 stage.style.setProperty('--intro',String(state.intro));
 stage.style.setProperty('--light',String(.18+state.spread*.16+state.dual*.14));
 stage.dataset.shot=String(phase);
 scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 hovered=-1;
 if(editorial && pointerInside && orbitEnabled){
  ray.setFromCamera(mouse,camera);
  const hit=ray.intersectObjects(layers,true).find(h=>{let o:THREE.Object3D|null=h.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});
  if(hit){let parent:THREE.Object3D|null=hit.object;while(parent && parent.userData.structure===undefined)parent=parent.parent;if(parent)hovered=parent.userData.structure;}
 }
 document.querySelectorAll<HTMLElement>('[data-structure]').forEach(b=>{b.dataset.hovered=String(Number(b.dataset.structure)===hovered);});
 renderer.domElement.style.cursor=hovered>=0?'pointer':'';
 const outlined=selected>=0?selected:hovered;
 const selectedRoot=layers[outlined];
 selection.visible=outlined>=0&&Boolean(selectedRoot?.visible);if(selection.visible&&selectedRoot){
  if(selection.parent!==selectedRoot)selectedRoot.add(selection);
  selection.position.set(0,[.11,.14,.08,.16,.15][outlined]);selection.scale.set([3.85,3.7,3.3,2.69,3.34][outlined],1,[3.85,3.7,3.3,2.69,3.34][outlined]);
 }
 core.scale.setScalar(1);
 for(const option of structureSelect.options){const i=Number(option.value);option.disabled=i>=0&&(!layers[i].visible||((state.focus>.5||state.dual>.2)&&i!==3));}
 scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);updateAnnotations(mobile);
 renderer.info.reset();const submittedAt=performance.now();composer.render();lastSubmitMs=performance.now()-submittedAt;if(renderedFrames===0)checkpoint('firstRender');renderedFrames++;dirty=Math.abs(orbit.x-(orbitEnabled?orbit.targetX:0))>.0005||Math.abs(orbit.y-(orbitEnabled?orbit.targetY:0))>.0005;stage.dataset.ready='true';
}
await yieldTask();
checkpoint('beforeCompile');await renderer.compileAsync(scene,camera);checkpoint('compiled');
ensureActive();
renderer.setAnimationLoop(render);
listen(document,'visibilitychange',()=>{if(document.hidden)stop();dirty=true;});
function cleanup(){if(destroyed)return;destroyed=true;stop();trigger?.kill();timeline.kill();abort.abort();resizeObserver.disconnect();renderer.setAnimationLoop(null);release();}
listen(window,'pagehide',((e:PageTransitionEvent)=>{if(!e.persisted)cleanup();}) as EventListener);listen(window,'pageshow',()=>{dirty=true;});listen(document,'astro:before-swap',cleanup);
slider.disabled=false;configureMotion();stage.classList.add('ready');
// Deterministic inspection hook; it exposes only preview state and renderer statistics.
Object.assign(window,{chipPreview:{seek,setProgress,select,setAntialias:(enabled:boolean)=>{if(fxaa){fxaa.enabled=enabled;dirty=true;}},getState:()=>({quality:quality.tier,pixelRatio:renderer.getPixelRatio(),progress:state.progress,selected,hovered,orbit:[orbit.x,orbit.y],cutPlayed,inView,layerY:layers.map(g=>g.position.y),camera:camera.position.toArray(),spread:state.spread,siliconCount:assembly.children.filter(child=>child.userData.isDie===true).length,domainAmount:state.dual,selectionVisible:selection.visible,reduced:reducedQuery.matches,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,renderedFrames,lastSubmitMs,antialias:fxaa?(fxaa.enabled?'fxaa':'off'):'msaa4',postBuffer:[composer.readBuffer.width,composer.readBuffer.height],aaResolution:fxaa?fxaa.material.uniforms.resolution.value.toArray():null,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,ready:stage.dataset.ready==='true'})}});

} catch(error) {
 release();
 if(!(error instanceof DOMException && error.name==='AbortError'))console.warn('3D preview initialization failed:',error);
 throw error;
}

}
