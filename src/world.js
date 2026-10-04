// world.js — the endless path and the regions it runs through.
// Everything is laid out in path coordinates (s = distance along the path, u = metres to its right),
// so terrain, path and plants line up however the path bends. The world is built in 40 m chunks
// ahead of the runner and dropped behind it. Units are metres; the path is 3 lanes, 2.2 m apart.
// Regions (forest → jungle → desert → forest …) last LEG metres each and blend over BLEND metres,
// so how the world looks tells you how far you've run.
import * as THREE from 'three';
import {ID} from './print.js';

export const LANE=2.2,PATH_HW=3.4,CHUNK=40;
export const REGIONS=['forest','jungle','desert'],LEG=1500,BLEND=400;
const AHEAD=340,BEHIND=50;

// ---------- noise ----------
function hash2(x,y,s){let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,982451653))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296;}
function vnoise(x,y,s=0){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi,s),b=hash2(xi+1,yi,s),c=hash2(xi,yi+1,s),d=hash2(xi+1,yi+1,s);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
function rng(seed){let s=(Math.imul(seed|0,2654435761)>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};

// Region weights [forest, jungle, desert] at s, the sheet number (one per region passed) and its name.
export function regionAt(s){s=Math.max(0,s);const k=Math.floor(s/LEG),b=smooth(LEG-BLEND,LEG,s-k*LEG),w=[0,0,0];
  w[k%3]+=1-b;w[(k+1)%3]+=b;const n=k+(b>.5?1:0);return{w,sheet:n+1,name:REGIONS[n%3]};}

// ---------- the path: heading and height are smooth sums of sines; x,z are integrated ----------
export class Path{
  constructor(){this.x=[0];this.z=[0];}
  heading(s){return .16*Math.sin(s/130+.5)+.09*Math.sin(s/53+2.1)+.04*Math.sin(s/23);}
  height(s){return 7*Math.sin(s/90)+3*Math.sin(s/37+.7)+.8*Math.sin(s/15+2);}
  ensure(s){const X=this.x,Z=this.z;while(X.length-2<s){const i=X.length-1,h=this.heading(i+.5);X.push(X[i]+Math.sin(h));Z.push(Z[i]-Math.cos(h));}}
  // frame at s: position on the centre line, forward (fx,fz) and right (rx,rz) on the ground plane
  at(s,o={}){s=Math.max(0,s);this.ensure(s+2);const i=Math.floor(s),t=s-i,h=this.heading(s);
    o.x=this.x[i]+(this.x[i+1]-this.x[i])*t;o.z=this.z[i]+(this.z[i+1]-this.z[i])*t;o.y=this.height(s);
    o.fx=Math.sin(h);o.fz=-Math.cos(h);o.rx=Math.cos(h);o.rz=Math.sin(h);return o;}
  bio(s){return regionAt(s).w;}
  // forest clearings: every few hundred metres the trees thin and the banks fall away into a meadow
  open(s){return smooth(.52,.72,vnoise(s/170,.5,21))*this.bio(s)[0];}
  // ground height across the valley: flat path and shoulders, then rising banks (wooded, jungle, or open desert)
  ground(s,u){const a=Math.abs(u),side=u<0?1:2,rise=Math.max(0,a-4.2),[f,j,d]=this.bio(s);
    const bank=(24*f+10*j+6*d)*(1-.8*this.open(s));
    const ridge=(.5+.9*vnoise(s*.005,side*5.3,7))*bank*(1-Math.exp(-rise/38));
    const bumps=(vnoise(s*.03,u*.03,3)-.5)*(7-4*d)*smooth(4.2,18,a);
    return this.height(s)+ridge+bumps;}
}

// ---------- cut-paper geometry (all built about 1 unit tall) ----------
function part(g,id,smoothN=false){if(smoothN&&g.index)g.computeVertexNormals();g=g.index?g.toNonIndexed():g;if(!smoothN||!g.attributes.normal)g.computeVertexNormals();
  const n=g.attributes.position.count;
  g.setAttribute('aId',new THREE.BufferAttribute(new Float32Array(n).fill(id),1));
  g.setAttribute('aUV',new THREE.BufferAttribute(new Float32Array(n*2),2));
  g.setAttribute('aBio',new THREE.BufferAttribute(new Float32Array(n*2),2));return g;}
const KEYS=['position','normal','aId','aUV','aBio'];
function merge(parts){const out=new THREE.BufferGeometry();
  for(const k of KEYS){const arrs=parts.map(p=>p.attributes[k].array),len=arrs.reduce((a,b)=>a+b.length,0),A=new Float32Array(len);let o=0;for(const a of arrs){A.set(a,o);o+=a.length;}
    out.setAttribute(k,new THREE.BufferAttribute(A,parts[0].attributes[k].itemSize));}
  return out;}
const at=(g,x,y,z,sx=1,sy=1,sz=1,ry=0)=>{g.scale(sx,sy,sz);if(ry)g.rotateY(ry);g.translate(x,y,z);return g;};
const raw=pos=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));return g;};
const R0=rng(99);

