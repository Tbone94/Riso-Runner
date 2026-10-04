// trailer.js — the Riso Runner trailer, rendered offline from the game itself.
// Open index.html?trailer (main.js imports this) in a Chromium with WebCodecs H.264 (the Claude app's browser works):
//   ?trailer            ready: preview, contact sheet and render buttons
//   ?trailer#sheet      upload a contact sheet (a thumbnail every 0.5 s)
//   ?trailer#frames=a,b upload full frames at those times (seconds)
//   ?trailer#render     encode the MP4 (H.264 1080p60 + AAC) and upload it
// Uploads go to trailer/receiver.py (python3 trailer/receiver.py promo/trailer, port 5198).
// Every shot is real play: the game runs at 60 steps a second, an autopilot reads the obstacles ahead and
// jumps, ducks and changes lane. The trailer adds captions, the end card, the sound mix and the encoder.
import * as audio from '../src/audio.js';
import {LANE,START,forkAt,speedAt,tumbleLane,REGION_INFO} from '../src/world.js';

const RR=window.RR,FW=1920,FH=1080,FPS=60,DT=1/FPS,BAR=2;   // the music is 120 bpm: a bar every 2 s
const UPLOAD='http://127.0.0.1:5198/upload',MUSIC='music/jungle.m4a';
const STENCIL='"Big Shoulders Stencil Display", Impact, sans-serif',MONO='"Cutive Mono", "Courier New", monospace';
const PLAY_URL='tbone94.github.io/Riso-Runner';
const $=s=>document.querySelector(s),clamp=(v,a,b)=>v<a?a:v>b?b:v,ease=k=>1-Math.pow(1-clamp(k,0,1),3);

// ---------- the stage: the game's canvas at 1920×1080, nothing else on screen ----------
const css=document.createElement('style');
css.textContent=`#frame{position:fixed!important;left:0!important;top:0!important;width:${FW}px!important;height:${FH}px!important;inset:auto!important}
  #title,#bar,#slug,#hud,#ink,#focus,#toast,#fork,#card,#pauseHud,#lab,#labBtn,.crop,.reg{display:none!important}
  #tp{position:fixed;left:12px;top:12px;z-index:9;background:#f2ede3;border:2px solid #3d5588;padding:10px;font:13px ${MONO};color:#3d5588;width:500px}
  #tp canvas{width:480px;height:270px;display:block;margin-bottom:8px;background:#fff}
  #tp button{font:900 13px ${STENCIL};letter-spacing:.12em;border:2px solid currentColor;background:none;color:inherit;padding:6px 10px;margin:0 6px 6px 0;cursor:pointer}`;
document.head.appendChild(css);
const panel=document.createElement('div');panel.id='tp';
panel.innerHTML=`<canvas id="tview" width="960" height="540"></canvas><button id="tPrev">PREVIEW</button><button id="tSheet">CONTACT SHEET</button><button id="tRender">RENDER MP4</button><div id="tstatus">loading…</div>`;
document.body.appendChild(panel);
const status=s=>{$('#tstatus').textContent=s;},view=$('#tview'),vx=view.getContext('2d');
const out=document.createElement('canvas');out.width=FW;out.height=FH;const ox=out.getContext('2d');
const game=$('#c');
RR.S.scale=1;RR.S.deckle=0;audio.setMuted(true);RR.resize();

// ---------- sound: every effect the game plays is logged with its trailer time, mixed offline later ----------
const ORIG={...audio.sfx},LOG=[];let T=0,PRE=false;
for(const k in audio.sfx)audio.sfx[k]=(...a)=>{if(!PRE)LOG.push({t:T,name:k,args:a});};   // not during a shot's run-up
const MARKS=[],HITS=[];   // {t, what}: moments the music reacts to (focus, crash)

