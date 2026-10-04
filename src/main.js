// main.js — Riso Runner: the run itself, plus the look lab (L) for tuning the print.
// The world drifts from forest to jungle to desert as you run, and the ink drums change with it.
// States: title → run → dead → run …  The runner lives in path space (s along, u across, y up).
import * as THREE from 'three';
import {inkMaterial,skyMaterial,PrintPass,hex3} from './print.js';
import {World,regionAt,LEG,BLEND,LANE,START,speedAt} from './world.js';
import {Air} from './air.js';

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
const JUMP={'Forest':START,'Forest → jungle':LEG-BLEND-150,'Jungle':LEG+300,'Jungle → desert':2*LEG-BLEND-150,'Desert':2*LEG+300,'Desert → forest':3*LEG-BLEND-150};
const S={jump:'Forest',preset:'By region',shafts:.7,paper:'Natural',fov:78,sun:-38,fog:150,god:false,
  tone:.55,hatch:.45,deckle:1,grain:1.2,grainAmt:.6,ink:.9,soft:.12,mis:1.4,speedMis:.1,drift:.6,outline:.85,thick:1,wobble:1.4,defects:.5,dots:0,scale:.75,reprint:false};
const CONTROLS=[
  ['jump','Go to',Object.keys(JUMP)],['god','Can\'t crash (for looking around)'],['preset','Inks',['By region',...Object.keys(PRESETS)]],['paper','Paper',Object.keys(PAPERS)],
  ['fov','Field of view',60,100,1],['sun','Sun direction',-180,180,1],['fog','Fog distance',60,320,5],['shafts','Light shafts',0,1.5,.05],
  '-',
  ['tone','Bold shapes',0,1,.05],['hatch','Key plate hatching',0,1,.05],['deckle','Rough print edge',0,1,.05],
  ['ink','Ink density',.3,1.4,.05],['grainAmt','Grain strength',0,1,.05],['grain','Grain size (px)',.5,3,.05],['soft','Grain softness',.02,.5,.01],['mis','Misregistration (px)',0,6,.1],['speedMis','… extra per m/s',0,.4,.01],
  ['drift','Far plates drift',0,1,.05],['outline','Key outlines',0,1,.05],['thick','Outline weight',.5,3,.1],['wobble','Outline wobble',0,4,.1],
  ['defects','Press defects',0,1,.05],['dots','Halftone (mid plate)',0,1,.05],['scale','Render scale',.4,1,.05],
  ['reprint','Reprint at 12 fps'],
];
const store={get(k,d){try{const v=localStorage.getItem('rr.'+k);return v===null?d:JSON.parse(v);}catch{return d;}},set(k,v){try{localStorage.setItem('rr.'+k,JSON.stringify(v));}catch{}}};

// ---------- renderer, scene, camera ----------
const canvas=document.getElementById('c'),frameEl=document.getElementById('frame');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(S.fov,1,.15,2600);
const mat=inkMaterial();mat.side=THREE.DoubleSide;
const omat=inkMaterial(true,mat.uniforms);omat.side=THREE.DoubleSide;   // obstacles: same uniforms, less fog, heavier outline
const sky=new THREE.Mesh(new THREE.SphereGeometry(2300,32,16),skyMaterial());sky.renderOrder=-1;sky.frustumCulled=false;scene.add(sky);
const world=new World(scene,mat,omat),air=new Air(scene);
const print=new PrintPass(renderer);

function resize(){const r=frameEl.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  renderer.setPixelRatio(dpr);renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();
  print.setSize(Math.round(r.width*dpr),Math.round(r.height*dpr),S.scale,dpr);}
new ResizeObserver(resize).observe(frameEl);

