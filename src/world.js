// world.js — the endless path and the regions it runs through.
// Everything is laid out in path coordinates (s = distance along the path, u = metres to its right),
// so terrain, path and plants line up however the path bends. The world is built in 40 m chunks
// ahead of the runner and dropped behind it. Units are metres; the path is 3 lanes, 2.2 m apart.
// Each region lasts LEG metres and blends into the next over BLEND metres. Near the end of every
// region the path forks around an island: the left or right branch picks which region comes next.
import * as THREE from 'three';
import {ID} from './print.js';

export const LANE=2.2,PATH_HW=3.4,CHUNK=40;
export const REGIONS=['forest','autumn','jungle','desert','snow','night'];
export const REGION_INFO=[{name:'Forest',twist:''},{name:'Autumn',twist:'falling trees'},{name:'Jungle',twist:'mist and low branches'},
  {name:'Desert',twist:'tumbleweeds'},{name:'Snow',twist:'icy lanes'},{name:'Night',twist:'darkness'}];
export const LEG=1500,BLEND=400,FORK_LEN=70;
export const forkAt=k=>k*LEG+LEG-BLEND-300;          // the island's tip, 300 m before the next region starts blending in
const AHEAD=340,BEHIND=50;
export const START=60;
// Speed climbs from 9 m/s toward 25 and keeps creeping up; difficulty keeps rising for ~9 km.
export const speedAt=s=>9+16*(1-Math.exp(-Math.max(0,s-START)/4200));
const diffAt=s=>Math.min(2.5,Math.max(0,(s-200)/3500));