// ---------- the autopilot ----------
// Reads the obstacles ahead: rocks and tumbleweeds block lanes (pick the lane that stays clear longest, or the one
// with pickups); logs, falling trees and gaps are jumped so the arc peaks over them; branches are ducked under.
const JV=8.8,G=26;
function pilot(o={}){const R=RR.R,W=RR.world,s=R.s,v=Math.max(R.v,4);
  // forks: be in the chosen side lane well before the island
  const k=Math.floor((s-forkAt(0)+260)/1500),fs=forkAt(k);
  if(k>=0&&s>fs-240&&s<fs+75){steer(o.side||1);RR.duck(false);return;}
  const look=v*1.6+6,ahead=W.obs.between(s-3,s+look).filter(b=>b.s+b.len+.15>s).sort((a,b)=>a.s-b.s);
  const first=[1e9,1e9,1e9];let jumpO=null,duckO=null;
  for(const b of ahead){const kind=b.kind==='gap'?'gap':W.obs.variant(b).kind,d=b.s-s;
    if(kind==='rock1'||kind==='rock2'){for(let l=0;l<3;l++)if(b.mask[l])first[l]=Math.min(first[l],d);}
    else if(kind==='tumble'){const l=Math.round(tumbleLane(b)/LANE)+1;first[l]=Math.min(first[l],d);}
    else if(kind==='branch'){if(!duckO)duckO=b;}
    else if(!jumpO)jumpO=b;}
  if(o.crash){steer(o.crashLane??R.lane);}
  else{const cur=R.lane+1;let best=cur;
    if(first[cur]<1e9){for(let l=0;l<3;l++)if(first[l]>first[best]+.01||(first[l]===first[best]&&Math.abs(l-cur)<Math.abs(best-cur)))best=l;}
    else if(o.gather){let most=-1;for(let l=0;l<3;l++)if(first[l]>=1e9){const n=drops(s,l-1);if(n>most+.5||(n===most&&l===cur)){most=n;best=l;}}}
    steer(best-1);}
  if(jumpO){const c=jumpO.s+jumpO.len/2;if(!R.air&&c-s<=v*JV/G+.4&&c-s>0)RR.jump();}
  const ducking=duckO&&duckO.s-s<v*.22+1.4&&s<duckO.s+duckO.len+.5&&!(jumpO&&jumpO.s<duckO.s&&jumpO.s+jumpO.len>s-1);
  RR.duck(!!ducking);}
function steer(l){const R=RR.R;if(R.lane<l)RR.lane(1);else if(R.lane>l)RR.lane(-1);}
function drops(s,lane){let n=0;for(const c of[s,s+40])for(const d of RR.world.obs.dropsNear(c))if(!d.branch&&d.s>s+3&&d.s<s+34&&Math.abs(d.u-lane*LANE)<.5&&!RR.world.collected.has(d.id))n++;return n;}

// ---------- captions: stamped on paper labels in the region's key ink ----------
const keyInk=()=>{const v=RR.print.u.uInk2.value;return`rgb(${v.x*255|0},${v.y*255|0},${v.z*255|0})`;};
const midInk=()=>{const v=RR.print.u.uInk1.value;return`rgb(${v.x*255|0},${v.y*255|0},${v.z*255|0})`;};
const PAPER='#f2ede3';
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
const specks=(()=>{const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d'),r=rng(3);x.fillStyle='#000';
  for(let i=0;i<700;i++){const z=r()<.8?1.5:3;x.globalAlpha=.5+r()*.5;x.fillRect(r()*256,r()*256,z,z);}return ox.createPattern(c,'repeat');})();
// a label: lines [{text, size, font}], at (x, y) as fractions of the frame, appearing at t0 for dur seconds
function label(t,{t0,dur,lines,x=.5,y=.16,rot=-1.5,align='center',ink=keyInk()}){const a=t-t0;if(a<0||a>dur)return;
  const k=ease(a/.14),fade=1-clamp((a-dur+.25)/.25,0,1);if(fade<=0)return;
  ox.save();ox.globalAlpha=fade;
  const pad=26,gap=10;let w=0,h=0;for(const L of lines){ox.font=`${L.font||'900'} ${L.size}px ${L.mono?MONO:STENCIL}`;L.w=ox.measureText(L.text).width+(L.mono?0:L.size*.08*L.text.length);w=Math.max(w,L.w);h+=L.size+gap;}
  h+=pad*2-gap;w+=pad*2;
  const cx=x*FW,cy=y*FH,sc=1.12-.12*k;
  ox.translate(cx,cy);ox.rotate(rot*Math.PI/180);ox.scale(sc,sc);
  const bx=align==='left'?0:-w/2;
  ox.fillStyle='rgba(0,0,0,.18)';ox.fillRect(bx+7,-h/2+7,w,h);
  ox.fillStyle=PAPER;ox.fillRect(bx,-h/2,w,h);ox.strokeStyle=ink;ox.lineWidth=4;ox.strokeRect(bx+2,-h/2+2,w-4,h-4);
  let yy=-h/2+pad;ox.fillStyle=ink;ox.textBaseline='top';
  for(const L of lines){ox.font=`${L.font||'900'} ${L.size}px ${L.mono?MONO:STENCIL}`;ox.letterSpacing=L.mono?'0px':`${(L.size*.08).toFixed(1)}px`;
    ox.textAlign='left';ox.fillText(L.text,bx+(w-L.w)/2,yy+(L.mono?0:L.size*.04));yy+=L.size+gap;}
  ox.letterSpacing='0px';
  // starved ink: knock specks out of the label
  ox.globalCompositeOperation='destination-out';ox.globalAlpha=.35*fade;ox.fillStyle=specks;ox.fillRect(bx,-h/2,w,h);
  ox.restore();}
