'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createScoHandler}=require('../src');

const runBrowser=promisify(execFile);

/** @typedef {{value:number,source:string,privateValue:number}} Observation */

/** @type {import('../src/core').SourceFile[]} */
const originals=[
  {path:'owner.mjs',sourceType:'module',
    code:'export const owner={secretField:7};'},
  {path:'state.mjs',sourceType:'module',
    code:"import {owner} from './owner.mjs';class Reader{read(){return owner.secretField;}}export const instance=new Reader();"},
  {path:'private.mjs',sourceType:'module',
    code:'const hidden={privateField:13};export const privateValue=hidden.privateField;'}
];

const inspector=[
  '<!doctype html><meta charset="utf-8"><script type="module">',
  'try {',
  '  const {instance}=await import("./state.mjs");',
  '  const {privateValue}=await import("./private.mjs");',
  '  const source=Function.prototype.toString.call(Object.getPrototypeOf(instance).read);',
  '  const value={value:instance.read(),source,privateValue};',
  '  const view=document.createElement("pre");view.id="result";',
  '  view.textContent=btoa(JSON.stringify(value));document.body.appendChild(view);',
  '}catch(error){',
  '  const view=document.createElement("pre");view.id="failure";',
  '  view.textContent=String(error.stack||error);document.body.appendChild(view);',
  '}',
  '</script>'
].join('\n');

/**
 * An external real-browser importer can inspect the prototype method
 * source of a class instance delivered by the SCO HTTP server. The HTML
 * observer is outside the compiler's published JavaScript source inventory.
 *
 * @returns {Promise<{sourceEqual:boolean,privateSourceChanged:boolean,privateValue:number}>}
 */
async function main(){
  const sco=createScoHandler(originals,{
    routePrefix:'/sco/',
    publicPaths:originals.map(file=>file.path),
    closedWorld:true
  });
  const originalSources=new Map(originals.map(file=>['/original/'+file.path,file.code]));
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://localhost').pathname;
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    if(pathname==='/original/index.html'||pathname==='/sco/index.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(inspector);
      return;
    }
    const source=originalSources.get(pathname);
    if(source!==undefined){
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(source);return;
    }
    if(pathname.startsWith('/sco/')) {
      sco(request,response);
      return;
    }
    response.writeHead(404).end();
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing local HTTP port');
    const origin='http://127.0.0.1:'+address.port;
    /**
     * @param {'original'|'sco'} kind
     * @returns {Promise<Observation>}
     */
    async function inspect(kind){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=12000','--dump-dom',
        origin+'/'+kind+'/index.html'
      ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,kind+' browser failure: '+stdout.slice(0,1400));
      return /** @type {Observation} */ (JSON.parse(Buffer.from(encoded,'base64').toString('utf8')));
    }
    const native=await inspect('original');
    const actual=await inspect('sco');
    const emittedPrivateResponse=await fetch(origin+'/sco/private.mjs');
    assert.equal(emittedPrivateResponse.status,200);
    const emittedPrivate=await emittedPrivateResponse.text();
    const nativePrivate=originals.find(file=>file.path==='private.mjs');
    assert.ok(nativePrivate);
    const privateSourceChanged=emittedPrivate!==nativePrivate.code;
    assert.equal(privateSourceChanged,true,
      'SCO must retain independent private module source transformation');
    assert.doesNotMatch(emittedPrivate,/privateField/u,
      'Private source must have actually renamed the internal property');
    assert.deepEqual({value:actual.value,privateValue:actual.privateValue},
      {value:native.value,privateValue:native.privateValue});
    assert.equal(actual.source,native.source,JSON.stringify({
      native,actual,emittedPrivate:emittedPrivate.slice(0,300)
    },null,2));
    const result={sourceEqual:true,privateSourceChanged,privateValue:actual.privateValue};
    process.stdout.write('SCO_EXPORTED_INSTANCE_SOURCE_BROWSER '+JSON.stringify(result)+'\n');
    return result;
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;
});
module.exports={main};