// ---------- noise ----------
function hash2(x,y,s){let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,982451653))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296;}
function vnoise(x,y,s=0){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi,s),b=hash2(xi+1,yi,s),c=hash2(xi,yi+1,s),d=hash2(xi+1,yi+1,s);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
function rng(seed){let s=(Math.imul(seed|0,2654435761)>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};

// ---------- the route: which region each leg is ----------
// Leg 0 is the starting region. Fork k (at the end of leg k) offers two other regions; until the runner
// picks, the world ahead is built as if they'll take the first.
export const route={start:0,picks:{},version:0,cache:[],
  options(k){const r=rng(k*7919+101),cur=this.leg(k),o=[0,1,2,3,4,5].filter(x=>x!==cur),a=o.splice(Math.floor(r()*o.length),1)[0];return[a,o[Math.floor(r()*o.length)]];},
  leg(k){if(k<=0)return this.start;if(this.cache[k]===undefined)this.cache[k]=this.options(k-1)[this.picks[k-1]??0];return this.cache[k];},
  choose(k,side){this.picks[k]=side;this.cache=[];this.version++;},
  reset(start){this.start=start;this.picks={};this.cache=[];this.version++;}};
// Region weights (one per region) at s, the leg you're in and its region.
export function regionAt(s){s=Math.max(0,s);const k=Math.floor(s/LEG),b=smooth(LEG-BLEND,LEG,s-k*LEG),w=[0,0,0,0,0,0];
  w[route.leg(k)]+=1-b;w[route.leg(k+1)]+=b;const n=b>.5?k+1:k,r=route.leg(n);return{w,leg:n,r,name:REGIONS[r]};}
// Ice on the path in the snow: long slippery stretches where changing lanes is slow.
export const iceAt=s=>regionAt(s).w[4]*smooth(.5,.58,vnoise(s/38,9.3,77));

// ---------- the path: heading and height are smooth sums of sines; x,z are integrated ----------
export class Path{
  constructor(){this.x=[0];this.z=[0];this.gapB=new Map();}
  heading(s){return .16*Math.sin(s/130+.5)+.09*Math.sin(s/53+2.1)+.04*Math.sin(s/23);}
  height(s){return 7*Math.sin(s/90)+2.4*Math.sin(s/37+.7)+.3*Math.sin(s/15+2);}   // gentle crests: you can always see ~30 m over a rise
  ensure(s){const X=this.x,Z=this.z;while(X.length-2<s){const i=X.length-1,h=this.heading(i+.5);X.push(X[i]+Math.sin(h));Z.push(Z[i]-Math.cos(h));}}
  // frame at s: position on the centre line, forward (fx,fz) and right (rx,rz) on the ground plane
  at(s,o={}){s=Math.max(0,s);this.ensure(s+2);const i=Math.floor(s),t=s-i,h=this.heading(s);
    o.x=this.x[i]+(this.x[i+1]-this.x[i])*t;o.z=this.z[i]+(this.z[i+1]-this.z[i])*t;o.y=this.height(s);
    o.fx=Math.sin(h);o.fz=-Math.cos(h);o.rx=Math.cos(h);o.rz=Math.sin(h);return o;}
  bio(s){return regionAt(s).w;}
  // the fork around s, if any: its index, where it starts, and how far the branches have spread apart
  fork(s){const k=Math.floor((s-forkAt(0)+40)/LEG);if(k<0)return null;const fs=forkAt(k);if(s<fs-1||s>fs+FORK_LEN+1)return null;
    return{k,fs,spread:4.8*smooth(fs,fs+16,s)*(1-smooth(fs+FORK_LEN-16,fs+FORK_LEN,s))};}
  spread(s){const f=this.fork(s);return f?f.spread:0;}
  // is (s,u) on a path surface (the 3-lane path, or a fork branch), within margin m?
  onPath(s,u,m=0){const f=this.fork(s);if(f&&s>=f.fs&&s<=f.fs+FORK_LEN)return Math.abs(Math.abs(u)-(LANE+f.spread))<1.3+m;return Math.abs(u)<PATH_HW+m;}
  // clearings (forest, autumn, snow fields): every few hundred metres the trees thin into a meadow
  open(s){const w=this.bio(s);return smooth(.52,.72,vnoise(s/170,.5,21))*(w[0]+w[1]+.8*w[4]+.5*w[5]);}
  // ground height across the valley: flat path and shoulders, then rising banks
  ground(s,u){const a=Math.abs(u),aa=Math.max(0,a-this.spread(s)),side=u<0?1:2,rise=Math.max(0,aa-4.2),w=this.bio(s);
    const bank=(24*w[0]+18*w[1]+10*w[2]+6*w[3]+30*w[4]+22*w[5])*(1-.8*this.open(s));
    const ridge=(.5+.9*vnoise(s*.005,side*5.3,7))*bank*(1-Math.exp(-rise/38));
    const bumps=(vnoise(s*.03,u*.03,3)-.5)*(7-4*w[3])*smooth(4.2,18,aa);
    return this.height(s)+ridge+bumps-3.2*this.gapDip(s)*(1-smooth(5,13,a));}
  // how deep we are into a gap's ravine (0 outside, 1 inside), for the ground and the water
  gapDip(s){const B=this.gapB.get(Math.floor(s/CHUNK));if(!B)return 0;let w=0;
    for(const g of B){const a=g.s,b=g.s+g.len;w=Math.max(w,smooth(a-2.5,a-.4,s)*(1-smooth(b+.4,b+2.5,s)));}return w;}
}

// ---------- obstacles ----------
// One endless, seeded sequence (the same every run). Spacing never drops below ~1.15 s of running,
// so every obstacle can be read and answered; harder patterns unlock with distance.
//   log    across every lane, jump it          branch  across every lane, duck under it
//   rock1  blocks one lane                     rock2   blocks two lanes, one stays open
//   gap    a stream or chasm across the path, jump it
// Regions put their own twist on some of them (variant()): autumn logs become trees that topple across
// the path as you near them, desert logs become tumbleweeds rolling across the lanes, jungle rocks become
// low branches. Moving things move by your distance to them, not by the clock, so they're always fair.
export class Obstacles{
  constructor(path){this.P=path;this.B=new Map();this.next=START+110;this.rnd=rng(4711);}
  put(o,a,b){for(let k=Math.floor(a/CHUNK);k<=Math.floor(b/CHUNK);k++){if(!this.B.has(k))this.B.set(k,[]);this.B.get(k).push(o);}}
  // the end of the no-obstacle zone around a fork, if x is in one
  forkClear(x){const k=Math.floor((x-forkAt(0)+60)/LEG);if(k<0)return 0;const fs=forkAt(k);return x>fs-40&&x<fs+FORK_LEN+25?fs+FORK_LEN+25:0;}
  ensure(s){const r=this.rnd;while(this.next<s){let at=this.next;const fc=this.forkClear(at);if(fc){this.next=fc;continue;}
      const d=diffAt(at),v=speedAt(at);
      const W={log:1,branch:d>.03?.8:0,rock1:1.1,rock2:d>.12?.8:0,gap:d>.06?.5+.3*d:0};
      let tot=0;for(const k in W)tot+=W[k];let x=r()*tot,kind='log';for(const k in W)if((x-=W[k])<0){kind=k;break;}
      const o=this.make(kind,at,r);let end=o.s+o.len;
      // follow-ups, once there's been time to read the first (each at least ~0.8 s later)
      const follow=(k2,gap,mod)=>{const p=end+v*gap;if(this.forkClear(p))return;const f=this.make(k2,p,r,mod);end=f.s+f.len;};
      const q=r();
      if(kind==='rock2'&&d>.35&&q<Math.min(.8,.3+.25*d))follow(r()<.5?'log':'branch',.8);                 // dodge, then jump or duck
      else if(kind==='log'&&d>.6&&q<.3)follow('rock1',.85);                                              // jump, then dodge
      else if(kind==='rock2'&&d>.8&&q<.95){const open=o.mask.indexOf(0);follow('rock2',.85,f=>{f.mask=[1,1,1];f.mask[(open+1+Math.floor(r()*2))%3]=0;});}   // zigzag
      else if(kind==='gap'&&d>1.1&&q<.25)follow('branch',.95);                                            // leap, then duck
      this.next=end+Math.max(v*1.15,(34-19*Math.min(d,1)-4*Math.max(0,d-1))*(.85+.4*r()));}}
  make(kind,s,r,mod){const o={kind,s,seed:r(),seed2:r(),seed3:r(),mask:[1,1,1]};
    if(kind==='log')o.len=.9;
    else if(kind==='branch')o.len=.7;
    else if(kind==='rock1'){o.mask=[0,0,0];o.mask[Math.floor(r()*3)]=1;o.len=1.4;}
    else if(kind==='rock2'){o.mask[Math.floor(r()*3)]=0;o.len=1.4;}
    else{o.s=Math.round(s);o.len=Math.round(3+1.5*Math.min(1,diffAt(s)));
      for(let k=Math.floor((o.s-3)/CHUNK);k<=Math.floor((o.s+o.len+3)/CHUNK);k++){if(!this.P.gapB.has(k))this.P.gapB.set(k,[]);this.P.gapB.get(k).push(o);}}
    if(mod)mod(o);
    this.put(o,o.s-3,o.s+o.len+3);return o;}
  // which region dresses this obstacle, and what it really is there
  variant(o){if(o.vv===route.version)return o.v;const w=regionAt(o.s).w;let x=o.seed,r=0;for(;r<5;r++)if((x-=w[r])<0)break;
    let kind=o.kind;
    if(r===1&&kind==='log'&&o.seed2<.65)kind='fall';
    else if(r===2&&kind==='rock1'&&o.seed2<.45)kind='branch';
    else if(r===3&&kind==='log'&&o.seed2<.65)kind='tumble';
    o.v={r,kind};o.vv=route.version;return o.v;}
  near(s){return this.B.get(Math.floor(s/CHUNK))||[];}
  between(a,b){const out=new Set();for(let k=Math.floor(a/CHUNK);k<=Math.floor(b/CHUNK);k++)for(const o of this.B.get(k)||[])if(o.s>=a&&o.s<b)out.add(o);return[...out];}
}
// A tumbleweed's lane at the moment you reach it, and where it is when you're d metres away.
export const tumbleLane=o=>(Math.floor(o.seed3*3)-1)*LANE;
const tumbleU=(o,d)=>tumbleLane(o)+((o.seed3*97)%1<.5?-1:1)*Math.max(-11,Math.min(11,d*.38));
// A falling tree's tilt (0 standing … 1 down) when you're d metres away: it falls between 36 and 19 m.
const fallT=d=>smooth(36,19,d);

// ---------- cut-paper geometry (all built about 1 unit tall) ----------
// aBio  = region weights (autumn, jungle, desert) for ground and path
// aBio2 = (snow, night, extra): extra is ice on the path, or the dressing region of an obstacle
const KEYS=['position','normal','aId','aUV','aBio','aBio2'];
function part(g,id,smoothN=false){if(smoothN&&g.index)g.computeVertexNormals();g=g.index?g.toNonIndexed():g;if(!smoothN||!g.attributes.normal)g.computeVertexNormals();
  const n=g.attributes.position.count;
  g.setAttribute('aId',new THREE.BufferAttribute(new Float32Array(n).fill(id),1));
  g.setAttribute('aUV',new THREE.BufferAttribute(new Float32Array(n*2),2));
  g.setAttribute('aBio',new THREE.BufferAttribute(new Float32Array(n*3),3));
  g.setAttribute('aBio2',new THREE.BufferAttribute(new Float32Array(n*3),3));
  for(const k of Object.keys(g.attributes))if(!KEYS.includes(k))g.deleteAttribute(k);return g;}
function merge(parts){const out=new THREE.BufferGeometry();
  for(const k of KEYS){const arrs=parts.map(p=>p.attributes[k].array),len=arrs.reduce((a,b)=>a+b.length,0),A=new Float32Array(len);let o=0;for(const a of arrs){A.set(a,o);o+=a.length;}
    out.setAttribute(k,new THREE.BufferAttribute(A,parts[0].attributes[k].itemSize));}
  return out;}
const at=(g,x,y,z,sx=1,sy=1,sz=1,ry=0)=>{g.scale(sx,sy,sz);if(ry)g.rotateY(ry);g.translate(x,y,z);return g;};
const raw=pos=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));return g;};
// a world-built mesh geometry from flat arrays
function built(pos,uv,bio,bio2,ids,nor=null,index=null){const g=new THREE.BufferGeometry(),n=pos.length/3;g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('aUV',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('aBio',new THREE.Float32BufferAttribute(bio,3));g.setAttribute('aBio2',new THREE.Float32BufferAttribute(bio2,3));
  g.setAttribute('aId',new THREE.Float32BufferAttribute(typeof ids==='number'?new Array(n).fill(ids):ids,1));
  if(index)g.setIndex(index);if(nor)g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));else g.computeVertexNormals();return g;}
