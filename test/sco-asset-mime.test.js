'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createServer}=require('node:http');
const {createScoHandler}=require('../src');

/** @type {{path:string,sourceType:'asset',code:Buffer}[]} */
const assets=[
  {path:'page.html',sourceType:'asset',code:Buffer.from('<main>safe</main>')},
  {path:'legacy.htm',sourceType:'asset',code:Buffer.from('<p>safe</p>')},
  {path:'styles/site.css',sourceType:'asset',code:Buffer.from('body{color:blue}')},
  {path:'manifest.json',sourceType:'asset',code:Buffer.from('{"ok":true}')},
  {path:'images/vector.SVG',sourceType:'asset',code:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>')},
  {path:'images/pixel.png',sourceType:'asset',code:Buffer.from([0x89,0x50,0x4e,0x47])},
  {path:'images/photo.jpg',sourceType:'asset',code:Buffer.from([0xff,0xd8,0xff])},
  {path:'images/photo.jpeg',sourceType:'asset',code:Buffer.from([0xff,0xd8,0xff])},
  {path:'images/animation.gif',sourceType:'asset',code:Buffer.from('GIF89a')},
  {path:'images/image.webp',sourceType:'asset',code:Buffer.from('RIFFxxxxWEBP')},
  {path:'images/favicon.ico',sourceType:'asset',code:Buffer.from([0,0,1,0])},
  {path:'fonts/site.woff',sourceType:'asset',code:Buffer.from('wOFF')},
  {path:'fonts/site.woff2',sourceType:'asset',code:Buffer.from('wOF2')},
  {path:'fonts/site.ttf',sourceType:'asset',code:Buffer.from([0,1,0,0])},
  {path:'fonts/site.otf',sourceType:'asset',code:Buffer.from('OTTO')},
  {path:'answer.wasm',sourceType:'asset',code:Buffer.from([0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,3,2,1,0,7,8,1,4,112,105,110,103,0,0,10,6,1,4,0,65,42,11])},
  {path:'unknown.bin',sourceType:'asset',code:Buffer.from([0,1,2,3])}
];

const expectedTypes=new Map([
  ['page.html','text/html; charset=utf-8'],
  ['legacy.htm','text/html; charset=utf-8'],
  ['styles/site.css','text/css; charset=utf-8'],
  ['manifest.json','application/json'],
  ['images/vector.SVG','image/svg+xml'],
  ['images/pixel.png','image/png'],
  ['images/photo.jpg','image/jpeg'],
  ['images/photo.jpeg','image/jpeg'],
  ['images/animation.gif','image/gif'],
  ['images/image.webp','image/webp'],
  ['images/favicon.ico','image/vnd.microsoft.icon'],
  ['fonts/site.woff','font/woff'],
  ['fonts/site.woff2','font/woff2'],
  ['fonts/site.ttf','font/ttf'],
  ['fonts/site.otf','font/otf'],
  ['answer.wasm','application/wasm'],
  ['unknown.bin','application/octet-stream']
]);

test('SCO serves validated static assets with browser-compatible MIME and exact bytes',async()=>{
  const server=createServer(createScoHandler(assets,{publicPaths:assets.map(file=>file.path)}));
  /** @type {Promise<void>} */
  const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await listening;
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    for(const asset of assets){
      const response=await fetch(origin+'/obfs/'+asset.path);
      assert.equal(response.status,200,asset.path);
      assert.equal(response.headers.get('content-type'),expectedTypes.get(asset.path),asset.path);
      assert.equal(response.headers.get('x-content-type-options'),'nosniff',asset.path);
      assert.equal(response.headers.get('cache-control'),'no-store',asset.path);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),asset.code,asset.path);
      if(asset.path==='answer.wasm'){
        const compiled=await WebAssembly.instantiateStreaming(fetch(origin+'/obfs/'+asset.path));
        assert.equal(typeof compiled.instance.exports.ping,'function');
        assert.equal(/** @type {()=>number} */ (compiled.instance.exports.ping)(),42);
      }
    }
  }finally{
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
});