const big=(text,size=74)=>({text,size}),small=(text,size=30)=>({text,size,mono:true,font:'400'});

// ---------- the shots ----------
// region: forest 0, autumn 1, jungle 2, desert 3, snow 4, night 5. Each shot starts on a bar line.
const SHOTS=[
  {bars:2,region:0,seed:11,s:2470,cap:t=>label(t,{t0:.35,dur:3.4,lines:[big('AN ENDLESS RUN',84)]})},
  {bars:2,region:0,seed:23,s:5480,cap:t=>label(t,{t0:.2,dur:3.6,lines:[big('JUMP · DUCK · DODGE',84)]})},
  {bars:2,region:0,seed:5,legs:false,fork:1,side:1,cap:(t,sh)=>label(t,{t0:.2,dur:3.6,lines:[big('PICK YOUR PATH',84),small(sh.opts)]})},
  {bars:1,region:1,seed:31,s:3980,tag:'AUTUMN',twist:'trees fall across the path',head:'SIX REGIONS'},
  {bars:1,region:2,seed:41,s:4000,tag:'JUNGLE',twist:'mist and low branches',head:'SIX REGIONS'},
  {bars:1,region:3,seed:51,s:3990,tag:'DESERT',twist:'tumbleweeds',head:'EACH WITH A TWIST'},
  {bars:1,region:4,seed:61,s:4000,tag:'SNOW',twist:'icy lanes',head:'EACH WITH A TWIST'},
  {bars:1,region:5,seed:71,s:3990,tag:'NIGHT',twist:'the dark',head:'A NEW COURSE EVERY RUN'},
  {bars:3,region:1,seed:83,s:2500,gather:true,focusAt:1.1,cap:t=>{label(t,{t0:1.2,dur:2.3,lines:[big('SLOW TIME',84)]});label(t,{t0:3.5,dur:2.4,lines:[big('PICKUPS FLY TO YOU',84)]});}},
  {bars:2,region:3,seed:97,s:2600,crash:true,cap:t=>label(t,{t0:1.25,dur:2.6,lines:[big('EVERY RUN ENDS',64),big('ON A POSTCARD',64)],x:.27,y:.2,rot:-2})},
  {bars:3,region:0,seed:5,s:1000,end:true},
];
let t0=0;for(const sh of SHOTS){sh.t0=t0;sh.dur=sh.bars*BAR;t0+=sh.dur;}
const TOTAL=t0;

function setup(sh){
  if(sh.fork!==undefined){const fs=forkAt(sh.fork);RR.shot({region:sh.region,seed:sh.seed,s:fs-52,legs:false});
    sh.opts=RR.route.options(sh.fork).map(i=>REGION_INFO[i].name.toUpperCase()).join('   ◀  ▶   ');RR.R.lane=0;RR.R.u=0;}
  else RR.shot({region:sh.region,seed:sh.seed,s:sh.s,god:!sh.crash});
  sh.dead=false;sh.pc=null;sh.pcT=0;
  if(sh.crash){// run into the first rock ahead: start in its lane
    const R=RR.R,b=RR.world.obs.between(R.s+20,R.s+200).find(b=>b.kind==='rock1'||b.kind==='rock2');
    sh.crashLane=b?b.mask.indexOf(1)-1:0;sh.crashS=b?b.s:0;}
  if(sh.end){RR.R.v=6;}
}

