// tools/trim-glb.mjs — keep a rigged character and only the animations the game uses.
//   node tools/trim-glb.mjs <in.glb> <out.glb> Clip1,Clip2,...
// Made for Quaternius' Universal Animation Library (CC0): drops texture coordinates, materials' textures,
// constant scale tracks and every unused clip, and repacks the binary so each accessor sits in its own view.
import {readFileSync,writeFileSync} from 'node:fs';
const [,,IN,OUT,LIST]=process.argv,KEEP=LIST.split(',');
const glb=readFileSync(IN),jl=glb.readUInt32LE(12),J=JSON.parse(glb.slice(20,20+jl).toString()),bin=glb.slice(20+jl+8);
const SIZE={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},BYTES={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const read=i=>{const a=J.accessors[i],v=J.bufferViews[a.bufferView],el=SIZE[a.type]*BYTES[a.componentType],st=v.byteStride||el,o=(v.byteOffset||0)+(a.byteOffset||0);
  const out=Buffer.alloc(el*a.count);for(let k=0;k<a.count;k++)bin.copy(out,k*el,o+k*st,o+k*st+el);return out;};
const isOnes=i=>{const b=read(i);for(let k=0;k<b.length;k+=4)if(Math.abs(b.readFloatLE(k)-1)>1e-4)return false;return true;};
// what to keep
for(const m of J.meshes)for(const p of m.primitives){for(const k of Object.keys(p.attributes))if(k.startsWith('TEXCOORD')||k.startsWith('COLOR'))delete p.attributes[k];}
J.animations=J.animations.filter(a=>KEEP.includes(a.name)).map(a=>{const ch=a.channels.filter(c=>!(c.target.path==='scale'&&isOnes(a.samplers[c.sampler].output)));
  const used=[...new Set(ch.map(c=>c.sampler))];return{name:a.name,samplers:used.map(s=>a.samplers[s]),channels:ch.map(c=>({...c,sampler:used.indexOf(c.sampler)}))};});
const missing=KEEP.filter(n=>!J.animations.some(a=>a.name===n));if(missing.length)throw new Error('missing clips: '+missing);
for(const m of J.materials||[]){delete m.pbrMetallicRoughness?.baseColorTexture;delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;}
delete J.textures;delete J.images;delete J.samplers;
// repack
const map=new Map(),views=[],acc=[],chunks=[];let off=0;
const use=i=>{if(i==null)return i;if(map.has(i))return map.get(i);const a={...J.accessors[i]},data=read(i);
  const pad=(4-off%4)%4;if(pad){chunks.push(Buffer.alloc(pad));off+=pad;}
  views.push({buffer:0,byteOffset:off,byteLength:data.length});chunks.push(data);off+=data.length;
  a.bufferView=views.length-1;delete a.byteOffset;acc.push(a);map.set(i,acc.length-1);return acc.length-1;};
for(const m of J.meshes)for(const p of m.primitives){for(const k in p.attributes)p.attributes[k]=use(p.attributes[k]);p.indices=use(p.indices);}
for(const s of J.skins||[])s.inverseBindMatrices=use(s.inverseBindMatrices);
for(const a of J.animations)for(const s of a.samplers){s.input=use(s.input);s.output=use(s.output);}
J.accessors=acc;J.bufferViews=views;const B=Buffer.concat(chunks);J.buffers=[{byteLength:B.length}];
const js=Buffer.from(JSON.stringify(J)),jp=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]),bp=Buffer.concat([B,Buffer.alloc((4-B.length%4)%4)]);
const head=Buffer.alloc(12);head.write('glTF',0);head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jp.length+8+bp.length,8);
const ch=(n,t)=>{const h=Buffer.alloc(8);h.writeUInt32LE(n,0);h.write(t,4);return h;};
writeFileSync(OUT,Buffer.concat([head,ch(jp.length,'JSON'),jp,ch(bp.length,'BIN\0'),bp]));
console.log(OUT,(12+16+jp.length+bp.length)/1e6+' MB',J.animations.map(a=>a.name+':'+a.channels.length).join(' '));
