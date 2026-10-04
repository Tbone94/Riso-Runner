// air.js — life in the air around the runner: tumbling leaves, seed fluff and pollen, desert dust,
// snowfall, fireflies, and a few birds. Particles live in a box that wraps around the camera, so there
// are always some about; each belongs to a region (forest, autumn, jungle, desert, snow, night) and only
// shows while that region holds. They print into the density buffer like everything else
// (paper-white things are zero ink).
import * as THREE from 'three';
import {ID} from './print.js';

function rng(seed){let s=(Math.imul(seed|0,2654435761)>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}

const VERT=`
attribute vec4 aR;
uniform float uTime,uScale;uniform vec3 uCam,uW1,uW2,uFwd,uRight;
varying float vKind,vRot,vShade,vFlap,vBlink;
void main(){
  float w[6];w[0]=uW1.x;w[1]=uW1.y;w[2]=uW1.z;w[3]=uW2.x;w[4]=uW2.y;w[5]=uW2.z;
  float k=5.,acc=0.;for(int i=0;i<6;i++){acc+=w[i];if(aR.w<acc){k=float(i);break;}}
  float t=uTime,size=0.;vec3 world;vBlink=1.;
  #ifdef BIRDS
    // a loose flock far ahead, drifting slowly across the sky (none over the jungle canopy or at night)
    vec3 c=uCam+uFwd*150.+vec3(0.,50.+6.*sin(t*.07),0.)+uRight*(sin(t*.035)*100.);
    world=c+uRight*(aR.x-.5)*40.+uFwd*(aR.z-.5)*30.+vec3(0.,(aR.y-.5)*10.+sin(t*.6+aR.x*9.),0.);
    size=2.2*(1.-w[2]-w[5]-.6*w[4]);vFlap=sin(t*(6.+3.*aR.y)+aR.z*20.);
  #else
    const float BOX=36.;
    vec3 p=aR.xyz*BOX;
    #ifdef LEAF
      // leaves fall on a breeze and tumble: some in the forest, lots in autumn, a few big ones in the jungle
      p+=vec3(.7*t+sin(t*.8+aR.x*30.)*1.5,-1.*t,.3*t+cos(t*.6+aR.y*20.));
      float f=fract(aR.y*37.);
      size=k==0.?(f<.6?.17:0.):k==1.?.19:k==2.?(f<.3?.24:0.):0.;
      size*=.7+.6*fract(aR.x*91.);
    #else
      // forest fluff drifts, jungle pollen hangs in the light, desert dust streams past, snow falls,
      // and at night fireflies wander and blink
      vec3 vel=k==0.||k==1.?vec3(.4,.05,.2):k==2.?vec3(.08,.12,.05):k==3.?vec3(5.5,.3,1.5):k==4.?vec3(.6,-1.6,.3):vec3(.1,.05,.1);
      p+=vel*t+vec3(sin(t*.5+aR.z*40.),.6*sin(t*.4+aR.x*33.),cos(t*.45+aR.y*27.))*(k==3.?.3:k==4.?.5:.8);
      size=(k==3.?.035:k==4.?.07:k==5.?.09:.05)*(.6+.8*fract(aR.z*57.));
      if(k==1.&&fract(aR.x*13.)>.3)size=0.;
      if(k==5.){vBlink=smoothstep(.2,.9,sin(t*(1.5+aR.y*2.)+aR.x*40.));if(vBlink<.02)size=0.;}
    #endif
    world=uCam+mod(p-uCam+BOX*.5,BOX)-BOX*.5;
    vFlap=0.;
  #endif
  vec4 mv=viewMatrix*vec4(world,1.);float dz=-mv.z;
  vKind=k;vRot=t*(1.2+2.*aR.y)+aR.x*20.;vShade=fract(aR.z*13.);
  if(size<=0.||dz<.7){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;return;}   // off-screen: hidden
  gl_PointSize=clamp(size*uScale/dz,1.,48.);
  gl_Position=projectionMatrix*mv;
}`;

const FRAG_LEAF=`
varying float vKind,vRot,vShade,vFlap,vBlink;
void main(){
  vec2 c=gl_PointCoord-.5;float cr=cos(vRot),sr=sin(vRot);c=mat2(cr,-sr,sr,cr)*c;
  float sq=.25+.75*abs(sin(vRot*.6));                 // foreshortened as it tumbles
  if(abs(c.x)>.48||abs(c.y)>.24*(1.-4.*c.x*c.x)*sq)discard;
  vec3 d=vKind==0.?(vShade<.5?vec3(.3,.7,.08):vec3(.08,.75,.45))
        :vKind==1.?(vShade<.33?vec3(.8,.12,0.):vShade<.66?vec3(.3,.75,0.):vec3(.1,.7,.45))   // yellow, orange, red
        :vec3(.42,.62,0.);
  gl_FragColor=vec4(d,(${ID.LEAF}.+.5)/64.);
}`;
const FRAG_MOTE=`
varying float vKind,vRot,vShade,vFlap,vBlink;
void main(){
  float r=length(gl_PointCoord-.5);if(r>.5)discard;
  // paper-white fluff and snow, yellow pollen, sandy dust, fireflies glowing in the light ink
  vec3 d=vKind==3.?vec3(.5,.25,0.):vKind==2.&&vShade<.4?vec3(.6,0.,0.):vKind==5.?vec3(.95*vBlink,0.,0.):vec3(0.);
  gl_FragColor=vec4(d,(${ID.AIR}.+.5)/64.);
}`;
const FRAG_BIRD=`
varying float vKind,vRot,vShade,vFlap,vBlink;
float seg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.,1.));}
void main(){
  vec2 p=gl_PointCoord-.5;p.y=-p.y;float wy=.06+.16*vFlap;
  float d=min(seg(p,vec2(0.,0.),vec2(-.42,wy)),seg(p,vec2(0.,0.),vec2(.42,wy)));
  if(d>.05)discard;
  gl_FragColor=vec4(0.,.15,1.,(${ID.AIR}.+.5)/64.);
}`;

export class Air{
  constructor(scene){
    this.u={uTime:{value:0},uScale:{value:500},uCam:{value:new THREE.Vector3()},uW1:{value:new THREE.Vector3(1,0,0)},uW2:{value:new THREE.Vector3()},
      uFwd:{value:new THREE.Vector3(0,0,-1)},uRight:{value:new THREE.Vector3(1,0,0)}};
    this.leaves=this.points(scene,480,'LEAF',FRAG_LEAF,true,1);
    this.motes=this.points(scene,800,'MOTE',FRAG_MOTE,false,2);
    this.birds=this.points(scene,11,'BIRDS',FRAG_BIRD,false,3);
  }
  points(scene,n,def,frag,depthWrite,seed){const r=rng(seed*977),A=new Float32Array(n*4);for(let i=0;i<n*4;i++)A[i]=r();
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));g.setAttribute('aR',new THREE.BufferAttribute(A,4));
    const m=new THREE.ShaderMaterial({uniforms:this.u,vertexShader:VERT,fragmentShader:frag,defines:{[def]:1},depthWrite});
    const p=new THREE.Points(g,m);p.frustumCulled=false;scene.add(p);return p;}
  // w: the six region weights; scale: density-buffer pixels per world unit at 1 m
  update(t,camera,w,scale){const u=this.u;u.uTime.value=t;u.uCam.value.copy(camera.position);u.uW1.value.set(w[0],w[1],w[2]);u.uW2.value.set(w[3],w[4],w[5]);u.uScale.value=scale;
    camera.getWorldDirection(u.uFwd.value);u.uFwd.value.y=0;u.uFwd.value.normalize();u.uRight.value.set(-u.uFwd.value.z,0,u.uFwd.value.x);}
}