// forest
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

// ---------- far plates: two rings of mountains that travel with the camera ----------
// Each region has its own skyline; the rings morph between them as the regions blend.
const N_RING=240,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function fbm1(a,s){let v=0,amp=.5,f=1;for(let o=0;o<4;o++){v+=amp*vnoise(Math.cos(a)*f*2+9,Math.sin(a)*f*2+s,s);amp*=.5;f*=2.1;}return v;}
const fuji=a=>540*Math.pow(Math.max(0,1-Math.abs(wrap(a-.35))/.3),1.6);
const SKYLINE={
  far:[a=>Math.max(90+190*fbm1(a,3),fuji(a)), a=>70+150*fbm1(a*1.4,5), a=>30+150*smooth(.47,.5,fbm1(a*1.3,8))+12*fbm1(a*6,2)],
  near:[a=>20+150*fbm1(a*1.7,11)*(1-.7*Math.exp(-Math.pow(wrap(a-.35)/.22,2))), a=>50+190*fbm1(a*2.3,13), a=>5+95*smooth(.5,.53,fbm1(a*2.1,17))],
};
function ringGeo(r,snow,id){const pos=[],uv=[],idx=[];
  for(let i=0;i<=N_RING;i++){const a=i/N_RING*Math.PI*2,x=Math.sin(a)*r,z=-Math.cos(a)*r;
    pos.push(x,-90,z,x,0,z);uv.push(-90,snow,0,snow);if(i<N_RING){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}}
  const g=new THREE.BufferGeometry(),n=pos.length/3;g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(new Array(n*3).fill(0).map((_,i)=>i%3===1?1:0),3));
  g.setAttribute('aUV',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('aId',new THREE.Float32BufferAttribute(new Array(n).fill(id),1));
  g.setAttribute('aBio',new THREE.Float32BufferAttribute(new Array(n*2).fill(0),2));g.setIndex(idx);return g;}

