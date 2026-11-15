'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/**
 * Verify that the COO output executes as native browser ES modules, with
 * accesses to a page-owned external API preserved verbatim.
 * @returns {Promise<void>}
 */
async function main() {
  const input=[
    {path:'private.mjs',sourceType:/** @type {const} */ ('module'),
      code:'const local={pulse:5,mask:3};'+
        'export function update(n){local.pulse+=n;return local.pulse^local.mask;}'},
    {path:'entry.mjs',sourceType:/** @type {const} */ ('module'),
      code:'import {update} from "./private.mjs";'+
        'window.externalBridge.accept(update(2),update(4));'}
  ];
  const original=obfuscateFiles(input,{mode:'coo',seed:'symbol-browser-negative',
    strings:false,identifiers:false,properties:false});
  const emitted=obfuscateFiles(input,{mode:'coo',seed:'symbol-browser-positive',
    strings:false,identifiers:false,experimentalSymbolKeys:true});
  assert.equal(emitted.files[0].metrics.symbolKeys,2);
  assert.equal(emitted.files[1].metrics.symbolKeys,0);
  assert.match(/** @type {string} */ (emitted.files[0].code),/=Symbol\(\)/u);
  assert.match(/** @type {string} */ (emitted.files[1].code),/window\.externalBridge\.accept/u);

  /** @type {Map<string,{body:string,type:string}>} */
  const routes=new Map();
  for(const [prefix,files] of [['native',original.files],['symbol',emitted.files]]) {
    for(const file of files)routes.set('/'+prefix+'/'+file.path,{
      body:/** @type {string} */ (file.code),
      type:'text/javascript; charset=utf-8'
    });
    const html='<!doctype html><html><body><div id="answer">initial</div>'+
      '<script>window.externalBridge={accept:function(a,b){'+
      'document.getElementById("answer").textContent=String(a)+","+String(b);}};</script>'+
      '<script type="module" src="/'+prefix+'/entry.mjs"></script></body></html>';
    routes.set('/'+prefix+'.html',{body:html,type:'text/html; charset=utf-8'});
  }
  const server=http.createServer((req,res)=>{
    const route=routes.get(req.url??'');
    if(!route){res.writeHead(404);res.end('missing');return;}
    res.writeHead(200,{'Content-Type':route.type,'Cache-Control':'no-store'});
    res.end(route.body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const browser=process.env.CHROMIUM_BIN??'chromium';
    /** @param {string} prefix @returns {Promise<string|undefined>} */
    async function run(prefix) {
      const url='http://127.0.0.1:'+address.port+'/'+prefix+'.html';
      const {stdout}=await promisify(execFile)(browser,[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=3500','--dump-dom',url
      ],{encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024});
      return /<div id="answer">([^<]*)<\/div>/u.exec(stdout)?.[1];
    }
    const native=await run('native');
    const transformed=await run('symbol');
    assert.equal(native,'4,8');
    assert.equal(transformed,native);
    process.stdout.write('Chromium private Symbol-key ESM and page-owned host API: '+transformed+'\n');
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
