// runner.js — the runner, seen from behind (the "behind" view; first person has no body).
// A faceted mannequin after Superhot: a dozen low-poly solids, each facet flat, so the print pass inks it in
// hard facet bands like cut paper. It is posed in code every frame (run, jump tuck, slide, lean into lane
// changes) and on a crash it shatters into its facets, which tumble away.
// The body prints with the obstacle material: solid ink, a heavy outline and a paper edge, so it reads on any
// ground. It is mostly mid ink, so it never reads as an obstacle (those are mostly key).
import * as THREE from 'three';
import {ID} from './print.js';
import {GLTFLoader} from '../lib/GLTFLoader.js';

const KEYS=['position','normal','aId','aUV','aBio','aBio2'];
// a solid's geometry with flat facets and the ink attributes the shader expects
function inked(g){g=g.index?g.toNonIndexed():g;g.computeVertexNormals();const n=g.attributes.position.count;
  g.setAttribute('aId',new THREE.BufferAttribute(new Float32Array(n).fill(ID.RUNNER),1));
  g.setAttribute('aUV',new THREE.BufferAttribute(new Float32Array(n*2),2));
  g.setAttribute('aBio',new THREE.BufferAttribute(new Float32Array(n*3),3));
  g.setAttribute('aBio2',new THREE.BufferAttribute(new Float32Array(n*3),3));
  for(const k of Object.keys(g.attributes))if(!KEYS.includes(k))g.deleteAttribute(k);return g;}
// a tapered, faceted limb hanging down from its joint: len long, r0 wide at the joint, r1 at the far end
const limb=(len,r0,r1,sides=5)=>{const g=new THREE.CylinderGeometry(r1,r0,len,sides,1);g.translate(0,-len/2,0);return inked(g);};

