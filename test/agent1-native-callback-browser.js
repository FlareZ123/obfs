'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/** @typedef {{kind:string,observation:'source'|'frame',body:string,deferred?:boolean,patchedMap?:boolean}} Scenario */
/** @typedef {{value:number,source:string|null,frame:string|null,column:number|null,error:string|null,callerError:string|null}} Observation */

/** @type {Scenario[]} */
const scenarios=[
  {kind:'json-toJSON',observation:'frame',
    body:'JSON.stringify({toJSON:function(){external();return 1;}});'},
  {kind:'json-replacer',observation:'source',
    body:"JSON.stringify({x:1},function(key,value){if(key==='x')external();return value;});"},
  {kind:'json-reviver',observation:'source',
    body:"JSON.parse('{\"x\":1}',function(key,value){if(key==='x')external();return value;});"},
  {kind:'array-sort',observation:'frame',
    body:'[2,1].sort(function(a,b){external();return a-b;});'},
  {kind:'string-replace',observation:'frame',
    body:"'a'.replace(/a/,function(){external();return 'b';});"},
  {kind:'array-map',observation:'frame',
    body:'[1].map(function(value){external();return value;});'},
  {kind:'map-forEach',observation:'frame',
    body:"new Map([['x',1]]).forEach(function(){external();});"},
  {kind:'array-from-map',observation:'frame',
    body:'Array.from([1],function(value){external();return value;});'},
  {kind:'promise-then-deferred',observation:'frame',deferred:true,
    body:'Promise.resolve(1).then(function(value){external();return value;});'},
  {kind:'array-map-host-overridden-source-control',observation:'source',patchedMap:true,
    body:'[1].map(function(value){return owner.longPrivatePropertyName;});'}
];

/**
 * Build a classic-script fixture so the host callback and application
 * functions share a sloppy same-realm caller chain.
 * @param {Scenario} scenario
 * @returns {string}
 */
function sourceFor(scenario){
  return [
    'const other={unrelatedField:2};',
    'function hidden(external){const owner={longPrivatePropertyName:1};',
    scenario.body,
    'return owner.longPrivatePropertyName;}',
    'function plain(){return other.unrelatedField;}',
    'function publicReader(external){return hidden(external)+plain();}',
    'module.exports=publicReader;'
  ].join('');
}


/**
 * Build an ESM fixture. Its application functions are strict by language
 * semantics, unlike the CommonJS fixture above.
 * @param {Scenario} scenario
 * @returns {string}
 */
function moduleSourceFor(scenario){
  return [
    'const other={unrelatedField:2};',
    'function hidden(external){const owner={longPrivatePropertyName:1};',
    scenario.body,
    'return owner.longPrivatePropertyName;}',
    'function plain(){return other.unrelatedField;}',
    'export function publicReader(external){return hidden(external)+plain();}'
  ].join('');
}

/**
 * @param {string} observation
 * @param {string} scriptPath
 * @param {boolean} [patchedMap]
 * @returns {string}
 */
