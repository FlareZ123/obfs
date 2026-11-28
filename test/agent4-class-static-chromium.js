'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const exec=promisify(execFile);

/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */
/** @typedef {{name:string,setup:string,observed:boolean}} Case */

const cases=/** @type {Case[]} */([
  {
    name:'self-construct',
    setup:'const carrier={instance:{}};const Holder=class{x=(carrier.instance=new WeakMap());static {new this();}};',
    observed:true
  },
  {
    name:'inherited-getter',
    setup:'class Base{static get fire(){new this();return 1;}}const carrier={instance:{}};const Holder=class extends Base{x=(carrier.instance=new WeakMap());static {this.fire;}};',
    observed:true
  },
  {
    name:'super-getter',
    setup:'class Base{static get fire(){new this();return 1;}}const carrier={instance:{}};const Holder=class extends Base{x=(carrier.instance=new WeakMap());static {super.fire;}};',
    observed:true
  },
  {
    name:'implicit-template',
    setup:'const carrier={instance:{}};const Holder=class Inner{x=(carrier.instance=new WeakMap());static {const hook={toString(){new Inner();return "x";}};`${hook}`;}};',
    observed:true
  },
  {
    name:'pure-static-positive',
    setup:'class Ordinary{}const carrier={instance:new Ordinary()};const Holder=class{x=(carrier.instance=new WeakMap());static version=3+4;};',
    observed:false
  }
]);

const storageSource=[
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{...descriptor,',
  '    value:function(_key,value){captured.set(this,value);}',
  '  });',
  '  localStorage.setItem("storage-prototype-override",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '}'
].join('\n');
const tail=[
  'const nativePrototype=Object.getPrototypeOf(carrier.instance);',
  'const nativeSet=nativePrototype.set;',
  'nativePrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeSet,this,[key,value]);',
  '};'
].join('\n');
const page=[
  '<!doctype html><html><head><meta charset="utf-8"></head><body>',
  '<script type="module">',
  'try {',
  '  const {sample}=await import("./entry.mjs");',
  '  const payload={result:sample(),capturedSource:document.title};',
  '  const pre=document.createElement("pre");pre.id="result";',
  '  pre.textContent=btoa(JSON.stringify(payload));',
  '  document.body.appendChild(pre);',
  '} catch(error) {',
  '  const pre=document.createElement("pre");pre.id="failure";',
  '  pre.textContent=String(error.stack||error);',
  '  document.body.appendChild(pre);',
  '}',
  '</script></body></html>'
].join('\n');

/**
 * Native-versus-COO source observation using genuine Chromium Storage,
 * document.title DOMString conversion, ESM module linker and HTTP origin.
 * @returns {Promise<void>}
 */
async function main() {
  /** @type {Map<string,string>} */
  const files=new Map();
  /** @type {Map<string,number>} */
  const bindingCount=new Map();
  for(const item of cases) {
    /** @type {SourceFile[]} */
    const originals=[
      {path:'mutate.mjs',sourceType:'module',code:item.setup+'\n'+tail},
      {path:'storage.mjs',sourceType:'module',code:storageSource},
      {path:'entry.mjs',sourceType:'module',
        code:'import "./mutate.mjs";export {sample} from "./storage.mjs";'}
    ];
    const obfuscated=obfuscateFiles(originals,{
      mode:'coo',closedWorld:true,identifiers:true,properties:false,strings:false,
      seed:'agent4-static-class-real-chromium-'+item.name
    });
    const storage=obfuscated.files.find(file=>file.path==='storage.mjs');
    assert.ok(storage,'Missing transformed Storage module');
    bindingCount.set(item.name,storage.metrics.bindings);
    /** @type {Array<readonly [string,Array<{path:string,code:unknown}>]>} */
    const variants=[
      ['original',originals],
      ['emitted',obfuscated.files]
    ];
    for(const [label,source] of variants) {
      for(const file of source) {
        assert.equal(typeof file.code,'string');
        files.set('/'+item.name+'/'+label+'/'+file.path,String(file.code));
      }
    }
  }
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const pathname=new URL(request.url??'/', 'http://localhost').pathname;
    if(pathname.endsWith('/index.html')) {
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(page);
      return;
    }
    const data=files.get(pathname);
    if(data===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(data);
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    if(!address||typeof address==='string')throw Error('No HTTP address');
    const origin='http://127.0.0.1:'+address.port;
    const report=[];
    for(const item of cases) {
      /** @type {{result:{value:number,independent:number},capturedSource:string}|undefined} */
      let native;
      for(const kind of ['original','emitted']) {
        const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
          '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
          '--no-first-run','--virtual-time-budget=15000','--dump-dom',
          origin+'/'+item.name+'/'+kind+'/index.html'
        ],{encoding:'utf8',timeout:45000,maxBuffer:5*1024*1024});
        const match=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u);
        assert.ok(match,'Chrome '+item.name+'/'+kind+' failed: '+stdout.slice(0,2000));
        const result=JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));
        if(kind==='original')native=result;
        else assert.deepEqual(result,native,
          'Real Chromium source parity '+item.name);
      }
      assert.ok(native);
      assert.deepEqual(native.result,{value:29,independent:7});
      if(item.observed)assert.ok(native.capturedSource.includes('privateLocal'));
      else {
        assert.equal(native.capturedSource,'');
        assert.ok((bindingCount.get(item.name)??0)>0,
          'Positive transformation yield must not be vacuous');
      }
      report.push({name:item.name,sourceObserved:item.observed,
        bindings:bindingCount.get(item.name)});
    }
    process.stdout.write('AGENT4_CLASS_STATIC_CHROMIUM '+JSON.stringify(report)+'\n');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve(undefined)));
  }
}
if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={main};
