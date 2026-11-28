'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {transform}=require('esbuild');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */
/** @typedef {{path:string,code:string}} RenderFile */
/** @typedef {{checksumResult:number,elapsedMs:number}} BrowserReport */

/**
 * Two distinct objects from one exported factory travel through both a private
 * record and tuple; one is additionally forwarded through a pure imported
 * identity function. A private local reader is called directly in the module.
 * @returns {SourceFile[]}
 */
function graph(){
  return [
    {path:'state.mjs',sourceType:'module',code:
      'export function makeState(){return {secretField:17,otherField:5};}'},
    {path:'identity.mjs',sourceType:'module',code:
      'export function identity(value){return value;}'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {makeState} from "./state.mjs";',
      'import {identity} from "./identity.mjs";',
      'const first=makeState();const second=makeState();',
      'const record={left:first,right:second};',
      'const recordLeft=record.left;const recordRight=record.right;',
      'const tuple=[first,second];',
      'const tupleLeft=tuple[0];const tupleRight=tuple[1];',
      'const carried=identity(recordLeft);',
      // Arithmetic compound writes are inside the current proof grammar;
      // logical compound writes remain fail-closed.
      'function calculate(n){',
      'first.secretField+=n;',
      'second.otherField+=(n^3);',
      'return (tupleLeft.secretField+tupleRight.otherField+carried.secretField+recordRight.otherField)|0;',
      '}',
      'const started=performance.now();let checksum=0;',
      'for(let i=0;i<5000000;i++)checksum^=calculate(Math.imul(i,1664525)|0);',
      'export const checksumResult=checksum;',
      'export const elapsedMs=performance.now()-started;'
    ].join('\n')}
  ];
}

/**
 * A C0-containing import specifier has different POSIX and WHATWG URL
 * identities. The native browser must select the root factory, not the decoy.
 * @returns {SourceFile[]}
 */
function pathAliasGraph(){
  const specifier='./a/.\t/../state.mjs';
  return [
    {path:'state.mjs',sourceType:'module',code:
      'export function makeState(){return {secretField:23};}'},
    {path:'a/state.mjs',sourceType:'module',code:
      'export function makeState(){return {secretField:41};}'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {makeState} from '+JSON.stringify(specifier)+';'+
      'const state=makeState();export const value=state.secretField;'}
  ];
}

/**
 * @param {SourceFile[]} files
 * @returns {RenderFile[]}
 */
function compile(files){
  const outcome=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'agent9-factory-multiroot-chromium',
    properties:true,strings:false,identifiers:false
  });
  assert.equal(outcome.crossFile.objects,1,
    'One exported factory must be proven across the complete browser ESM graph');
  assert.equal(outcome.crossFile.properties,2,
    'Both private factory data fields must actually be renamed');
  const emitted=outcome.files.map(file=>({path:file.path,code:String(file.code)}));
  assert.doesNotMatch(emitted.map(file=>file.code).join('\n'),/secretField|otherField/u);
  return emitted;
}

/**
 * @param {SourceFile[]} files
 * @returns {Promise<RenderFile[]>}
 */
async function minify(files){
  return Promise.all(files.map(async file=>({
    path:file.path,
    code:(await transform(file.code,{
      loader:'js',format:'esm',target:'es2022',minify:true,
      legalComments:'none'
    })).code
  })));
}