// Step the game one frame for shot sh at shot time a (seconds since the shot began).
let clock=performance.now()+1000;
async function stepShot(sh,a){
  if(sh.focusAt!==undefined&&!sh.focused&&a>=sh.focusAt){sh.focused=true;RR.fill();RR.focus();MARKS.push({t:T,what:'focus'});}
  if(sh.end){RR.R.v=6;RR.S.god=true;}
  // the crash: steer clear until a couple of seconds in, then hold the rock's lane
  const crashNow=sh.crash&&RR.R.s>sh.crashS-24;
  if(RR.state==='run')pilot({side:sh.side,gather:sh.gather,crash:crashNow,crashLane:sh.crashLane});
  clock+=1000/FPS;RR.frame(clock);
  if(!sh.crash&&!sh.end&&!PRE&&RR.state==='run'){const R=RR.R,hit=RR.world.collide(R.s,R.u,R.y,R.duck)||(RR.world.gapAt(R.s)&&R.y<.05?{k:'gap'}:null);
    if(hit)HITS.push({t:+T.toFixed(2),k:hit.k,lane:R.lane,u:+R.u.toFixed(2),y:+R.y.toFixed(2)});}   // the autopilot slipped (shots run with crashing off)
  if(sh.crash&&RR.state==='dead'&&!sh.dead){sh.dead=true;MARKS.push({t:T,what:'crash'});}
  if(sh.dead&&!sh.pc){await new Promise(r=>setTimeout(r,800));sh.pc=RR.postcard;sh.pcT=a;}
}

function compose(sh,a){
  ox.drawImage(game,0,0,FW,FH);
  if(sh.cap)sh.cap(a,sh);
  if(sh.tag){label(a,{t0:.12,dur:sh.dur-.1,lines:[big(sh.tag,96),small(sh.twist,30)],x:.06,y:.8,rot:-2,align:'left'});
    if(sh.head)label(a,{t0:0,dur:sh.dur,lines:[big(sh.head,84)],y:.15,rot:-1.2});}
  if(sh.pc){// the postcard drops onto the frame
    const k=ease((a-sh.pcT)/.45),w=900,h=600,x=FW*.66,y=FH*.53+(1-k)*-120;
    ox.save();ox.globalAlpha=clamp((a-sh.pcT)/.15,0,1);ox.translate(x,y);ox.rotate((4-2*k)*Math.PI/180);
    ox.fillStyle='rgba(0,0,0,.22)';ox.fillRect(-w/2+12,-h/2+12,w,h);ox.drawImage(sh.pc,-w/2,-h/2,w,h);ox.restore();}
  if(sh.end)endCard(a);
}
function endCard(a){const k=ease(a/.6);
  ox.save();ox.globalAlpha=.86*k;ox.fillStyle=PAPER;ox.fillRect(0,0,FW,FH);ox.restore();
  const ink='#3d5588',mid='#00838a';
  label(a,{t0:.25,dur:99,lines:[big('RISO RUNNER',190)],y:.36,rot:-1.5,ink});
  label(a,{t0:.9,dur:99,lines:[small('run as far as you can',40)],y:.555,rot:.8,ink:mid});
  label(a,{t0:1.6,dur:99,lines:[big('FREE IN YOUR BROWSER',58),small(PLAY_URL,40)],y:.74,rot:-1,ink});
}

// Render the whole trailer, calling each(frameIndex, t) after composing every frame.
async function run(each,{from=0,to=TOTAL}={}){LOG.length=0;MARKS.length=0;HITS.length=0;let f=0;
  for(const sh of SHOTS){sh.focused=false;
    if(sh.t0+sh.dur<=from||sh.t0>=to){f+=Math.round(sh.dur*FPS);continue;}
    PRE=true;setup(sh);for(let i=0;i<Math.round(.5*FPS);i++){T=sh.t0;await stepShot(sh,-.5+i*DT);}PRE=false;   // half a second's run-up, so the world is built and moving
    const n=Math.round(sh.dur*FPS);
    for(let i=0;i<n;i++,f++){const a=i*DT;T=sh.t0+a;await stepShot(sh,a);if(T<from-1e-6||T>to+1e-6)continue;compose(sh,a);await each(f,T);}}
}

