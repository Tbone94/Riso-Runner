// audio.js — every sound is made in code with WebAudio: a bed of ambience per region, footsteps that
// change with the ground, and small effects. Nothing loads; the context starts on the first tap or key.
// Regions: forest, autumn, jungle, desert, snow, night. The music is the one thing that loads (see music()).
// Mix: effects and ambience (master, their own volume) and music (mbus, its own volume) meet in out (mute), then a
// safety limiter.
let ctx=null,master=null,out=null,noiseBuf=null,sfxVol=.8,muted=false;
const SFX=2.5,MUSIC=.56;   // scales: at the default sliders (effects .8, music .5) the music sits a few dB under the effects
const beds=[];let birdT=0,stepPhase=0,lastFoot=0;

function noise(){if(noiseBuf)return noiseBuf;const n=ctx.sampleRate*2;noiseBuf=ctx.createBuffer(1,n,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;return noiseBuf;}
function src(loop=true){const s=ctx.createBufferSource();s.buffer=noise();s.loop=loop;return s;}
const env=(g,t,a,peak,d)=>{g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);};

export function start(){
  if(ctx){if(ctx.state==='suspended')ctx.resume();return;}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  ctx=new AC();out=ctx.createGain();out.gain.value=muted?0:1;
  const lim=ctx.createDynamicsCompressor();lim.threshold.value=-6;lim.knee.value=4;lim.ratio.value=12;lim.attack.value=.003;lim.release.value=.25;
  out.connect(lim);lim.connect(ctx.destination);master=ctx.createGain();master.gain.value=SFX*sfxVol;master.connect(out);
  mlp=ctx.createBiquadFilter();mlp.type='lowpass';mlp.frequency.value=20000;mbus=ctx.createGain();mbus.gain.value=0;mbus.connect(mlp);mlp.connect(out);
  fetch('music/music.json').then(r=>r.ok?r.json():null).then(m=>{man=m&&(m.loops||m);msync=!!(m&&m.sync);}).catch(()=>{});
  document.addEventListener('visibilitychange',()=>{document.hidden?ctx.suspend():ctx.resume();});   // no sound from a hidden tab
  // ambience beds: a filtered noise per region (wind through leaves, jungle hum, desert wind, hush, night)
  const BED=[{f:900,q:.6,g:.05},{f:1400,q:.5,g:.07},{f:3800,q:3,g:.035},{f:420,q:.4,g:.07},{f:600,q:.3,g:.045},{f:5200,q:6,g:.02}];
  for(const b of BED){const s=src(),f=ctx.createBiquadFilter(),g=ctx.createGain();f.type='bandpass';f.frequency.value=b.f;f.Q.value=b.q;g.gain.value=0;
    s.connect(f);f.connect(g);g.connect(master);s.start(ctx.currentTime+Math.random());beds.push({g,base:b.g,f});}
}
export function setSfxVolume(v){sfxVol=v;if(master)master.gain.value=SFX*sfxVol;}   // effects and ambience; 0 is off
export function setMuted(m){muted=m;if(out)out.gain.value=muted?0:1;}
export const isMuted=()=>muted;
export function setMusicVolume(v){musicVol=v;}   // 0 is off

// ---------- music ----------
// One loop per region (music/<region>.m4a, listed in music/music.json), crossfading when the region you're in
// changes. Each file carries a second of the loop's own audio on both ends, so the loop points stay seamless
// whatever a decoder does with AAC's priming samples. Only the playing and the next region stay decoded.
// When every loop is the same length (versions of one theme, music.json "sync"), a new region's version starts at
// the same point in the bar as the one playing, so the tune carries on through the fade and only the band changes.
const NAMES=['forest','autumn','jungle','desert','snow','night'];
let man=null,msync=false,mbus=null,mlp=null,musicVol=.5,curR=-1,sync0=-1;
const xf=()=>msync?4:3;   // crossfade seconds
const loops={},voices=[];   // loops: region -> decode promise; voices: the loops playing (one, or two in a crossfade)
function loadLoop(r){const m=man&&man[NAMES[r]];if(!m)return null;
  return loops[r]||(loops[r]=fetch('music/'+m.file).then(x=>x.arrayBuffer()).then(b=>ctx.decodeAudioData(b)).then(buf=>({buf,m})).catch(()=>{delete loops[r];return null;}));}
function playLoop(r){const p=loadLoop(r);if(!p)return;
  p.then(L=>{if(!L||curR!==r||voices.some(v=>v.r===r&&!v.out))return;const t=ctx.currentTime,src=ctx.createBufferSource(),g=ctx.createGain();
    src.buffer=L.buf;src.loop=true;src.loopStart=L.m.pad;src.loopEnd=L.m.pad+L.m.loop;
    const live=voices.length>0;if(!live||!msync)sync0=t;const at=msync?(t-sync0)%L.m.loop:0;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(1,t+(live?xf():1.5));src.connect(g);g.connect(mbus);src.start(t,L.m.pad+at);
    const v={r,src,g,out:false};voices.push(v);src.onended=()=>voices.splice(voices.indexOf(v),1);});}
