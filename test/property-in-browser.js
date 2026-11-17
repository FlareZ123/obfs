'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const execFileAsync=promisify(execFile);

/**
 * Verify that the actual browser executes a two-module ESM graph whose
 * locally owned string membership and direct reads are renamed consistently,
 * while the unknown page-owned API remains untouched.
 *
 * @returns {Promise<void>}
 */
async function main(){
  const files=[
    {path:'private.mjs',sourceType:/** @type {const} */ ('module'),
      code:'const bag={secretField:5};'+
        'export function update(n){bag.secretField+=n;'+
        'return ["secretField" in bag,bag.secretField];}'},
    {path:'entry.mjs',sourceType:/** @type {const} */ ('module'),
      code:'import {update} from "./private.mjs";'+
        'const first=update(2),second=update(4);'+
        'window.externalBridge.accept([first[0],first[1],second[0],second[1]]);'}
  ];
  const common={mode:/** @type {const} */ ('coo'),
    strings:false,identifiers:false};
  const variants=[
    {name:'native',result:obfuscateFiles(files,{
      ...common,seed:'own-in-browser-native',properties:false
    })},
    {name:'renamed',result:obfuscateFiles(files,{
      ...common,seed:'own-in-browser-renamed'
    })},
    {name:'symbol',result:obfuscateFiles(files,{
      ...common,seed:'own-in-browser-symbol',experimentalSymbolKeys:true
    })}
  ];
  assert.equal(variants[1].result.files[0].metrics.properties,1);
  assert.equal(variants[2].result.files[0].metrics.symbolKeys,1);
  for(const item of variants){
    const entry=/** @type {string} */ (item.result.files[1].code);
    assert.match(entry,/window\.externalBridge\.accept/u);
    assert.equal(item.result.files[1].metrics.properties,0);
  }
  const renamed=/** @type {string} */(variants[1].result.files[0].code);
  assert.doesNotMatch(renamed,/"secretField" in bag/u);
  assert.match(renamed,/"_p[0-9a-f]{10}" in bag/u);

  /** @type {Map<string,{body:string,type:string}>} */
  const routes=new Map();
  for(const item of variants){
    for(const file of item.result.files){
      routes.set('/'+item.name+'/'+file.path,{
        body:/** @type {string} */ (file.code),
        type:'text/javascript; charset=utf-8'
      });
    }
    routes.set('/'+item.name+'.html',{
      body:'<!doctype html><html><body><div id="answer">initial</div>'+
        '<script>window.externalBridge={accept:function(items){'+
        'document.getElementById("answer").textContent=JSON.stringify(items);}};</script>'+
        '<script type="module" src="/'+item.name+'/entry.mjs"></script>'+
        '</body></html>',
      type:'text/html; charset=utf-8'
    });
  }
  const server=http.createServer((req,res)=>{
    const route=routes.get(req.url??'');
    if(!route){res.writeHead(404);res.end('missing');return;}
    res.writeHead(200,{'Content-Type':route.type,'Cache-Control':'no-store'});
    res.end(route.body);
  });
  /** @type {Promise<void>} */
  const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await listening;
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const port=address.port;
    const browser=process.env.CHROMIUM_BIN??'chromium';
    /** @param {string} name @returns {Promise<string|undefined>} */
    async function run(name){
      const url='http://127.0.0.1:'+port+'/'+name+'.html';
      const {stdout}=await execFileAsync(browser,[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=3500','--dump-dom',url
      ],{encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024});
      return /<div id="answer">([^<]*)<\/div>/u.exec(stdout)?.[1];
    }
    const native=await run('native');
    assert.equal(native,'[true,7,true,11]');
    for(const name of ['renamed','symbol']){
      assert.equal(await run(name),native,name);
    }
    process.stdout.write('OWN_IN_CHROMIUM_ESM '+JSON.stringify({
      native,renamed:native,symbol:native,
      publishedPrivateBytes:Buffer.byteLength(renamed),
      preservedPageApi:'window.externalBridge.accept',
      boundary:'real Chromium two ESM modules, local loopback HTML'
    })+'\n');
  }finally{
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});

module.exports={main};