// ---------- the mix: the music loop plus the logged effects, rendered offline ----------
async function renderAudio(){const SR=48000,len=Math.ceil(TOTAL*SR),ac=new OfflineAudioContext(2,len,SR);
  const bus=ac.createGain();bus.connect(ac.destination);
  // music: the region loop, muffled during focus, cut for the crash, faded at the end
  const man=await (await fetch('music/music.json')).json(),m=(man.loops||man).jungle;
  const mb=await ac.decodeAudioData(await (await fetch(MUSIC)).arrayBuffer());
  const src=ac.createBufferSource(),lp=ac.createBiquadFilter(),mg=ac.createGain();src.buffer=mb;src.loop=true;src.loopStart=m.pad;src.loopEnd=m.pad+m.loop;
  lp.type='lowpass';lp.frequency.value=20000;src.connect(lp);lp.connect(mg);mg.connect(bus);mg.gain.value=.62;src.start(0,m.pad);
  for(const k of MARKS){
    if(k.what==='focus'){const sh=SHOTS.find(s=>k.t>=s.t0&&k.t<s.t0+s.dur);lp.frequency.setValueAtTime(20000,k.t);lp.frequency.exponentialRampToValueAtTime(900,k.t+.3);
      lp.frequency.setValueAtTime(900,sh.t0+sh.dur-.25);lp.frequency.exponentialRampToValueAtTime(20000,sh.t0+sh.dur);}
    if(k.what==='crash'){const sh=SHOTS.find(s=>k.t>=s.t0&&k.t<s.t0+s.dur);mg.gain.setValueAtTime(.62,k.t);mg.gain.linearRampToValueAtTime(.06,k.t+.06);
      mg.gain.setValueAtTime(.06,k.t+.9);mg.gain.linearRampToValueAtTime(.62,sh.t0+sh.dur);}}
  mg.gain.setValueAtTime(.62,TOTAL-2.5);mg.gain.linearRampToValueAtTime(0,TOTAL-.05);
  const fx=ac.createGain();fx.gain.value=1.6;fx.connect(bus);
  audio.renderSfx(ac,fx,LOG,ORIG);
  const buf=await ac.startRendering();
  // level: about -16 dBFS RMS, soft-clipped, peaks under -1 dBFS
  let q=0;const n=buf.length;for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=0;i<n;i++)q+=d[i]*d[i];}
  const g=Math.pow(10,(-16-10*Math.log10(q/(2*n)+1e-12))/20);let peak=0;
  for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=0;i<n;i++){d[i]=Math.tanh(d[i]*g);peak=Math.max(peak,Math.abs(d[i]));}}
  const p=Math.min(1,.89/peak);for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=0;i<n;i++)d[i]*=p;}
  return buf;}
function wav(buf){const n=buf.length,b=new DataView(new ArrayBuffer(44+n*4)),w=(o,s)=>{for(let i=0;i<s.length;i++)b.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF');b.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');b.setUint32(16,16,true);b.setUint16(20,1,true);b.setUint16(22,2,true);b.setUint32(24,buf.sampleRate,true);
  b.setUint32(28,buf.sampleRate*4,true);b.setUint16(32,4,true);b.setUint16(34,16,true);w(36,'data');b.setUint32(40,n*4,true);
  const L=buf.getChannelData(0),R=buf.getChannelData(1);for(let i=0;i<n;i++){b.setInt16(44+i*4,clamp(L[i],-1,1)*32767,true);b.setInt16(46+i*4,clamp(R[i],-1,1)*32767,true);}
  return new Blob([b.buffer],{type:'audio/wav'});}

// ---------- output ----------
async function upload(name,blob){const r=await fetch(`${UPLOAD}?name=${encodeURIComponent(name)}`,{method:'POST',body:blob});if(!r.ok)throw new Error('upload failed');}
const toBlob=(c,type='image/jpeg',q=.88)=>new Promise(r=>c.toBlob(r,type,q));
const show=()=>vx.drawImage(out,0,0,view.width,view.height);
// yield without timers (a hidden tab throttles setTimeout, not channel messages)
const ych=new MessageChannel(),yq=[];ych.port1.onmessage=()=>{const r=yq.shift();if(r)r();};
const breathe=()=>new Promise(r=>{yq.push(r);ych.port2.postMessage(0);});

