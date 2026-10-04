// audio.js — every sound is made in code with WebAudio: a bed of ambience per region, footsteps that
// change with the ground, and small effects. Nothing loads; the context starts on the first tap or key.
// Regions: forest, autumn, jungle, desert, snow, night.
let ctx=null,master=null,noiseBuf=null,vol=.8,muted=false;
const beds=[];let birdT=0,stepPhase=0,lastFoot=0;

function noise(){if(noiseBuf)return noiseBuf;const n=ctx.sampleRate*2;noiseBuf=ctx.createBuffer(1,n,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;return noiseBuf;}
function src(loop=true){const s=ctx.createBufferSource();s.buffer=noise();s.loop=loop;return s;}
const env=(g,t,a,peak,d)=>{g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);};

export function start(){
  if(ctx){if(ctx.state==='suspended')ctx.resume();return;}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  ctx=new AC();master=ctx.createGain();master.gain.value=muted?0:vol;master.connect(ctx.destination);
  // ambience beds: a filtered noise per region (wind through leaves, jungle hum, desert wind, hush, night)
  const BED=[{f:900,q:.6,g:.05},{f:1400,q:.5,g:.07},{f:3800,q:3,g:.035},{f:420,q:.4,g:.07},{f:600,q:.3,g:.045},{f:5200,q:6,g:.02}];
  for(const b of BED){const s=src(),f=ctx.createBiquadFilter(),g=ctx.createGain();f.type='bandpass';f.frequency.value=b.f;f.Q.value=b.q;g.gain.value=0;
    s.connect(f);f.connect(g);g.connect(master);s.start(ctx.currentTime+Math.random());beds.push({g,base:b.g,f});}
}
export function setVolume(v){vol=v;if(master)master.gain.value=muted?0:vol;}
export function setMuted(m){muted=m;if(master)master.gain.value=muted?0:vol;}
export const isMuted=()=>muted;

// a short tone with an envelope
function tone(freq,dur,{type='sine',gain=.2,glide=0,at=0,attack=.005}={}){if(!ctx)return;const t=ctx.currentTime+at,o=ctx.createOscillator(),g=ctx.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,t);if(glide)o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*glide),t+dur);
  env(g,t,attack,gain,dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+attack+dur+.05);}
// a burst of filtered noise
function hiss(dur,{freq=1200,q=1,type='bandpass',gain=.2,sweep=0,at=0,attack=.005}={}){if(!ctx)return;const t=ctx.currentTime+at,s=src(false),f=ctx.createBiquadFilter(),g=ctx.createGain();
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