function pageFor(observation,scriptPath,patchedMap=false){
  const patch=patchedMap?
    'var nativeMap=Array.prototype.map;Array.prototype.map=function(callback,thisArg){'+
      'window.__observation.source=Function.prototype.toString.call(callback);'+
      'return nativeMap.call(this,callback,thisArg);};': '';
  return '<!doctype html><meta charset="utf-8">'+
    '<pre id="result"></pre><pre id="failure"></pre>'+
    '<script>'+patch+
    'window.module={exports:{}};'+
    'window.__observation={source:null,frame:null,column:null,error:null,callerError:null};'+
    'window.__kind='+JSON.stringify(observation)+';'+
    'function external(){try{'+
      'if(window.__kind==="source"){'+
        'var captured=arguments.callee.caller&&arguments.callee.caller.caller;'+
        'window.__observation.source=captured?Function.prototype.toString.call(captured):null;'+
      '}else{'+
        'var stack=String(new Error("host callback").stack||"");'+
        'var lines=stack.split("\\n");'+
        'var frame=lines.find(function(line){return /\\bhidden\\b/.test(line);})||null;'+
        'window.__observation.frame=frame;'+
        'var match=frame&&frame.match(/:(\\d+):(\\d+)\\)?$/);'+
        'window.__observation.column=match?Number(match[2]):null;'+
      '}'+
    '}catch(error){window.__observation.error=String(error&&error.message||error);}}'+
    '</script>'+
    '<script src="'+scriptPath+'"></script>'+
    '<script>try{'+
      'var value=module.exports(external);'+
      'Promise.resolve().then(function(){'+
        'var seen=window.__observation;'+
        'var result={value:value,source:seen.source,frame:seen.frame,column:seen.column,error:seen.error,callerError:seen.callerError};'+
        'document.getElementById("result").textContent=btoa(JSON.stringify(result));'+
      '});'+
    '}catch(error){document.getElementById("failure").textContent=String(error&&error.stack||error);}</script>';
}


/**
 * @param {string} modulePath
 * @param {boolean} [patchedMap]
 * @returns {string}
 */
function modulePageFor(modulePath,patchedMap=false){
  const patch=patchedMap?
    'var nativeMap=Array.prototype.map;Array.prototype.map=function(callback,thisArg){'+
      'window.__observation.source=Function.prototype.toString.call(callback);'+
      'return nativeMap.call(this,callback,thisArg);};': '';
  return '<!doctype html><meta charset="utf-8">'+
    '<pre id="result"></pre><pre id="failure"></pre>'+
    '<script>'+patch+
    'window.__observation={source:null,frame:null,column:null,error:null,callerError:null};'+
    'function external(){try{'+
      'var captured=arguments.callee.caller&&arguments.callee.caller.caller;'+
      'window.__observation.source=captured?Function.prototype.toString.call(captured):null;'+
    '}catch(error){window.__observation.callerError=String(error&&error.message||error);}'+
    'var stack=String(new Error("host callback").stack||"");'+
    'var lines=stack.split("\\n");'+
    'var frame=lines.find(function(line){return /\\bhidden\\b/.test(line);})||null;'+
    'window.__observation.frame=frame;'+
    'var match=frame&&frame.match(/:(\\d+):(\\d+)\\)?$/);'+
    'window.__observation.column=match?Number(match[2]):null;}'+
    '</script>'+
    '<script type="module">import {publicReader} from "'+modulePath+'";try{'+
      'var value=publicReader(external);'+
      'Promise.resolve().then(function(){'+
        'var seen=window.__observation;'+
        'var result={value:value,source:seen.source,frame:seen.frame,column:seen.column,error:seen.error,callerError:seen.callerError};'+
        'document.getElementById("result").textContent=btoa(JSON.stringify(result));'+
      '});'+
    '}catch(error){document.getElementById("failure").textContent=String(error&&error.stack||error);}</script>';
}

/**
 * @param {string} origin
 * @param {string} pagePath
 * @returns {Promise<Observation>}
 */
async function observe(origin,pagePath){
  const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=2500','--dump-dom',
    origin+pagePath
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium did not produce an observation for '+pagePath+': '+stdout.slice(0,1800));
  return /** @type {Observation} */(JSON.parse(Buffer.from(encoded,'base64').toString('utf8')));
}

