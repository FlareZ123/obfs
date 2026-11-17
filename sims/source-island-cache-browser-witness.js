'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const chromium=promisify(execFile);

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile[]} */
const original=[
  {path:'watched.mjs',sourceType:'module',
    code:'const recordA={privateA:17};const valueA=recordA.privateA;export function watched(){return valueA;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const recordB={privateB:23,otherB:19};const valueB=recordB.privateB;export function unrelated(){return valueB;}'},
  {path:'entry.mjs',sourceType:'module',
    code:'import {watched} from "./watched.mjs";'+
      'import {unrelated} from "./independent.mjs";'+
      'const cache=await caches.open("source-island-source-visibility");'+
      'await cache.add("./independent.mjs");'+
      'const stored=await cache.match("./independent.mjs");'+
      'const bytes=await stored.text();'+
      'export const answer={watched:watched.toString(),value:unrelated(),'+
        'containsOriginal:bytes.includes("privateB")};'}
];

/** @returns {string} */
function page(){
  return '<!doctype html><html><body><script type="module">'+
    'try{const m=await import("./entry.mjs");const p=document.createElement("pre");'+
    'p.id="result";p.textContent=btoa(JSON.stringify(m.answer));document.body.appendChild(p);'+
    '}catch(error){const p=document.createElement("pre");p.id="failure";'+
    'p.textContent=String(error.stack||error);document.body.appendChild(p);}' +
    '</script></body></html>';
}

/**
 * Test an actual browser source-byte observer that does not contain
 * fetch/XMLHttpRequest/FileReader syntax in the compiler-supplied files:
 * global CacheStorage Cache.add() fetches and stores the relative ESM URL,
 * Cache.match() returns the response, and Response.text() discloses bytes.
 *
 * @returns {Promise<{cacheSourceObserver:boolean,forcedRewriteChangesBehavior:boolean,
 *  guardedCompilerDeclines:boolean,guardedProperties:number,reason:string}>}
 */
async function main(){
  const opts={mode:/** @type {const} */('coo'),closedWorld:true,
    seed:'browser-cache-island-boundary',strings:false,identifiers:false};
  const independent=original.find(file=>file.path==='independent.mjs');
  assert.ok(independent);
  const isolated=obfuscateFiles([independent],{...opts,closedWorld:false});
  assert.equal(isolated.files[0].metrics.properties,2);
  const forced=original.map(file=>file.path==='independent.mjs' ?
    {...file,code:isolated.files[0].code} : file);

  /** @type {{files:SourceFile[],reason:string,renamed:number}|null} */
  let guarded=null;
  let reason='';
  try {
    const transformed=obfuscateFiles(original,{
      ...opts,experimentalSourceObserverIslands:['independent.mjs']
    });
    guarded={
      files:transformed.files,
      reason:'admitted',
      renamed:transformed.files.find(f=>f.path==='independent.mjs')?.metrics.properties ?? 0
    };
  }catch(error){
    reason=error instanceof Error ? error.message : String(error);
  }

  /** @type {Map<string,string>} */
  const resources=new Map();
  /** @type {Array<[string,SourceFile[]]>} */
  const groups=[
    ['original',original],
    ['counterfactual',forced]
  ];
  if(guarded)groups.push(['guarded',guarded.files]);
  for(const [folder,files] of groups){
    for(const file of files)resources.set('/'+folder+'/'+file.path,String(file.code));
    resources.set('/'+folder+'/index.html',page());
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address || typeof address==='string')throw new Error('No web server address');
    const origin='http://127.0.0.1:'+address.port;
    /** @returns {Promise<{watched:string,value:number,containsOriginal:boolean}>}
     *  @param {string} folder */
    async function run(folder){
      const {stdout}=await chromium(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=15000','--dump-dom',
        origin+'/'+folder+'/index.html'
      ],{encoding:'utf8',timeout:45000,maxBuffer:5*1024*1024});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,folder+' browser failed: '+stdout.slice(0,1500));
      return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
    }
    const native=await run('original');
    const changed=await run('counterfactual');
    assert.deepEqual(native,{
      watched:'function watched(){return valueA;}',value:23,containsOriginal:true
    });
    assert.deepEqual(changed,{
      watched:'function watched(){return valueA;}',value:23,containsOriginal:false
    });
    const guardedOutput=guarded?await run('guarded'):null;
    const outcome={
      cacheSourceObserver:true,
      forcedRewriteChangesBehavior:JSON.stringify(native)!==JSON.stringify(changed),
      guardedCompilerDeclines:guarded===null,
      guardedProperties:guarded?.renamed??0,
      reason,
      guardedOutput
    };
    console.log('SOURCE_ISLAND_CACHE_BROWSER '+JSON.stringify(outcome));
    assert.equal(guarded,null,
      'The opt-in source-island proof must refuse indirect CacheStorage source-byte readers');
    return outcome;
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
