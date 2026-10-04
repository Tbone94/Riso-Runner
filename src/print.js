// print.js — the risograph print engine on the GPU.
// The scene never renders colour. Every surface writes ink densities (R light, G mid, B key) and a
// material id (A); the print pass then screens each plate into grain, nudges it out of register,
// cuts key-ink outlines from depth + id, and multiplies the inks onto paper — riso.js, per frame.
// Inks have roles, so any three-ink set works: light = sky glow, sunlit ground; mid = foliage, rock;
// key = trunks, deep shade, outlines (and, in the desert, the blue of the sky).
import * as THREE from 'three';

// ---------- shared GLSL ----------
const NOISE=`
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
`;

// Material ids (A channel = (id+.5)/64, plus a per-instance jitter so neighbouring plants outline apart).
// Obstacles add OBST to their id, which the print pass reads to cut them a heavier outline.
export const ID={SKY:0,GROUND:1,PATH:2,LEAF:3,TRUNK:4,ROCK:5,MOUNTAIN:6,RIDGE:7,GRASS:8,BIRCH:9,
  VINE:10,MOSS:11,CACTUS:12,STRATA:13,FROND:14,SHRUB:15,DRYGRASS:16,PALM:17,WATER:18,AIR:19,SHADOW:20};   // AIR (motes, birds) and SHADOW (under obstacles) are never outlined
export const OBST=24;

