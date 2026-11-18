'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * A top-level browser window exposes top/parent/frames as aliases of its
 * WindowProxy. Unlike a Node shim, Chromium verifies the actual host
 * semantics while exercising the compiler-generated eager ESM decoder.
 * @param {string} mutation
 * @returns {SourceFile[]}
 */
function graph(mutation){
  return [
    {path:'entry.mjs',sourceType:'module',code:[
      "import './mutator.mjs';",
      "import {payload} from './target.mjs';",
      "document.getElementById('out').textContent=payload;"
    ].join('\n')},
    {path:'mutator.mjs',sourceType:'module',code:mutation},
    {path:'target.mjs',sourceType:'module',
      code:"export const payload='browser-window-alias-canary';"}
  ];
}

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function runBrowser(files){
  const server=http.createServer((request,response)=>{
    const filename=(request.url??'/').slice(1);
    if(filename===''){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; script-src 'self'",
        'cache-control':'no-store'});
      response.end('<!doctype html><meta charset="utf-8"><pre id="out">pending</pre>'+
        '<script type="module" src="/entry.mjs"></script>');
      return;
    }
    const file=files.find(item=>item.path===filename);
    if(!file){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
      'cache-control':'no-store'});
    response.end(file.code);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=5000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/'
    ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
    const value=stdout.match(/<pre id="out">([^<]*)<\/pre>/u)?.[1];
    assert.notEqual(value,undefined,'No browser module output: '+stdout.slice(0,800));
    return /** @type {string} */ (value);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

/** @returns {Promise<void>} */
async function main(){
  /** @type {{name:string,mutation:string,encoded:boolean}[]} */
  const fixtures=[
    {name:'top WindowProxy',mutation:'top.String.fromCharCode=()=>"?";',encoded:false},
    {name:'parent WindowProxy',mutation:'parent.String.fromCharCode=()=>"?";',encoded:false},
    {name:'frames WindowProxy',mutation:'frames.String.fromCharCode=()=>"?";',encoded:false},
    {name:'window.top WindowProxy',mutation:'window.top.String.fromCharCode=()=>"?";',encoded:false},
    {name:'unrelated Number property',mutation:'top.Number.windowAliasCanary=1;',encoded:true}
  ];
  const outcomes=[];
  for(const fixture of fixtures){
    const native=graph(fixture.mutation);
    const compiled=obfuscateFiles(native,{
      mode:'coo',strings:true,properties:false,identifiers:false,
      seed:'browser-window-alias-live/'+fixture.name
    });
    assert.equal(compiled.files.find(file=>file.path==='target.mjs')?.metrics.literals,
      fixture.encoded?1:0,fixture.name+' transform yield');
    const originalOutput=await runBrowser(native);
    const emittedOutput=await runBrowser(compiled.files);
    assert.equal(originalOutput,'browser-window-alias-canary',fixture.name);
    assert.equal(emittedOutput,originalOutput,fixture.name+' native/emitted parity');
    outcomes.push({fixture:fixture.name,encoded:fixture.encoded,output:emittedOutput});
  }
  process.stdout.write(JSON.stringify({browser:'actual Chromium',outcomes})+'\n');
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
