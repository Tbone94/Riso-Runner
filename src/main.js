// main.js — M0 look lab: a slow run down an endless path, printed live, with a panel of sliders for
// every part of the print. The world drifts from forest to jungle to desert as you run, and the ink
// drums change with it. No gameplay yet; this is the vibe test.
import * as THREE from 'three';
import {inkMaterial,skyMaterial,PrintPass,hex3} from './print.js';
import {World,regionAt,LEG,BLEND} from './world.js';

const {INKS,PAPERS}=window.Riso;
// light → mid → key, matching the ink roles (sky glow / foliage / trunks, shade, outlines)
const PRESETS={
  'Woodblock':['Sunflower','Teal','Federal Blue'],
  'Forest':['Yellow','Green','Hunter Green'],
  'Dusk':['Coral','Violet','Federal Blue'],
  'Zine':['Yellow','Fluorescent Pink','Blue'],
  'Ukiyo-e':['Flat Gold','Bright Red','Medium Blue'],
  'Maple':['Sunflower','Orange','Burgundy'],
  'Sea glass':['Mint','Aqua','Teal'],
  'Moody':['Light Gray','Brick','Black'],
};
// each region's inks, horizon ink (fog), fog distance and how strongly light shafts show
const REGION={
  forest:{inks:PRESETS['Woodblock'],fog:[.4,.05,0],fogK:1,shaft:.45},
  jungle:{inks:['Yellow','Green','Hunter Green'],fog:[.17,.04,0],fogK:.55,shaft:1.2},
  desert:{inks:['Sunflower','Orange','Medium Blue'],fog:[.44,.1,0],fogK:1.8,shaft:.15},
};
const RK=['forest','jungle','desert'],INK3=RK.map(r=>REGION[r].inks.map(n=>hex3(INKS[n])));
const JUMP={'Forest':60,'Forest → jungle':LEG-BLEND-150,'Jungle':LEG+300,'Jungle → desert':2*LEG-BLEND-150,'Desert':2*LEG+300,'Desert → forest':3*LEG-BLEND-150};
const S={jump:'Forest',preset:'By region',shafts:.7,paper:'Natural',speed:8,fov:78,sun:-38,fog:150,
  grain:1.2,grainAmt:.6,ink:.9,soft:.12,mis:1.4,speedMis:.1,drift:.6,outline:.85,thick:1,wobble:1.4,defects:.5,dots:0,scale:.75,reprint:false};
const CONTROLS=[
  ['jump','Go to',Object.keys(JUMP)],['preset','Inks',['By region',...Object.keys(PRESETS)]],['paper','Paper',Object.keys(PAPERS)],
  ['speed','Speed (m/s)',0,24,.5],['fov','Field of view',60,100,1],['sun','Sun direction',-180,180,1],['fog','Fog distance',60,320,5],['shafts','Light shafts',0,1.5,.05],
  '-',
  ['ink','Ink density',.3,1.4,.05],['grainAmt','Grain strength',0,1,.05],['grain','Grain size (px)',.5,3,.05],['soft','Grain softness',.02,.5,.01],['mis','Misregistration (px)',0,6,.1],['speedMis','… extra per m/s',0,.4,.01],
  ['drift','Far plates drift',0,1,.05],['outline','Key outlines',0,1,.05],['thick','Outline weight',.5,3,.1],['wobble','Outline wobble',0,4,.1],
  ['defects','Press defects',0,1,.05],['dots','Halftone (mid plate)',0,1,.05],['scale','Render scale',.4,1,.05],
  ['reprint','Reprint at 12 fps'],
];

// ---------- renderer, scene, camera ----------
const canvas=document.getElementById('c'),frameEl=document.getElementById('frame');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(S.fov,1,.15,2600);
const mat=inkMaterial();mat.side=THREE.DoubleSide;
const sky=new THREE.Mesh(new THREE.SphereGeometry(2300,32,16),skyMaterial());sky.renderOrder=-1;sky.frustumCulled=false;scene.add(sky);
const world=new World(scene,mat);
const print=new PrintPass(renderer);

function resize(){const r=frameEl.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  renderer.setPixelRatio(dpr);renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();
  print.setSize(Math.round(r.width*dpr),Math.round(r.height*dpr),S.scale,dpr);}
new ResizeObserver(resize).observe(frameEl);