// ---------- the ink material: one shader for every surface ----------
// Each id has a lit and a shaded density triple; lighting picks between them in hard bands, a slow
// world-space noise makes the ink uneven like a hand-inked block, and distance fogs toward the horizon ink.
// Ground and path blend per vertex between the six regions (forest, autumn, jungle, desert, snow, night);
// plants and obstacles carry the region they belong to, for autumn leaves, snow caps and night.
// The far plates and the sky take their inks from uniforms the game blends by the camera's region.
// The obstacle variant shares every uniform; it fogs far less and inks a little heavier, so whatever you
// have to answer stays readable from further off while the scenery behind it fades.
export function inkMaterial(obstacle=false,shared=null){
  const m=new THREE.ShaderMaterial({defines:obstacle?{OBSTACLE:1}:{},
    uniforms:shared||{uTime:{value:0},uSun:{value:new THREE.Vector3(0,1,0)},uFogDist:{value:150},uFogInk:{value:new THREE.Vector3(.4,.05,0)},
      uFarInk:{value:new THREE.Vector3(.18,.5,.12)},uNearInk:{value:new THREE.Vector3(.25,.62,.3)},uRingFog:{value:new THREE.Vector2(.4,.25)},uSnowLine:{value:400},uStrata:{value:0}},
    vertexShader:`
attribute float aId;
attribute vec2 aUV;
attribute vec3 aBio,aBio2;
uniform float uTime;
varying vec3 vN,vW,vBio,vBio2;varying float vId,vSeed,vH,vReg;varying vec2 vUV;
void main(){
  mat4 m=modelMatrix;float seed=0.,reg=aBio2.z;
  #ifdef USE_INSTANCING
    m=modelMatrix*instanceMatrix;
  #endif
  #ifdef USE_INSTANCING_COLOR
    seed=instanceColor.r;reg=floor(instanceColor.g*8.+.5);
  #endif
  vec4 w=m*vec4(position,1.);
  // leaves, fronds and grass sway with height (geometry is built 1 unit tall); vines swing from the top
  float k=0.;
  if(abs(aId-3.)<.5||abs(aId-8.)<.5||abs(aId-14.)<.5||abs(aId-16.)<.5){k=max(position.y,0.);k*=k;}
  else if(abs(aId-10.)<.5){k=1.-position.y;k*=k*2.;}
  if(k>0.){w.x+=sin(uTime*1.3+seed*40.+w.z*.06)*.22*k;w.z+=cos(uTime*1.05+seed*31.+w.x*.05)*.14*k;}
  vN=normalize(mat3(m)*normal);vW=w.xyz;vId=aId;vSeed=seed;vUV=aUV;vBio=aBio;vBio2=aBio2;vH=position.y;vReg=reg;
  gl_Position=projectionMatrix*viewMatrix*w;
}`,
    fragmentShader:`
uniform float uTime,uFogDist,uSnowLine,uStrata;uniform vec3 uSun,uFogInk,uFarInk,uNearInk;uniform vec2 uRingFog;
varying vec3 vN,vW,vBio,vBio2;varying float vId,vSeed,vH,vReg;varying vec2 vUV;
${NOISE}
// per region: forest, autumn, jungle, desert, snow, night (light, mid, key)
const vec3 GL[6]=vec3[6](vec3(.45,.17,0.),vec3(.5,.34,.02),vec3(.3,.37,.02),vec3(.48,.11,0.),vec3(.03,0.,0.),vec3(.05,.35,.25));   // ground, lit
const vec3 GS[6]=vec3[6](vec3(.42,.44,.1),vec3(.35,.5,.25),vec3(.08,.5,.34),vec3(.34,.14,.22),vec3(.3,.05,.06),vec3(0.,.45,.55));  // ground, shade
const vec3 PL[6]=vec3[6](vec3(.22,.03,0.),vec3(.3,.12,.02),vec3(.44,.1,.05),vec3(.26,.08,0.),vec3(.12,.03,.02),vec3(.1,.25,.2));   // path, lit
const vec3 PS[6]=vec3[6](vec3(.28,.17,.05),vec3(.3,.3,.15),vec3(.14,.34,.44),vec3(.28,.18,.18),vec3(.35,.1,.1),vec3(.05,.35,.4)); // path, shade
const float DAP[6]=float[6](.85,.9,1.,0.,.3,.3);                                                                                  // dappled shade
// Arizona sandstone: bands of light, mid and mixed ink, wavering with height
vec3 strata(float y,float x){float b=fract(y/7.+.35*vnoise(vec2(x*.015,y*.05)));
  return b<.3?vec3(.5,.42,0.):b<.55?vec3(.3,.78,.04):b<.75?vec3(.6,.22,0.):vec3(.28,.6,.14);}
void main(){
  vec3 N=normalize(vN);if(!gl_FrontFacing)N=-N;
  float b=dot(N,uSun),lit=smoothstep(.02,.14,b),deep=smoothstep(-.12,-.45,b);
  int id=int(vId+.5),reg=int(vReg+.5);
  float W[6];W[1]=vBio.x;W[2]=vBio.y;W[3]=vBio.z;W[4]=vBio2.x;W[5]=vBio2.y;W[0]=max(0.,1.-W[1]-W[2]-W[3]-W[4]-W[5]);
  vec3 L=vec3(.5,.2,0.),S=vec3(.5,.5,.1);       // (light, mid, key)
  float fogK=1.,dapK=0.;bool dressedByRegion=false;
  if(id==1||id==2){                               // ground and path, blended across regions
    L=vec3(0.);S=vec3(0.);for(int i=0;i<6;i++){L+=W[i]*(id==1?GL[i]:PL[i]);S+=W[i]*(id==1?GS[i]:PS[i]);dapK+=W[i]*DAP[i];}
    float t=vnoise(vW.xz*.21);
    if(id==1){L.y+=.1*(t-.5)*(1.-W[4]);
      float litter=smoothstep(.62,.7,vnoise(vW.xz*1.3))*W[1];L+=vec3(-.1,.2,.15)*litter;S+=vec3(0.,0.,.2)*litter;}   // autumn leaf litter
    else{float u=vUV.y,s=vUV.x,fw=W[0]+W[1]+W[5],jw=W[2],dw=W[3];
      vec2 q=vec2((fract(s/1.6)-.5)*1.6,abs(u)-1.1);
      float stud=(1.-smoothstep(.08,.12,length(q)))*(fw+.3*dw+.3*W[4]);
      float kerb=smoothstep(3.0,3.25,abs(u));
      float rut=smoothstep(.35,.2,abs(abs(u)-2.2))*.1*vnoise(vec2(s*.7,u*3.))*fw;
      float seam=smoothstep(.86,.93,fract(s/.45))*jw;                                   // gaps between boardwalk planks
      float woodg=(vnoise(vec2(s*2.2,u*9.))-.5)*.12*jw;                                 // grain along the boards
      vec3 add=vec3(0.,rut+woodg,.5*stud+.75*kerb+.55*seam);L+=add;S+=add+vec3(0.,0.,.05*kerb);
      // ice: pale and glassy, with paper-white glints and fine key cracks
      float ice=vBio2.z,glint=smoothstep(.8,.86,fract(s*.35+u*.6+.3*vnoise(vec2(s*.2,u))));
      float crack=smoothstep(.97,1.,1.-abs(vnoise(vec2(s*.9,u*1.4))-.5)*2.)*.6;
      vec3 I=vec3(.38,.04,.06)*(1.-glint)+vec3(0.,0.,crack);L=mix(L,I,ice);S=mix(S,I+vec3(0.,.04,.08),ice);dapK*=1.-ice;}
  }else if(id==3){L=vec3(.24,.6,.02);S=vec3(.1,.78,.34);dressedByRegion=true;
    vec3 an=abs(N);vec2 pp=an.y>max(an.x,an.z)?vW.xz:an.x>an.z?vW.zy:vW.xy;   // pick the face's plane so the marks don't smear
    float mk=smoothstep(.7,.76,vnoise(pp*vec2(2.6,4.2)+vSeed*17.));
    L+=vec3(-.1,.18,.12)*mk;S+=vec3(0.,0.,.3)*mk;
    if(reg==1){float c=fract(vSeed*7.31+floor(vW.y*.4)*.37);                        // autumn: yellow, orange or red crowns
      if(c<.33){L=vec3(.8,.12,0.);S=vec3(.55,.4,.15);}else if(c<.66){L=vec3(.35,.72,0.);S=vec3(.15,.78,.3);}else{L=vec3(.12,.7,.38);S=vec3(.05,.6,.72);}
      L+=vec3(0.,.1,.1)*mk;S+=vec3(0.,0.,.2)*mk;}
  }else if(id==4){L=vec3(.06,.3,.6);S=vec3(0.,.36,.86);dressedByRegion=true;
  }else if(id==5){L=vec3(.32,.1,.28);S=vec3(.15,.22,.66);dressedByRegion=true;
  }else if(id==6||id==7){                         // far plates: flat, graded like a woodblock bokashi, inks set per region
    float y=vUV.x;lit=1.;deep=0.;
    if(id==6){L=uFarInk*mix(.35,1.,smoothstep(0.,300.,y));L=mix(L,strata(y*1.3,vW.x+vW.z)*.8*mix(.55,1.,smoothstep(0.,150.,y)),uStrata);
      if(y>uSnowLine-12.*vnoise(vec2(vW.x*.02,vW.z*.02)))L=vec3(.03,.02,0.);fogK=uRingFog.x;}   // snow is bare paper
    else{L=uNearInk*mix(.5,1.,smoothstep(0.,120.,y));L=mix(L,strata(y*2.,vW.x-vW.z),uStrata);
      if(y>uSnowLine*.45+10.*vnoise(vec2(vW.x*.03,vW.z*.03)))L=mix(L,vec3(.06,.02,0.),step(uSnowLine,250.));fogK=uRingFog.y;}
    S=L;
  }else if(id==8){L=vec3(.3,.52,0.);S=vec3(.2,.66,.24);dressedByRegion=true;
    if(reg==1){L=vec3(.55,.25,0.);S=vec3(.4,.35,.2);}
  }else if(id==9){L=vec3(.04,.04,.06);S=vec3(.1,.18,.3);dressedByRegion=true;
    float mark=step(.82,vnoise(vec2(vH*26.,vSeed*50.+atan(N.x,N.z)*1.2)));L.z+=.8*mark;S.z+=.8*mark;
  }else if(id==10){L=vec3(.12,.62,.28);S=vec3(0.,.72,.6);
  }else if(id==11){                               // mossy trunk climbed by pothos
    L=vec3(.06,.32,.55);S=vec3(0.,.38,.84);
    float m=smoothstep(.5,.6,vnoise(vec2(vH*55.,atan(N.x,N.z)*1.6+vSeed*9.)));
    L=mix(L,vec3(.32,.66,.08),m);S=mix(S,vec3(.1,.8,.4),m);
  }else if(id==12){                               // saguaro: light + key overprint to green, with ribs
    float rib=smoothstep(.35,.5,abs(fract(atan(N.z,N.x)*1.91)-.5));
    L=vec3(.58,.02,.34)+vec3(0.,0.,.25)*rib;S=vec3(.32,.06,.68)+vec3(0.,0.,.2)*rib;
  }else if(id==13){L=strata(vW.y,vW.x+vW.z);S=L*vec3(.55,.75,1.)+vec3(0.,0.,.42);
  }else if(id==14){                               // jungle fronds: sunlit lime, deep green underneath
    L=vec3(.52,.5,0.);S=vec3(.04,.74,.56);
    float v=vnoise(vW.xz*1.7+vW.y*.9);L.y+=.12*v;S.z+=.12*v;
  }else if(id==15){L=vec3(.42,.06,.22);S=vec3(.3,.1,.48);
  }else if(id==16){L=vec3(.5,.14,.04);S=vec3(.4,.24,.22);
  }else if(id==17){                               // palm trunk: ringed bark
    float ring=smoothstep(.55,.75,fract(vH*95.));L=vec3(.3,.3,.25)+vec3(0.,0.,.4)*ring;S=vec3(.15,.35,.6)+vec3(0.,0.,.3)*ring;
  }else if(id==18){                               // a stream (rippled key lines on mid), a dry chasm in the desert, ice in the snow
    float rip=smoothstep(.82,.9,fract(vUV.y*.9+sin(vUV.x*1.7+uTime*1.5)*.25+uTime*.15));
    L=vec3(.08,.35,.38)+vec3(0.,0.,.4)*rip;L=mix(L,vec3(.1,.3,.85),W[3]);L=mix(L,vec3(.3,.05,.1)+vec3(0.,0.,.3)*rip,W[4]);L=mix(L,vec3(0.,.45,.75),W[5]);S=L;lit=1.;deep=0.;
  }else if(id==20){                               // a shadow pooled on the path under an obstacle, with a ragged edge
    vec2 q=vUV;float r=q.x*q.x+pow(abs(q.y),6.)+.25*(vnoise(vW.xz*2.3)-.5);if(r>1.)discard;
    L=vec3(0.);for(int i=0;i<6;i++)L+=W[i]*PS[i];L+=vec3(0.,.08,.32);S=L;lit=1.;deep=0.;}
  vec3 d=mix(S,L,lit);d.z+=deep*.16;
  if(dressedByRegion||id>=11&&id<=17){
    if(reg==4)d=mix(d,vec3(.02,0.,.01),smoothstep(.3,.6,N.y)*(id==3||id==4||id==5||id==8||id==9?1.:0.));   // snow settles on every upturned face
    if(reg==5)d=vec3(d.x*.2,d.y*.75+.12,d.z*.85+.22);}                                                // moonlit
  // dappled canopy shade on the ground and path near the tree line
  if(id<=2){float near=1.-smoothstep(9.,40.,abs(vUV.y)),lo=mix(.5,.34,W[2]);   // the jungle floor is mostly shade, with bright sun patches
    float dap=smoothstep(lo,lo+.12,vnoise(vW.xz*.12+vec2(sin(uTime*.4)*.06,cos(uTime*.31)*.05)));
    d=mix(d,S+vec3(0.,.04,.1),dap*near*dapK);}
  d*=.86+.28*vnoise(vW.xz*.07+vW.y*.05+vSeed*13.);   // uneven ink, like a hand-inked block
  float dist=length(vW-cameraPosition);
  float f=id>=6&&id<=7?fogK:1.-exp(-pow(dist/uFogDist,1.5));
  float oid=float(id);
  #ifdef OBSTACLE
    f*=.35;d.z+=.1;d.x+=.4*lit*smoothstep(.2,.7,N.y);oid+=${OBST}.;   // a sunlit top in light ink over a dark body
  #endif
  d=mix(d,uFogInk,f);
  gl_FragColor=vec4(clamp(d,0.,1.),(oid+.5+(vSeed-.5)*.4)/64.);
}`});
  return m;
}