// ---------- the world ----------
export class World{
  constructor(scene,mat){
    this.scene=scene;this.mat=mat;this.path=new Path();this.chunks=new Map();
    this.geo={pine:pineGeo(),broad:broadleafGeo(),birch:birchGeo(),bush:bushGeo(),rock:rockGeo(),grass:grassGeo(),
      tall:tallGeo(),palm:palmGeo(),fan:fanGeo(),banana:bananaGeo(),fern:fernGeo(),vine:vineGeo(),
      jbush:bushGeo(ID.FROND),cactus:cactusGeo(),butte:butteGeo(),srock:rockGeo(ID.STRATA),shrub:bushGeo(ID.SHRUB),dgrass:grassGeo(ID.DRYGRASS)};
    this.rings=new THREE.Group();this.ringBio=null;
    this.far=new THREE.Mesh(ringGeo(1500,400,ID.MOUNTAIN),mat);this.near=new THREE.Mesh(ringGeo(900,99999,ID.RIDGE),mat);
    this.skyline={far:SKYLINE.far.map(f=>Float32Array.from({length:N_RING+1},(_,i)=>f(i/N_RING*Math.PI*2))),
                  near:SKYLINE.near.map(f=>Float32Array.from({length:N_RING+1},(_,i)=>f(i/N_RING*Math.PI*2)))};
    for(const m of[this.far,this.near]){m.frustumCulled=false;m.renderOrder=-.5;this.rings.add(m);}
    scene.add(this.rings);
  }
  update(s,cam){
    const i0=Math.max(0,Math.floor((s-BEHIND)/CHUNK)),i1=Math.floor((s+AHEAD)/CHUNK);
    for(const[i,c]of this.chunks)if(i<i0||i>i1){this.scene.remove(c);c.traverse(o=>{if(o.isInstancedMesh)o.dispose();else if(o.geometry&&o.userData.own)o.geometry.dispose();});this.chunks.delete(i);}
    for(let i=i0;i<=i1;i++)if(!this.chunks.has(i)){const c=this.build(i);this.chunks.set(i,c);this.scene.add(c);}
    this.rings.position.set(cam.x,0,cam.z);
    // morph the skylines toward the region ahead
    const w=this.path.bio(s+150),key=w.map(v=>v.toFixed(3)).join();
    if(key!==this.ringBio){this.ringBio=key;
      for(const[m,L]of[[this.far,this.skyline.far],[this.near,this.skyline.near]]){const p=m.geometry.attributes.position,uv=m.geometry.attributes.aUV;
        for(let i=0;i<=N_RING;i++){const h=w[0]*L[0][i]+w[1]*L[1][i]+w[2]*L[2][i];p.setY(i*2+1,h);uv.setX(i*2+1,h);}
        p.needsUpdate=uv.needsUpdate=true;}}
  }
  pos(s,u,o){const f=this.path.at(s,o);return[f.x+u*f.rx,this.path.ground(s,u),f.z+u*f.rz];}
  build(ci){
    const g=new THREE.Group(),P=this.path,s0=ci*CHUNK,F={};
    // terrain: rows every 2 m, columns dense near the path and sparse out on the banks
    const U=[-120,-88,-64,-47,-35,-26,-19,-14,-10,-7.2,-5.4,-4.2,-3.4,0,3.4,4.2,5.4,7.2,10,14,19,26,35,47,64,88,120],R=21,C=U.length;
    const pos=new Float32Array(R*C*3),nor=new Float32Array(R*C*3),uv=new Float32Array(R*C*2),bio=new Float32Array(R*C*2),idx=[];
    const v=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),E=.6;
    for(let r=0;r<R;r++){const s=s0+r*2,w=P.bio(s);for(let c=0;c<C;c++){const u=U[c],k=r*C+c,p=this.pos(s,u,F);pos.set(p,k*3);uv.set([s,u],k*2);bio.set([w[1],w[2]],k*2);
      const p1=this.pos(s+E,u,F),p2=this.pos(s-E,u,F),p3=this.pos(s,u+E,F),p4=this.pos(s,u-E,F);
      a.set(p1[0]-p2[0],p1[1]-p2[1],p1[2]-p2[2]);b.set(p3[0]-p4[0],p3[1]-p4[1],p3[2]-p4[2]);v.crossVectors(b,a).normalize();if(v.y<0)v.negate();nor.set([v.x,v.y,v.z],k*3);
      if(r<R-1&&c<C-1)idx.push(k,k+C,k+1,k+1,k+C,k+C+1);}}
    const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(pos,3));tg.setAttribute('normal',new THREE.BufferAttribute(nor,3));
    tg.setAttribute('aUV',new THREE.BufferAttribute(uv,2));tg.setAttribute('aBio',new THREE.BufferAttribute(bio,2));
    tg.setAttribute('aId',new THREE.BufferAttribute(new Float32Array(R*C).fill(ID.GROUND),1));tg.setIndex(idx);
    const tm=new THREE.Mesh(tg,this.mat);tm.userData.own=true;g.add(tm);
    // the path: a ribbon a few cm above the ground; kerbs, studs and planks are drawn by the shader from (s,u)
    {const ppos=[],pnor=[],puv=[],pbio=[],pidx=[],W=[-PATH_HW,-1.1,1.1,PATH_HW];
      for(let r=0;r<R;r++){const s=s0+r*2,f=P.at(s,F),y=P.height(s)+.06,dy=(P.height(s+.5)-P.height(s-.5)),w=P.bio(s);
        v.set(-f.fx*dy,1,-f.fz*dy).normalize();
        for(const u of W){ppos.push(f.x+u*f.rx,y,f.z+u*f.rz);pnor.push(v.x,v.y,v.z);puv.push(s,u);pbio.push(w[1],w[2]);}
        if(r<R-1)for(let c=0;c<W.length-1;c++){const k=r*W.length+c,n=W.length;pidx.push(k,k+n,k+1,k+1,k+n,k+n+1);}}
      const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.Float32BufferAttribute(ppos,3));pg.setAttribute('normal',new THREE.Float32BufferAttribute(pnor,3));
      pg.setAttribute('aUV',new THREE.Float32BufferAttribute(puv,2));pg.setAttribute('aBio',new THREE.Float32BufferAttribute(pbio,2));
      pg.setAttribute('aId',new THREE.Float32BufferAttribute(new Array(ppos.length/3).fill(ID.PATH),1));pg.setIndex(pidx);
      const pm=new THREE.Mesh(pg,this.mat);pm.userData.own=true;g.add(pm);}
    // plants and rocks, seeded by chunk so the world is the same every run. Each region places its own
    // things, each kept with the probability that region holds at that spot, so borders mix naturally.
    const rnd=rng(ci*7919+13),put={};for(const k in this.geo)put[k]=[];
    const side=()=>rnd()<.5?-1:1,keep=(b,s)=>rnd()<P.bio(s)[b];
    const add=(kind,s,u,h,w=h,sink=.04,tilt=0)=>{const p=this.pos(s,u,F);put[kind].push([p[0],p[1]-sink*h,p[2],h,w,rnd()*Math.PI*2,rnd(),tilt,F.fx,F.fz]);};
    const S=()=>s0+rnd()*CHUNK;
    // forest
    for(let n=0;n<62;n++){const s=S(),u=side()*(5.6+Math.pow(rnd(),1.7)*112),t=rnd();if(!keep(0,s))continue;
      if(Math.abs(u)<5.6+70*P.open(s)&&rnd()<.92)continue;                                    // the meadow keeps a lone tree or two
      if(t<.55)add('pine',s,u,7+rnd()*10,(7+rnd()*10)*.9);else if(t<.85)add('broad',s,u,6+rnd()*6,7+rnd()*6);else add('birch',s,u,7+rnd()*5,6+rnd()*3);}
    for(let n=0;n<3;n++){const s=S();if(keep(0,s)&&P.open(s)<.3)add('broad',s,side()*(5.8+rnd()*1.6),11+rnd()*5,14+rnd()*5);}   // big trees leaning over the path
    for(let n=0;n<34;n++){const s=S(),h=.7+rnd()*1.1;if(keep(0,s))add('bush',s,side()*(4.6+Math.pow(rnd(),1.5)*22),h,h*1.25,.1);}
    for(let n=0;n<7;n++){const s=S(),h=.6+rnd()*1.6;if(keep(0,s))add('rock',s,side()*(4.6+rnd()*30),h,h*1.8,.15);}
    for(let n=0;n<240;n++){const s=S(),h=.25+rnd()*.45,w=P.bio(s);if(rnd()<w[0]+.4*w[1])add('grass',s,side()*(3.15+Math.pow(rnd(),2)*13),h,h*1.2,0);}
    // jungle: giants hung with vines, palms (some leaning over the path), fan palms, banana leaves, ferns
    for(let n=0;n<15;n++){const s=S(),u=side()*(6+Math.pow(rnd(),1.4)*60),h=22+rnd()*14;if(!keep(1,s))continue;add('tall',s,u,h,h*.9);
      const base=put.tall[put.tall.length-1],k=1+Math.floor(rnd()*4);
      for(let q=0;q<k;q++){const ang=rnd()*Math.PI*2,rad=(.04+.12*rnd())*h*.9,top=base[1]+h*(.78+.08*rnd()),len=h*(.35+.45*rnd());
        put.vine.push([base[0]+Math.cos(ang)*rad,top-len,base[2]+Math.sin(ang)*rad,len,.32,rnd()*Math.PI*2,rnd(),0,0,1]);}}
    for(let n=0;n<16;n++){const s=S(),h=8+rnd()*8;if(keep(1,s))add('palm',s,side()*(6+Math.pow(rnd(),1.3)*45),h,h,.02,(rnd()-.5)*.25);}
    for(let n=0;n<5;n++){const s=S(),sd=side(),h=7+rnd()*5;if(keep(1,s))add('palm',s,sd*(4.4+rnd()*1.4),h,h,.02,-sd*(.22+rnd()*.14));}
    for(let n=0;n<28;n++){const s=S(),h=1.3+rnd()*1.6;if(keep(1,s))add('fan',s,side()*(3.7+Math.pow(rnd(),1.6)*22),h,h,0);}
    for(let n=0;n<20;n++){const s=S(),h=2+rnd()*2.4;if(keep(1,s))add('banana',s,side()*(4+Math.pow(rnd(),1.5)*28),h,h,0);}
    for(let n=0;n<26;n++){const s=S(),h=1.2+rnd()*2;if(keep(1,s))add('jbush',s,side()*(5+Math.pow(rnd(),1.3)*40),h,h*1.5,.15);}
    for(let n=0;n<80;n++){const s=S(),h=.7+rnd()*.8;if(keep(1,s))add('fern',s,side()*(3.4+Math.pow(rnd(),1.8)*22),h,h*1.2,0);}
    // desert: saguaros, buttes, striped rocks, sage and dry grass
    for(let n=0;n<9;n++){const s=S(),h=4+rnd()*6;if(keep(2,s))add('cactus',s,side()*(5.5+Math.pow(rnd(),1.2)*90),h,h*.75,.02);}
    for(let n=0;n<2;n++){const s=S(),h=18+rnd()*40,w=h*(.8+rnd()*1.2);if(keep(2,s))add('butte',s,side()*(w*.6+22+rnd()*70),h,w,.05);}   // well clear of the path
    for(let n=0;n<12;n++){const s=S(),h=.5+rnd()*2;if(keep(2,s))add('srock',s,side()*(4.5+Math.pow(rnd(),1.3)*50),h,h*1.6,.15);}
    for(let n=0;n<30;n++){const s=S(),h=.5+rnd()*.6;if(keep(2,s))add('shrub',s,side()*(4.2+Math.pow(rnd(),1.4)*60),h,h*1.4,.1);}
    for(let n=0;n<80;n++){const s=S(),h=.25+rnd()*.25;if(keep(2,s))add('dgrass',s,side()*(3.3+Math.pow(rnd(),2)*20),h,h*1.3,0);}
    const m4=new THREE.Matrix4(),qy=new THREE.Quaternion(),qt=new THREE.Quaternion(),sc=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),ax=new THREE.Vector3();
    for(const kind in put){const L=put[kind];if(!L.length)continue;const im=new THREE.InstancedMesh(this.geo[kind],this.mat,L.length);
      im.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(L.length*3),3);
      L.forEach(([x,y,z,h,w,ry,sd,tilt,fx,fz],i)=>{qy.setFromAxisAngle(up,ry);qt.setFromAxisAngle(ax.set(fx,0,fz),tilt);qy.premultiply(qt);   // lean about the path's forward axis
        sc.set(w,h,w);m4.compose(v.set(x,y,z),qy,sc);im.setMatrixAt(i,m4);im.instanceColor.array[i*3]=sd;});
      im.computeBoundingSphere();g.add(im);}
    return g;
  }
}