export class Runner{
  constructor(scene,mat){
    this.mat=mat;this.root=new THREE.Group();scene.add(this.root);this.parts=[];this.shards=null;
    const J=(parent,x,y,z)=>{const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;};
    const M=(parent,geo,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.frustumCulled=false;parent.add(m);this.parts.push(m);return m;};
    const j=this.j={};
    j.hips=J(this.root,0,.95,0);
    M(j.hips,inked(new THREE.CylinderGeometry(.15,.13,.2,6)),0,-.02,0);                       // pelvis
    j.spine=J(j.hips,0,.08,0);
    M(j.spine,inked(new THREE.CylinderGeometry(.21,.15,.46,6)),0,.25,0);                      // chest, broad at the shoulders
    j.head=J(j.spine,0,.55,0);
    M(j.head,inked(new THREE.IcosahedronGeometry(.12,0)),0,.12,.01);                          // head
    M(j.head,inked(new THREE.CylinderGeometry(.045,.055,.08,5)),0,.0,0);                      // neck
    for(const sd of[-1,1]){const k=sd<0?'L':'R';
      j['sh'+k]=J(j.spine,.25*sd,.46,0);M(j['sh'+k],limb(.29,.06,.045));
      j['el'+k]=J(j['sh'+k],0,-.29,0);M(j['el'+k],limb(.27,.045,.035));
      M(j['el'+k],inked(new THREE.OctahedronGeometry(.055,0)),0,-.31,0);                    // fist
      j['th'+k]=J(j.hips,.1*sd,-.06,0);M(j['th'+k],limb(.44,.085,.06,6));
      j['kn'+k]=J(j['th'+k],0,-.44,0);M(j['kn'+k],limb(.43,.06,.04));
      j['an'+k]=J(j['kn'+k],0,-.43,0);M(j['an'+k],inked(new THREE.CylinderGeometry(.04,.055,.22,4).rotateX(Math.PI/2).rotateY(Math.PI/4)),0,-.03,.06);}   // foot
    this.ph=0;this.air=0;this.slide=0;this.lean=0;
  }
  show(on){this.root.visible=on&&!this.shards;}
  // place and pose the runner. f: path frame at the runner (x,z, right rx,rz, forward fx,fz), y: ground height,
  // R: the runner state, lean: how far it is from its lane (m, signed), dt: frame time
  update(f,y,R,lean,dt){
    if(this.shards)return this.updateShards(dt);
    // local +z is the way it runs; x = its left keeps the basis right-handed
    const left=new THREE.Vector3(-f.rx,0,-f.rz),fwd=new THREE.Vector3(f.fx,0,f.fz),up=new THREE.Vector3(0,1,0);
    this.root.position.set(f.x+R.u*f.rx,y+R.y,f.z+R.u*f.rz);
    this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left,up,fwd));
    const k=t=>1-Math.exp(-t*dt);
    this.air+=((R.air?1:0)-this.air)*k(14);this.slide+=((R.duck?1:0)-this.slide)*k(18);this.lean+=(lean-this.lean)*k(10);
    this.ph+=dt*Math.PI*2*(1.3+.07*R.v);
    const p=this.ph,j=this.j,a=this.air,sl=this.slide,run=(1-a)*(1-sl);
    const sw=Math.sin(p),kn=s=>.2+1.25*Math.pow(Math.max(0,Math.sin(s+.9)),1.2);
    const mix3=(r,jv,s)=>r*run+jv*a*(1-sl)+s*sl;
    // legs: a sprint (thigh swing, knee folding on the way back), a jump tuck, a slide (one leg out, one folded)
    j.thL.rotation.x=mix3(-.95*sw-.15,-1.15,-1.45);j.knL.rotation.x=mix3(kn(p),1.5,.1);
    j.thR.rotation.x=mix3(.95*sw-.15,-.55,-.55);j.knR.rotation.x=mix3(kn(p+Math.PI),1.7,1.75);
    j.anL.rotation.x=mix3(-.3+.3*sw,.5,.6);j.anR.rotation.x=mix3(-.3-.3*sw,.5,.2);
    // arms swing against the legs, elbows bent; up and out in a jump, trailing back in a slide
    j.shL.rotation.x=mix3(.85*sw,-2.3,.9);j.shR.rotation.x=mix3(-.85*sw,-2.3,.9);
    j.shL.rotation.z=mix3(.08,.5,-.25);j.shR.rotation.z=mix3(-.08,-.5,.25);
    j.elL.rotation.x=mix3(-1.35+.25*sw,-.4,-.3);j.elR.rotation.x=mix3(-1.35-.25*sw,-.4,-.3);
    // body: a forward sprint lean with a bob and a counter-twist; leaning back low in a slide
    j.spine.rotation.x=mix3(.22,.35,-.95);j.spine.rotation.y=run*.16*sw;
    j.hips.position.y=mix3(.95+.05*Math.abs(Math.cos(p)),.85,.4);j.hips.rotation.y=-run*.1*sw;
    j.head.rotation.x=-j.spine.rotation.x*.75;
    // lean into a lane change
    this.root.rotateZ(-Math.max(-.35,Math.min(.35,this.lean*.14)));
  }
  // Shatter: every pair of facets becomes a shard flying off the body, tumbling, bouncing once on the ground.
  shatter(v,groundY){if(this.shards)return;this.root.updateMatrixWorld(true);const out=[],c=new THREE.Vector3(),q=new THREE.Vector3();
    const fwd=new THREE.Vector3(0,0,1).applyQuaternion(this.root.quaternion);
    for(const m of this.parts){const pos=m.geometry.attributes.position,n=pos.count/3;
      for(let t=0;t<n;t+=2){const verts=[];c.set(0,0,0);
        for(let i=t*3;i<Math.min(n,t+2)*3;i++){q.fromBufferAttribute(pos,i).applyMatrix4(m.matrixWorld);verts.push(q.x,q.y,q.z);c.add(q);}
        c.divideScalar(verts.length/3);for(let i=0;i<verts.length;i+=3){verts[i]-=c.x;verts[i+1]-=c.y;verts[i+2]-=c.z;}
        const g=inked(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(verts,3))),s=new THREE.Mesh(g,this.mat);
        s.position.copy(c);s.frustumCulled=false;this.root.parent.add(s);
        const out_=c.clone().sub(this.root.position);out_.y=Math.max(0,out_.y-.9);out_.normalize();
        out.push({m:s,v:out_.multiplyScalar(2+Math.random()*3).addScaledVector(fwd,v*.12+Math.random()*1.5).add(new THREE.Vector3(0,1.5+Math.random()*2.5,0)),
          w:new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(14),g:groundY});}}
    this.shards=out;this.root.visible=false;}
  updateShards(dt){for(const s of this.shards){s.v.y-=14*dt;s.m.position.addScaledVector(s.v,dt);
      if(s.m.position.y<s.g+.03){s.m.position.y=s.g+.03;s.v.y=Math.abs(s.v.y)*.3;s.v.x*=.6;s.v.z*=.6;s.w.multiplyScalar(.6);}
      s.m.rotation.x+=s.w.x*dt;s.m.rotation.y+=s.w.y*dt;s.m.rotation.z+=s.w.z*dt;}}
  // back in one piece for a new run
  reset(){if(this.shards){for(const s of this.shards){s.m.parent.remove(s.m);s.m.geometry.dispose();}this.shards=null;}this.ph=0;this.air=0;this.slide=0;this.lean=0;}
}