// Signboard faces: the text is drawn on a canvas and printed in the key ink on a light wooden board.
// They count as obstacles for the print (flat ink, heavy outline).
export function signMaterial(tex){return new THREE.ShaderMaterial({uniforms:{tex:{value:tex}},side:THREE.DoubleSide,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform sampler2D tex;varying vec2 vUv;void main(){float k=texture2D(tex,vUv).a;gl_FragColor=vec4(.3,.08,.08+.86*k,(${OBST}.+${ID.TRUNK}.+.5)/64.);}`});}

// ---------- the sky: a split fountain with kasumi mist bands ----------
export function skyMaterial(){
  return new THREE.ShaderMaterial({
    uniforms:{uSun:{value:new THREE.Vector3(0,1,0)},uFogInk:{value:new THREE.Vector3(.4,.05,0)},uSkyTop:{value:new THREE.Vector3(.06,.42,0)},uNight:{value:0},uKasumi:{value:1}},
    depthWrite:false,depthTest:false,side:THREE.BackSide,
    vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.);}`,
    fragmentShader:`
uniform vec3 uSun,uFogInk,uSkyTop;uniform float uNight,uKasumi;varying vec3 vDir;
${NOISE}
void main(){
  vec3 dir=normalize(vDir);float y=dir.y;
  // two inks on one roller: the top ink blending into the horizon ink, with uneven banding
  float band=(vnoise(vec2(y*26.,dir.x*.6+3.))-.5)*.14;
  vec3 d=mix(uFogInk,uSkyTop,clamp(smoothstep(.0,.6,y)+band,0.,1.));
  // kasumi: long horizontal mist bands where the paper shows through
  float m=smoothstep(.56,.68,vnoise(vec2((dir.x+dir.z*.7)*2.3,y*17.)))*(1.-smoothstep(.04,.42,y))*step(.015,y);
  d*=1.-.9*m*uKasumi;
  // the sun, a flat disc of light ink, or at night a paper-white moon with a thin ring
  float sd=acos(clamp(dot(dir,uSun),-1.,1.)),disc=1.-smoothstep(.068,.074,sd);
  d=mix(d,mix(vec3(.95,.3,0.),vec3(0.),uNight),disc);
  d=mix(d,vec3(.7,d.y*.5,d.z*.4),uNight*(1.-smoothstep(.08,.1,sd))*(1.-disc)*.6);
  // stars: specks of paper in the night sky
  float st=step(.996,hash(floor(dir.xz/(y+.3)*260.)))*uNight*step(.05,y);d*=1.-st;
  if(y<0.)d=uFogInk;
  gl_FragColor=vec4(d,0.);
}`});
}

