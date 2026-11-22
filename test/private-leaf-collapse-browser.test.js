'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {collapsePrivateLeaf}=require('../workplace/private-leaf-collapse');

const runBrowser=promisify(execFile);

/** @type {{path:string,sourceType:'module',code:string}} */
const LEAF={path:'private.mjs',sourceType:'module',
  code:'export const owner={secretFirst:7,secretSecond:5};'+
    'export function readPrivate(){return owner.secretFirst+owner.secretSecond;}'};
/** @type {{path:string,sourceType:'module',code:string}} */
const ENTRY={path:'entry.mjs',sourceType:'module',
  code:'import {readPrivate} from "./private.mjs";'+
    'export function publicRun(n){return work(n);}'+
    'function work(n){let total=0;for(let i=0;i<n;i++)total+=readPrivate();return total;}'};

/** @returns {string} */
function page(){
  return [
    '<!doctype html><html><body><pre id="result"></pre>',
    '<script type="module">',
    'try {',
    'const exports=await import("./entry.mjs");',
    'const counts=[0,1,17,1000,10000];',
    'const report={values:counts.map(n=>exports.publicRun(n)),',
    'source:String(exports.publicRun),keys:Object.keys(exports)};',
    'document.getElementById("result").textContent=btoa(JSON.stringify(report));',
    '}catch(error){document.getElementById("result").textContent="ERROR:"+String(error.stack||error);}',
    '</script></body></html>'
  ].join('\n');
}

/**
 * Two-file native ESM graph versus a one-file emitted entry in real Chromium.
 * This deliberately checks the reviewed entry-only surface. Private module
 * URL, stack provenance, and arbitrary host source observers are outside
 * this restricted browser deployment's advertised compatibility contract.
 * @returns {Promise<void>}
 */
async function main(){
  const collapsed=collapsePrivateLeaf(LEAF,ENTRY,{entryOnlyReviewed:true});
  const result=obfuscateFiles([collapsed],{
    mode:'coo',closedWorld:true,seed:'entry-private-leaf-chrome-20261122',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(result.files.length,1);
  assert.ok(result.files[0].metrics.properties>=2,'Private owner rewrite must be real');
  const emitted=String(result.files[0].code);
  /** @type {string[]} */
  const requested=[];
  const server=http.createServer((request,response)=>{
    const route=request.url??'/';
    requested.push(route);
    const map=new Map([
      ['/native/index.html',page()],
      ['/native/entry.mjs',ENTRY.code],
      ['/native/private.mjs',LEAF.code],
      ['/emitted/index.html',page()],
      ['/emitted/entry.mjs',emitted]
    ]);
    const body=map.get(route);
    if(body===undefined){response.writeHead(404).end();return;}
    const isJs=route.endsWith('.mjs');
    response.writeHead(200,{'Content-Type':isJs?
      'text/javascript; charset=utf-8':'text/html; charset=utf-8',
      'Cache-Control':'no-store'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const addr=server.address();
    assert.ok(addr&&typeof addr!=='string');
    const origin='http://127.0.0.1:'+addr.port;
    /** @param {'native'|'emitted'} variant */
    async function run(variant){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=3000','--dump-dom',
        origin+'/'+variant+'/index.html'
      ],{encoding:'utf8',timeout:45000,maxBuffer:6*1024*1024});
      const encoded=/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u.exec(stdout)?.[1];
      assert.ok(encoded,'No browser result for '+variant+': '+stdout.slice(-1200));
      return /** @type {{values:number[],source:string,keys:string[]}} */(
        JSON.parse(Buffer.from(encoded,'base64').toString('utf8')));
    }
    const native=await run('native');
    const transformed=await run('emitted');
    assert.deepEqual(native.values,transformed.values);
    assert.deepEqual(native.values,[0,12,204,12000,120000]);
    assert.deepEqual(native.keys,['publicRun']);
    assert.deepEqual(transformed.keys,['publicRun']);
    assert.equal(native.source,transformed.source);
    assert.ok(requested.includes('/native/private.mjs'));
    assert.ok(!requested.includes('/emitted/private.mjs'));
    process.stdout.write('CHROMIUM_ENTRY_PRIVATE_LEAF '+JSON.stringify({
      nativeFiles:2,emittedFiles:1,renamedProperties:result.files[0].metrics.properties,
      publicSourceIdentical:true,valuesIdentical:true,privateUrlAbsentFromOutput:true
    })+'\n');
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}

test('real Chromium entry-only ESM bundle preserves exported function and values',{
  skip:process.platform==='win32'?'Chromium runner is configured on Ubuntu':false
},main);