// ---------- the runner ----------
const G=26,JUMP_V=8.8,SLIDE_T=.75;
const R={s:START,u:0,lane:0,y:0,vy:0,air:false,slide:0,v:0,eye:1.62,roll:0,bufJump:0,bufSlide:0};
let state='title',deadT=0,startS=START,runNo=store.get('run',0),best=store.get('best',0),shake=0,lastSheet=1;
function reset(){Object.assign(R,{s:startS,u:0,lane:0,y:0,vy:0,air:false,slide:0,v:0,eye:1.62,roll:0,bufJump:0,bufSlide:0});lastSheet=regionAt(startS).sheet;}
function begin(){reset();runNo++;store.set('run',runNo);state='run';hideCard();toast(regionAt(R.s));}
function jump(){if(state!=='run')return;if(!R.air&&!world.gapAt(R.s)){R.vy=JUMP_V;R.air=true;R.slide=0;}else R.bufJump=.15;}
function slide(){if(state!=='run')return;if(R.air){R.vy=Math.min(R.vy,-16);R.bufSlide=.3;}else R.slide=SLIDE_T;}   // in the air: drop fast, then slide
function lane(d){if(state!=='run')return;R.lane=Math.max(-1,Math.min(1,R.lane+d));}
function die(how){state='dead';deadT=0;proofT=.55;shake=how==='fell'?0:1;
  const m=Math.floor(R.s-startS),wasBest=m>best;if(wasBest){best=m;store.set('best',best);}
  setTimeout(()=>{if(state==='dead')showCard('dead',m,how,wasBest);},650);}
function step(dt){
  const target=speedAt(R.s);R.v=Math.min(target,R.v+target*dt*1.6);   // eases up to speed at the start of a run
  R.s+=R.v*dt;
  R.u+=(R.lane*LANE-R.u)*(1-Math.exp(-16*dt));
  R.bufJump=Math.max(0,R.bufJump-dt);R.bufSlide=Math.max(0,R.bufSlide-dt);R.slide=Math.max(0,R.slide-dt);
  const gap=S.god?null:world.gapAt(R.s);
  if(R.air||R.y>0||gap){R.vy-=G*dt;R.y+=R.vy*dt;}
  if(!gap&&R.y<=0){R.y=0;R.vy=0;if(R.air){R.air=false;if(R.bufSlide>0)R.slide=SLIDE_T;else if(R.bufJump>0)jump();}}
  if(gap&&R.y<-.5){die('fell');return;}
  if(!S.god){const o=world.collide(R.s,R.u,R.y,R.slide>0);if(o){R.s=Math.min(R.s,o.s-1.5);die(o.kind);return;}}   // stop just short, so you see what you hit
  const sh=regionAt(R.s);if(sh.sheet!==lastSheet){lastSheet=sh.sheet;toast(sh);}
}

// ---------- HUD, cards and toasts ----------
const card=document.getElementById('card'),hud=document.getElementById('hud'),toastEl=document.getElementById('toast');
const pad=n=>String(Math.max(0,n)).padStart(4,'0');
function showCard(kind,m,how,wasBest){
  const why={log:'tripped on a log',branch:'hit a low branch',rock1:'ran into a rock',rock2:'ran into a rock',fell:'fell in'}[how]||'';
  card.innerHTML=kind==='title'
    ?`<h1>RISO RUNNER</h1><p class="sub">a run through a risograph print</p>
      <p class="keys">← → change lane · ↑ jump · ↓ slide<br><span>on a phone: swipe</span></p><p class="go">SPACE / TAP TO RUN</p>${best?`<p class="best">BEST ${pad(best)} M</p>`:''}`
    :`<h1>MISPRINT</h1><p class="sub">run ${String(runNo).padStart(4,'0')} · ${why}</p>
      <p class="big">${pad(m)} M</p><p class="best">${wasBest?'NEW BEST':'BEST '+pad(best)+' M'}</p><p class="go">SPACE / TAP TO RUN AGAIN</p>`;
  card.classList.add('show');}