// ---------- blue noise (the same 128² tile as riso.js) ----------
function rng(seed){let s=(Math.imul(seed|0,2654435761)>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
function blueTile(){const N=128,n=N*N,r=rng(4242),v=new Float32Array(n),t=new Float32Array(n);for(let i=0;i<n;i++)v[i]=r();
  const box=(a,b,dx,dy)=>{for(let y=0;y<N;y++)for(let x=0;x<N;x++){let s=0;for(let k=-2;k<=2;k++)s+=a[((y+k*dy+N)%N)*N+(x+k*dx+N)%N];b[y*N+x]=s/5;}};
  for(let pass=0;pass<3;pass++){const u=new Float32Array(n);box(v,t,1,0);box(t,u,0,1);for(let i=0;i<n;i++)v[i]-=u[i];}
  const idx=Array.from({length:n},(_,i)=>i).sort((a,b)=>v[a]-v[b]),out=new Uint8Array(n);idx.forEach((k,i)=>out[k]=Math.min(255,Math.floor((i+.5)/n*256)));return out;}
function blueTexture(){const t=new THREE.DataTexture(blueTile(),128,128,THREE.RedFormat,THREE.UnsignedByteType);
  t.magFilter=t.minFilter=THREE.NearestFilter;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.generateMipmaps=false;t.needsUpdate=true;return t;}

export const hex3=h=>{const n=parseInt(h.slice(1),16);return new THREE.Vector3((n>>16&255)/255,(n>>8&255)/255,(n&255)/255);};

// ---------- the print pass ----------
const POST_FRAG=`
uniform sampler2D tDens,tDepth,tBlue;
uniform vec2 uRes,uDensRes,uMis0,uMis1,uMis2,uSunUV;
uniform vec3 uInk0,uInk1,uInk2,uPaper;
uniform float uNear,uFar,uDepthDrift,uGrain,uGrainAmt,uInkAmt,uSoft,uOutline,uThick,uWobble,uDefects,uDots,uSeed,uDpr,uShaft,uTone,uHatch,uDeckle;
varying vec2 vUv;
${NOISE}
float linZ(float d){float z=d*2.-1.;return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear));}
float invZ(vec2 uv){return 1./linZ(texture2D(tDepth,uv).r);}
// Key-ink outlines: the Laplacian of inverse depth is ~0 across any plane, so it lights up only at
// silhouettes and creases; the id channel catches touching objects. Wobbled like a hand-cut block.
float outline(vec2 uv){
  vec2 fc=gl_FragCoord.xy/uDpr;
  uv+=uWobble*vec2(sin(fc.y*.06+uSeed*3.1)+.5*sin(fc.y*.19),sin(fc.x*.05+uSeed*5.3)+.5*sin(fc.x*.17))/uRes*uDpr;
  vec2 t=uThick/uDensRes;
  float c=invZ(uv),n=invZ(uv+vec2(0.,t.y)),s=invZ(uv-vec2(0.,t.y)),e=invZ(uv+vec2(t.x,0.)),w=invZ(uv-vec2(t.x,0.));
  float lap=abs(n+s+e+w-4.*c)/max(c,1e-6);
  float ed=smoothstep(.05,.14,lap);
  float a=texture2D(tDens,uv).a,an=texture2D(tDens,uv+vec2(0.,t.y)).a,as=texture2D(tDens,uv-vec2(0.,t.y)).a,ae=texture2D(tDens,uv+vec2(t.x,0.)).a,aw=texture2D(tDens,uv-vec2(t.x,0.)).a;
  float idd=step(.004,max(max(abs(an-a),abs(as-a)),max(abs(ae-a),abs(aw-a))));
  if(a<1./64.)idd=0.;                             // the sky never outlines itself (depth handles the skyline)
  // nor do motes, birds or obstacle shadows (ids 19, 20)
  vec4 A4=floor(vec4(an,as,ae,aw)*64.);float A0=floor(a*64.);
  if(A0==19.||A0==20.||any(equal(A4,vec4(19.)))||any(equal(A4,vec4(20.))))idd=0.;
  float z=1./c;
  float o=max(ed,idd)*(1.-smoothstep(70.,260.,z));  // outlines fade with distance, as in Sable
  // obstacles: a second, wider ring that only counts where an obstacle meets anything else
  const float OB=${OBST}./64.;
  vec2 t2=t*2.4;float b0=step(OB,a),bn=step(OB,texture2D(tDens,uv+vec2(0.,t2.y)).a),bs=step(OB,texture2D(tDens,uv-vec2(0.,t2.y)).a),
    be=step(OB,texture2D(tDens,uv+vec2(t2.x,0.)).a),bw=step(OB,texture2D(tDens,uv-vec2(t2.x,0.)).a);
  float ob=max(max(abs(bn-b0),abs(bs-b0)),max(abs(be-b0),abs(bw-b0)));
  return max(o,ob*(1.-smoothstep(150.,380.,z)));
}
// Light shafts: march toward the sun and count how much open sky lies between; that light bleaches
// the mid and key plates and lays down a haze of light ink, so rays stream through canopy gaps.
float shafts(vec2 uv){
  if(uShaft<=0.)return 0.;
  vec2 d=uSunUV-uv;float L=length(d*vec2(uRes.x/uRes.y,1.));vec2 st=d*min(1.,.9/max(L,1e-3))/24.;
  float j=hash(gl_FragCoord.xy+uSeed),acc=0.,wsum=0.,wt=1.;
  for(int i=0;i<24;i++){acc+=wt*step(220.,linZ(texture2D(tDepth,uv+st*(float(i)+j)).r));wsum+=wt;wt*=.93;}   // near samples weigh most, so gaps cast streaks
  return uShaft*acc/wsum*(1.-smoothstep(0.,1.25,L));
}
// The key plate as a hand-cut line screen: hatching whose lines thicken with density (solid at 1),
// wavering like a gouge, so shade and trunks read as carved while the light inks stay grainy.
float hatch(vec2 fc,float d){vec2 p=fc/uDpr;const float a=.82;vec2 r=mat2(cos(a),-sin(a),sin(a),cos(a))*p;
  float wv=1.3*sin(r.x*.045+r.y*.01)+.7*sin(r.x*.13+uSeed*6.);
  float f=abs(fract((r.y+wv)/3.4)-.5)*2.;return 1.-smoothstep(d-.14,d+.14,f);}
float grain(vec2 fc,float k){return texture2D(tBlue,(fc/uDpr+vec2(37.,91.)*k+floor(uSeed*61.)*vec2(17.,29.))/(128.*uGrain)).r;}
float dots(vec2 fc,float d,float ang){fc/=uDpr;float c=cos(ang),s=sin(ang);vec2 r=mat2(c,-s,s,c)*fc/4.2;vec2 f=fract(r)-.5;
  float rad=sqrt(clamp(d,0.,1.))*.64;return 1.-smoothstep(rad-.07,rad+.07,length(f));}
vec3 plate(vec2 uv,vec2 fc,float dk,vec2 mis,int k,vec3 ink,float sh,float sky,float edge){
  vec2 o=mis*dk/uRes*uDpr;
  vec4 s=texture2D(tDens,uv+o);
  float d=k==0?s.r:k==1?s.g:s.b,ob=step(${OBST}./64.,s.a);   // obstacles print as flat, solid ink: no hatching, little grain
  if(k==2)d=max(d,outline(uv+o)*uOutline);
  d=k==0?d+sh*.4:d*(1.-sh*.6);
  // press defects, fixed to the sheet: a starved patch on each drum, and the feed rollers' tire tracks
  float starve=smoothstep(.55,.85,vnoise(fc/uDpr/240.+float(k)*7.3));
  float tx=vUv.x;float tire=(1.-smoothstep(.0025,.0045,abs(tx-.24)))+(1.-smoothstep(.0025,.0045,abs(tx-.76)));
  tire*=step(.55,fract(fc.y/uDpr/9.))*vnoise(vec2(tx*40.,fc.y/uDpr/120.));
  d*=uInkAmt*(1.-uDefects*.4*starve);
  if(k==2)d+=uDefects*.22*tire;
  // bold shapes: push densities toward clean paper and solid ink, leaving grain for the tints between
  d=mix(d,smoothstep(.1,.86,d),max(uTone,.85*ob));
  // grain strength: 0 prints a flat tint, 1 is pure stochastic grain (Grain Touch)
  float cov=mix(clamp(d,0.,1.),clamp((d-grain(fc,float(k)))/uSoft+.5,0.,1.),uGrainAmt*(1.-.6*ob));
  if(k==1)cov=mix(cov,dots(fc,d,.26),uDots);
  if(k==2)cov=mix(cov,hatch(fc,clamp(d,0.,1.)),uHatch*(1.-sky)*(1.-ob));
  return mix(vec3(1.),ink,cov*edge);
}
void main(){
  vec2 fc=gl_FragCoord.xy;
  float zc=linZ(texture2D(tDepth,vUv).r);
  float dk=mix(1.,.35+1.65*smoothstep(4.,160.,zc),uDepthDrift);  // far plates drift further: misregistration as depth of field
  float sh=shafts(vUv),sky=step(1500.,zc);
  // the print doesn't bleed: ink stops a few pixels short of the image edge, raggedly, like a real plate
  vec2 q=fc/uDpr,R=uRes/uDpr;float ed=min(min(q.x,R.x-q.x),min(q.y,R.y-q.y)),along=q.x+q.y*1.7;
  float edge=mix(1.,smoothstep(0.,2.5,ed-1.5-5.*vnoise(vec2(along*.06,1.))-2.*vnoise(vec2(along*.4,3.))),uDeckle);
  vec3 col=plate(vUv,fc,dk,uMis0,0,uInk0,sh,sky,edge)*plate(vUv,fc,dk,uMis1,1,uInk1,sh,sky,edge)*plate(vUv,fc,dk,uMis2,2,uInk2,sh,sky,edge);
  vec2 p=fc/uDpr;
  float fibre=.965+.035*vnoise(p*vec2(.9,.14))+.015*(vnoise(p*.5)-.5);
  float speck=1.-.35*step(.9965,hash(floor(p*.7)))*uDefects;
  gl_FragColor=vec4(uPaper*fibre*speck*col,1.);
}`;

export class PrintPass{
  constructor(renderer){
    this.renderer=renderer;
    this.rt=new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType,depthTexture:new THREE.DepthTexture(4,4),
      minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false});
    this.rt.depthTexture.minFilter=this.rt.depthTexture.magFilter=THREE.NearestFilter;
    const V=v=>({value:v});
    this.u={tDens:V(this.rt.texture),tDepth:V(this.rt.depthTexture),tBlue:V(blueTexture()),
      uRes:V(new THREE.Vector2(4,4)),uDensRes:V(new THREE.Vector2(4,4)),uSunUV:V(new THREE.Vector2(.5,.8)),
      uMis0:V(new THREE.Vector2()),uMis1:V(new THREE.Vector2()),uMis2:V(new THREE.Vector2()),
      uInk0:V(new THREE.Vector3(1,.9,0)),uInk1:V(new THREE.Vector3(1,.3,.7)),uInk2:V(new THREE.Vector3(0,.4,.75)),uPaper:V(new THREE.Vector3(.95,.93,.89)),
      uNear:V(.15),uFar:V(2600),uDepthDrift:V(.6),uGrain:V(1),uGrainAmt:V(.6),uInkAmt:V(1),uSoft:V(.1),uOutline:V(.85),uThick:V(1),uWobble:V(1.5),
      uDefects:V(.5),uDots:V(0),uSeed:V(0),uDpr:V(1),uShaft:V(0),uTone:V(.55),uHatch:V(.6),uDeckle:V(1)};
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:this.u,depthTest:false,depthWrite:false,
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,fragmentShader:POST_FRAG}));
    this.quad.frustumCulled=false;
    this.scene=new THREE.Scene();this.scene.add(this.quad);this.cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  }
  // w,h: drawing-buffer pixels; scale: density buffer resolution relative to that
  setSize(w,h,scale,dpr){const dw=Math.max(2,Math.round(w*scale)),dh=Math.max(2,Math.round(h*scale));
    this.rt.setSize(dw,dh);this.u.uRes.value.set(w,h);this.u.uDensRes.value.set(dw,dh);this.u.uDpr.value=dpr;}
  render(scene,camera){const r=this.renderer;
    this.u.uNear.value=camera.near;this.u.uFar.value=camera.far;
    r.setRenderTarget(this.rt);r.setClearColor(0x000000,0);r.clear();r.render(scene,camera);
    r.setRenderTarget(null);r.render(this.scene,this.cam);}
}
