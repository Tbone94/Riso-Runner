// main.js — Riso Runner: the run itself, plus the look lab (L) for tuning the print.
// Six regions (forest, autumn, jungle, desert, snow, night), each with its own inks and twist; near the
// end of each one the path forks and the branch you take picks the next.
// States: title → run → dead → run …  The runner lives in path space (s along, u across, y up).
import * as THREE from 'three';
import {inkMaterial,skyMaterial,signMaterial,PrintPass,hex3} from './print.js';
import {World,regionAt,route,REGIONS,REGION_INFO,FINDS,findKind,LEG,BLEND,LANE,START,FORK_LEN,forkAt,speedAt,iceAt} from './world.js';
import {Air} from './air.js';
import {postcard} from './postcard.js';
import * as audio from './audio.js';

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
// Each region's inks, horizon ink (fog), fog distance, light shafts, sky top, far and near hills,
// how much the hills fade, where snow starts on the peaks, sandstone strata, night, and mist bands.
const REGION={
  forest:{inks:PRESETS['Woodblock'],fog:[.4,.05,0],fogK:1,shaft:.45,sky:[.06,.42,0],far:[.18,.5,.12],near:[.25,.62,.3],ringFog:[.4,.25],snow:400,strata:0,night:0,kasumi:1},
  autumn:{inks:['Sunflower','Orange','Burgundy'],fog:[.42,.08,0],fogK:1.1,shaft:.7,sky:[.15,.05,.12],far:[.3,.25,.25],near:[.35,.55,.2],ringFog:[.4,.25],snow:9999,strata:0,night:0,kasumi:1},
  jungle:{inks:['Yellow','Green','Hunter Green'],fog:[.17,.04,0],fogK:.4,shaft:1.2,sky:[.1,.22,0],far:[.2,.42,.14],near:[.16,.62,.38],ringFog:[.62,.5],snow:9999,strata:0,night:0,kasumi:1},
  desert:{inks:['Sunflower','Orange','Medium Blue'],fog:[.44,.1,0],fogK:1.8,shaft:.15,sky:[.04,0,.34],far:[.45,.6,.05],near:[.5,.7,.15],ringFog:[.32,.18],snow:9999,strata:1,night:0,kasumi:.3},
  snow:{inks:['Aqua','Medium Blue','Federal Blue'],fog:[.25,.05,.03],fogK:1.3,shaft:.3,sky:[.35,.12,.05],far:[.3,.25,.12],near:[.15,.55,.35],ringFog:[.35,.25],snow:160,strata:0,night:0,kasumi:.8},
  night:{inks:['Yellow','Violet','Federal Blue'],fog:[0,.3,.45],fogK:.45,shaft:0,sky:[0,.25,.75],far:[0,.45,.55],near:[0,.5,.7],ringFog:[.5,.35],snow:400,strata:0,night:1,kasumi:.5},
};
const RG=REGIONS.map(r=>REGION[r]),INK3=RG.map(g=>g.inks.map(n=>hex3(INKS[n])));
const S={start:'Forest',preset:'By region',shafts:.7,paper:'Natural',fov:78,sun:-38,fog:150,god:false,
  tone:.55,hatch:.45,deckle:1,halo:1,grain:1.2,grainAmt:.6,ink:.9,soft:.12,mis:1.4,speedMis:.1,drift:.6,outline:.85,thick:1,wobble:1.4,defects:.5,dots:0,scale:.75,reprint:false};
const CONTROLS=[
  ['start','Start in',REGION_INFO.map(r=>r.name)],['god','Can\'t crash (for looking around)'],['preset','Inks',['By region',...Object.keys(PRESETS)]],['paper','Paper',Object.keys(PAPERS)],
  ['fov','Field of view',60,100,1],['sun','Sun direction',-180,180,1],['fog','Fog distance',60,320,5],['shafts','Light shafts',0,1.5,.05],
  '-',
  ['tone','Bold shapes',0,1,.05],['hatch','Key plate hatching',0,1,.05],['deckle','Rough print edge',0,1,.05],['halo','Paper edge round obstacles',0,1,.05],
  ['ink','Ink density',.3,1.4,.05],['grainAmt','Grain strength',0,1,.05],['grain','Grain size (px)',.5,3,.05],['soft','Grain softness',.02,.5,.01],['mis','Misregistration (px)',0,6,.1],['speedMis','… extra per m/s',0,.4,.01],
  ['drift','Far plates drift',0,1,.05],['outline','Key outlines',0,1,.05],['thick','Outline weight',.5,3,.1],['wobble','Outline wobble',0,4,.1],
  ['defects','Press defects',0,1,.05],['dots','Halftone (mid plate)',0,1,.05],['scale','Render scale',.4,1,.05],
  ['reprint','Reprint at 12 fps'],
];
const store0={get(k,d){try{const v=localStorage.getItem('rr.'+k);return v===null?d:JSON.parse(v);}catch{return d;}}};
// The player's settings: field of view, volume, calm mode (less print wobble, no shake) and quality.
const SET=Object.assign({fov:78,volume:.8,music:.5,muted:false,calm:false,quality:'auto'},store0.get('settings',{}));
const store={get(k,d){try{const v=localStorage.getItem('rr.'+k);return v===null?d:JSON.parse(v);}catch{return d;}},set(k,v){try{localStorage.setItem('rr.'+k,JSON.stringify(v));}catch{}}};