// ---------- inks and paper on the print and on the page ----------
// "By region" crossfades the drums as the regions blend; a named preset holds one set everywhere.
const toHex=v=>'#'+[v.x,v.y,v.z].map(c=>Math.round(c*255).toString(16).padStart(2,'0')).join('');
let inkLabel='';
function applyInks(){const R=regionAt(s),w=R.w,U=[print.u.uInk0,print.u.uInk1,print.u.uInk2];let names;
  if(S.preset==='By region'){for(let k=0;k<3;k++)U[k].value.set(0,0,0).addScaledVector(INK3[0][k],w[0]).addScaledVector(INK3[1][k],w[1]).addScaledVector(INK3[2][k],w[2]);names=REGION[R.name].inks;}
  else{names=PRESETS[S.preset];names.forEach((n,k)=>U[k].value.copy(hex3(INKS[n])));}
  const paper=PAPERS[S.paper],hex=U.map(x=>toHex(x.value));print.u.uPaper.value.copy(hex3(paper));
  const label=`<b>SHEET ${String(R.sheet).padStart(2,'0')}</b> · ${R.name} · ${names.join(' / ')}`,key=label+hex.join()+paper;
  if(key===inkLabel)return;inkLabel=key;   // the page chrome only changes when an ink visibly does
  const st=document.documentElement.style;st.setProperty('--paper',paper);st.setProperty('--light',hex[0]);st.setProperty('--mid',hex[1]);st.setProperty('--key',hex[2]);
  document.getElementById('sheet').innerHTML=label;
  document.getElementById('bar').innerHTML=hex.map(c=>`<i style="background:${c}"></i>`).join('')+
    `<i style="background:${hex[0]}"><i style="width:100%;height:100%;background:${hex[1]}"></i></i>`;}
function applySun(){const az=S.sun*Math.PI/180,el=.36,v=new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el));
  mat.uniforms.uSun.value.copy(v);sky.material.uniforms.uSun.value.copy(v);}

// ---------- the lab panel ----------
const box=document.getElementById('controls');
for(const c of CONTROLS){
  if(c==='-'){box.appendChild(document.createElement('hr'));continue;}
  const[k,label,a,b,step]=c;
  if(Array.isArray(a)){const l=document.createElement('label');l.innerHTML=`<span>${label}</span><span></span><select>${a.map(o=>`<option${o===S[k]?' selected':''}>${o}</option>`).join('')}</select>`;
    l.querySelector('select').onchange=e=>{S[k]=e.target.value;if(k==='jump')s=JUMP[S.jump];applyInks();};box.appendChild(l);continue;}
  if(a===undefined){const l=document.createElement('label');l.className='chk';l.innerHTML=`<input type="checkbox"${S[k]?' checked':''}> ${label}`;
    l.querySelector('input').onchange=e=>{S[k]=e.target.checked;};box.appendChild(l);continue;}
  const l=document.createElement('label');l.innerHTML=`<span>${label}</span><output>${S[k]}</output><input type="range" min="${a}" max="${b}" step="${step}" value="${S[k]}">`;
  const out=l.querySelector('output');
  l.querySelector('input').oninput=e=>{S[k]=+e.target.value;out.textContent=S[k];if(k==='sun')applySun();if(k==='scale')resize();if(k==='fov'){camera.fov=S.fov;camera.updateProjectionMatrix();}};
  box.appendChild(l);
}
const lab=document.getElementById('lab');if(innerWidth<640)lab.classList.add('hide');
document.getElementById('hideLab').onclick=()=>lab.classList.add('hide');
document.getElementById('labBtn').onclick=()=>lab.classList.remove('hide');
let paused=false,proofT=0;
const pauseBtn=document.getElementById('pause');
const togglePause=()=>{paused=!paused;pauseBtn.textContent=paused?'RUN':'PAUSE';};
pauseBtn.onclick=togglePause;
document.getElementById('proof').onclick=()=>{proofT=.6;};
addEventListener('keydown',e=>{if(e.target.tagName==='SELECT')return;if(e.code==='Space'){e.preventDefault();togglePause();}if(e.code==='KeyC')proofT=.6;});

