'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');
const {normalizePublicIsland}=require('../sims/source-island-public-normalizer');

const runBrowser=promisify(execFile);

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile[]} */
const original=[
  {path:'watched.mjs',sourceType:'module',
    code:'const recordA={privateA:17};const valueA=recordA.privateA;export function watched(){return valueA;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const recordB={privateB:23,otherB:19};const valueB=recordB.privateB;export function unrelated(){return valueB;}'},
  {path:'entry.mjs',sourceType:'module',
    code:'import {watched} from "./watched.mjs";import {unrelated} from "./independent.mjs";'+
      'export const answer={source:watched.toString(),value:unrelated()};'}
];

/** @returns {string} */
function page(){
  return '<!doctype html><html><body><script type="module">'+
    'try{const mod=await import("./entry.mjs");'+
    'const pre=document.createElement("pre");pre.id="result";'+
    'pre.textContent=btoa(JSON.stringify(mod.answer));document.body.appendChild(pre);'+
    '}catch(error){const pre=document.createElement("pre");pre.id="failure";'+
    'pre.textContent=String(error.stack||error);document.body.appendChild(pre);}' +
    '</script></body></html>';
}

/**
 * Test the actual browser ESM linker and source-text observation against
 * independent local-owner property renaming and public-source normalization.
 * The HTML harness consumes only the entry's primitive answer object; it is
 * deliberately not an authorization or hostile-runtime integrity test.
 *
 * @returns {Promise<{browser:'Chromium',fields:number,matchedGraphs:number,normalizedFields:number}>}
 */
async function main(){
  const emitted=obfuscateFiles(original,{
    mode:'coo',seed:'island-real-browser',closedWorld:true,
    strings:false,identifiers:false,
    experimentalSourceObserverIslands:['independent.mjs']
  });
  const leaf=emitted.files.find(file=>file.path==='independent.mjs');
  assert.ok(leaf && typeof leaf.code==='string' && leaf.metrics.properties===2);
  const normalized=normalizePublicIsland(/** @type {string} */ (leaf.code));
  assert.equal(normalized.properties,2);
  /** @type {Map<string,string>} */
  const resources=new Map();
  /** @type {Array<[string,SourceFile[]]>} */
  const graphs=[
    ['original',original],
    ['emitted',emitted.files],
    ['normalized',emitted.files.map(file=>file.path==='independent.mjs' ?
      {...file,code:normalized.code} : file)]
  ];
  for(const [folder,files] of graphs) {
    for(const file of files)resources.set('/'+folder+'/'+file.path,String(file.code));
    resources.set('/'+folder+'/index.html',page());
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':pathname.endsWith('.html') ?
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
    if(!address||typeof address==='string')throw new Error('Missing HTTP test port');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {unknown} */
    let baseline;
    let matchedGraphs=0;
    for(const folder of ['original','emitted','normalized']){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+folder+'/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,folder+' Chromium failed: '+stdout.slice(0,1500));
      const result=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
      if(folder==='original')baseline=result;
      else assert.deepEqual(result,baseline,folder+' browser semantic mismatch');
      matchedGraphs++;
    }
    assert.deepEqual(baseline,{source:'function watched(){return valueA;}',value:23});
    const outcome={
      browser:/** @type {const} */('Chromium'),
      fields:leaf.metrics.properties,
      matchedGraphs,normalizedFields:normalized.properties
    };
    console.log('SOURCE_ISLAND_BROWSER '+JSON.stringify(outcome));
    return outcome;
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