const R0=rng(99);

// forest, autumn, snow, night
function pineGeo(){const P=[part(at(new THREE.CylinderGeometry(.016,.026,.3,6),0,.15,0),ID.TRUNK)];
  for(let i=0;i<4;i++){const r=.3-.062*i,h=.36-.03*i;P.push(part(at(new THREE.ConeGeometry(r,h,9),0,.2+i*.19+h/2,0,1,1,1,i*.7),ID.LEAF,true));}
  return merge(P);}
const blob=(r,x,y,z,sy,ry,id=ID.LEAF)=>part(at(new THREE.IcosahedronGeometry(r,1),x,y,z,1,sy,1,ry),id,true);
function broadleafGeo(){return merge([part(at(new THREE.CylinderGeometry(.016,.03,.55,6),0,.275,0),ID.TRUNK),
  blob(.27,0,.64,0,.85,0),blob(.21,.18,.53,.06,.8,.5),blob(.2,-.16,.56,-.08,.8,1.1),blob(.17,.02,.84,.04,.8,2)]);}
function birchGeo(){return merge([part(at(new THREE.CylinderGeometry(.013,.018,.92,7),0,.46,0),ID.BIRCH),blob(.15,.05,.82,0,1.3,0),blob(.12,-.07,.7,.03,1.3,1)]);}
function bushGeo(id=ID.LEAF){return merge([blob(.5,0,.45,0,.9,0,id),blob(.36,.36,.32,.12,.9,.8,id),blob(.3,-.3,.3,-.1,.9,1.6,id)]);}
function rockGeo(id=ID.ROCK){return part(at(new THREE.DodecahedronGeometry(.5,0),0,.12,0,1,.55,.8),id);}
function grassGeo(id=ID.GRASS){const P=[];for(let i=0;i<5;i++){const a=i/5*Math.PI*2,lean=.35;
    const bx=Math.cos(a)*.05,bz=Math.sin(a)*.05,tx=Math.cos(a)*lean,tz=Math.sin(a)*lean,px=-Math.sin(a)*.045,pz=Math.cos(a)*.045;
    P.push(part(raw([bx-px,0,bz-pz, bx+px,0,bz+pz, tx,1-.2*(i%2),tz]),id));}
  return merge(P);}

// jungle
// A feathery frond along +x: a rib that lifts then droops, with a thin leaflet triangle either side of each step.
function frond(len,lift,droop,n,wid){const P=[],out=[];for(let i=0;i<=n;i++){const t=i/n;P.push([t*len,len*(lift*t-droop*t*t),0]);}
  for(let i=1;i<n;i++){const t=i/n,a=P[i],b=P[i+1],w=wid*len*Math.sin(Math.PI*Math.min(1,t*1.1));
    for(const sd of[-1,1])out.push(...a,...b,a[0]+w*.5,a[1]-w*.45,sd*w);}
  return raw(out);}
function palmGeo(){const P=[];
  for(let i=0;i<7;i++){const y0=i/7*.88,y1=(i+1)/7*.88,c=new THREE.CylinderGeometry(.017,.021,y1-y0+.004,7,1,true);c.translate(.06*Math.pow((y0+y1)/1.76,2),(y0+y1)/2,0);P.push(part(c,ID.PALM));}
  for(let k=0;k<11;k++){const g=frond(.36+.06*R0(),.55,1.5+.5*R0(),11,.2);g.rotateZ(-.15+.55*R0());g.rotateY(k/11*Math.PI*2+R0()*.3);g.translate(.06,.88,0);P.push(part(g,ID.FROND));}
  return merge(P);}
// A pleated fan on a stalk: wedges alternate up and down, so the light catches every other fold.
function fanGeo(){const P=[];
  for(let f=0;f<3;f++){const tilt=.5+.5*R0(),yaw=f/3*Math.PI*2+R0(),top=.45+.4*R0(),r=.42+.12*R0(),out=[],n=18;
    for(let i=0;i<n;i++){const a0=-2.5+5*i/n,a1=-2.5+5*(i+1)/n,y0=(i%2?.04:-.02),y1=(i%2?-.02:.04),cup=.18;
      out.push(0,0,0, Math.cos(a0)*r,cup*r+y0,Math.sin(a0)*r, Math.cos(a1)*r,cup*r+y1,Math.sin(a1)*r);}
    const g=raw(out);g.rotateX(tilt);g.rotateY(yaw);const dx=Math.sin(yaw)*.12*tilt,dz=Math.cos(yaw)*.12*tilt;g.translate(dx,top,dz);P.push(part(g,ID.FROND));
    const st=raw([0,0,0,.012,0,0,dx,top,dz, .012,0,0,dx+.012,top,dz,dx,top,dz]);P.push(part(st,ID.FROND));}
  return merge(P);}
// Big paddle leaves (banana / monstera), each folded along its midrib.
function bananaGeo(){const P=[part(at(new THREE.CylinderGeometry(.03,.045,.45,6),0,.225,0),ID.FROND)];
  for(let k=0;k<6;k++){const len=.55+.2*R0(),wid=.17,n=9,out=[];const M=[],E=[];
    for(let i=0;i<=n;i++){const t=i/n,x=t*len,y=len*(.9*t-1.1*t*t),w=wid*len*Math.pow(Math.sin(Math.PI*Math.min(t*1.05,1)),.7)*2;M.push([x,y,0]);E.push([x,y-w*.3,w]);}
    for(let i=0;i<n;i++)for(const sd of[-1,1]){const m0=M[i],m1=M[i+1],e0=[E[i][0],E[i][1],sd*E[i][2]],e1=[E[i+1][0],E[i+1][1],sd*E[i+1][2]];
      if(sd>0&&i%3===2)continue;                                   // a tear in the leaf
      out.push(...m0,...m1,...e0,...m1,...e1,...e0);}
    const g=raw(out);g.rotateZ(.5+.5*R0());g.rotateY(k/6*Math.PI*2+R0()*.4);g.translate(0,.42,0);P.push(part(g,ID.FROND));}
  return merge(P);}
function fernGeo(){const P=[];for(let k=0;k<9;k++){const g=frond(.6,.9,1.2+.4*R0(),9,.16);g.rotateZ(.1+.5*R0());g.rotateY(k/9*Math.PI*2+R0()*.4);g.translate(0,.05,0);P.push(part(g,ID.FROND));}return merge(P);}
// A rainforest giant: a tall mossy trunk with buttress fins and a flat canopy far overhead.
function tallGeo(){const P=[part(at(new THREE.CylinderGeometry(.011,.017,.82,7),0,.41,0),ID.MOSS)];
  for(let k=0;k<4;k++){const a=k/4*Math.PI*2+.3,c=Math.cos(a),s=Math.sin(a);P.push(part(raw([.012*c,0,.012*s, .07*c,0,.07*s, .012*c,.1,.012*s]),ID.MOSS));}
  P.push(blob(.17,0,.86,0,.4,0),blob(.13,.13,.83,.05,.45,.6),blob(.13,-.12,.85,-.07,.4,1.2),blob(.11,.03,.92,-.1,.45,2),blob(.1,-.04,.8,.13,.4,2.6));
  return merge(P);}