// ---------- renderer, scene, camera ----------
const canvas=document.getElementById('c'),frameEl=document.getElementById('frame');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
S.fov=SET.fov;S.scale=SET.quality==='low'?.55:SET.quality==='high'?.9:.75;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(S.fov,1,.15,2600);
const mat=inkMaterial();mat.side=THREE.DoubleSide;
const omat=inkMaterial(true,mat.uniforms);omat.side=THREE.DoubleSide;   // obstacles: same uniforms, less fog, heavier outline
const sky=new THREE.Mesh(new THREE.SphereGeometry(2300,32,16),skyMaterial());sky.renderOrder=-1;sky.frustumCulled=false;scene.add(sky);
// Signboards at a fork: "◀ SNOW / icy lanes" and "DESERT ▶ / tumbleweeds", drawn once per fork.
const signs=new Map();
function signMat(k,side){const key=route.version+':'+k+':'+side;if(signs.has(key))return signs.get(key);
  const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d'),info=REGION_INFO[route.options(k)[side]];
  x.fillStyle='#000';x.textAlign='center';x.textBaseline='middle';
  x.font='900 66px "Big Shoulders Stencil Display", Impact, sans-serif';x.fillText(side?info.name.toUpperCase()+'  ▶':'◀  '+info.name.toUpperCase(),256,50);
  x.font='30px "Cutive Mono", monospace';x.fillText(info.twist||'easy going',256,104);
  x.lineWidth=8;x.strokeRect(6,6,500,116);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.NoColorSpace;const m=signMaterial(t);signs.set(key,m);return m;}
document.fonts?.load('900 66px "Big Shoulders Stencil Display"').then(()=>{signs.clear();world.rebuildAll();});
const world=new World(scene,mat,omat,signMat),air=new Air(scene);
const print=new PrintPass(renderer);

// The vertical field of view, widened on tall (portrait) screens so all three lanes always fit across.
function fitFov(){const minH=72*Math.PI/180,need=2*Math.atan(Math.tan(minH/2)/camera.aspect)*180/Math.PI;camera.fov=Math.min(110,Math.max(S.fov,need));camera.updateProjectionMatrix();}
function resize(){const r=frameEl.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  renderer.setPixelRatio(dpr);renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;fitFov();
  print.setSize(Math.round(r.width*dpr),Math.round(r.height*dpr),S.scale,dpr);}
new ResizeObserver(resize).observe(frameEl);
// Phones and touch screens: the print fills the screen (see the CSS), so it bleeds off the edges instead of stopping raggedly.
const bleed=matchMedia('(pointer:coarse),(max-width:640px)'),fitBleed=()=>{S.deckle=bleed.matches?0:1;};fitBleed();bleed.addEventListener('change',fitBleed);

// ---------- the runner ----------
const G=26,JUMP_V=8.8;
const R={s:START,u:0,lane:0,branch:0,y:0,vy:0,air:false,duck:false,v:0,eye:1.62,roll:0,bufJump:0};
let state='title',deadT=0,startS=START,runNo=store.get('run',0),best=store.get('best',0),shake=0,lastLeg=0,duckHeld=false;
// Modes: an endless run (a new course every time) or today's run (one course for everyone, by date).
let mode='endless',streak=0,streakT=0,wasFocus=false,prevCard='title',cardKind='title';
const today=()=>{const d=new Date();return{key:`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`,seed:d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate()};};
const dailyBest=()=>store.get('daily.'+today().key,0);
const FOCUS_DROPS=45,FOCUS_T=6,FOCUS_SLOW=.7;
let runT=0,got=[0,0,0,0,0,0],ink=0,meter=0,focusT=0,needSnap=false,snap=null,card_pc=null;
function reset(){Object.assign(R,{s:startS,u:0,lane:0,branch:0,y:0,vy:0,air:false,duck:false,v:0,eye:1.62,roll:0,bufJump:0});lastLeg=regionAt(startS).leg;duckHeld=false;
  runT=0;got=[0,0,0,0,0,0];ink=0;meter=0;focusT=0;}