function hideCard(){card.classList.remove('show');}
let toastT=0;
function toast(r){toastEl.innerHTML=`<b>SHEET ${String(r.sheet).padStart(2,'0')}</b><span>${r.name}</span>`;toastEl.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('show'),2600);}

// ---------- inks and paper on the print and on the page ----------
// "By region" crossfades the drums as the regions blend; a named preset holds one set everywhere.
const toHex=v=>'#'+[v.x,v.y,v.z].map(c=>Math.round(c*255).toString(16).padStart(2,'0')).join('');
let inkLabel='';
function applyInks(){const Rg=regionAt(R.s),w=Rg.w,U=[print.u.uInk0,print.u.uInk1,print.u.uInk2];let names;
  if(S.preset==='By region'){for(let k=0;k<3;k++)U[k].value.set(0,0,0).addScaledVector(INK3[0][k],w[0]).addScaledVector(INK3[1][k],w[1]).addScaledVector(INK3[2][k],w[2]);names=REGION[Rg.name].inks;}
  else{names=PRESETS[S.preset];names.forEach((n,k)=>U[k].value.copy(hex3(INKS[n])));}
  const paper=PAPERS[S.paper],hex=U.map(x=>toHex(x.value));print.u.uPaper.value.copy(hex3(paper));
  const label=`<b>SHEET ${String(Rg.sheet).padStart(2,'0')}</b> · ${Rg.name} · ${names.join(' / ')}`,key=label+hex.join()+paper;
  if(key===inkLabel)return;inkLabel=key;   // the page chrome only changes when an ink visibly does
  const st=document.documentElement.style;st.setProperty('--paper',paper);st.setProperty('--light',hex[0]);st.setProperty('--mid',hex[1]);st.setProperty('--key',hex[2]);
  document.getElementById('sheet').innerHTML=label;
  document.getElementById('bar').innerHTML=hex.map(c=>`<i style="background:${c}"></i>`).join('')+
    `<i style="background:${hex[0]}"><i style="width:100%;height:100%;background:${hex[1]}"></i></i>`;}
function applySun(){const az=S.sun*Math.PI/180,el=.36,v=new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el));
  mat.uniforms.uSun.value.copy(v);sky.material.uniforms.uSun.value.copy(v);}

// ---------- the lab panel (L) ----------
const box=document.getElementById('controls');
for(const c of CONTROLS){
  if(c==='-'){box.appendChild(document.createElement('hr'));continue;}
  const[k,label,a,b,step]=c;
  if(Array.isArray(a)){const l=document.createElement('label');l.innerHTML=`<span>${label}</span><span></span><select>${a.map(o=>`<option${o===S[k]?' selected':''}>${o}</option>`).join('')}</select>`;
    l.querySelector('select').onchange=e=>{S[k]=e.target.value;if(k==='jump'){startS=JUMP[S.jump];if(state==='run')R.s=startS;else reset();}applyInks();e.target.blur();};box.appendChild(l);continue;}
  if(a===undefined){const l=document.createElement('label');l.className='chk';l.innerHTML=`<input type="checkbox"${S[k]?' checked':''}> ${label}`;
    l.querySelector('input').onchange=e=>{S[k]=e.target.checked;e.target.blur();};box.appendChild(l);continue;}
  const l=document.createElement('label');l.innerHTML=`<span>${label}</span><output>${S[k]}</output><input type="range" min="${a}" max="${b}" step="${step}" value="${S[k]}">`;
  const out=l.querySelector('output');
  l.querySelector('input').oninput=e=>{S[k]=+e.target.value;out.textContent=S[k];if(k==='sun')applySun();if(k==='scale')resize();if(k==='fov'){camera.fov=S.fov;camera.updateProjectionMatrix();}};
  l.querySelector('input').onchange=e=>e.target.blur();
  box.appendChild(l);
}
const lab=document.getElementById('lab');
const toggleLab=()=>lab.classList.toggle('hide');
document.getElementById('hideLab').onclick=()=>lab.classList.add('hide');
document.getElementById('labBtn').onclick=()=>lab.classList.remove('hide');
let paused=false,proofT=0;
const pauseBtn=document.getElementById('pause');
const togglePause=()=>{paused=!paused;pauseBtn.textContent=paused?'RESUME':'PAUSE';};
pauseBtn.onclick=togglePause;
document.getElementById('proof').onclick=()=>{proofT=.6;};