// A hanging vine, 1 unit long (scaled to length), with little pothos leaves stepping down it.
function vineGeo(){const out=[],n=14;for(let i=0;i<n;i++){const y0=1-i/n,y1=1-(i+1)/n,x0=.04*Math.sin(i*1.3),x1=.04*Math.sin((i+1)*1.3);
    out.push(x0-.05,y0,0, x0+.05,y0,0, x1,y1,0);const sd=i%2?1:-1;out.push(x1,y1,0, x1+sd*.6,y1+.004,.2, x1+sd*.45,y1-.02,-.15);}
  return part(raw(out),ID.VINE);}

// desert
function cactusGeo(){const C=(r,h,x,y,z,rz=0)=>{const g=new THREE.CylinderGeometry(r,r*1.05,h,12);if(rz)g.rotateZ(rz);g.translate(x,y,z);return part(g,ID.CACTUS,true);};
  const cap=(r,x,y,z)=>part(at(new THREE.SphereGeometry(r,12,5,0,Math.PI*2,0,Math.PI/2),x,y,z),ID.CACTUS,true);
  return merge([C(.07,.9,0,.45,0),cap(.07,0,.9,0),C(.048,.15,.1,.42,0,Math.PI/2),C(.048,.3,.17,.56,0),cap(.048,.17,.71,0),
    C(.044,.12,-.09,.55,0,Math.PI/2),C(.044,.2,-.15,.64,0),cap(.044,-.15,.74,0)]);}
// A butte: a jagged flat-topped column; the shader prints its strata.
function butteGeo(){const g=new THREE.CylinderGeometry(.42,.5,1,10,1),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),r=Math.hypot(x,z);if(r<1e-4)continue;const a=Math.atan2(z,x),k=.7+.6*hash2(Math.round((a+Math.PI)/(Math.PI*2)*10)%10,3,5);p.setX(i,x*k);p.setZ(i,z*k);}
  g.translate(0,.5,0);return part(g,ID.STRATA);}

// ---------- obstacle pieces (built in path space: x across the path, y up, z back along it) ----------
const box=(w,h,d,x,y,z,id)=>part(at(new THREE.BoxGeometry(w,h,d),x,y,z),id);
function logGeo(trunk,leaf){const g=new THREE.CylinderGeometry(.42,.46,7.8,10,1);g.rotateZ(Math.PI/2);g.translate(0,.42,0);
  const st=new THREE.CylinderGeometry(.07,.1,.8,6);st.rotateZ(-.7);st.translate(1.7,.95,0);
  return merge([part(g,trunk),part(st,trunk),blob(.5,-2.6,.8,.1,.6,0,leaf),blob(.4,2.9,.7,-.1,.6,1,leaf)]);}
function ledgeGeo(){return merge([box(7.8,.62,.9,0,.31,0,ID.STRATA),box(8.3,.2,1.15,0,.72,0,ID.STRATA)]);}
// A fallen tree resting across the banks, high enough to duck under (its underside is 1.2 m up).
function branchGeo(trunk,leaf,vines){const g=new THREE.CylinderGeometry(.3,.36,12,9,1);g.rotateZ(Math.PI/2-.04);g.translate(0,1.52,0);
  const P=[part(g,trunk),blob(.8,-1.3,1.95,0,.55,0,leaf),blob(.7,1.6,1.9,.1,.55,1,leaf),blob(.9,-3.9,1.9,-.1,.6,2,leaf),blob(.8,4.2,1.85,0,.6,3,leaf)];
  if(vines)for(const[x,y0,y1]of[[-4.2,1.5,.2],[-3.7,1.5,.6],[3.8,1.5,.3],[4.4,1.5,.1],[-1.8,1.45,1.28],[.6,1.45,1.3],[2.4,1.45,1.27]]){
    const v=vineGeo();v.scale(.35,y0-y1,.35);v.translate(x,y1,0);P.push(v);}
  return merge(P);}
function archGeo(){return merge([box(9.8,.95,1.1,0,1.65,0,ID.STRATA),box(1.4,1.2,1.1,-4.6,.6,0,ID.STRATA),box(1.4,1.2,1.1,4.6,.6,0,ID.STRATA),
  part(at(new THREE.DodecahedronGeometry(.4,0),-5.6,.2,.4),ID.STRATA)]);}
function boulderGeo(id){return merge([part(at(new THREE.DodecahedronGeometry(.85,0),0,.8,0,1.05,1.05,.95),id),part(at(new THREE.DodecahedronGeometry(.32,0),.75,.22,.45),id)]);}
function saguaroGeo(){const g=cactusGeo();g.scale(2.6,3.3,2.6);return g;}
// A tree that topples across the path: it stands on its pivot (origin) and is ~9.5 m tall.
function fallGeo(){const g=new THREE.CylinderGeometry(.3,.4,8.6,9,1);g.translate(0,4.3,0);
  return merge([part(g,ID.TRUNK),blob(1.4,0,8.6,0,.8,0),blob(1.1,.9,7.9,.3,.8,1),blob(1,-.8,8.1,-.2,.8,2),blob(.9,.2,9.4,.1,.8,3)]);}
// A tumbleweed: a loose ball of dry twigs, 1.1 m across, centred on its origin.
function tumbleGeo(){const P=[];for(let i=0;i<18;i++){const a=new THREE.Vector3(R0()-.5,R0()-.5,R0()-.5).normalize().multiplyScalar(.62),b=new THREE.Vector3(R0()-.5,R0()-.5,R0()-.5).normalize().multiplyScalar(.62);P.push(stick(a.toArray(),b.toArray(),.045,ID.DRYGRASS));}
  P.push(part(new THREE.IcosahedronGeometry(.52,1),ID.DRYGRASS));return merge(P);}
// A cylinder from a to b (for posts, ropes and twigs).
function stick(a,b,r,id){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),g=new THREE.CylinderGeometry(r,r,d.length(),5);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate((A.x+B.x)/2,(A.y+B.y)/2,(A.z+B.z)/2);return part(g,id);}
// Gap markers, tall enough to show over a rise: the posts of a rope bridge whose ropes have snapped and
// hang into the gap, or stone cairns in the desert. Built for the near edge; the far edge is turned round.
function bridgeGeo(trunk){const P=[];for(const x of[-3.8,3.8]){P.push(stick([x,0,0],[x,2,0],.1,trunk),stick([x,1.75,0],[x*.97,.9,-.6],.035,trunk),stick([x*.97,.9,-.6],[x*.95,-.3,-.9],.035,trunk));}return merge(P);}
function cairnGeo(){const P=[];for(const x of[-3.8,3.8])P.push(part(at(new THREE.DodecahedronGeometry(.45,0),x,.35,0,1,.8,1),ID.STRATA),part(at(new THREE.DodecahedronGeometry(.34,0),x,.95,0,1,.8,1,1),ID.STRATA),part(at(new THREE.DodecahedronGeometry(.24,0),x,1.42,0,1,.9,1,2),ID.STRATA));return merge(P);}
// The signpost at a fork's tip: a post and two arrow boards (the boards' faces are drawn separately).
function signPostGeo(){return merge([stick([0,0,0],[0,3.1,0],.13,ID.TRUNK),box(2.6,.12,.12,-.95,2.55,0,ID.TRUNK),box(2.6,.12,.12,.95,1.75,0,ID.TRUNK)]);}
// Give an obstacle geometry its dressing region (read by the shader for autumn leaves, snow caps, night).
const dressed=new Map();
function dress(geo,r){const key=geo.uuid+r;if(!dressed.has(key)){const g=geo.clone(),a=g.attributes.aBio2;for(let i=0;i<a.count;i++)a.setZ(i,r);dressed.set(key,g);}return dressed.get(key);}