function begin(m=mode){mode=m;audio.start();snap=null;card_pc=null;paused=false;
  const seed=m==='daily'?today().seed:(Math.random()*4294967296)>>>0;
  route.reset(m==='daily'?seed%6:Math.max(0,REGION_INFO.findIndex(r=>r.name===S.start)));world.reseed(seed);
  reset();runNo++;store.set('run',runNo);state='run';hideCard();toast(regionAt(R.s));audio.sfx.chime();}
function focus(){if(state!=='run'||meter<1||focusT>0)return;focusT=FOCUS_T;meter=0;audio.sfx.focus();toastText('FOCUS','time slows and pickups fly to you');}
const events=[];   // crashes, for testing from the console
function jump(){if(state!=='run'||paused)return;if(!R.air&&!world.gapAt(R.s)){R.vy=JUMP_V;R.air=true;audio.sfx.jump();}else R.bufJump=.15;}
function duck(on){if(state!=='run'||paused){duckHeld=false;return;}if(on&&!duckHeld)audio.sfx.duck();duckHeld=on;if(on&&R.air)R.vy=Math.min(R.vy,-16);}   // in the air, ducking drops you fast
function lane(d){if(state!=='run'||R.branch||paused)return;const l=Math.max(-1,Math.min(1,R.lane+d));if(l!==R.lane){R.lane=l;audio.sfx.lane();}}
function die(how){events.push({e:'die',how,s:R.s,t:runT});state='dead';deadT=0;proofT=.55;shake=how==='fell'||SET.calm?0:1;duckHeld=false;needSnap=true;audio.sfx.crash();
  const m=Math.floor(R.s-startS),wasBest=m>best;if(wasBest){best=m;store.set('best',best);}
  if(mode==='daily'&&m>dailyBest())store.set('daily.'+today().key,m);
  setTimeout(()=>{if(state==='dead')showCard('dead',m,how,wasBest);},700);}
function step(dt){
  const target=speedAt(R.s);R.v=Math.min(target,R.v+target*dt*1.6);   // eases up to speed at the start of a run
  R.s+=R.v*dt;
  // the fork: whichever side lane you're in picks the branch, and with it the next region
  const fk=world.path.fork(R.s);
  if(fk&&R.s>=fk.fs&&!R.branch&&R.s<fk.fs+FORK_LEN){
    if(R.lane===0&&!S.god){R.s=fk.fs-1.4;die('sign');return;}
    R.branch=R.lane||1;route.choose(fk.k,R.branch<0?0:1);world.rebuildFrom(fk.k*LEG+LEG-BLEND);audio.sfx.chime();
    const info=REGION_INFO[route.leg(fk.k+1)];forkBanner(`<b>${info.name.toUpperCase()} AHEAD</b><span>${info.twist||'easy going'}</span>`,true);}
  if(R.branch&&!(fk&&R.s<fk.fs+FORK_LEN)){R.lane=R.branch;R.branch=0;}
  const goal=R.branch?R.branch*(LANE+world.path.spread(R.s)):R.lane*LANE;
  R.u+=(goal-R.u)*(1-Math.exp(-(R.branch?20:16-10*iceAt(R.s))*dt));           // on ice, changing lanes is slow and slippery
  R.bufJump=Math.max(0,R.bufJump-dt);
  const gap=S.god?null:world.gapAt(R.s);
  if(R.air||R.y>0||gap){R.vy-=G*dt;R.y+=R.vy*dt;}
  if(!gap&&R.y<=0){R.y=0;R.vy=0;if(R.air){R.air=false;audio.sfx.land();if(R.bufJump>0&&!duckHeld)jump();}}
  R.duck=duckHeld&&!R.air;
  if(gap&&R.y<-.5){die('fell');return;}
  if(!S.god){const hit=world.collide(R.s,R.u,R.y,R.duck);if(hit){R.s=Math.min(R.s,hit.o.s-1.5);die(hit.k);return;}}   // stop just short, so you see what you hit
  // pickups (acorns, maple leaves, …); with focus, everything a few metres ahead flies to you
  streakT-=dt;if(streakT<0)streak=0;
  for(const d of world.pickup(R.s,R.u,R.y,R.duck,focusT>0?9:0)){const k=findKind(d);world.collect(d,focusT>0?.24:.14);got[k]++;ink++;meter=Math.min(1,meter+1/FOCUS_DROPS);
    audio.sfx.pickup(k,streak++);streakT=1.3;}
  runT+=dt;focusT=Math.max(0,focusT-dt);if(wasFocus&&focusT<=0)audio.sfx.focusEnd();wasFocus=focusT>0;
  const rg=regionAt(R.s);if(rg.leg!==lastLeg){lastLeg=rg.leg;toast(rg);audio.sfx.chime();}
  // the fork banner, while one is coming up
  const nk=Math.floor((R.s-forkAt(0)+200)/LEG),fs=forkAt(nk);
  if(nk>=0&&R.s>fs-190&&R.s<fs){const[a,b]=route.options(nk).map(i=>REGION_INFO[i]);
    forkBanner(`<b>FORK AHEAD</b><span class="${R.lane<0?'on':''}">◀ ${a.name}${a.twist?' · '+a.twist:''}</span><span class="${R.lane>0?'on':''}">${b.name}${b.twist?' · '+b.twist:''} ▶</span><i>pick a side lane</i>`);}
  else if(!(fk&&R.s<fk.fs+40))forkBanner('');
}

