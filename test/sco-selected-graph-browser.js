'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {
  partitionScoSelectedGraph,createScoSelectedGraphHandler
}=require('../src');

/**
 * Two independently selected ESM facades load together in a real Chromium
 * document. Both call a trusted Node.js private original over a cookie-gated
 * RPC endpoint, while ordinary local functions execute in the browser.
 *
 * @returns {Promise<void>}
 */
async function main(){
  const sourceA='const PRIVATE_BROWSER_ALPHA_CANARY=73;'+
    'export async function secret(value){return PRIVATE_BROWSER_ALPHA_CANARY+value.length;}'+
    'export function local(value){return value.toUpperCase();}'+
    'export async function combined(value){return local(value)+":"+await secret(value);}';
  const sourceB='const PRIVATE_BROWSER_BETA_CANARY=91;'+
    'export async function secret(value){return PRIVATE_BROWSER_BETA_CANARY+value.length;}'+
    'export function local(value){return value.toLowerCase();}'+
    'export async function combined(value){return local(value)+":"+await secret(value);}';
  const inputs=[
    {path:'alpha.mjs',code:sourceA},
    {path:'beta.mjs',code:sourceB}
  ];
  const graph=partitionScoSelectedGraph(inputs.map(file=>({
    file:{...file,sourceType:/** @type {'module'} */ ('module')},
    options:{seed:'sco-browser-multi-20261117',privateNames:['secret']}
  })));
  /** @type {Record<string,Record<string,unknown>>} */
  const originals=Object.create(null);
  for(const input of inputs){
    originals[input.path]=await import('data:text/javascript,'+encodeURIComponent(input.code));
  }
  let rpcCalls=0;
  const ids=new Set(inputs.map(input=>graph.partitions[input.path].methodNames.secret));
  const privateHandler=createScoSelectedGraphHandler(graph,originals,{
    authorizeRead:req=>req.headers.cookie==='session=allow',
    authorizeRpc:req=>req.headers.cookie==='session=allow',
    authorizeOperation:(req,method,args)=>{
      if(req.headers.cookie!=='session=allow'||!ids.has(method)||
         args.length!==1||typeof args[0]!=='string')return false;
      rpcCalls++;
      return true;
    }
  });
  const textA='AlphaΩ';
  const textB='Beta🚀';
  const first=/** @type {(v:string)=>Promise<string>} */ (originals['alpha.mjs'].combined);
  const second=/** @type {(v:string)=>Promise<string>} */ (originals['beta.mjs'].combined);
  const expected=(await first(textA))+'|'+(await second(textB));
  const page='<!doctype html><html><body><pre id="out">pending</pre>'+
    '<script type="module">'+
    'import * as a from "/obfs/alpha.mjs";'+
    'import * as b from "/obfs/beta.mjs";'+
    'try{const x=await a.combined("AlphaΩ");'+
    'const y=await b.combined("Beta🚀");'+
    'document.getElementById("out").textContent=x+"|"+y;}'+
    'catch(error){document.getElementById("out").textContent="failed:"+String(error);}'+
    '</script></body></html>';
  const server=http.createServer((req,res)=>{
    if(req.url==='/'){
      res.writeHead(200,{
        'content-type':'text/html; charset=utf-8',
        'set-cookie':'session=allow; Path=/; HttpOnly; SameSite=Strict',
        'cache-control':'no-store'
      });
      res.end(page);
      return;
    }
    privateHandler(req,res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing Chromium server port');
    const origin='http://127.0.0.1:'+address.port;
    assert.equal((await fetch(origin+'/obfs/alpha.mjs')).status,403);
    assert.equal((await fetch(origin+'/obfs/beta.mjs')).status,403);
    assert.equal((await fetch(origin+'/obfs/private.mjs')).status,404);
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=6000','--dump-dom',origin+'/'
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const observed=stdout.match(/<pre id="out">([^<]+)<\/pre>/u)?.[1];
    assert.equal(observed,expected,
      'Chromium two-facade SCO mismatch: '+stdout.slice(-1300));
    assert.equal(rpcCalls,2);
    console.log('Chromium selected SCO graph: 2 modules, 2 authenticated private RPCs, native parity');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}
if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