async function contactSheet(every=.5){const cols=8,tw=320,th=180,n=Math.ceil(TOTAL/every),rows=Math.ceil(n/cols);
  const c=document.createElement('canvas');c.width=cols*tw;c.height=rows*th;const x=c.getContext('2d');x.font='16px monospace';
  await run(async(f,t)=>{if(f%Math.round(every*FPS))return;const k=f/Math.round(every*FPS),X=(k%cols)*tw,Y=Math.floor(k/cols)*th;
    x.drawImage(out,X,Y,tw,th);x.fillStyle='#000';x.fillRect(X,Y,52,20);x.fillStyle='#fff';x.fillText(t.toFixed(1),X+3,Y+15);show();status(`sheet ${t.toFixed(1)}/${TOTAL}s`);await breathe();});
  await upload('contact.jpg',await toBlob(c));status('contact sheet uploaded');}
async function frames(list){const want=list.map(Number);
  await run(async(f,t)=>{for(const w of want)if(Math.round(w*FPS)===f){show();await upload(`frame-${w.toFixed(2)}.jpg`,await toBlob(out));}},{from:Math.min(...want)-.01,to:Math.max(...want)+.01});
  status('frames uploaded');}
async function renderMP4(){
  const {Muxer,ArrayBufferTarget}=await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5/build/mp4-muxer.mjs');
  const muxer=new Muxer({target:new ArrayBufferTarget(),video:{codec:'avc',width:FW,height:FH,frameRate:FPS},audio:{codec:'aac',numberOfChannels:2,sampleRate:48000},fastStart:'in-memory',firstTimestampBehavior:'offset'});
  const venc=new VideoEncoder({output:(c,m)=>muxer.addVideoChunk(c,m),error:e=>{console.error(e);status('video encoder error '+e);}});
  venc.configure({codec:'avc1.640032',width:FW,height:FH,bitrate:24e6,framerate:FPS,latencyMode:'quality',avc:{format:'avc'}});
  const t1=performance.now();
  await run(async(f,t)=>{const vf=new VideoFrame(out,{timestamp:Math.round(f*1e6/FPS),duration:Math.round(1e6/FPS)});venc.encode(vf,{keyFrame:f%120===0});vf.close();
    while(venc.encodeQueueSize>6)await breathe();
    if(f%30===0){show();status(`video ${t.toFixed(1)}/${TOTAL}s · ${((performance.now()-t1)/1000).toFixed(0)}s`);await breathe();}});
  await venc.flush();
  status('mixing sound…');const abuf=await renderAudio();await upload('riso-runner-trailer-audio.wav',wav(abuf));
  const aenc=new AudioEncoder({output:(c,m)=>muxer.addAudioChunk(c,m),error:e=>{console.error(e);status('audio encoder error '+e);}});
  aenc.configure({codec:'mp4a.40.2',numberOfChannels:2,sampleRate:48000,bitrate:192000});
  {const n=abuf.length,L=abuf.getChannelData(0),R=abuf.getChannelData(1),CHK=1024;
    for(let i=0;i<n;i+=CHK){const m=Math.min(CHK,n-i),d=new Float32Array(m*2);d.set(L.subarray(i,i+m),0);d.set(R.subarray(i,i+m),m);
      const ad=new AudioData({format:'f32-planar',sampleRate:48000,numberOfFrames:m,numberOfChannels:2,timestamp:Math.round(i/48000*1e6),data:d});aenc.encode(ad);ad.close();}
    await aenc.flush();}
  muxer.finalize();
  const blob=new Blob([muxer.target.buffer],{type:'video/mp4'});status(`uploading ${(blob.size/1e6).toFixed(1)} MB…`);
  await upload('riso-runner-trailer.mp4',blob);status(`done: riso-runner-trailer.mp4 (${(blob.size/1e6).toFixed(1)} MB, ${TOTAL}s)`);window.RENDER_DONE=blob.size;}
async function preview(){await run(async(f,t)=>{show();status(`${t.toFixed(2)}s`);await breathe();});}