// ---------- HUD, cards and banners ----------
const card=document.getElementById('card'),hud=document.getElementById('hud'),toastEl=document.getElementById('toast'),forkEl=document.getElementById('fork');
const pad=n=>String(Math.max(0,n)).padStart(4,'0'),km=m=>(m/1000).toFixed(1)+' km';
const WHY={log:'tripped on a log',branch:'hit a low branch',rock1:'ran into a rock',rock2:'ran into a rock',fell:'fell in',sign:'ran into the signpost',fall:'hit a fallen tree',tumble:'hit a tumbleweed'};
let installEvt=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;if(state==='title'&&card.classList.contains('show'))showCard('title');});
const ios=/iphone|ipad|ipod/i.test(navigator.userAgent),standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
function showCard(kind,m,how,wasBest){prevCard=kind==='settings'?prevCard:kind;cardKind=kind;
  if(kind==='title'){const db=dailyBest();
    card.innerHTML=`<h1>RISO RUNNER</h1><p class="sub">run as far as you can</p>
      <p class="keys">← → change lane · ↑ jump · hold ↓ to duck · F focus<br><span>on a phone: swipe (hold after swiping down to stay low)</span></p>
      <p class="btns"><button class="go" data-a="run">RUN</button><button data-a="daily">TODAY'S RUN</button></p>
      <p class="best">${best?`BEST ${pad(best)} M`:''}${best&&db?' · ':''}${db?`TODAY ${pad(db)} M`:''}</p>
      <p class="small"><button data-a="settings">SETTINGS</button>${installEvt?'<button data-a="install">INSTALL</button>':''}</p>
      ${ios&&!standalone?'<p class="hint">to install: tap Share, then Add to Home Screen</p>':''}`;}
  else if(kind==='pause')card.innerHTML=`<h1>PAUSED</h1><p class="btns"><button class="go" data-a="resume">RESUME</button><button data-a="settings">SETTINGS</button><button data-a="quit">QUIT</button></p>`;
  else if(kind==='settings')card.innerHTML=`<h1>SETTINGS</h1>
      <label class="set"><span>Field of view</span><input type="range" min="60" max="100" step="1" value="${SET.fov}" data-k="fov"></label>
      <label class="set"><span>Volume</span><input type="range" min="0" max="1" step=".05" value="${SET.volume}" data-k="volume"></label>
      <label class="set"><span>Music</span><input type="range" min="0" max="1" step=".05" value="${SET.music}" data-k="music"></label>
      <label class="set chk"><input type="checkbox" data-k="muted"${SET.muted?' checked':''}><span>Sound off (M)</span></label>
      <label class="set chk"><input type="checkbox" data-k="calm"${SET.calm?' checked':''}><span>Calm mode: steadier print, no shake</span></label>
      <label class="set"><span>Quality</span><select data-k="quality">${['auto','high','low'].map(q=>`<option${q===SET.quality?' selected':''}>${q}</option>`).join('')}</select></label>
      <p class="btns"><button class="go" data-a="back">DONE</button></p>`;
  else{card.innerHTML=`<div class="cols"><div><h1>RUN OVER</h1><p class="sub">${mode==='daily'?"today's run":'run '+runNo} · ${WHY[how]||''}</p>
      <p class="big">${pad(m)} M</p><p class="best">${ink} gathered · ${wasBest?'NEW BEST':'best '+pad(best)+' m'}</p>
      <p class="btns"><button class="go" data-a="again">RUN AGAIN</button><button data-a="quit">MENU</button></p></div>
      <div><img class="pc" alt="Postcard of this run"><button data-a="save">SAVE POSTCARD</button></div></div>`;
    if(needSnap){print.render(scene,camera);takeSnap();}
    if(snap){const R2=regionAt(R.s),hex=[print.u.uInk0,print.u.uInk1,print.u.uInk2].map(x=>toHex(x.value));
      card_pc=postcard({snap,region:REGION_INFO[R2.r].name,metres:m,finds:foundLines(),runNo:mode==='daily'?today().key:runNo,best,inks:hex,paper:PAPERS[S.paper],why:WHY[how]});
      card.querySelector('.pc').src=card_pc.toDataURL('image/jpeg',.85);}}
  card.classList.add('show');}