// ---------- far plates: two rings of mountains that travel with the camera ----------
// Each region has its own skyline; the rings morph between them as the regions blend.
const N_RING=240,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function fbm1(a,s){let v=0,amp=.5,f=1;for(let o=0;o<4;o++){v+=amp*vnoise(Math.cos(a)*f*2+9,Math.sin(a)*f*2+s,s);amp*=.5;f*=2.1;}return v;}
const fuji=a=>540*Math.pow(Math.max(0,1-Math.abs(wrap(a-.35))/.3),1.6);
const crags=(a,s,lo,hi)=>lo+hi*Math.pow(1-Math.abs(2*fbm1(a*2.4,s)-1),2.2);   // sharp alpine ridgelines
const SKYLINE={   // forest, autumn, jungle, desert, snow, night
  far:[a=>Math.max(90+190*fbm1(a,3),fuji(a)), a=>60+130*fbm1(a*1.2,4), a=>70+150*fbm1(a*1.4,5), a=>30+150*smooth(.47,.5,fbm1(a*1.3,8))+12*fbm1(a*6,2),
       a=>Math.max(crags(a,6,120,420),.8*fuji(a)), a=>Math.max(90+190*fbm1(a,3),fuji(a))],
  near:[a=>20+150*fbm1(a*1.7,11)*(1-.7*Math.exp(-Math.pow(wrap(a-.35)/.22,2))), a=>15+110*fbm1(a*1.5,12), a=>50+190*fbm1(a*2.3,13), a=>5+95*smooth(.5,.53,fbm1(a*2.1,17)),
       a=>crags(a,14,40,200), a=>20+150*fbm1(a*1.7,11)],
};
function ringGeo(r,id){const pos=[],uv=[],idx=[];
  for(let i=0;i<=N_RING;i++){const a=i/N_RING*Math.PI*2,x=Math.sin(a)*r,z=-Math.cos(a)*r;
    pos.push(x,-90,z,x,0,z);uv.push(-90,0,0,0);if(i<N_RING){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}}
  const n=pos.length/3;return built(pos,uv,new Array(n*3).fill(0),new Array(n*3).fill(0),id,new Array(n*3).fill(0).map((_,i)=>i%3===1?1:0),idx);}

