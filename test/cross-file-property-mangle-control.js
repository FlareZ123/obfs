'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {build}=require('esbuild');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');

/** @typedef {{path:string,sourceType:'module',code:string}} Input */
/** @typedef {{path:string,code:string}} Output */

/**
 * Same three-module closed record and imported immutable identity as the
 * compiler's real-browser proof. The reflective variant is intentionally
 * outside the mangleProps safety contract.
 * @param {boolean} reflective
 * @returns {Input[]}
 */
function graph(reflective) {
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:17,otherField:5};'},
    {path:'identity.mjs',sourceType:'module',
      code:'export const identity=x=>x;'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+
        'import {identity} from "./identity.mjs";'+
        'const forward=identity;'+
        'export function run(a){const result=forward(state);'+
        (reflective?
          'return [Object.keys(result),result.secretField+a];}':
          'return (result.secretField+a)^result.otherField;}')}
  ];
}

/**
 * Run ordinary esbuild in one whole-graph build so each property has one
 * mangle namespace. This is an equal-trust public-code control, without
 * claimed semantic safety for reflective JavaScript.
 * @param {Input[]} files
 * @returns {Promise<string>}
 */
async function bundleMangled(files) {
  const source=new Map(files.map(file=>[file.path,file.code]));
  const built=await build({
    entryPoints:['entry.mjs'],outfile:'bundle.mjs',
    bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',
    minify:true,legalComments:'none',mangleProps:/Field$/,
    plugins:[{name:'closed-graph',setup(plugin){
      plugin.onResolve({filter:/./},args=>{
        const path=args.path.startsWith('./')?args.path.slice(2):args.path;
        if(!source.has(path))return {errors:[{text:'Unknown graph module: '+path}]};
        return {path,namespace:'closed-graph'};
      });
      plugin.onLoad({filter:/./,namespace:'closed-graph'},args=>({
        contents:source.get(args.path),loader:'js'
      }));
    }}]
  });
  assert.equal(built.outputFiles.length,1);
  return built.outputFiles[0].text;
}

/** @param {Input[]} source @returns {Output[]} */
function compile(source){
  const built=obfuscateFiles(source,{
    mode:'coo',closedWorld:true,properties:true,
    identifiers:false,strings:false,seed:'independent-esbuild-mangle-control'
  });
  const reflective=source[2].code.includes('Object.keys');
  assert.equal(built.crossFile.objects,reflective?0:1);
  assert.equal(built.crossFile.properties,reflective?0:2);
  return built.files.map(file=>({path:file.path,code:String(file.code)}));
}

/**
 * Compare a genuinely renamed published ESM graph with an ordinary
 * configured property-mangling bundle in the same real browser. The
 * reflection control documents why mangleProps requires programmer
 * knowledge and cannot replace conservative proof for arbitrary input.
 * @returns {Promise<void>}
 */