function saveSettings(){store.set('settings',SET);}
function applySettings(){S.fov=SET.fov;fitFov();audio.setVolume(SET.volume);audio.setMusicVolume(SET.music);audio.setMuted(SET.muted);
  if(SET.quality!=='auto'){S.scale=SET.quality==='low'?.55:.9;resize();}}
card.addEventListener('input',e=>{const k=e.target.dataset.k;if(!k)return;SET[k]=e.target.type==='checkbox'?e.target.checked:e.target.type==='range'?+e.target.value:e.target.value;applySettings();saveSettings();});
function act(a){audio.start();
  if(a==='run')begin('endless');else if(a==='daily')begin('daily');else if(a==='again')begin(mode);
  else if(a==='settings')showCard('settings');else if(a==='back')showCard(prevCard==='settings'?'title':prevCard);
  else if(a==='resume')togglePause();else if(a==='quit'){paused=false;state='title';reset();showCard('title');}
  else if(a==='save')savePostcard();else if(a==='install'&&installEvt){installEvt.prompt();installEvt.userChoice.finally(()=>{installEvt=null;showCard('title');});}}
// "12 maple leaves", "3 acorns": what this run gathered, most first (at most two lines)
const named=(n,k)=>`${n} ${n===1?FINDS[k].one:FINDS[k].many}`;
function foundLines(){const L=got.map((n,k)=>[n,k]).filter(a=>a[0]).sort((a,b)=>b[0]-a[0]).slice(0,2).map(([n,k])=>named(n,k)+' gathered');return L.length?L:['nothing gathered'];}
// Copy the frame just drawn (it must be read before the browser presents it).
function takeSnap(){needSnap=false;snap=document.createElement('canvas');snap.width=canvas.width;snap.height=canvas.height;snap.getContext('2d').drawImage(canvas,0,0);}
// Save the postcard: the share sheet where there is one (phones), a download otherwise.
function savePostcard(){if(!card_pc)return;card_pc.toBlob(async blob=>{const name=`riso-runner-run-${runNo}.png`,file=new File([blob],name,{type:'image/png'});
  try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Riso Runner'});return;}}catch(e){if(e.name==='AbortError')return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);},'image/png');}
function hideCard(){card.classList.remove('show');cardKind='';}
let toastT=0;
function toastText(title,sub){toastEl.innerHTML=`<b>${title}</b><span>${sub}</span>`;toastEl.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('show'),2800);}
function toast(r){const info=REGION_INFO[r.r];toastEl.innerHTML=`<b>${info.name.toUpperCase()}</b><span>${info.twist?'watch out: '+info.twist:km(Math.max(0,r.leg*LEG))}</span>`;
  toastEl.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('show'),2800);}
let forkHTML='',forkT=0;
function forkBanner(html,hold=false){if(html===forkHTML)return;forkHTML=html;clearTimeout(forkT);
  if(html){forkEl.innerHTML=html;forkEl.classList.add('show');if(hold)forkT=setTimeout(()=>forkBanner(''),2400);}else forkEl.classList.remove('show');}

// ---------- inks and paper on the print and on the page ----------
// "By region" crossfades the drums as the regions blend; a named preset holds one set everywhere.
const toHex=v=>'#'+[v.x,v.y,v.z].map(c=>Math.round(c*255).toString(16).padStart(2,'0')).join('');
let inkLabel='';
function applyInks(){const Rg=regionAt(R.s),w=Rg.w,U=[print.u.uInk0,print.u.uInk1,print.u.uInk2];
  if(S.preset==='By region'){for(let k=0;k<3;k++){U[k].value.set(0,0,0);for(let r=0;r<6;r++)if(w[r])U[k].value.addScaledVector(INK3[r][k],w[r]);}}
  else PRESETS[S.preset].forEach((n,k)=>U[k].value.copy(hex3(INKS[n])));
  const paper=PAPERS[S.paper],hex=U.map(x=>toHex(x.value));print.u.uPaper.value.copy(hex3(paper));
  const label=`<b>${REGION_INFO[Rg.r].name.toUpperCase()}</b> · ${km(Math.max(0,R.s-startS))}`,key=label+hex.join()+paper;
  if(key===inkLabel)return;inkLabel=key;   // the page chrome only changes when something visibly does
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
    l.querySelector('select').onchange=e=>{S[k]=e.target.value;if(k==='start'){route.reset(REGION_INFO.findIndex(r=>r.name===S.start));world.rebuildAll();reset();if(state==='dead'){state='title';showCard('title');}}applyInks();e.target.blur();};box.appendChild(l);continue;}
  if(a===undefined){const l=document.createElement('label');l.className='chk';l.innerHTML=`<input type="checkbox"${S[k]?' checked':''}> ${label}`;
    l.querySelector('input').onchange=e=>{S[k]=e.target.checked;e.target.blur();};box.appendChild(l);continue;}
  const l=document.createElement('label');l.innerHTML=`<span>${label}</span><output>${S[k]}</output><input type="range" min="${a}" max="${b}" step="${step}" value="${S[k]}">`;
  const out=l.querySelector('output');
  l.querySelector('input').oninput=e=>{S[k]=+e.target.value;out.textContent=S[k];if(k==='sun')applySun();if(k==='scale')resize();if(k==='fov')fitFov();};
  l.querySelector('input').onchange=e=>e.target.blur();
  box.appendChild(l);
}
const lab=document.getElementById('lab');
const toggleLab=()=>lab.classList.toggle('hide');
document.getElementById('hideLab').onclick=()=>lab.classList.add('hide');
document.getElementById('labBtn').onclick=()=>lab.classList.remove('hide');
let paused=false,proofT=0;
const pauseBtn=document.getElementById('pause');
function togglePause(){if(state!=='run'&&!paused)return;paused=!paused;pauseBtn.textContent=paused?'RESUME':'PAUSE';duckHeld=false;if(paused)showCard('pause');else hideCard();}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='run'&&!paused)togglePause();});
pauseBtn.onclick=togglePause;
document.getElementById('proof').onclick=()=>{proofT=.6;};

