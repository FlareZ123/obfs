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
    code:'const a={visibleA:17};const v=a.visibleA;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const b={privateB:23};const v=b.privateB;export function unrelated(){return v;}'},
  {path:'entry.mjs',sourceType:'module',
    code:'import {watched} from "./watched.mjs";'+
      'import {unrelated} from "./independent.mjs";'+
      'const source=await hostReadModule("./independent.mjs");'+
      'export const answer={source:watched.toString(),value:unrelated(),'+
        'observedFile:source};'}
];

/** @returns {string} */
function page() {
  return '<!doctype html><html><body>'+
    '<script>window.hostReadModule=async file=>{'+
      'const response=await fetch(file,{cache:"no-store"});'+
      'if(!response.ok)throw new Error("source read "+response.status);'+
      'return response.text();};</script>'+
    '<script type="module">try{'+
      'const {answer}=await import("./entry.mjs");'+
      'const p=document.createElement("pre");p.id="result";'+
      'p.textContent=btoa(JSON.stringify(answer));document.body.appendChild(p);'+
      '}catch(e){const p=document.createElement("pre");p.id="failure";'+
      'p.textContent=String(e.stack||e);document.body.appendChild(p);'+
      '}</script></body></html>';
}

/**
 * The declared ESM graph never names fetch, XMLHttpRequest, document, window
 * or Node filesystem readers. The HTML embedding host injects a free callable
 * capability and therefore static ESM import closure is insufficient.
 *
 * @returns {Promise<{browser:'Chromium',modesRefused:number,
 *  numericResult:number,sourceDifferent:boolean}>}
 */
async function main() {
  let modesRefused=0;
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    assert.throws(()=>obfuscateFiles(original,{
      mode,closedWorld:true,seed:'ambient-browser-guard-'+mode,
      strings:false,identifiers:false,properties:true,
      experimentalSourceObserverIslands:['independent.mjs']
    }),/Source observer island/i,mode+' must refuse unproved host source reader');
    modesRefused++;
  }

  const forced=obfuscateFiles([original[1]],{
    mode:'coo',seed:'ambient-browser-unsafe-control',
    closedWorld:false,strings:false,identifiers:false,properties:true
  });
  assert.ok(forced.files[0].metrics.properties>=1,
    'negative control requires a real property-name change');
  const counterfactual=original.map(f=>f.path==='independent.mjs'?
    {...f,code:String(forced.files[0].code)}:f);

  /** @type {Map<string,string>} */
  const resources=new Map();
  for(const [group,files] of /** @type {Array<[string,SourceFile[]]>} */ ([
    ['native',original],['forced',counterfactual]
  ])){
    for(const file of files)resources.set('/'+group+'/'+file.path,String(file.code));
    resources.set('/'+group+'/index.html',page());
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
  try {
    const bound=server.address();
    if(!bound||typeof bound==='string')throw new Error('no browser witness port');
    const origin='http://127.0.0.1:'+bound.port;
    /** @param {string} folder @returns {Promise<{source:string,value:number,observedFile:string}>} */
    async function run(folder) {
      const {stdout}=await chromium(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+folder+'/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,folder+' Chromium error: '+stdout.slice(0,2000));
      return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
    }
    const native=await run('native');
    const changed=await run('forced');
    assert.equal(native.value,23);
    assert.equal(changed.value,23);
    assert.equal(changed.source,native.source);
    assert.equal(native.observedFile,original[1].code);
    assert.notEqual(changed.observedFile,native.observedFile);
    assert.equal(changed.observedFile,forced.files[0].code);
    const report={
      browser:/** @type {const} */ ('Chromium'),modesRefused,
      numericResult:native.value,sourceDifferent:true
    };
    console.log('AMBIENT_BROWSER_SOURCE_READER '+JSON.stringify(report));
    return report;
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}
if(require.main===module)main().catch(err=>{console.error(err);process.exitCode=1;});
module.exports={main};