// ---------- the itch kit: captioned GIFs (frame sequences, assembled by tools/gifs.py), screenshots, cover, banner ----------
// ?trailer#kit uploads gif-<name>-<nnn>.jpg (960×540, 15 fps), shot<n>.jpg (1920×1080, no captions), cover.png (1260×1000)
// and banner.png (1920×690).
const GIF=[
  {name:'run',region:0,seed:11,s:2470,dur:3.6,word:'RUN.',line:'as far as you can'},
  {name:'dodge',region:0,seed:23,s:5530,dur:3.6,word:'DODGE.',line:'jump, duck, change lanes'},
  {name:'forks',region:0,seed:5,fork:1,side:1,dur:3.6,word:'FORKS.',line:'pick where you run next'},
  {name:'regions',dur:3.6,word:'SIX REGIONS.',parts:[[1,31,3980],[2,41,4000],[3,51,3990],[4,61,4000],[5,71,3990],[0,23,5480]]},
  {name:'focus',region:1,seed:83,s:2500,gather:true,focusAt:.3,dur:3.6,word:'FOCUS.',line:'time slows, pickups fly to you'},
  {name:'postcard',region:3,seed:97,s:2600,crash:true,dur:4.2,word:'POSTCARDS.',line:'every run ends on one'},
  {name:'cover',region:2,seed:41,s:4000,dur:3.6,cover:true},
];
const STILLS=[[0,11,2470,1.6],[1,31,3980,1.2],[2,41,4000,1.4],[3,51,3990,1.0],[4,61,4000,1.4],[5,71,3990,1.3]];
const NAMES=REGION_INFO.map(r=>r.name.toUpperCase());
async function grab(sh,secs,each){PRE=true;setup(sh);for(let i=0;i<Math.round(.5*FPS);i++){T=0;await stepShot(sh,-.5+i*DT);}PRE=false;
  for(let i=0;i<Math.round(secs*FPS);i++){const a=i*DT;T=a;await stepShot(sh,a);ox.drawImage(game,0,0,FW,FH);if(sh.pc)compose({pc:sh.pc,pcT:sh.pcT,dur:9},a);await each(i,a);}}
const half=document.createElement('canvas');half.width=960;half.height=540;const hx=half.getContext('2d');
function gifCaption(a,word,line){label(a,{t0:.05,dur:99,lines:line?[big(word,150),small(line,52)]:[big(word,150)],x:.04,y:.2,rot:-2,align:'left'});}
async function kit(only=null){   // only: a list of GIF names (and 'stills') to redo
  // GIFs: every 4th frame (15 fps), with the caption stamped on
  for(const g of GIF){if(only&&!only.includes(g.name))continue;let n=0;
    const shots=g.parts?g.parts.map(([region,seed,s])=>({region,seed,s,dur:g.dur/g.parts.length})):[{...g}];
    for(const sh of shots){await grab(sh,sh.dur,async(i,a)=>{if(i%4)return;
      if(g.word)gifCaption(n/15,g.word,g.parts?NAMES[sh.region]:g.line);
      if(g.cover)label(n/15,{t0:.05,dur:99,lines:[big('RISO RUNNER',170)],y:.5,rot:-2});
      hx.drawImage(out,0,0,960,540);await upload(`gif-${g.name}-${String(n++).padStart(3,'0')}.jpg`,await toBlob(half,'image/jpeg',.92));
      vx.drawImage(out,0,0,view.width,view.height);status(`gif ${g.name} ${n}`);});}}
  // screenshots: one per region, no captions
  if(!only||only.includes('stills'))for(const [k,[region,seed,s,at]] of STILLS.entries()){let shot=null;
    await grab({region,seed,s},at+DT,async(i,a)=>{if(a>=at-1e-6&&!shot){shot=true;await upload(`shot${k+1}.jpg`,await toBlob(out,'image/jpeg',.9));}});
    if(k===2)coverArt=await createImageBitmap(out);if(k===0)bannerArt=await createImageBitmap(out);status(`shot ${k+1}`);}
  if(coverArt){await upload('cover.png',await toBlob(cover(),'image/png'));await upload('banner.png',await toBlob(banner(),'image/png'));}
  status('kit uploaded');window.KIT_DONE=true;}