// ---------- input: keys and swipes ----------
const go=()=>{if(cardKind==='title')begin('endless');else if(cardKind==='dead'&&deadT>.8)begin(mode);};
addEventListener('keydown',e=>{if(e.target.tagName==='SELECT'||e.target.tagName==='INPUT')return;const c=e.code;
  audio.start();
  if(c==='KeyL'){toggleLab();return;}if(c==='KeyP'||c==='Escape'){togglePause();return;}if(c==='KeyC'){proofT=.6;return;}
  if(c==='KeyM'){SET.muted=!SET.muted;applySettings();saveSettings();return;}
  if(paused){if(c==='Space'||c==='Enter'){e.preventDefault();togglePause();}return;}
  if(cardKind==='title'&&c==='KeyD'){begin('daily');return;}
  if(cardKind==='dead'&&c==='KeyS'){savePostcard();return;}
  if(state!=='run'){if(c==='Space'||c==='Enter'||c==='ArrowUp'){e.preventDefault();go();}return;}
  if(c==='KeyF'){focus();return;}
  if(e.repeat)return;
  if(c==='ArrowLeft'||c==='KeyA')lane(-1);else if(c==='ArrowRight'||c==='KeyD')lane(1);
  else if(c==='ArrowUp'||c==='KeyW'||c==='Space'){e.preventDefault();jump();}else if(c==='ArrowDown'||c==='KeyS'){e.preventDefault();duck(true);}});