// Called every frame: r = the region you're in, next = the one after it, level = 1 running, less on cards and pause.
export function music(r,next,level=1,focus=false){
  if(!ctx||!man)return;const t=ctx.currentTime;
  mbus.gain.setTargetAtTime(MUSIC*musicVol*level,t,.4);
  mlp.frequency.setTargetAtTime(focus?900:20000,t,.2);   // focus muffles the music, as if underwater
  if(r!==curR){curR=r;for(const v of voices)if(!v.out&&v.r!==r){v.out=true;v.g.gain.cancelScheduledValues(t);v.g.gain.setValueAtTime(v.g.gain.value,t);v.g.gain.linearRampToValueAtTime(0,t+xf());v.src.stop(t+xf()+.1);}
    playLoop(r);}
  loadLoop(next);
  for(const k in loops)if(+k!==r&&+k!==next&&!voices.some(v=>v.r===+k))delete loops[k];   // let go of loops we're done with
}
export const _debug=()=>({ctx,master,out,mbus,voices,loops,curR,man,sync0});   // for measuring from the console

// The trailer's offline mix: play logged effects ({t, name, args}) into another context, each at its own time.
let tOff=0;
export function renderSfx(c,dest,log,play=sfx){const keep=[ctx,master,noiseBuf];ctx=c;master=dest;noiseBuf=null;
  for(const e of log){tOff=e.t;play[e.name](...e.args);}[ctx,master,noiseBuf]=keep;tOff=0;}

// a short tone with an envelope
function tone(freq,dur,{type='sine',gain=.2,glide=0,at=0,attack=.005}={}){if(!ctx)return;const t=ctx.currentTime+tOff+at,o=ctx.createOscillator(),g=ctx.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,t);if(glide)o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*glide),t+dur);
  env(g,t,attack,gain,dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+attack+dur+.05);}
// a burst of filtered noise
function hiss(dur,{freq=1200,q=1,type='bandpass',gain=.2,sweep=0,at=0,attack=.005}={}){if(!ctx)return;const t=ctx.currentTime+tOff+at,s=src(false),f=ctx.createBiquadFilter(),g=ctx.createGain();
  f.type=type;f.frequency.setValueAtTime(freq,t);if(sweep)f.frequency.exponentialRampToValueAtTime(freq*sweep,t+dur);f.Q.value=q;
  env(g,t,attack,gain,dur);s.connect(f);f.connect(g);g.connect(master);s.start(t,Math.random());s.stop(t+attack+dur+.05);}

// Called every frame: w = region weights, speed (m/s), grounded, ducking.
export function update(dt,w,speed,grounded,running){
  if(!ctx)return;const t=ctx.currentTime;
  beds.forEach((b,i)=>b.g.gain.setTargetAtTime(b.base*w[i]*(running?1:.7),t,.4));
  // footsteps: the stride quickens with speed; the ground changes the sound
  if(running&&grounded&&speed>1){stepPhase+=dt*speed/1.9;if(stepPhase>=1){stepPhase-=1;foot(w);}}
  // birds in the forest and autumn, parrots in the jungle, crickets at night
  birdT-=dt;if(birdT<=0){birdT=1.2+Math.random()*3;const r=Math.random();
    if(r<w[0]+w[1]){const f=2600+Math.random()*1800;for(let i=0;i<2+Math.random()*3;i++)tone(f*(1+.08*i),.07,{gain:.025,glide:1.25,at:i*.09});}
    else if(r<w[0]+w[1]+w[2]){const f=900+Math.random()*500;tone(f,.18,{type:'triangle',gain:.03,glide:1.6});tone(f*1.5,.12,{type:'triangle',gain:.02,glide:.7,at:.2});}
    else if(r<w[0]+w[1]+w[2]+w[5]*1.5){for(let i=0;i<6;i++)tone(4400,.025,{gain:.015,at:i*.06});}}
}
function foot(w){const snow=w[4],sand=w[3],wood=w[2];
  hiss(.07,{freq:snow>.5?2400:sand>.5?700:wood>.5?400:900,q:snow>.5?.8:1.5,gain:.05+.04*snow,type:snow>.5?'highpass':'bandpass'});
  tone(wood>.5?150:90,.06,{gain:wood>.5?.06:.04,glide:.6});}

export const sfx={
  jump(){hiss(.18,{freq:500,sweep:3,gain:.07});tone(180,.1,{gain:.05,glide:1.4});},
  land(){tone(80,.12,{gain:.09,glide:.5});hiss(.08,{freq:600,gain:.05});},
  duck(){hiss(.2,{freq:1800,sweep:.4,gain:.05});},
  lane(){hiss(.1,{freq:1200,sweep:1.6,gain:.025});},
  // pickups: a bell, rising through a pentatonic run as you string them together; each kind its own timbre
  pickup(kind,streak){const scale=[0,2,4,7,9,12,14,16,19,21],n=scale[Math.min(streak,scale.length-1)],f=[660,740,520,880,990,1180][kind]*Math.pow(2,n/12);
    tone(f,.22,{type:kind===3?'triangle':'sine',gain:.08});tone(f*2,.12,{gain:.025,at:.01});if(kind===5)tone(f*1.5,.3,{gain:.03,at:.03});},
  focus(){[0,4,7,12].forEach((n,i)=>tone(330*Math.pow(2,n/12),.9,{type:'triangle',gain:.05,at:i*.06,attack:.15}));},
  focusEnd(){tone(392,.4,{type:'triangle',gain:.04,glide:.7});},
  crash(){hiss(.5,{freq:300,type:'lowpass',gain:.25});tone(70,.4,{gain:.2,glide:.4});hiss(.35,{freq:3000,sweep:.3,gain:.08,at:.05});},
  chime(){tone(784,.3,{type:'triangle',gain:.05});tone(1046,.4,{type:'triangle',gain:.04,at:.12});},
};