async function main(){
  /** @type {Map<string,{body:string,type:string}>} */
  const assets=new Map([
    ['/index.html',{body:'<!doctype html><meta charset="utf-8"><title>Equal-trust property control</title>',
      type:'text/html; charset=utf-8'}]
  ]);
  /** @type {Record<string,{nativeBytes:number,protectedBytes:number,mangledBytes:number}>} */
  const bytes={};
  for(const [name,reflective] of /** @type {[string,boolean][]} */ (
    [['positive',false],['reflective',true]])){
    const native=graph(reflective);
    const compiled=compile(native);
    const mangled=await bundleMangled(native);
    const labels=/secretField|otherField/u;
    assert.equal(labels.test(native.map(x=>x.code).join('\n')),true);
    assert.equal(labels.test(compiled.map(x=>x.code).join('\n')),reflective);
    assert.equal(labels.test(mangled),false);
    bytes[name]={
      nativeBytes:Buffer.byteLength(native.map(x=>x.code).join('\n')),
      protectedBytes:Buffer.byteLength(compiled.map(x=>x.code).join('\n')),
      mangledBytes:Buffer.byteLength(mangled)
    };
    for(const [variant,files] of /** @type {[string,Input[]|Output[]][]} */ (
      [['native',native],['protected',compiled]])){
      for(const file of files){
        assets.set('/'+name+'/'+variant+'/'+file.path,
          {body:file.code,type:'text/javascript; charset=utf-8'});
      }
    }
    assets.set('/'+name+'/mangled/bundle.mjs',
      {body:mangled,type:'text/javascript; charset=utf-8'});
  }
  const server=http.createServer((req,res)=>{
    const asset=assets.get(req.url??'');
    if(req.method!=='GET'||!asset){res.writeHead(404).end();return;}
    res.writeHead(200,{
      'content-type':asset.type,'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      'content-security-policy':"script-src 'self'"
    });
    res.end(asset.body);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    /** @type {Promise<void>} */
    const ready=new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    await ready;
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+address.port+'/index.html',
      {waitUntil:'domcontentloaded',timeout:45000});
    const data=await page.evaluate(async()=>{
      const positiveNative='/positive/native/entry.mjs';
      const positiveProtected='/positive/protected/entry.mjs';
      const positiveMangled='/positive/mangled/bundle.mjs';
      const reflectiveNative='/reflective/native/entry.mjs';
      const reflectiveProtected='/reflective/protected/entry.mjs';
      const reflectiveMangled='/reflective/mangled/bundle.mjs';
      const n=/** @type {{run:(a:number)=>number}} */ (await import(positiveNative));
      const p=/** @type {{run:(a:number)=>number}} */ (await import(positiveProtected));
      const m=/** @type {{run:(a:number)=>number}} */ (await import(positiveMangled));
      const rn=/** @type {{run:(a:number)=>[string[],number]}} */ (await import(reflectiveNative));
      const rp=/** @type {{run:(a:number)=>[string[],number]}} */ (await import(reflectiveProtected));
      const rm=/** @type {{run:(a:number)=>[string[],number]}} */ (await import(reflectiveMangled));
      const reflected=JSON.stringify(rn.run(0));
      if(JSON.stringify(rp.run(0))!==reflected)
        throw Error('Proof-based reflective refusal changed semantics');
      if(JSON.stringify(rm.run(0))===reflected)
        throw Error('Mangle regex did not demonstrate reflective incompatibility');
      /** @type {{native:number[],protected:number[],mangled:number[]}} */
      const time={native:[],protected:[],mangled:[]};
      /** @param {(value:number)=>number} fn */
      function timed(fn){
        let checksum=0;
        const start=performance.now();
        for(let i=0;i<100000;i++)checksum^=fn(i);
        const ms=performance.now()-start;
        if(!Number.isFinite(ms)||ms<=0)throw Error('Missing work timing');
        return {ms,checksum};
      }
      for(let i=0;i<4;i++){
        timed(n.run);timed(p.run);timed(m.run);
      }
      const orders=[
        ['native','protected','mangled'],
        ['mangled','protected','native'],
        ['protected','native','mangled'],
        ['mangled','native','protected'],
        ['native','mangled','protected'],
        ['protected','mangled','native']
      ];
      for(let trial=0;trial<12;trial++){
        /** @type {number|undefined} */
        let checksum;
        for(const variant of orders[trial%orders.length]){
          const fn=variant==='native'?n.run:
            variant==='protected'?p.run:m.run;
          const result=timed(fn);
          if(checksum!==undefined&&result.checksum!==checksum)
            throw Error('Timed checksum divergence');
          checksum=result.checksum;
          time[/** @type {'native'|'protected'|'mangled'} */ (variant)].push(result.ms);
        }
      }
      let exactHeldout=0;
      for(let i=0;i<100000;i++){
        const value=n.run(i);
        if(!Object.is(value,p.run(i))||!Object.is(value,m.run(i))||
           JSON.stringify(rn.run(i))!==JSON.stringify(rp.run(i)))
          throw Error('Exact heldout mismatch at '+i);
        exactHeldout++;
      }
      return {exactHeldout,reflectiveOriginal:reflected,
        reflectiveMangled:JSON.stringify(rm.run(0)),time};
    });
    assert.equal(data.exactHeldout,100000);
    const protectedVsNative=pairedBudgetBound(data.time.native,data.time.protected);
    const mangledVsNative=pairedBudgetBound(data.time.native,data.time.mangled);
    const protectedVsMangled=pairedBudgetBound(data.time.mangled,data.time.protected);
    console.log('CROSS_FILE_PROPERTY_MANGLE_CONTROL '+JSON.stringify({
      browser:await browser.version(),exactHeldout:data.exactHeldout,
      positiveProtectedPropertiesRenamed:2,
      reflectiveProtectedPropertiesRenamed:0,
      reflectiveOriginal:data.reflectiveOriginal,
      reflectiveMangled:data.reflectiveMangled,
      bytes,protectedVsNative,mangledVsNative,protectedVsMangled,
      timingMs:data.time,
      limitation:'Configured esbuild is a whole-graph bundle and can change reflected keys. The compiler uses three ESM modules and conservatively refuses the reflective case. Timing covers selected warmed calls only, not startup or hostile-runner reconstruction.'
    }));
  }finally{
    try{if(browser)await browser.close();}
    finally{
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve()));
      await closed;
    }
  }
}
if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