addEventListener('keyup',e=>{if(e.code==='ArrowDown'||e.code==='KeyS')duck(false);});
addEventListener('blur',()=>duck(false));
// Swipes steer during a run (swipe down and keep holding to stay low); elsewhere a drag looks around
// (springs back) and a tap starts.
let yaw=0,pitch=0,ptr=null;
frameEl.addEventListener('pointerdown',e=>{audio.start();if(e.target.closest('#card'))return;ptr={x:e.clientX,y:e.clientY,yaw,pitch,done:false};frameEl.setPointerCapture(e.pointerId);});
frameEl.addEventListener('pointermove',e=>{if(!ptr)return;const dx=e.clientX-ptr.x,dy=e.clientY-ptr.y;
  if(state==='run'&&!paused){if(!ptr.done&&Math.hypot(dx,dy)>28){ptr.done=true;if(Math.abs(dx)>Math.abs(dy))lane(dx>0?1:-1);else if(dy<0)jump();else{duck(true);ptr.ducking=true;}}return;}
  yaw=ptr.yaw-dx*.005;pitch=Math.max(-.9,Math.min(.9,ptr.pitch-dy*.005));});
const up=e=>{if(ptr){if(ptr.ducking)duck(false);else if(!ptr.done&&e&&Math.hypot(e.clientX-ptr.x,e.clientY-ptr.y)<10){if(state==='run')jump();else go();}}ptr=null;};
frameEl.addEventListener('pointerup',up);frameEl.addEventListener('pointercancel',()=>up(null));
card.addEventListener('pointerup',e=>{const b=e.target.closest('button');if(b){e.stopPropagation();act(b.dataset.a);return;}if(e.target.closest('label'))return;go();});
document.getElementById('pauseHud').addEventListener('pointerdown',e=>{e.stopPropagation();audio.start();togglePause();});
const focusEl=document.getElementById('focus'),inkEl=document.getElementById('ink');
focusEl.addEventListener('pointerdown',e=>{e.stopPropagation();focus();});

