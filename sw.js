// sw.js — offline play. Everything the game needs is cached on install; afterwards it's served from the
// cache, and a new version (bump VERSION when shipping) installs in the background and takes over on the
// next launch. Saved bests live in localStorage, so updates never clear them.
const VERSION='riso-runner-3';
const FILES=['./','index.html','manifest.webmanifest','riso.js','lib/three.module.min.js','lib/three.core.min.js',
  'src/main.js','src/world.js','src/print.js','src/air.js','src/audio.js','src/postcard.js',
  'fonts/big-shoulders-stencil-display-latin.woff2','fonts/cutive-mono-latin.woff2',
  'music/music.json','music/forest.m4a','music/autumn.m4a','music/jungle.m4a','music/desert.m4a','music/snow.m4a','music/night.m4a',
  'icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png','icons/favicon-32.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit=>hit||fetch(e.request).then(res=>{
    if(res.ok&&new URL(e.request.url).origin===location.origin){const copy=res.clone();caches.open(VERSION).then(c=>c.put(e.request,copy));}return res;})));});