// ---------- input: keys and swipes ----------
const go=()=>{if(state==='title'||(state==='dead'&&deadT>.8))begin();};
addEventListener('keydown',e=>{if(e.target.tagName==='SELECT'||e.target.tagName==='INPUT')return;const c=e.code;
  if(c==='KeyL'){toggleLab();return;}if(c==='KeyP'||c==='Escape'){togglePause();return;}if(c==='KeyC'){proofT=.6;return;}
  if(state!=='run'){if(c==='Space'||c==='Enter'||c==='ArrowUp'){e.preventDefault();go();}return;}
  if(paused)return;
  if(c==='ArrowLeft'||c==='KeyA')lane(-1);else if(c==='ArrowRight'||c==='KeyD')lane(1);
  else if(c==='ArrowUp'||c==='KeyW'||c==='Space'){e.preventDefault();jump();}else if(c==='ArrowDown'||c==='KeyS'){e.preventDefault();slide();}});
// Swipes steer during a run; elsewhere a drag looks around (springs back) and a tap starts.
let yaw=0,pitch=0,ptr=null;
frameEl.addEventListener('pointerdown',e=>{ptr={x:e.clientX,y:e.clientY,yaw,pitch,done:false};frameEl.setPointerCapture(e.pointerId);});
frameEl.addEventListener('pointermove',e=>{if(!ptr)return;const dx=e.clientX-ptr.x,dy=e.clientY-ptr.y;
  if(state==='run'&&!paused){if(!ptr.done&&Math.hypot(dx,dy)>28){ptr.done=true;if(Math.abs(dx)>Math.abs(dy))lane(dx>0?1:-1);else if(dy<0)jump();else slide();}return;}
  yaw=ptr.yaw-dx*.005;pitch=Math.max(-.9,Math.min(.9,ptr.pitch-dy*.005));});
frameEl.addEventListener('pointerup',e=>{if(ptr&&!ptr.done&&Math.hypot(e.clientX-ptr.x,e.clientY-ptr.y)<10){if(state==='run')jump();else go();}ptr=null;});
frameEl.addEventListener('pointercancel',()=>{ptr=null;});
card.addEventListener('pointerup',go);

