'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

// This attacker consumes only the three distributed guarded modules. The
// public files are never edited and neither compiler nor original sources
// are used. The browser's embedding page controls its own import map.
const publicDirectory=path.join(__dirname,'../examples/closed-graph-host/after');
const distributed=['entry.mjs','logic.mjs','state.mjs'];

/** @returns {Promise<void>} */
async function main() {
  /** @type {Map<string,string>} */
  const resources=new Map();
  for(const name of distributed){
    const source=fs.readFileSync(path.join(publicDirectory,name),'utf8');
    assert.match(source,/Unauthorized execution host/u);
    resources.set('/app/'+name,source);
  }
  // The redirected dependency performs a visible action before the
  // guarded app importer can evaluate its own hostname check.
  resources.set('/rogue.mjs',
    'globalThis.events.push("rogue-before-guard");'+
    'export function read(){return 0;}');
  /** @param {boolean} redirected */
  function page(redirected){
    const map=redirected ? '<script type="importmap">'+
      JSON.stringify({imports:{'/app/logic.mjs':'/rogue.mjs'}})+
      '</script>' : '';
    return '<!doctype html><html><body><pre id="out">pending</pre>'+
      '<script>globalThis.events=[];</script>'+map+
      '<script type="module">'+
      'import("/app/entry.mjs").then(()=>{'+
      'document.getElementById("out").textContent='+
      'JSON.stringify({events:globalThis.events,answer:globalThis.answer});'+
      '},error=>{document.getElementById("out").textContent='+
      'JSON.stringify({events:globalThis.events,error:error.message});});'+
      '</script></body></html>';
  }
  resources.set('/control.html',page(false));
  resources.set('/mapped.html',page(true));
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(pathname);
    if(body===undefined){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':pathname.endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'});
    res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('Missing attack server port');
    /** @param {'control'|'mapped'} label @returns {Promise<{events:string[],error?:string,answer?:number}>} */
    async function load(label) {
      const url='http://127.0.0.1:'+addr.port+'/'+label+'.html';
      const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
      ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
      const json=stdout.match(/<pre id="out">([^<]+)<\/pre>/u)?.[1];
      assert.ok(json&&json!=='pending','Chromium failed to load '+label+': '+stdout.slice(-850));
      return JSON.parse(json);
    }
    const control=await load('control');
    const mapped=await load('mapped');
    assert.deepEqual(control,{events:[],error:'Unauthorized execution host'});
    assert.deepEqual(mapped,{
      events:['rogue-before-guard'],error:'Unauthorized execution host'
    });
    console.log(JSON.stringify({attack:'browser-import-map-pre-guard-effect',
      publishedFilesUnmodified:distributed.length,control,mapped}));
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
