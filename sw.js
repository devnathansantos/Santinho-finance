const CACHE="santinho-finance-v8";
const SHELL=["./","./index.html","./style.css","./app.js","./manifest.json","./logo.png","./logo-192.png","./logo-512.png","./apple-touch-icon.png","./assistant-robot.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("santinho-finance-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;
  const appCode=/\.(html|css|js|json|svg|png)$/.test(u.pathname)||u.pathname.endsWith("/");
  if(appCode){
    e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request).then(x=>x||caches.match("./index.html"))));
  }else e.respondWith(caches.match(e.request).then(x=>x||fetch(e.request)));
});