// ---------- the world ----------
export class World{
  constructor(scene,mat,omat=mat,signMat=null){
    this.scene=scene;this.mat=mat;this.omat=omat;this.signMat=signMat;this.path=new Path();this.chunks=new Map();this.obs=new Obstacles(this.path);
    this.geo={pine:pineGeo(),broad:broadleafGeo(),birch:birchGeo(),bush:bushGeo(),rock:rockGeo(),grass:grassGeo(),
      tall:tallGeo(),palm:palmGeo(),fan:fanGeo(),banana:bananaGeo(),fern:fernGeo(),vine:vineGeo(),jbush:bushGeo(ID.FROND),
      cactus:cactusGeo(),butte:butteGeo(),srock:rockGeo(ID.STRATA),shrub:bushGeo(ID.SHRUB),dgrass:grassGeo(ID.DRYGRASS)};
    const fLog=logGeo(ID.TRUNK,ID.LEAF),fBranch=branchGeo(ID.TRUNK,ID.LEAF,false),fRock=boulderGeo(ID.ROCK);
    // dressing per region: forest, autumn, jungle, desert, snow, night
    this.og={log:[fLog,fLog,logGeo(ID.MOSS,ID.FROND),ledgeGeo(),fLog,fLog],branch:[fBranch,fBranch,branchGeo(ID.MOSS,ID.FROND,true),archGeo(),fBranch,fBranch],
      rock:[fRock,fRock,boulderGeo(ID.MOSS),boulderGeo(ID.STRATA),fRock,fRock],saguaro:saguaroGeo(),fall:fallGeo(),tumble:tumbleGeo(),
      gap:[bridgeGeo(ID.TRUNK),bridgeGeo(ID.TRUNK),bridgeGeo(ID.MOSS),cairnGeo(),bridgeGeo(ID.TRUNK),bridgeGeo(ID.TRUNK)],sign:signPostGeo()};
    this.rings=new THREE.Group();this.ringBio=null;
    this.far=new THREE.Mesh(ringGeo(1500,ID.MOUNTAIN),mat);this.near=new THREE.Mesh(ringGeo(900,ID.RIDGE),mat);
    const sample=f=>Float32Array.from({length:N_RING+1},(_,i)=>f(i/N_RING*Math.PI*2));
    this.skyline={far:SKYLINE.far.map(sample),near:SKYLINE.near.map(sample)};
    for(const m of[this.far,this.near]){m.frustumCulled=false;m.renderOrder=-.5;this.rings.add(m);}
    scene.add(this.rings);
  }
  drop(i){const c=this.chunks.get(i);if(!c)return;this.scene.remove(c);c.traverse(o=>{if(o.isInstancedMesh)o.dispose();else if(o.geometry&&o.userData.own)o.geometry.dispose();});this.chunks.delete(i);}
  // after a fork pick, everything from where the next region starts blending in is rebuilt
  rebuildFrom(s){for(const i of[...this.chunks.keys()])if((i+1)*CHUNK>s)this.drop(i);this.ringBio=null;}
  rebuildAll(){for(const i of[...this.chunks.keys()])this.drop(i);this.ringBio=null;}
  update(s,cam){
    const i0=Math.max(0,Math.floor((s-BEHIND)/CHUNK)),i1=Math.floor((s+AHEAD)/CHUNK);
    for(const i of[...this.chunks.keys()])if(i<i0||i>i1)this.drop(i);
    this.obs.ensure((i1+2)*CHUNK);
    for(let i=i0;i<=i1;i++)if(!this.chunks.has(i)){const c=this.build(i);this.chunks.set(i,c);this.scene.add(c);}
    this.rings.position.set(cam.x,0,cam.z);
    // morph the skylines toward the region ahead
    const w=this.path.bio(s+150),key=w.map(v=>v.toFixed(3)).join();
    if(key!==this.ringBio){this.ringBio=key;
      for(const[m,L]of[[this.far,this.skyline.far],[this.near,this.skyline.near]]){const p=m.geometry.attributes.position,uv=m.geometry.attributes.aUV;
        for(let i=0;i<=N_RING;i++){let h=0;for(let r=0;r<6;r++)if(w[r])h+=w[r]*L[r][i];p.setY(i*2+1,h);uv.setX(i*2+1,h);}
        p.needsUpdate=uv.needsUpdate=true;}}
    // moving obstacles: falling trees and tumbleweeds, posed by the runner's distance to them
    const m=new THREE.Matrix4(),rz=new THREE.Matrix4(),F={};
    for(const c of this.chunks.values())for(const d of c.userData.dyn){const o=d.o,dist=o.s+o.len/2-s;
      if(d.kind==='fall'){const tl=fallT(dist)*(Math.PI/2-.05);d.mesh.matrix.copy(d.base).multiply(rz.makeRotationZ(d.side*tl));}
      else{const u=tumbleU(o,dist),f=this.path.at(o.s+o.len/2,F),roll=-(u-tumbleLane(o))/.62,hop=.62+.25*Math.abs(Math.sin(roll*.5));
        d.mesh.matrix.copy(d.base).setPosition(f.x+u*f.rx,this.path.height(o.s)+.06+hop,f.z+u*f.rz).multiply(rz.makeRotationZ(roll));}}
  }
  // what the runner (at s, u, feet y above the path, ducking or not) is hitting, if anything
  collide(s,u,y,duck){for(const o of this.obs.near(s)){if(o.kind==='gap'||s<o.s-.2||s>o.s+o.len+.1)continue;const k=this.obs.variant(o).kind;
      if(k==='rock1'||k==='rock2'){let hit=false;for(let l=0;l<3;l++)if(o.mask[l]&&Math.abs(u-(l-1)*LANE)<.9)hit=true;if(hit&&y<1.7)return{o,k};continue;}
      if(k==='tumble'){if(Math.abs(u-tumbleLane(o))<1&&y<.7)return{o,k};continue;}
      if(k==='log'||k==='fall'){if(y<.68)return{o,k};continue;}
      if(k==='branch'&&y+(duck?.95:1.8)>=1.15)return{o,k};}
    return null;}
  gapAt(s){for(const o of this.obs.near(s))if(o.kind==='gap'&&s>o.s+.3&&s<o.s+o.len-.3)return o;return null;}
  pos(s,u,o){const f=this.path.at(s,o);return[f.x+u*f.rx,this.path.ground(s,u),f.z+u*f.rz];}
  build(ci){
    const g=new THREE.Group(),P=this.path,s0=ci*CHUNK,F={},v=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();g.userData.dyn=[];
    const bioOf=s=>{const w=P.bio(s);return[[w[1],w[2],w[3]],[w[4],w[5]]];};
    // terrain: rows every metre, columns dense near the path and sparse out on the banks
    {const U=[-120,-88,-64,-47,-35,-26,-19,-14,-10,-7.2,-5.4,-4.2,-3.4,0,3.4,4.2,5.4,7.2,10,14,19,26,35,47,64,88,120],R=41,C=U.length,E=.6;
      const pos=[],nor=[],uv=[],bio=[],bio2=[],idx=[];
      for(let r=0;r<R;r++){const s=s0+r,[b1,b2]=bioOf(s),sp=P.spread(s);for(let c=0;c<C;c++){const u=U[c]+Math.sign(U[c])*sp,k=r*C+c,p=this.pos(s,u,F);
        pos.push(...p);uv.push(s,u);bio.push(...b1);bio2.push(b2[0],b2[1],0);
        const p1=this.pos(s+E,u,F),p2=this.pos(s-E,u,F),p3=this.pos(s,u+E,F),p4=this.pos(s,u-E,F);
        a.set(p1[0]-p2[0],p1[1]-p2[1],p1[2]-p2[2]);b.set(p3[0]-p4[0],p3[1]-p4[1],p3[2]-p4[2]);v.crossVectors(b,a).normalize();if(v.y<0)v.negate();nor.push(v.x,v.y,v.z);
        if(r<R-1&&c<C-1)idx.push(k,k+C,k+1,k+1,k+C,k+C+1);}}
      const m=new THREE.Mesh(built(pos,uv,bio,bio2,ID.GROUND,nor,idx),this.mat);m.userData.own=true;g.add(m);}
    // the path: a ribbon a few cm above the ground (two narrower ones round a fork's island); kerbs, studs,
    // planks and ice are drawn by the shader from (s,u)
    const gaps=this.obs.between(s0-CHUNK,s0+2*CHUNK).filter(o=>o.kind==='gap'),inGap=x=>gaps.some(o=>x>=o.s&&x<o.s+o.len);
    {const pos=[],uv=[],bio=[],bio2=[],ids=[],nor=[];
      const strip=(rows,uOf,uvScale)=>{const W=[-1,-.33,.33,1];let prev=null;
        for(const s of rows){const f=P.at(s,F),y=P.height(s)+.06,dy=(P.height(s+.5)-P.height(s-.5)),[b1,b2]=bioOf(s),ice=iceAt(s);v.set(-f.fx*dy,1,-f.fz*dy).normalize();
          const row=W.map(t=>{const u=uOf(s,t);return{p:[f.x+u*f.rx,y,f.z+u*f.rz],uv:[s,t*uvScale],b1,b2:[b2[0],b2[1],ice],n:[v.x,v.y,v.z]};});
          if(prev&&!inGap(s-.5))for(let c=0;c<3;c++)for(const q of[prev[c],row[c],prev[c+1],prev[c+1],row[c],row[c+1]]){pos.push(...q.p);uv.push(...q.uv);bio.push(...q.b1);bio2.push(...q.b2);nor.push(...q.n);ids.push(ID.PATH);}
          prev=row;}};
      const rows=(a,b)=>{const out=[];for(let s=a;s<=b+1e-6;s+=1)out.push(s);return out;};
      const fk=P.fork(s0+CHUNK/2)||P.fork(s0)||P.fork(s0+CHUNK);
      if(fk&&fk.fs<s0+CHUNK&&fk.fs+FORK_LEN>s0){const a0=Math.max(s0,fk.fs),a1=Math.min(s0+CHUNK,fk.fs+FORK_LEN);
        if(a0>s0)strip(rows(s0,a0),(s,t)=>t*PATH_HW,PATH_HW);if(a1<s0+CHUNK)strip(rows(a1,s0+CHUNK),(s,t)=>t*PATH_HW,PATH_HW);
        for(const sd of[-1,1])strip(rows(a0,a1),(s,t)=>sd*(LANE+P.spread(s))+t*1.3,PATH_HW);}
      else strip(rows(s0,s0+CHUNK),(s,t)=>t*PATH_HW,PATH_HW);
      const m=new THREE.Mesh(built(pos,uv,bio,bio2,ids,nor),this.mat);m.userData.own=true;g.add(m);}
    // gaps that start in this chunk: the cut edges of the path, and water (or a dry chasm floor) below
    for(const o of gaps){if(o.s<s0||o.s>=s0+CHUNK)continue;const pos=[],uvs=[],bio=[],bio2=[],ids=[];
      const quad=(A,B,C,D,id,ua,ub,sa,bb)=>{for(const q of[A,B,C,A,C,D])pos.push(...q);for(const uu of[ua,ub,ub,ua,ub,ua])uvs.push(sa,uu);for(let i=0;i<6;i++){bio.push(...bb[0]);bio2.push(bb[1][0],bb[1][1],0);ids.push(id);}};
      for(const se of[o.s,o.s+o.len]){const f=P.at(se,F),h=P.height(se),p=(u,y)=>[f.x+u*f.rx,y,f.z+u*f.rz];quad(p(-PATH_HW,h+.06),p(PATH_HW,h+.06),p(PATH_HW,h-.9),p(-PATH_HW,h-.9),ID.ROCK,-PATH_HW,PATH_HW,se,bioOf(se));}
      for(let x=o.s-2.5;x<o.s+o.len+2.5;x+=1){const f0=P.at(x,F),h0=P.height(x)-1.7,f1=P.at(x+1,{}),h1=P.height(x+1)-1.7;
        const q0=u=>[f0.x+u*f0.rx,h0,f0.z+u*f0.rz],q1=u=>[f1.x+u*f1.rx,h1,f1.z+u*f1.rz];quad(q0(-12),q0(12),q1(12),q1(-12),ID.WATER,-12,12,x,bioOf(x));}
      const wm=new THREE.Mesh(built(pos,uvs,bio,bio2,ids),this.mat);wm.userData.own=true;g.add(wm);
      const r=this.obs.variant(o).r,Up=new THREE.Vector3(0,1,0),Rv=new THREE.Vector3(),Bv=new THREE.Vector3();
      for(const[se,sg]of[[o.s,1],[o.s+o.len,-1]]){const f=P.at(se,F),mm=new THREE.Mesh(dress(this.og.gap[r],r),this.omat);mm.matrixAutoUpdate=false;
        mm.matrix.makeBasis(Rv.set(f.rx*sg,0,f.rz*sg),Up,Bv.set(-f.fx*sg,0,-f.fz*sg)).setPosition(f.x,P.height(se)+.06,f.z);g.add(mm);}}
    // plants and rocks, seeded by chunk so the world is the same every run. Each region places its own
    // things, each kept with the probability that region holds at that spot, so borders mix naturally.
    // Forest-type plants (forest, autumn, snow, night) remember which region they grew in for their colours.
    const rnd=rng(ci*7919+13),put={};for(const k in this.geo)put[k]=[];
    const side=()=>rnd()<.5?-1:1,keep=(rs,s)=>{const w=P.bio(s);let t=0;for(const r of rs)t+=w[r];return rnd()<t;};
    const pickR=(rs,s)=>{const w=P.bio(s);let t=0;for(const r of rs)t+=w[r];let x=rnd()*t;for(const r of rs)if((x-=w[r])<0)return r;return rs[0];};
    const add=(kind,s,u,h,w=h,sink=.04,tilt=0,r=0)=>{if(P.onPath(s,u,.15))return;const p=this.pos(s,u,F);put[kind].push([p[0],p[1]-sink*h,p[2],h,w,rnd()*Math.PI*2,rnd(),tilt,F.fx,F.fz,r]);};
    const S=()=>s0+rnd()*CHUNK,FOR=[0,1,4,5];
    for(let n=0;n<62;n++){const s=S(),u=side()*(5.6+Math.pow(rnd(),1.7)*112),t=rnd();if(!keep(FOR,s))continue;const r=pickR(FOR,s);
      if(Math.abs(u)<5.6+P.spread(s)+70*P.open(s)&&rnd()<.92)continue;                       // the meadow keeps a lone tree or two
      const pine=r===4?.85:r===1?.1:.55,birch=r===1?.35:.15;
      if(t<pine)add('pine',s,u,7+rnd()*10,(7+rnd()*10)*.9,.04,0,r);else if(t<1-birch)add('broad',s,u,6+rnd()*6,7+rnd()*6,.04,0,r);else add('birch',s,u,7+rnd()*5,6+rnd()*3,.04,0,r);}
    for(let n=0;n<3;n++){const s=S();if(keep([0,1,5],s)&&P.open(s)<.3)add('broad',s,side()*(5.8+P.spread(s)+rnd()*1.6),11+rnd()*5,14+rnd()*5,.04,0,pickR([0,1,5],s));}   // big trees leaning over the path
    for(let n=0;n<34;n++){const s=S(),h=.7+rnd()*1.1;if(keep(FOR,s))add('bush',s,side()*(4.6+Math.pow(rnd(),1.5)*22),h,h*1.25,.1,0,pickR(FOR,s));}
    for(let n=0;n<7;n++){const s=S(),h=.6+rnd()*1.6;if(keep(FOR,s))add('rock',s,side()*(4.6+rnd()*30),h,h*1.8,.15,0,pickR(FOR,s));}
    for(let n=0;n<240;n++){const s=S(),h=.25+rnd()*.45,w=P.bio(s);if(rnd()<w[0]+w[1]+w[5]+.4*w[2])add('grass',s,side()*(3.15+Math.pow(rnd(),2)*13),h,h*1.2,0,0,pickR([0,1,5,2],s));}
    // jungle: giants hung with vines, palms (some leaning over the path), fan palms, banana leaves, ferns
    for(let n=0;n<15;n++){const s=S(),u=side()*(6+Math.pow(rnd(),1.4)*60),h=22+rnd()*14;if(!keep([2],s))continue;const before=put.tall.length;add('tall',s,u,h,h*.9,.04,0,2);
      if(put.tall.length===before)continue;const base=put.tall[put.tall.length-1],k=1+Math.floor(rnd()*4);
      for(let q=0;q<k;q++){const ang=rnd()*Math.PI*2,rad=(.04+.12*rnd())*h*.9,top=base[1]+h*(.78+.08*rnd()),len=h*(.35+.45*rnd());
        put.vine.push([base[0]+Math.cos(ang)*rad,top-len,base[2]+Math.sin(ang)*rad,len,.32,rnd()*Math.PI*2,rnd(),0,0,1,2]);}}
    for(let n=0;n<16;n++){const s=S(),h=8+rnd()*8;if(keep([2],s))add('palm',s,side()*(6+Math.pow(rnd(),1.3)*45),h,h,.02,(rnd()-.5)*.25,2);}
    for(let n=0;n<5;n++){const s=S(),sd=side(),h=7+rnd()*5;if(keep([2],s))add('palm',s,sd*(4.4+P.spread(s)+rnd()*1.4),h,h,.02,-sd*(.22+rnd()*.14),2);}
    for(let n=0;n<28;n++){const s=S(),h=1.3+rnd()*1.6;if(keep([2],s))add('fan',s,side()*(3.7+Math.pow(rnd(),1.6)*22),h,h,0,0,2);}
    for(let n=0;n<20;n++){const s=S(),h=2+rnd()*2.4;if(keep([2],s))add('banana',s,side()*(4+Math.pow(rnd(),1.5)*28),h,h,0,0,2);}
    for(let n=0;n<26;n++){const s=S(),h=1.2+rnd()*2;if(keep([2],s))add('jbush',s,side()*(5+Math.pow(rnd(),1.3)*40),h,h*1.5,.15,0,2);}
    for(let n=0;n<80;n++){const s=S(),h=.7+rnd()*.8;if(keep([2],s))add('fern',s,side()*(3.4+Math.pow(rnd(),1.8)*22),h,h*1.2,0,0,2);}
    // desert: saguaros, buttes, striped rocks, sage and dry grass
    for(let n=0;n<9;n++){const s=S(),h=4+rnd()*6;if(keep([3],s))add('cactus',s,side()*(5.5+Math.pow(rnd(),1.2)*90),h,h*.75,.02,0,3);}
    for(let n=0;n<2;n++){const s=S(),h=18+rnd()*40,w=h*(.8+rnd()*1.2);if(keep([3],s))add('butte',s,side()*(w*.6+22+rnd()*70),h,w,.05,0,3);}   // well clear of the path
    for(let n=0;n<12;n++){const s=S(),h=.5+rnd()*2;if(keep([3],s))add('srock',s,side()*(4.5+Math.pow(rnd(),1.3)*50),h,h*1.6,.15,0,3);}
    for(let n=0;n<30;n++){const s=S(),h=.5+rnd()*.6;if(keep([3],s))add('shrub',s,side()*(4.2+Math.pow(rnd(),1.4)*60),h,h*1.4,.1,0,3);}
    for(let n=0;n<80;n++){const s=S(),h=.25+rnd()*.25;if(keep([3],s))add('dgrass',s,side()*(3.3+Math.pow(rnd(),2)*20),h,h*1.3,0,0,3);}
    // a fork's island: a big tree in the middle and bushes and rocks round it
    {const fk=P.fork(s0+CHUNK/2);if(fk){const mid=fk.fs+FORK_LEN/2,r=regionAt(mid).r,tree=r===2?'palm':r===3?'cactus':r===4?'pine':'broad';
      if(mid>=s0&&mid<s0+CHUNK)add(tree,mid,0,13,r===3?9:14,.04,0,r);
      for(let n=0;n<16;n++){const s=fk.fs+14+rnd()*(FORK_LEN-28);if(s<s0||s>=s0+CHUNK)continue;const sp=P.spread(s),u=(rnd()*2-1)*Math.max(0,sp-.6);
        const kind=r===2?'fern':r===3?'shrub':rnd()<.7?'bush':'rock',h=.7+rnd()*.9;add(kind,s,u,h,h*1.3,.1,0,r);}}}
    const m4=new THREE.Matrix4(),qy=new THREE.Quaternion(),qt=new THREE.Quaternion(),sc=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),ax=new THREE.Vector3();
    for(const kind in put){const L=put[kind];if(!L.length)continue;const im=new THREE.InstancedMesh(this.geo[kind],this.mat,L.length);
      im.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(L.length*3),3);
      L.forEach(([x,y,z,h,w,ry,sd,tilt,fx,fz,r],i)=>{qy.setFromAxisAngle(up,ry);qt.setFromAxisAngle(ax.set(fx,0,fz),tilt);qy.premultiply(qt);   // lean about the path's forward axis
        sc.set(w,h,w);m4.compose(v.set(x,y,z),qy,sc);im.setMatrixAt(i,m4);im.instanceColor.array[i*3]=sd;im.instanceColor.array[i*3+1]=r/8;});
      im.computeBoundingSphere();g.add(im);}
    // obstacles, dressed for the region they stand in, each with a shadow pooled on the path beneath it
    {const B=new THREE.Vector3(),Rv=new THREE.Vector3(),Up=new THREE.Vector3(0,1,0),sp=[],suv=[],sbio=[],sbio2=[];
      const shadow=(o,u0,u1,pad=.75)=>{const a=o.s-pad,b=o.s+o.len+pad,N=4,[b1,b2]=bioOf(o.s);
        for(let i=0;i<N;i++)for(const[ka,kb]of[[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){const ss=a+(b-a)*(i+ka)/N,uu=kb?u1:u0,f=P.at(ss,F);
          sp.push(f.x+uu*f.rx,P.height(ss)+.085,f.z+uu*f.rz);suv.push(((i+ka)/N)*2-1,kb?1:-1);sbio.push(...b1);sbio2.push(b2[0],b2[1],0);}};
      const place=(geo,sc,u,y=.06)=>{const f=P.at(sc,F),m=new THREE.Mesh(geo,this.omat);m.matrixAutoUpdate=false;
        m.matrix.makeBasis(Rv.set(f.rx,0,f.rz),Up,B.set(-f.fx,0,-f.fz)).setPosition(f.x+u*f.rx,P.height(sc)+y,f.z+u*f.rz);g.add(m);return m;};
      for(const o of this.obs.between(s0,s0+CHUNK)){if(o.kind==='gap')continue;const{r,kind}=this.obs.variant(o),sc=o.s+o.len/2;
        if(kind==='rock1'||kind==='rock2'){for(let l=0;l<3;l++)if(o.mask[l]){const u=(l-1)*LANE,geo=r===3&&(o.seed*7+l)%1<.5?this.og.saguaro:this.og.rock[r];place(dress(geo,r),sc,u);shadow(o,u-1.15,u+1.15);}}
        else if(kind==='fall'){const sd=o.seed3<.5?-1:1,m=place(dress(this.og.fall,r),sc,sd*4.7,.4);g.userData.dyn.push({o,kind,mesh:m,base:m.matrix.clone(),side:sd});shadow(o,-PATH_HW-.2,PATH_HW+.2);}
        else if(kind==='tumble'){const m=place(dress(this.og.tumble,r),sc,0);g.userData.dyn.push({o,kind,mesh:m,base:m.matrix.clone()});const u=tumbleLane(o);shadow(o,u-1.1,u+1.1,.4);}
        else{place(dress(kind==='log'?this.og.log[r]:this.og.branch[r],r),sc,0);shadow(o,-PATH_HW-.2,PATH_HW+.2);}}
      // the signpost at a fork's tip
      {const fk=P.fork(s0+CHUNK/2)||P.fork(s0)||P.fork(s0+CHUNK);if(fk&&fk.fs>=s0&&fk.fs<s0+CHUNK){const r=regionAt(fk.fs).r;place(dress(this.og.sign,r),fk.fs,0,.06);
        if(this.signMat)for(const[side,y]of[[0,2.55],[1,1.75]]){const board=new THREE.Mesh(new THREE.PlaneGeometry(2.5,.62),this.signMat(fk.k,side));board.matrixAutoUpdate=false;
          const f=P.at(fk.fs,F);board.matrix.makeBasis(Rv.set(f.rx,0,f.rz),Up,B.set(-f.fx,0,-f.fz)).setPosition(f.x+(side?.95:-.95)*f.rx,P.height(fk.fs)+.06+y,f.z+(side?.95:-.95)*f.rz);
          board.matrix.multiply(new THREE.Matrix4().makeTranslation(0,0,.08));board.userData.own=true;g.add(board);}
        shadow({s:fk.fs-.3,len:.6},-1.1,1.1,.5);}}
      if(sp.length){const n=sp.length/3,sm=new THREE.Mesh(built(sp,suv,sbio,sbio2,ID.SHADOW,new Array(n*3).fill(0).map((_,i)=>i%3===1?1:0)),this.mat);sm.userData.own=true;g.add(sm);}}
    return g;
  }
}