// ---------- free look: drag to look around, springs back to the road ----------
let yaw=0,pitch=0,drag=null;
frameEl.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch};frameEl.setPointerCapture(e.pointerId);});
frameEl.addEventListener('pointermove',e=>{if(!drag)return;yaw=drag.yaw-(e.clientX-drag.x)*.005;pitch=Math.max(-.9,Math.min(.9,drag.pitch-(e.clientY-drag.y)*.005));});
const endDrag=()=>{drag=null;};frameEl.addEventListener('pointerup',endDrag);frameEl.addEventListener('pointercancel',endDrag);

// ---------- loop ----------
let s=60;
applyInks();applySun();resize();
let t=0,last=performance.now(),camY=null,fpsN=0,fpsT=0;
const look=new THREE.Vector3(),sunP=new THREE.Vector3(),fogInk=new THREE.Vector3(),F={},A={},distEl=document.getElementById('dist'),fpsEl=document.getElementById('fps');
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  if(!paused){s+=S.speed*dt;t+=dt;}
  const P=world.path,f=P.at(s,F),a=P.at(s+22,A),k=1-Math.exp(-6*dt);
  const ty=P.height(s)+1.65;camY=camY===null?ty:camY+(ty-camY)*k;
  camera.position.set(f.x,camY,f.z);
  look.set(a.x,P.height(s+22)+1.45,a.z);camera.lookAt(look);
  if(!drag){yaw*=1-k*.5;pitch*=1-k*.5;}
  camera.rotateY(yaw);camera.rotateX(pitch-.02);
  world.update(s,camera.position);sky.position.copy(camera.position);
  // the region sets the fog, the sky and the strength of the light shafts
  const R=regionAt(s),w=R.w,mu=mat.uniforms;
  fogInk.set(0,0,0);let fogK=0,shaftK=0;RK.forEach((r,i)=>{const G=REGION[r];fogInk.x+=G.fog[0]*w[i];fogInk.y+=G.fog[1]*w[i];fogInk.z+=G.fog[2]*w[i];fogK+=G.fogK*w[i];shaftK+=G.shaft*w[i];});
  mu.uTime.value=t;mu.uFogDist.value=S.fog*fogK;mu.uFogInk.value.copy(fogInk);mu.uBio.value.set(w[0],w[1],w[2]);
  sky.material.uniforms.uFogInk.value.copy(fogInk);sky.material.uniforms.uBio.value.set(w[0],w[1],w[2]);
  sunP.copy(mu.uSun.value).multiplyScalar(1000).add(camera.position).project(camera);
  const onScreen=sunP.z<1?1-Math.min(1,Math.max(0,(Math.max(Math.abs(sunP.x),Math.abs(sunP.y))-1)/.6)):0;
  print.u.uSunUV.value.set(sunP.x*.5+.5,sunP.y*.5+.5);print.u.uShaft.value=S.shafts*shaftK*onScreen;
  // misregistration: a base drift plus more with speed; the key plate stays nearly registered.
  // "Clean proof" snaps every plate into register — the crash frame.
  proofT=Math.max(0,proofT-dt);
  const m=proofT>0?0:S.mis+S.speed*S.speedMis,u=print.u,tick=Math.floor(t*12),j=S.reprint?(i=>(Math.sin(tick*12.9898+i*78.233)*43758.5453%1)*.35):()=>0;
  u.uMis0.value.set(-.85*m+j(1)*m,.55*m+j(2)*m);u.uMis1.value.set(.75*m+j(3)*m,-.4*m+j(4)*m);u.uMis2.value.set(.08*m,.04*m);
  u.uSeed.value=S.reprint?(tick*.618034)%1:0;
  u.uGrain.value=S.grain;u.uGrainAmt.value=S.grainAmt;u.uInkAmt.value=S.ink;u.uSoft.value=S.soft;u.uDepthDrift.value=S.drift;u.uOutline.value=S.outline;u.uThick.value=S.thick;
  u.uWobble.value=S.wobble;u.uDefects.value=S.defects;u.uDots.value=S.dots;
  if(S.preset==='By region')applyInks();
  print.render(scene,camera);
  fpsN++;fpsT+=dt;if(fpsT>.5){if(S.preset!=='By region')applyInks();fpsEl.textContent=Math.round(fpsN/fpsT)+' fps';fpsN=0;fpsT=0;distEl.textContent=String(Math.floor(s)).padStart(4,'0');}
  requestAnimationFrame(frame);
}
window.RR={S,print,world,camera,scene,applyInks,applySun,get s(){return s;},set s(v){s=v;}};   // for poking at the lab from the console
requestAnimationFrame(frame);
