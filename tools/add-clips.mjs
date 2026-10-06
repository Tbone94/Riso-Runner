// tools/add-clips.mjs — copy animations from one Quaternius library into the runner, renaming bones.
//   node tools/add-clips.mjs <target.glb> <source.glb> Clip1,Clip2,...   (writes target.glb in place)
// UAL2 uses Unreal-style bone names, UAL1 (the runner) Rigify names, but the two skeletons have the same rest pose
// bone for bone, so a channel only needs its target node renamed. Unmatched bones (the *_leaf tips) and constant
// scale tracks are dropped.
import {readFileSync,writeFileSync} from 'node:fs';
const [,,TGT,SRC,LIST]=process.argv,KEEP=LIST.split(',');
const load=f=>{const g=readFileSync(f),l=g.readUInt32LE(12);return{J:JSON.parse(g.slice(20,20+l)),bin:g.slice(20+l+8)};};
const T=load(TGT),S=load(SRC);
const SIZE={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},BYTES={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const read=(M,i)=>{const a=M.J.accessors[i],v=M.J.bufferViews[a.bufferView],el=SIZE[a.type]*BYTES[a.componentType],st=v.byteStride||el,o=(v.byteOffset||0)+(a.byteOffset||0);
  const out=Buffer.alloc(el*a.count);for(let k=0;k<a.count;k++)M.bin.copy(out,k*el,o+k*st,o+k*st+el);return out;};
// UAL2 → UAL1 bone names
const side=s=>s==='l'?'L':'R';
function rename(n){let m;
  const fixed={root:'root',pelvis:'DEF-hips',spine_01:'DEF-spine.001',spine_02:'DEF-spine.002',spine_03:'DEF-spine.003',neck_01:'DEF-neck',Head:'DEF-head'};
  if(fixed[n])return fixed[n];
  if((m=/^(clavicle|upperarm|lowerarm|hand|thigh|calf|foot|ball)_([lr])$/.exec(n)))
    return 'DEF-'+{clavicle:'shoulder',upperarm:'upper_arm',lowerarm:'forearm',hand:'hand',thigh:'thigh',calf:'shin',foot:'foot',ball:'toe'}[m[1]]+'.'+side(m[2]);
  if((m=/^(index|middle|pinky|ring)_0([123])_([lr])$/.exec(n)))return `DEF-f_${m[1]}.0${m[2]}.${side(m[3])}`;
  if((m=/^thumb_0([123])_([lr])$/.exec(n)))return `DEF-thumb.0${m[1]}.${side(m[2])}`;
  return null;}
const byName=new Map(T.J.nodes.map((n,i)=>[n.name,i]));
const chunks=[T.bin.slice(0,T.J.buffers[0].byteLength)];let off=chunks[0].length;
const put=(M,i)=>{const a={...M.J.accessors[i]},d=read(M,i),pad=(4-off%4)%4;if(pad){chunks.push(Buffer.alloc(pad));off+=pad;}
  T.J.bufferViews.push({buffer:0,byteOffset:off,byteLength:d.length});chunks.push(d);off+=d.length;a.bufferView=T.J.bufferViews.length-1;delete a.byteOffset;T.J.accessors.push(a);return T.J.accessors.length-1;};
const isOnes=i=>{const b=read(S,i);for(let k=0;k<b.length;k+=4)if(Math.abs(b.readFloatLE(k)-1)>1e-4)return false;return true;};
for(const name of KEEP){const an=S.J.animations.find(a=>a.name===name);if(!an)throw new Error('no clip '+name);
  T.J.animations=T.J.animations.filter(a=>a.name!==name);
  const done=new Map(),samplers=[],channels=[];let dropped=0;
  for(const c of an.channels){const to=rename(S.J.nodes[c.target.node].name),node=to&&byName.get(to);
    if(node==null||(c.target.path==='scale'&&isOnes(an.samplers[c.sampler].output))){dropped++;continue;}
    const sm=an.samplers[c.sampler],io=k=>{if(!done.has(k))done.set(k,put(S,k));return done.get(k);};
    samplers.push({input:io(sm.input),output:io(sm.output),interpolation:sm.interpolation||'LINEAR'});channels.push({sampler:samplers.length-1,target:{node,path:c.target.path}});}
  T.J.animations.push({name,samplers,channels});console.log(name,channels.length,'channels,',dropped,'dropped');}
const B=Buffer.concat(chunks);T.J.buffers=[{byteLength:B.length}];
const js=Buffer.from(JSON.stringify(T.J)),jp=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]),bp=Buffer.concat([B,Buffer.alloc((4-B.length%4)%4)]);
const head=Buffer.alloc(12);head.write('glTF',0);head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jp.length+8+bp.length,8);
const ch=(n,t)=>{const h=Buffer.alloc(8);h.writeUInt32LE(n,0);h.write(t,4);return h;};
writeFileSync(TGT,Buffer.concat([head,ch(jp.length,'JSON'),jp,ch(bp.length,'BIN\0'),bp]));console.log(TGT,(12+16+jp.length+bp.length)/1e6+' MB');
