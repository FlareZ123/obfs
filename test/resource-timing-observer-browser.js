'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{value:number,decodedBodySize:number|null}} Output */

const native=[
  {path:'state.mjs',sourceType:/** @type {const} */ ('module'),
    code:'export const state={secretField:23};\n'},
  {path:'entry.mjs',sourceType:/** @type {const} */ ('module'),
    code:'import {state} from "./state.mjs";export const value=state.secretField;\n'},
  {path:'observer.mjs',sourceType:/** @type {const} */ ('module'),
    code:'import {value} from "./entry.mjs";'+
      'const item=performance.getEntriesByType("resource").find(item=>'+
      'item.name.endsWith("/state.mjs"));'+
      'export const view={value,decodedBodySize:item?.decodedBodySize??null};\n'}
];

/** @param {ModuleFile[]} graph @returns {Map<string,string>} */
function byPath(graph){
  return new Map(graph.map(file=>[file.path,file.code]));
}

/** @returns {string} */
function html(){
  return '<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<script type="module">'+
    'try {const mod=await import("./observer.mjs");'+
    'const pre=document.createElement("pre");pre.id="result";'+
    'pre.textContent=btoa(JSON.stringify(mod.view));'+
    'document.body.appendChild(pre);'+
    '}catch(error){const pre=document.createElement("pre");'+
    'pre.id="failure";pre.textContent=String(error.stack||error);'+
    'document.body.appendChild(pre);}</script></body></html>';
}

/**
 * Real Chrome loads the same-origin state ESM from each variant's exact
 * response bytes. ResourceTiming returns decoded response body bytes.
 * @returns {Promise<{nativeBytes:number,unsafeBytes:number,refusedKeys:number,
 *   unsafeKeys:number,valuesPreserved:true,chromeSizeWitness:true}>}
 */
async function main(){
  const safe=obfuscateFiles(native,{
    mode:'coo',closedWorld:true,seed:'resource-timing-safe',
    strings:false,identifiers:false,properties:true
  });
  assert.equal(safe.crossFile.properties,0);
  assert.deepEqual(safe.files.map(file=>file.code),native.map(file=>file.code));
  const unsigned=obfuscateFiles(native.slice(0,2),{
    mode:'coo',closedWorld:true,seed:'resource-timing-unsafe',
    strings:false,identifiers:false,properties:true
  });
  assert.equal(unsigned.crossFile.properties,1,
    'Counterfactual must actually rewrite a distributed private owner');
  const unsafe=/** @type {ModuleFile[]} */ (
    [...unsigned.files.map(file=>({path:file.path,
      sourceType:/** @type {const} */ ('module'),
      code:/** @type {string} */ (file.code)})),native[2]]
  );
  const versions=new Map([
    ['native',byPath(native)],
    ['safe',byPath(/** @type {ModuleFile[]} */ (safe.files))],
    ['unsafe',byPath(unsafe)]
  ]);
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url??'/', 'http://127.0.0.1');
    const parts=url.pathname.split('/').filter(Boolean);
    const content=parts.length===2&&versions.get(parts[0])?.get(parts[1]);
    if(content===undefined&&!(parts.length===2&&parts[1]==='index.html')){
      response.writeHead(404).end();
      return;
    }
    if(content===undefined){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(html());
      return;
    }
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(content);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing test HTTP port');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {Map<string,Output>} */
    const observed=new Map();
    for(const name of ['native','safe','unsafe']){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=12000','--dump-dom',
        origin+'/'+name+'/index.html'
      ],{encoding:'utf8',timeout:45000,maxBuffer:5*1024*1024});
      const match=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u);
      assert.ok(match,name+' browser did not return a result: '+stdout.slice(0,1200));
      const result=/** @type {Output} */ (
        JSON.parse(Buffer.from(match[1],'base64').toString('utf8'))
      );
      observed.set(name,result);
    }
    const nativeBytes=Buffer.byteLength(native[0].code);
    const unsafeBytes=Buffer.byteLength(unsafe[0].code);
    assert.notEqual(nativeBytes,unsafeBytes,'Counterfactual must alter public ESM body size');
    assert.deepEqual(observed.get('native'),{value:23,decodedBodySize:nativeBytes});
    assert.deepEqual(observed.get('safe'),observed.get('native'));
    assert.deepEqual(observed.get('unsafe'),{value:23,decodedBodySize:unsafeBytes},
      'Actual same-origin ResourceTiming should expose the otherwise semantically hidden byte change');
    const result={nativeBytes,unsafeBytes,refusedKeys:safe.crossFile.properties,
      unsafeKeys:unsigned.crossFile.properties,
      valuesPreserved:/** @type {const} */ (true),
      chromeSizeWitness:/** @type {const} */ (true)};
    process.stdout.write('RESOURCE_TIMING_CHROME '+JSON.stringify(result)+'\n');
    return result;
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