let coverArt=null,bannerArt=null;
const INKS6=[['Sunflower','Teal','Federal Blue'],['Sunflower','Orange','Burgundy'],['Yellow','Green','Hunter Green'],['Sunflower','Orange','Medium Blue'],['Aqua','Medium Blue','Federal Blue'],['Yellow','Violet','Federal Blue']].map(r=>r.map(n=>Riso.INKS[n]));   // each region's three inks
function regMark(x,cx,cy,ink){x.strokeStyle=ink;x.lineWidth=3;x.beginPath();x.arc(cx,cy,14,0,7);x.moveTo(cx-22,cy);x.lineTo(cx+22,cy);x.moveTo(cx,cy-22);x.lineTo(cx,cy+22);x.stroke();}
function raggedTop(x,y,w,r){x.beginPath();x.moveTo(0,y+20);for(let i=0;i<=40;i++)x.lineTo(w*i/40,y+10+r()*20);x.lineTo(w,9999);x.lineTo(0,9999);x.closePath();x.fill();}
function cover(){const W=1260,H=1000,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d'),r=rng(9);
  x.fillStyle=PAPER;x.fillRect(0,0,W,H);
  // the art: the jungle frame, cropped to the top of the card
  const sw=1920,sh=sw*660/W;x.drawImage(coverArt,0,(1080-sh)/2-40,sw,sh,0,0,W,660);
  x.fillStyle=PAPER;raggedTop(x,628,W,r);
  const ink='#3d5588',off='#ff6c2f';x.textAlign='center';x.textBaseline='alphabetic';
  x.font=`900 210px ${STENCIL}`;x.letterSpacing='6px';x.fillStyle=off;x.fillText('RISO RUNNER',W/2+8,858);x.fillStyle=ink;x.fillText('RISO RUNNER',W/2,850);
  x.font=`900 62px ${STENCIL}`;x.letterSpacing='5px';x.fillStyle=off;x.fillText('RUN AS FAR AS YOU CAN',W/2+4,938);x.fillStyle=ink;x.fillText('RUN AS FAR AS YOU CAN',W/2,935);
  x.letterSpacing='0px';regMark(x,44,H-44,ink);regMark(x,W-44,H-44,ink);
  INKS6.flat().forEach((h,i)=>{x.fillStyle=h;x.fillRect(W/2-9*28+i*28,H-30,24,12);});
  return c;}
function banner(){const W=1920,H=690,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  x.drawImage(bannerArt,0,(1080-H)/2-60,W,H,0,0,W,H);
  const ink='#3d5588',bx=W*.5,by=H*.52;x.save();x.translate(bx,by);x.rotate(-1.5*Math.PI/180);
  const w=1260,h=340;x.fillStyle='rgba(0,0,0,.18)';x.fillRect(-w/2+12,-h/2+12,w,h);x.fillStyle=PAPER;x.fillRect(-w/2,-h/2,w,h);x.strokeStyle=ink;x.lineWidth=6;x.strokeRect(-w/2+3,-h/2+3,w-6,h-6);
  x.textAlign='center';x.font=`900 190px ${STENCIL}`;x.letterSpacing='6px';x.fillStyle='#ff6c2f';x.fillText('RISO RUNNER',6,32);x.fillStyle=ink;x.fillText('RISO RUNNER',0,26);
  x.font=`400 42px ${MONO}`;x.letterSpacing='0px';x.fillText('run as far as you can · free · phone or desktop',0,112);x.restore();
  return c;}

window.trailer={kit,HITS,run,contactSheet,frames,renderMP4,preview,renderAudio,SHOTS,LOG,MARKS,TOTAL};
await document.fonts.load(`900 40px "Big Shoulders Stencil Display"`);await document.fonts.load(`20px "Cutive Mono"`);
$('#tPrev').onclick=preview;$('#tSheet').onclick=()=>contactSheet();$('#tRender').onclick=renderMP4;
status(`ready · ${TOTAL}s · ${SHOTS.length} shots`);
const h=location.hash;
try{if(h==='#sheet')await contactSheet();else if(h.startsWith('#frames='))await frames(h.slice(8).split(','));else if(h==='#render')await renderMP4();else if(h.startsWith('#kit'))await kit(h.includes('=')?h.split('=')[1].split(','):null);}
catch(e){console.error(e);status('error: '+e.message);window.RENDER_ERR=String(e&&e.stack||e);}