/** @returns {Promise<void>} */
async function main(){
  /** @type {Map<string,{body:string,type:string}>} */
  const resources=new Map();
  /** @type {Map<string,number>} */
  const metrics=new Map();
  /** @type {Map<string,number>} */
  const moduleMetrics=new Map();
  /** @type {Array<{kind:string,mode:string,properties:number,deferred:boolean,patchedMap:boolean,native:Observation,compiled:Observation}>} */
  const results=[];

  for(const scenario of scenarios){
    const source=sourceFor(scenario);
    const output=obfuscateFiles([{
      path:'entry.js',sourceType:'commonjs',code:source
    }],{
      mode:'coo',seed:'agent1-native-callback-browser/'+scenario.kind,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(output.files.length,1);
    const emittedValue=output.files[0].code;
    assert.equal(typeof emittedValue,'string');
    const emitted=/** @type {string} */(emittedValue);
    metrics.set(scenario.kind,output.files[0].metrics.properties);
    assert.ok(output.files[0].metrics.properties>=1,
      scenario.kind+' must retain nonzero private-property rewrite yield');
    assert.ok(!emitted.includes('unrelatedField'),
      scenario.kind+' must rename the unrelated plain() positive control');
    if(scenario.patchedMap){
      assert.ok(emitted.includes('longPrivatePropertyName'),
        scenario.kind+' must conservatively retain the callback-observed owner property');
    }else{
      assert.ok(!emitted.includes('longPrivatePropertyName'),
        scenario.kind+' must rename the observed owner property');
    }

    const base='/'+scenario.kind;
    resources.set(base+'/native.js',{body:source,type:'text/javascript; charset=utf-8'});
    resources.set(base+'/compiled.js',{body:emitted,type:'text/javascript; charset=utf-8'});
    resources.set(base+'/native.html',{
      body:pageFor(scenario.observation,base+'/native.js',scenario.patchedMap??false),
      type:'text/html; charset=utf-8'
    });
    resources.set(base+'/compiled.html',{
      body:pageFor(scenario.observation,base+'/compiled.js',scenario.patchedMap??false),
      type:'text/html; charset=utf-8'
    });
    const moduleSource=moduleSourceFor(scenario);
    const moduleOutput=obfuscateFiles([{
      path:'entry.mjs',sourceType:'module',code:moduleSource
    }],{
      mode:'coo',closedWorld:true,
      seed:'agent1-native-callback-browser-esm/'+scenario.kind,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(moduleOutput.files.length,1);
    const moduleCodeValue=moduleOutput.files[0].code;
    assert.equal(typeof moduleCodeValue,'string');
    const moduleCode=/** @type {string} */(moduleCodeValue);
    moduleMetrics.set(scenario.kind,moduleOutput.files[0].metrics.properties);
    assert.ok(moduleOutput.files[0].metrics.properties>=1,
      scenario.kind+' ESM must retain nonzero private-property rewrite yield');
    assert.ok(!moduleCode.includes('unrelatedField'),
      scenario.kind+' ESM must rename the unrelated plain() positive control');
    if(scenario.patchedMap){
      assert.ok(moduleCode.includes('longPrivatePropertyName'),
        scenario.kind+' ESM must conservatively retain the callback-observed owner property');
    }else{
      assert.ok(!moduleCode.includes('longPrivatePropertyName'),
        scenario.kind+' ESM must rename the observed owner property');
    }
    resources.set(base+'/module-native.mjs',{
      body:moduleSource,type:'text/javascript; charset=utf-8'
    });
    resources.set(base+'/module-compiled.mjs',{
      body:moduleCode,type:'text/javascript; charset=utf-8'
    });
    resources.set(base+'/module-native.html',{
      body:modulePageFor(base+'/module-native.mjs',scenario.patchedMap??false),
      type:'text/html; charset=utf-8'
    });
    resources.set(base+'/module-compiled.html',{
      body:modulePageFor(base+'/module-compiled.mjs',scenario.patchedMap??false),
      type:'text/html; charset=utf-8'
    });
  }

  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const resource=resources.get(pathname);
    if(!resource){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':resource.type,
      'cache-control':'no-store'
    });
    response.end(resource.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });

  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;

    for(const scenario of scenarios){
      const base='/'+scenario.kind;
      const before=await observe(origin,base+'/native.html');
      const after=await observe(origin,base+'/compiled.html');
      assert.equal(before.value,3,scenario.kind+' native return value');
      assert.equal(after.value,before.value,scenario.kind+' native/emitted return parity');
      assert.equal(before.error,null,scenario.kind+' native observer must not throw');
      assert.equal(after.error,null,scenario.kind+' emitted observer must not throw');

      if(scenario.deferred){
        assert.equal(before.frame,null,scenario.kind+' must not retain the returned hidden() frame');
        assert.equal(after.frame,null,scenario.kind+' emitted callback must not retain the returned hidden() frame');
        assert.equal(before.column,null,scenario.kind+' deferred native column');
        assert.equal(after.column,null,scenario.kind+' deferred emitted column');
      }else if(scenario.observation==='source'){
        assert.ok(before.source&&before.source.includes('owner.longPrivatePropertyName'),
          scenario.kind+(scenario.patchedMap?' host override must expose the original callback source':' Chromium callback must expose the original hidden() source'));
        assert.ok(after.source,scenario.kind+' Chromium callback must retain a source observation');
        if(scenario.patchedMap){
          assert.equal(after.source,before.source,
            scenario.kind+' host override should observe unchanged callback source when owner key is retained');
          assert.ok(after.source.includes('longPrivatePropertyName'),
            scenario.kind+' host override should continue to observe the retained owner key');
        }else{
          assert.notEqual(after.source,before.source,
            scenario.kind+' should expose changed hidden() source after private-key rewriting');
          assert.ok(!after.source.includes('longPrivatePropertyName'),
            scenario.kind+' emitted source should not retain the original private key');
        }
      }else{
        assert.ok(before.frame&&before.frame.includes('hidden'),
          scenario.kind+' native Chromium stack must expose the active hidden() frame');
        assert.ok(after.frame&&after.frame.includes('hidden'),
          scenario.kind+' emitted Chromium stack must expose the active hidden() frame');
        assert.ok(Number.isInteger(before.column),scenario.kind+' native frame column');
        assert.ok(Number.isInteger(after.column),scenario.kind+' emitted frame column');
        assert.notEqual(after.column,before.column,
          scenario.kind+' should expose changed active-frame coordinates after private-key rewriting');
      }

      const properties=metrics.get(scenario.kind)??0;
      results.push({
        kind:scenario.kind,mode:'coo',deferred:scenario.deferred??false,
        patchedMap:scenario.patchedMap??false,properties,
        native:before,compiled:after
      });
      process.stdout.write('CHROMIUM_INTRINSIC_CALLBACK '+JSON.stringify({
        kind:scenario.kind,observation:scenario.observation,deferred:scenario.deferred??false,
        properties,
        nativeValue:before.value,compiledValue:after.value,
        nativeColumn:before.column,compiledColumn:after.column,
        sourceChanged:before.source!==after.source
      })+'\n');
    }

    /** @type {Array<{kind:string,properties:number,deferred:boolean,patchedMap:boolean,native:Observation,compiled:Observation}>} */
    const moduleResults=[];
    for(const scenario of scenarios){
      const base='/'+scenario.kind;
      const before=await observe(origin,base+'/module-native.html');
      const after=await observe(origin,base+'/module-compiled.html');
      assert.equal(before.value,3,scenario.kind+' ESM native return value');
      assert.equal(after.value,before.value,scenario.kind+' ESM native/emitted return parity');
      assert.equal(before.error,null,scenario.kind+' ESM native observer must not throw');
      assert.equal(after.error,null,scenario.kind+' ESM emitted observer must not throw');
      if(!scenario.patchedMap){
        assert.equal(before.source,null,
          scenario.kind+' strict ESM callback must not expose hidden() through sloppy caller-chain source');
        assert.equal(after.source,null,
          scenario.kind+' emitted strict ESM callback must not expose hidden() through sloppy caller-chain source');
      }
      if(scenario.patchedMap){
        assert.ok(before.source&&before.source.includes('owner.longPrivatePropertyName'),
          scenario.kind+' strict ESM host override must expose the original callback source');
        assert.ok(after.source&&after.source.includes('longPrivatePropertyName'),
          scenario.kind+' strict ESM host override must retain the callback-observed owner key');
        assert.equal(after.source,before.source,
          scenario.kind+' strict ESM host override should observe unchanged callback source when owner key is retained');
        assert.equal(before.frame,null,scenario.kind+' host override source capture should not require an active-frame edge');
        assert.equal(after.frame,null,scenario.kind+' emitted host override source capture should not require an active-frame edge');
      }else if(scenario.deferred){
        assert.equal(before.frame,null,scenario.kind+' strict ESM must not retain the returned hidden() frame');
        assert.equal(after.frame,null,scenario.kind+' strict ESM emitted callback must not retain the returned hidden() frame');
        assert.equal(before.column,null,scenario.kind+' strict ESM deferred native column');
        assert.equal(after.column,null,scenario.kind+' strict ESM deferred emitted column');
      }else{
        assert.ok(before.frame&&before.frame.includes('hidden'),
          scenario.kind+' strict ESM native Chromium stack must expose the active hidden() frame');
        assert.ok(after.frame&&after.frame.includes('hidden'),
          scenario.kind+' strict ESM emitted Chromium stack must expose the active hidden() frame');
        assert.ok(Number.isInteger(before.column),scenario.kind+' strict ESM native frame column');
        assert.ok(Number.isInteger(after.column),scenario.kind+' strict ESM emitted frame column');
        assert.notEqual(after.column,before.column,
          scenario.kind+' strict ESM should expose changed active-frame coordinates after private-key rewriting');
      }
      const properties=moduleMetrics.get(scenario.kind)??0;
      moduleResults.push({kind:scenario.kind,properties,deferred:scenario.deferred??false,patchedMap:scenario.patchedMap??false,native:before,compiled:after});
      process.stdout.write('CHROMIUM_INTRINSIC_CALLBACK_ESM '+JSON.stringify({
        kind:scenario.kind,properties,
        nativeValue:before.value,compiledValue:after.value,
        nativeColumn:before.column,compiledColumn:after.column,
        sourceUnavailable:before.source===null&&after.source===null,
        callerError:before.callerError
      })+'\n');
    }
    process.stdout.write('CHROMIUM_INTRINSIC_CALLBACK_ESM_SUMMARY '+JSON.stringify({
      scenarios:moduleResults.length,
      strictSourceUnavailable:moduleResults.filter(item=>!item.patchedMap).every(item=>item.native.source===null&&item.compiled.source===null),
      hostOverrideSourcePreserved:moduleResults.filter(item=>item.patchedMap).every(item=>item.native.source!==null&&item.compiled.source===item.native.source&&item.native.source.includes('longPrivatePropertyName')),
      framePosition:moduleResults.filter(item=>!item.patchedMap&&!item.deferred).every(item=>item.native.frame!==null&&item.compiled.frame!==null&&item.native.column!==item.compiled.column),
      deferredNoReturnedFrame:moduleResults.filter(item=>item.deferred).every(item=>item.native.frame===null&&item.compiled.frame===null),
      positiveYield:moduleResults.every(item=>item.properties>=1),
      nativeParity:moduleResults.every(item=>item.native.value===item.compiled.value)
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }

  assert.equal(results.length,scenarios.length);
  process.stdout.write('CHROMIUM_INTRINSIC_CALLBACK_SUMMARY '+JSON.stringify({
    node:process.version,scenarios:results.length,
    exactSource:results.filter(item=>item.native.source!==null&&!item.patchedMap).length,
    hostOverrideSourcePreserved:results.filter(item=>item.patchedMap).every(item=>item.native.source!==null&&item.compiled.source===item.native.source&&item.native.source.includes('longPrivatePropertyName')),
    framePosition:results.filter(item=>item.native.frame!==null).length,
    deferredNoReturnedFrame:results.filter(item=>item.deferred).every(item=>item.native.frame===null&&item.compiled.frame===null),
    positiveYield:results.every(item=>item.properties>=1),
    nativeParity:results.every(item=>item.native.value===item.compiled.value)
  })+'\n');
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