// ---------- loop ----------
applyInks();applySun();resize();applySettings();showCard('title');
let t=0,last=performance.now(),pathY=null,fpsN=0,fpsT=0,qT=0,qN=0;
const look=new THREE.Vector3(),sunP=new THREE.Vector3(),F={},A={},distEl=document.getElementById('dist'),fpsEl=document.getElementById('fps');
const mix6=(w,key,out)=>{if(typeof RG[0][key]==='number'){let v=0;for(let r=0;r<6;r++)v+=w[r]*RG[r][key];return v;}
  out.set(0,0,0);for(let r=0;r<6;r++)if(w[r]){const a=RG[r][key];out.x+=a[0]*w[r];out.y+=a[1]*w[r];if(out.isVector3)out.z+=a[2]*w[r];}return out;};
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  const slow=focusT>0?FOCUS_SLOW:1;
  if(!paused){t+=dt*slow;if(state==='run')step(dt*slow);else if(state==='dead'){deadT+=dt;if(R.y<0&&R.y>-6){R.vy-=G*dt;R.y+=R.vy*dt;}}}
  const P=world.path,f=P.at(R.s,F),a=P.at(R.s+22,A),k=1-Math.exp(-6*dt);
  // camera: path height is smoothed (hills), the runner's own jump/duck is not
  const py=P.height(R.s);pathY=pathY===null?py:pathY+(py-pathY)*k;
  R.eye+=((R.duck?.78:1.62)-R.eye)*(1-Math.exp(-22*dt));
  camera.position.set(f.x+R.u*f.rx,pathY+R.eye+R.y,f.z+R.u*f.rz);
  look.set(a.x+R.u*.5*a.rx,P.height(R.s+22)+1.45+R.y*.35,a.z+R.u*.5*a.rz);camera.lookAt(look);
  R.roll+=((R.u-(R.branch?R.u:R.lane*LANE))*.02-R.roll)*k;
  if(!ptr||state==='run'){yaw*=1-k*.5;pitch*=1-k*.5;}
  shake=Math.max(0,shake-dt*2.5);
  camera.rotateY(yaw+Math.sin(t*61)*.012*shake);camera.rotateX(pitch-.02+Math.sin(t*47)*.02*shake);camera.rotateZ(R.roll);
  world.update(R.s,camera.position);sky.position.copy(camera.position);
  // the region sets the fog, sky, hills and light shafts
  const w=regionAt(R.s).w,mu=mat.uniforms,su=sky.material.uniforms;
  mu.uTime.value=t;mu.uFogDist.value=S.fog*mix6(w,'fogK');mix6(w,'fog',mu.uFogInk.value);
  mix6(w,'far',mu.uFarInk.value);mix6(w,'near',mu.uNearInk.value);mix6(w,'ringFog',mu.uRingFog.value);mu.uSnowLine.value=mix6(w,'snow');mu.uStrata.value=mix6(w,'strata');
  su.uFogInk.value.copy(mu.uFogInk.value);mix6(w,'sky',su.uSkyTop.value);su.uNight.value=mix6(w,'night');su.uKasumi.value=mix6(w,'kasumi');
  air.update(t,camera,w,print.rt.height/(2*Math.tan(camera.fov*Math.PI/360)));
  sunP.copy(mu.uSun.value).multiplyScalar(1000).add(camera.position).project(camera);
  const onScreen=sunP.z<1?1-Math.min(1,Math.max(0,(Math.max(Math.abs(sunP.x),Math.abs(sunP.y))-1)/.6)):0;
  print.u.uSunUV.value.set(sunP.x*.5+.5,sunP.y*.5+.5);print.u.uShaft.value=S.shafts*mix6(w,'shaft')*onScreen;
  // misregistration: a base drift plus more with speed; the key plate stays nearly registered.
  // A crash snaps every plate into register for a moment.
  proofT=Math.max(0,proofT-dt);
  const sp=state==='run'?R.v:0,m=proofT>0||focusT>0?0:(S.mis+sp*S.speedMis)*(SET.calm?.3:1),u=print.u,tick=Math.floor(t*12),j=S.reprint?(i=>(Math.sin(tick*12.9898+i*78.233)*43758.5453%1)*.35):()=>0;
  u.uMis0.value.set(-.85*m+j(1)*m,.55*m+j(2)*m);u.uMis1.value.set(.75*m+j(3)*m,-.4*m+j(4)*m);u.uMis2.value.set(.08*m,.04*m);
  u.uSeed.value=S.reprint?(tick*.618034)%1:0;
  u.uGrain.value=S.grain;u.uGrainAmt.value=S.grainAmt;u.uInkAmt.value=S.ink;u.uSoft.value=S.soft;u.uDepthDrift.value=focusT>0?0:S.drift;u.uOutline.value=S.outline;u.uThick.value=S.thick;
  u.uWobble.value=S.wobble;u.uDefects.value=S.defects;u.uDots.value=S.dots;u.uTone.value=S.tone;u.uHatch.value=S.hatch;u.uDeckle.value=S.deckle;u.uHalo.value=S.halo;
  applyInks();
  print.render(scene,camera);
  if(needSnap)takeSnap();   // the moment the run ended, for the postcard
  const dist=Math.floor(R.s-startS);hud.textContent=state==='title'?'':pad(dist)+' M';
  {const k=regionAt(R.s).r;inkEl.textContent=state==='title'?'':named(got[k],k).toUpperCase();}
  focusEl.style.setProperty('--fill',(focusT>0?focusT/FOCUS_T:meter)*100+'%');focusEl.classList.toggle('ready',meter>=1&&focusT<=0);focusEl.classList.toggle('on',focusT>0);
  focusEl.classList.toggle('hide',state==='title');
  audio.update(dt,w,state==='run'&&!paused?R.v:0,!R.air,state==='run'&&!paused);
  {const rg=regionAt(R.s);audio.music(rg.r,route.leg(rg.leg+1),paused?.35:state==='run'?1:.75,focusT>0);}
  document.getElementById('pauseHud').classList.toggle('hide',state!=='run');
  // quality on auto: drop the print's resolution if the frame rate sags (slow phones), creep back up if there's room
  if(SET.quality==='auto'&&state==='run'&&!paused&&!document.hidden){qT+=dt;qN++;if(qT>2.5){const fps=qN/qT;
    if(fps<46&&S.scale>.5){S.scale=Math.max(.5,S.scale-.1);resize();}else if(fps>58&&S.scale<.75){S.scale=Math.min(.75,S.scale+.05);resize();}qT=0;qN=0;}}
  fpsN++;fpsT+=dt;if(fpsT>.5){fpsEl.textContent=Math.round(fpsN/fpsT)+' fps';fpsN=0;fpsT=0;distEl.textContent=runNo+' · BEST '+pad(best);}
  requestAnimationFrame(frame);
}
window.RR={S,R,print,world,camera,scene,air,route,applyInks,applySun,begin,jump,duck,lane,focus,events,fill:()=>{meter=1;},get ink(){return ink;},get meter(){return meter;},get focusT(){return focusT;},
  tick:dt=>{world.update(R.s,camera.position);if(state==='run')step(dt);},get state(){return state;},get paused(){return paused;}};   // for poking at it from the console
requestAnimationFrame(frame);
