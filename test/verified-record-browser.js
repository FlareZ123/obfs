'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {ROOT,NAMES,SEED}=require('../examples/application-challenge/build.cjs');
const {ablate,withOwnKeyCalls}=require('../sims/application-challenge-observer-ablation');

const exec=promisify(execFile);
const CASES=[[0,0],[0,1],[0xffffffff,3],
  ...Array.from({length:61},(_,i)=>[
    Math.imul(i+173,2654435761)>>>0,13*i+7
  ])];

/** @returns {number} */
function countCases(){return CASES.length;}

/** @param {number} value @returns {number} */
function externalValue(value){
  let x=(value^0xa5a5a5a5)>>>0;
  x=Math.imul(x^(x>>>16),0x45d9f3b)>>>0;
  return (x^(x>>>16))>>>0;
}

/**
 * Real Chromium verification of two complete ESM graphs from distinct
 * source-only and transformed own-record applications. The browser installs
 * the same caller-owned host API before evaluating either graph.
 * @returns {Promise<void>}
 */
async function main(){
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const original=await Promise.all(NAMES.map(async name=>({
    path:name,sourceType:'module',
    code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  const native=withOwnKeyCalls(ablate(original,'both'));
  const compiled=obfuscateFiles(native,{
    mode:'coo',closedWorld:true,seed:SEED,identifiers:true,
    properties:true,strings:false
  });
  assert.equal(compiled.crossFile.properties,2,
    'Chromium must execute genuinely transformed private properties');
  const sources=new Map();
  for(const file of native)sources.set('/native/'+file.path,file.code);
  for(const file of compiled.files)sources.set('/compiled/'+file.path,
    /** @type {string} */(file.code));
  const html=[
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<script type="module">',
    'try {',
    'window.externalValue='+externalValue.toString()+';',
    'const [original,emitted]=await Promise.all([',
    '  import("/native/app.mjs"),import("/compiled/app.mjs")',
    ']);',
    'const cases='+JSON.stringify(CASES)+';',
    'const raw=cases.map(([seed,count])=>original.evaluate(seed,count));',
    'const changed=cases.map(([seed,count])=>emitted.evaluate(seed,count));',
    'const pre=document.createElement("pre");',
    'pre.id="result";pre.textContent=btoa(JSON.stringify({raw,changed}));',
    'document.body.append(pre);',
    '} catch(error) {',
    'const pre=document.createElement("pre");pre.id="failure";',
    'pre.textContent=String(error.stack||error);document.body.append(pre);',
    '}',
    '</script></body></html>'
  ].join('\n');
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405);response.end();return;}
    if(request.url==='/'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(html);return;
    }
    const source=request.url?sources.get(request.url):undefined;
    if(typeof source!=='string'){
      response.writeHead(404);response.end();return;
    }
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(source);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing HTTP port');
    const origin='http://127.0.0.1:'+address.port;
    const emittedSource=await fetch(origin+'/compiled/private.mjs');
    assert.equal(emittedSource.status,200);
    const bytes=await emittedSource.text();
    assert.ok(bytes.includes('_p'),'Expected emitted private-property spellings');
    assert.ok(!bytes.includes('secretOffset:19') && !bytes.includes('secretSalt:37'),
      'Browser-delivered owner literal must use renamed keys');
    const nativeSource=await fetch(origin+'/native/private.mjs');
    assert.equal(nativeSource.status,200);
    assert.notEqual(await nativeSource.text(),bytes,
      'Both browser graphs must have genuinely different source bytes');
    const chromium=process.env.CHROMIUM_BIN??'google-chrome';
    const {stdout}=await exec(chromium,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=12000','--dump-dom',origin+'/'
    ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
    const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
    assert.ok(encoded,'Chromium did not evaluate both graph variants: '+stdout.slice(0,1800));
    const result=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
    assert.equal(result.raw.length,countCases());
    assert.deepEqual(result.changed,result.raw,
      'Real Chromium must preserve own-key-only ESM app outputs exactly');
    process.stdout.write('VERIFIED_RECORD_CHROMIUM '+JSON.stringify({
      cases:CASES.length,renamedPrivateFields:compiled.crossFile.properties,
      privateSourcePubliclyFetchable:true,allOutputsMatch:true,
      originalGraphFiles:native.length,emittedGraphFiles:compiled.files.length
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(
      error=>error?reject(error):resolve()));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
