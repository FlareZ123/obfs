'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {import('../src/core').OutputFile} OutputFile */

/**
 * @param {string} url
 * @returns {Promise<{first:number,last:number,length:number}>}
 */
async function browserOutput(url) {
  const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
  ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
  const match=stdout.match(/<pre id="out">(\{[^<]*\})<\/pre>/u);
  assert.ok(match,'The Chromium module did not produce a JSON result: '+stdout.slice(0,700));
  /** @type {{first:number,last:number,length:number}} */
  const result=JSON.parse(match[1]);
  return result;
}

/**
 * @param {string} mutation
 * @returns {SourceFile[]}
 */
function graph(mutation) {
  return [
    {path:'entry.mjs',sourceType:'module',code:[
      "import './mutator.mjs';",
      "import {payload} from './target.mjs';",
      "const report={first:payload.charCodeAt(0),last:payload.charCodeAt(payload.length-1),length:payload.length};",
      "document.getElementById('out').textContent=JSON.stringify(report);"
    ].join('\n')},
    {path:'mutator.mjs',sourceType:'module',code:mutation},
    {path:'target.mjs',sourceType:'module',code:
      'export const payload='+JSON.stringify('A'.repeat(2048)+'Z')+';'}
  ];
}

/**
 * @param {{name:string,mutation:string,expectEncoded:boolean}} fixture
 * @returns {Promise<{fixture:string,encodedLiterals:number,native:{first:number,last:number,length:number}}>}
 */
async function checkFixture(fixture) {
  const original=graph(fixture.mutation);
  const obfuscated=obfuscateFiles(original,{
    mode:'coo',strings:true,properties:false,identifiers:false,
    seed:'browser-array-index-intrinsic/'+fixture.name
  }).files;
  const target=obfuscated.find(file=>file.path==='target.mjs');
  assert.ok(target);
  assert.equal(target.metrics.literals,fixture.expectEncoded?1:0,
    'Unexpected string-encoding coverage: '+fixture.name);
  const originals=/** @type {OutputFile[]} */(original.map(file=>({
    ...file,metrics:{literals:0,objects:0,properties:0,bindings:0}
  })));
  const server=http.createServer((request,response)=>{
    const url=request.url??'';
    const group=url.startsWith('/native/')?originals:
      url.startsWith('/protected/')?obfuscated:null;
    const suffix=url.slice(url.lastIndexOf('/')+1);
    if(!group){response.writeHead(404);response.end();return;}
    if(suffix==='page'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; script-src 'self'",
        'cache-control':'no-store'});
      response.end('<!doctype html><meta charset="utf-8"><pre id="out">pending</pre>'+
        '<script type="module" src="entry.mjs"></script>');
      return;
    }
    const file=group.find(item=>item.path===suffix);
    if(!file){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(file.code);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected TCP listener');
    const base='http://127.0.0.1:'+address.port;
    const native=await browserOutput(base+'/native/page');
    const emitted=await browserOutput(base+'/protected/page');
    assert.deepEqual(native,{first:65,last:90,length:2049});
    assert.deepEqual(emitted,native,fixture.name+' browser host and decoder parity');
    return {fixture:fixture.name,encodedLiterals:target.metrics.literals,native};
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

/** @returns {Promise<void>} */
async function main() {
  const fixtures=[
    {name:'hostile-array-index',
      mutation:"Object.defineProperty(Array.prototype,'0',{configurable:true,get(){return 0;},set(v){}});",
      expectEncoded:false},
    {name:'hostile-object-index',
      mutation:"Object.defineProperty(Object.prototype,'0',{configurable:true,get(){return 0;},set(v){}});",
      expectEncoded:false},
    {name:'harmless-object-field',
      mutation:"Object.defineProperty(Object.prototype,'unrelatedAppField',{value:7,configurable:true});",
      expectEncoded:true}
  ];
  const observations=[];
  for(const fixture of fixtures)observations.push(await checkFixture(fixture));
  process.stdout.write(JSON.stringify({browser:'real Chromium',observations})+'\n');
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