/** @returns {Promise<void>} */
async function main(){
  const native=graph();
  const variants=/** @type {[string,RenderFile[]][]} */([
    ['native',native],['minified',await minify(native)],
    ['obfuscated',compile(native)]
  ]);
  const aliasNative=pathAliasGraph();
  const aliasMinified=await minify(aliasNative);
  const aliasOutcome=obfuscateFiles(aliasNative,{
    mode:'coo',closedWorld:true,seed:'agent9-factory-url-path-browser',
    properties:true,strings:false,identifiers:false
  });
  assert.equal(aliasOutcome.crossFile.properties,0,
    'C0 URL/POSIX path identity mismatch must refuse the factory proof');
  const aliasObfuscated=aliasOutcome.files.map(file=>({path:file.path,code:String(file.code)}));
  /** @type {Map<string,{content:string,type:string}>} */
  const routes=new Map([['/index.html',{
    content:'<!doctype html><html><meta charset="utf-8"><title>Factory multi-root proof</title></html>',
    type:'text/html; charset=utf-8'
  }]]);
  for(const [variant,files] of variants)
    for(const file of files)
      routes.set('/'+variant+'/'+file.path,{
        content:file.code,type:'text/javascript; charset=utf-8'
      });
  for(const [variant,files] of [
    ['path-native',aliasNative],['path-minified',aliasMinified],
    ['path-obfuscated',aliasObfuscated]
  ])
    for(const file of files)
      routes.set('/'+variant+'/'+file.path,{
        content:file.code,type:'text/javascript; charset=utf-8'
      });
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const url=new URL(request.url??'/', 'http://localhost');
    const file=routes.get(url.pathname);
    if(!file){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'Content-Type':file.type,
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'"
    });
    response.end(file.content);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    page.setDefaultTimeout(180000);
    await page.goto('http://127.0.0.1:'+address.port+'/index.html',{
      waitUntil:'domcontentloaded',timeout:45000
    });
    const samples=await page.evaluate(async(origin)=>{
      const aliasModules=await Promise.all([
        import(origin+'/path-native/entry.mjs'),
        import(origin+'/path-minified/entry.mjs'),
        import(origin+'/path-obfuscated/entry.mjs')
      ]);
      const aliasValues=aliasModules.map(module=>module.value);
      if(aliasValues.some(value=>value!==23))
        throw Error('Browser WHATWG C0 URL identity selected a POSIX decoy: '+JSON.stringify(aliasValues));
      /** @typedef {{checksumResult:number,elapsedMs:number}} BrowserReport */
      /** @type {Record<string,number[]>} */
      const times={native:[],minified:[],obfuscated:[]};
      /** @type {number|undefined} */
      let expectedChecksum;
      for(let round=0;round<11;round++){
        const order=round%2===0?
          ['native','minified','obfuscated']:
          ['obfuscated','minified','native'];
        for(const variant of order){
          const moduleUrl=origin+'/'+variant+'/entry.mjs?round='+round;
          const loaded=/** @type {{checksumResult:number,elapsedMs:number}} */(
            await import(moduleUrl)
          );
          if(expectedChecksum===undefined)expectedChecksum=loaded.checksumResult;
          if(loaded.checksumResult!==expectedChecksum)
            throw Error('native/minified/obfuscated checksum mismatch in '+variant+' round '+round);
          if(!(loaded.elapsedMs>0&&Number.isFinite(loaded.elapsedMs)))
            throw Error('Invalid browser timing for '+variant+' round '+round);
          if(round>=2)times[variant].push(loaded.elapsedMs);
        }
      }
      return {expectedChecksum,times};
    },'http://127.0.0.1:'+address.port);
    assert.ok(samples.expectedChecksum!==undefined);
    /** @param {number[]} values */
    const median=values=>{
      const sorted=[...values].sort((a,b)=>a-b);
      return sorted[Math.floor(sorted.length/2)];
    };
    const nativeMs=median(samples.times.native);
    const minifiedMs=median(samples.times.minified);
    const obfuscatedMs=median(samples.times.obfuscated);
    const nativeRatio=obfuscatedMs/nativeMs;
    const minifiedRatio=obfuscatedMs/minifiedMs;
    const report={
      roundsPerArm:samples.times.native.length,
      checksum:samples.expectedChecksum,
      nativeMs,minifiedMs,obfuscatedMs,nativeRatio,minifiedRatio,
      note:'Real Chromium COO exported-factory multi-root record+tuple graph; selected workload, not universal 2.5x proof'
    };
    process.stdout.write('AGENT9_FACTORY_MULTIROOT_CHROMIUM '+JSON.stringify(report)+'\n');
    assert.ok(nativeRatio<=2.5&&minifiedRatio<=2.5,
      'This exact protected browser workload must remain within 2.5x of native and minified');
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)
  main().catch(error=>{console.error(error);process.exitCode=1;});

module.exports={graph,main};