// ---------- loop ----------
applyInks();applySun();resize();showCard('title');
let t=0,last=performance.now(),pathY=null,fpsN=0,fpsT=0;
const look=new THREE.Vector3(),sunP=new THREE.Vector3(),fogInk=new THREE.Vector3(),F={},A={},distEl=document.getElementById('dist'),fpsEl=document.getElementById('fps');
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  if(!paused){t+=dt;if(state==='run')step(dt);else if(state==='dead'){deadT+=dt;if(R.y<0&&R.y>-6){R.vy-=G*dt;R.y+=R.vy*dt;}}}
  const P=world.path,f=P.at(R.s,F),a=P.at(R.s+22,A),k=1-Math.exp(-6*dt);
  // camera: path height is smoothed (hills), the runner's own jump/slide is not
  const py=P.height(R.s);pathY=pathY===null?py:pathY+(py-pathY)*k;
  R.eye+=((R.slide>0?.78:1.62)-R.eye)*(1-Math.exp(-22*dt));
  camera.position.set(f.x+R.u*f.rx,pathY+R.eye+R.y,f.z+R.u*f.rz);
  look.set(a.x+R.u*.5*a.rx,P.height(R.s+22)+1.45+R.y*.35,a.z+R.u*.5*a.rz);camera.lookAt(look);
  R.roll+=((R.u-R.lane*LANE)*.02-R.roll)*k;
  if(!ptr||state==='run'){yaw*=1-k*.5;pitch*=1-k*.5;}
  shake=Math.max(0,shake-dt*2.5);
  camera.rotateY(yaw+Math.sin(t*61)*.012*shake);camera.rotateX(pitch-.02+Math.sin(t*47)*.02*shake);camera.rotateZ(R.roll);
  world.update(R.s,camera.position);sky.position.copy(camera.position);
  // the region sets the fog, the sky and the strength of the light shafts
  const Rg=regionAt(R.s),w=Rg.w,mu=mat.uniforms;
  fogInk.set(0,0,0);let fogK=0,shaftK=0;RK.forEach((r,i)=>{const Gg=REGION[r];fogInk.x+=Gg.fog[0]*w[i];fogInk.y+=Gg.fog[1]*w[i];fogInk.z+=Gg.fog[2]*w[i];fogK+=Gg.fogK*w[i];shaftK+=Gg.shaft*w[i];});
  mu.uTime.value=t;mu.uFogDist.value=S.fog*fogK;mu.uFogInk.value.copy(fogInk);mu.uBio.value.set(w[0],w[1],w[2]);
  sky.material.uniforms.uFogInk.value.copy(fogInk);sky.material.uniforms.uBio.value.set(w[0],w[1],w[2]);
  air.update(t,camera,w,print.rt.height/(2*Math.tan(camera.fov*Math.PI/360)));
  sunP.copy(mu.uSun.value).multiplyScalar(1000).add(camera.position).project(camera);
  const onScreen=sunP.z<1?1-Math.min(1,Math.max(0,(Math.max(Math.abs(sunP.x),Math.abs(sunP.y))-1)/.6)):0;
  print.u.uSunUV.value.set(sunP.x*.5+.5,sunP.y*.5+.5);print.u.uShaft.value=S.shafts*shaftK*onScreen;
  // misregistration: a base drift plus more with speed; the key plate stays nearly registered.
  // "Clean proof" snaps every plate into register — the crash frame.
  proofT=Math.max(0,proofT-dt);
  const sp=state==='run'?R.v:0,m=proofT>0?0:S.mis+sp*S.speedMis,u=print.u,tick=Math.floor(t*12),j=S.reprint?(i=>(Math.sin(tick*12.9898+i*78.233)*43758.5453%1)*.35):()=>0;
  u.uMis0.value.set(-.85*m+j(1)*m,.55*m+j(2)*m);u.uMis1.value.set(.75*m+j(3)*m,-.4*m+j(4)*m);u.uMis2.value.set(.08*m,.04*m);
  u.uSeed.value=S.reprint?(tick*.618034)%1:0;
  u.uGrain.value=S.grain;u.uGrainAmt.value=S.grainAmt;u.uInkAmt.value=S.ink;u.uSoft.value=S.soft;u.uDepthDrift.value=S.drift;u.uOutline.value=S.outline;u.uThick.value=S.thick;
  u.uWobble.value=S.wobble;u.uDefects.value=S.defects;u.uDots.value=S.dots;u.uTone.value=S.tone;u.uHatch.value=S.hatch;u.uDeckle.value=S.deckle;
  applyInks();
  print.render(scene,camera);
  const dist=Math.floor(R.s-startS);hud.textContent=state==='title'?'':pad(dist)+' M';
  fpsN++;fpsT+=dt;if(fpsT>.5){fpsEl.textContent=Math.round(fpsN/fpsT)+' fps';fpsN=0;fpsT=0;distEl.textContent=pad(dist);}
  requestAnimationFrame(frame);
}
window.RR={S,R,print,world,camera,scene,air,applyInks,applySun,begin,jump,slide,lane,tick:dt=>{world.obs.ensure(R.s+300);if(state==='run')step(dt);},get state(){return state;},get paused(){return paused;}};   // for poking at it from the console
requestAnimationFrame(frame);