// ---------- the rigged runner ----------
// Quaternius' Universal Animation Library mannequin (CC0, models/runner.glb, trimmed by tools/trim-glb.mjs) with
// real animation: Sprint_Loop sped up with your speed, Jump_Start → Jump_Loop → Jump_Land, a slide to duck (UAL2's
// Slide_Start → Slide_Loop → Slide_Exit, added by tools/add-clips.mjs), Idle on the
// title. It prints with the same ink as the hand-built runner (flat facets, mid-ink body, key-ink joints), and the
// procedural runner stands in until the model loads (or if it can't).
const HEIGHT=1.78;
export class RiggedRunner{
  constructor(scene,mat){
    this.scene=scene;this.mat=mat;this.stand=new Runner(scene,mat);this.root=this.stand.root;this.ready=false;this.shards=null;this.on=true;
    new GLTFLoader().load('models/runner.glb',g=>{try{this.build(g);}catch(e){console.warn('runner model',e);}},undefined,e=>console.warn('runner model',e));}
  build(g){
    const model=g.scene,meshes=[];model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
    for(const m of meshes){const geo=m.geometry,n=geo.attributes.position.count,id=/joint/i.test(m.material.name)?ID.JOINT:ID.RUNNER;
      geo.setAttribute('aId',new THREE.BufferAttribute(new Float32Array(n).fill(id),1));
      for(const[k,sz]of[['aUV',2],['aBio',3],['aBio2',3]])geo.setAttribute(k,new THREE.BufferAttribute(new Float32Array(n*sz),sz));
      m.material=this.mat;m.frustumCulled=false;}
    // stand it 1.78 m tall on its feet, facing the way it runs (+z)
    const box=new THREE.Box3().setFromObject(model),k=HEIGHT/(box.max.y-box.min.y);model.scale.setScalar(k);model.position.y=-box.min.y*k;
    this.body=new THREE.Group();this.body.add(model);this.meshes=meshes;
    this.mixer=new THREE.AnimationMixer(model);this.A={};
    for(const c of g.animations){const a=this.mixer.clipAction(c);this.A[c.name]=a;}
    for(const n of['Jump_Start','Jump_Land','Slide_Start','Slide_Exit']){this.A[n].setLoop(THREE.LoopOnce,1);this.A[n].clampWhenFinished=true;}
    this.cur=null;this.play('Idle_Loop',0);
    this.scene.remove(this.stand.root);this.root=new THREE.Group();this.root.add(this.body);this.scene.add(this.root);this.ready=true;this.wasAir=false;this.wasDuck=false;this.landT=0;}
  play(name,fade=.15,ts=1,from=0){const a=this.A[name];if(this.cur===a){a.timeScale=ts;return;}
    a.reset();a.time=from;a.timeScale=ts;a.enabled=true;a.setEffectiveWeight(1);a.play();if(this.cur&&fade>0)this.cur.crossFadeTo(a,fade,false);else if(this.cur)this.cur.stop();this.cur=a;}
  show(on){this.on=on;if(!this.ready)return this.stand.show(on);this.root.visible=on&&!this.shards;}
  update(f,y,R,lean,dt){
    if(!this.ready)return this.stand.update(f,y,R,lean,dt);
    if(this.shards)return this.updateShards(dt);
    const left=new THREE.Vector3(-f.rx,0,-f.rz),fwd=new THREE.Vector3(f.fx,0,f.fz),up=new THREE.Vector3(0,1,0);
    this.root.position.set(f.x+R.u*f.rx,y+R.y,f.z+R.u*f.rz);
    this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left,up,fwd));
    this.lean=(this.lean||0)+(lean-(this.lean||0))*(1-Math.exp(-10*dt));this.root.rotateZ(-Math.max(-.3,Math.min(.3,this.lean*.12)));
    // which animation: idle before the run, the sprint (faster with speed), the jump in three parts, a roll to duck
    const run=R.v>.5,sprint=Math.min(1.55,Math.max(.85,R.v/15));
    if(!run&&dt>0)this.play('Idle_Loop',.3);
    else if(R.air){if(!this.wasAir)this.play('Jump_Start',.08,1.6,.45);else if(this.cur===this.A.Jump_Start&&this.cur.time>=this.cur.getClip().duration-.05)this.play('Jump_Loop',.15);}
    else if(R.duck){const sl=this.A.Slide_Start;if(!this.wasDuck)this.play('Slide_Start',.08,1.8,.1);else if(this.cur===sl&&sl.time>=sl.getClip().duration-.05)this.play('Slide_Loop',.1);}
    else if(this.wasDuck){this.play('Slide_Exit',.06,1.8);this.landT=.26;}
    else if(this.wasAir){this.play('Jump_Land',.06,2.4,.25);this.landT=.22;}
    else if(this.landT>0){this.landT-=dt;if(this.landT<=0)this.play('Sprint_Loop',.12,sprint);}
    else this.play('Sprint_Loop',this.wasDuck?.12:.2,sprint);
    this.wasAir=R.air;this.wasDuck=R.duck;
    this.mixer.update(dt);}
  // Shatter the body as posed this frame: every run of 96 triangles becomes a shard, flying and tumbling.
  shatter(v,groundY){
    if(!this.ready)return this.stand.shatter(v,groundY);if(this.shards)return;
    this.root.updateMatrixWorld(true);const fwd=new THREE.Vector3(0,0,1).applyQuaternion(this.root.quaternion),p=new THREE.Vector3(),pos=[],ids=[],S=[];
    for(const m of this.meshes){const ix=m.geometry.index,n=ix?ix.count:m.geometry.attributes.position.count,id=m.geometry.attributes.aId.array[0];
      for(let t0=0;t0<n;t0+=96*3){const v0=pos.length/3,c=new THREE.Vector3();
        for(let i=t0;i<Math.min(n,t0+96*3);i++){m.getVertexPosition(ix?ix.getX(i):i,p);p.applyMatrix4(m.matrixWorld);pos.push(p.x,p.y,p.z);ids.push(id);c.add(p);}
        const cnt=pos.length/3-v0;c.divideScalar(cnt);for(let i=v0;i<v0+cnt;i++){pos[i*3]-=c.x;pos[i*3+1]-=c.y;pos[i*3+2]-=c.z;}
        const out=c.clone().sub(this.root.position);out.y=Math.max(0,out.y-.9);out.normalize();
        S.push({v0,cnt,c,q:new THREE.Quaternion(),v:out.multiplyScalar(2+Math.random()*3).addScaledVector(fwd,v*.12+Math.random()*1.5).add(new THREE.Vector3(0,1.5+Math.random()*2.5,0)),
          w:new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize(),ws:6+Math.random()*10,g:groundY});}}
    const geo=new THREE.BufferGeometry(),n=pos.length/3;this.local=new Float32Array(pos);
    geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos.length),3));geo.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(pos.length),3));
    geo.setAttribute('aId',new THREE.BufferAttribute(new Float32Array(ids),1));for(const[k,sz]of[['aUV',2],['aBio',3],['aBio2',3]])geo.setAttribute(k,new THREE.BufferAttribute(new Float32Array(n*sz),sz));
    this.shardMesh=new THREE.Mesh(geo,this.mat);this.shardMesh.frustumCulled=false;this.scene.add(this.shardMesh);this.shards=S;this.root.visible=false;this.updateShards(0);}
  updateShards(dt){const P=this.shardMesh.geometry.attributes.position,L=this.local,dq=new THREE.Quaternion(),v=new THREE.Vector3();
    for(const s of this.shards){s.v.y-=14*dt;s.c.addScaledVector(s.v,dt);if(s.c.y<s.g+.05){s.c.y=s.g+.05;s.v.y=Math.abs(s.v.y)*.3;s.v.x*=.6;s.v.z*=.6;s.ws*=.6;}
      s.q.premultiply(dq.setFromAxisAngle(s.w,s.ws*dt));
      for(let i=s.v0;i<s.v0+s.cnt;i++){v.set(L[i*3],L[i*3+1],L[i*3+2]).applyQuaternion(s.q).add(s.c);P.setXYZ(i,v.x,v.y,v.z);}}
    P.needsUpdate=true;}
  reset(){if(!this.ready)return this.stand.reset();if(this.shards){this.scene.remove(this.shardMesh);this.shardMesh.geometry.dispose();this.shards=null;}
    this.lean=0;this.wasAir=false;this.wasDuck=false;this.landT=0;this.cur&&this.cur.stop();this.cur=null;this.play('Idle_Loop',0);this.root.visible=this.on;}
}
