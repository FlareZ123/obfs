'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/** @typedef {{kind:string,observation:'source'|'frame',body:string}} Scenario */
/** @typedef {{value:number,source:string|null,frame:string|null,column:number|null,error:string|null}} Observation */

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
    body:'Array.from([1],function(value){external();return value;});'}
];

/**
 * Build a classic-script fixture so the host callback and application
 * functions share a sloppy same-realm caller chain.
 * @param {Scenario} scenario
 * @returns {string}
 */
function sourceFor(scenario){
  return [
    'function publicReader(external){const other={unrelatedField:2};',
    'function hidden(external){const owner={longPrivatePropertyName:1};',
    scenario.body,
    'return owner.longPrivatePropertyName;}',
    'function plain(){return other.unrelatedField;}',
    'return hidden(external)+plain();}'
  ].join('');
}

/**
 * @param {string} observation
 * @param {string} scriptPath
 * @returns {string}
 */
function pageFor(observation,scriptPath){
  return '<!doctype html><meta charset="utf-8">'+
    '<pre id="result"></pre><pre id="failure"></pre>'+
    '<script>'+
    'window.__observation={source:null,frame:null,column:null,error:null};'+
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
      'var value=publicReader(external);'+
      'var seen=window.__observation;'+
      'var result={value:value,source:seen.source,frame:seen.frame,column:seen.column,error:seen.error};'+
      'document.getElementById("result").textContent=btoa(JSON.stringify(result));'+
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
  /** @type {Array<{kind:string,mode:string,properties:number,native:Observation,compiled:Observation}>} */
  const results=[];

  for(const scenario of scenarios){
    const source=sourceFor(scenario);
    const output=obfuscateFiles([{
      path:'entry.js',sourceType:'script',code:source
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
    assert.ok(!emitted.includes('longPrivatePropertyName'),
      scenario.kind+' must rename the observed owner property');

    const base='/'+scenario.kind;
    resources.set(base+'/native.js',{body:source,type:'text/javascript; charset=utf-8'});
    resources.set(base+'/compiled.js',{body:emitted,type:'text/javascript; charset=utf-8'});
    resources.set(base+'/native.html',{
      body:pageFor(scenario.observation,base+'/native.js'),
      type:'text/html; charset=utf-8'
    });
    resources.set(base+'/compiled.html',{
      body:pageFor(scenario.observation,base+'/compiled.js'),
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

      if(scenario.observation==='source'){
        assert.ok(before.source&&before.source.includes('owner.longPrivatePropertyName'),
          scenario.kind+' Chromium callback must expose the original hidden() source');
        assert.ok(after.source,scenario.kind+' Chromium callback must retain a source observation');
        assert.notEqual(after.source,before.source,
          scenario.kind+' should expose changed hidden() source after private-key rewriting');
        assert.ok(!after.source.includes('longPrivatePropertyName'),
          scenario.kind+' emitted source should not retain the original private key');
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
        kind:scenario.kind,mode:'coo',
        properties,
        native:before,compiled:after
      });
      process.stdout.write('CHROMIUM_INTRINSIC_CALLBACK '+JSON.stringify({
        kind:scenario.kind,observation:scenario.observation,
        properties,
        nativeValue:before.value,compiledValue:after.value,
        nativeColumn:before.column,compiledColumn:after.column,
        sourceChanged:before.source!==after.source
      })+'\n');
    }
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }

  assert.equal(results.length,scenarios.length);
  process.stdout.write('CHROMIUM_INTRINSIC_CALLBACK_SUMMARY '+JSON.stringify({
    node:process.version,scenarios:results.length,
    exactSource:results.filter(item=>item.native.source!==null).length,
    framePosition:results.filter(item=>item.native.frame!==null).length,
    positiveYield:results.every(item=>item.properties>=1),
    nativeParity:results.every(item=>item.native.value===item.compiled.value)
  })+'\n');
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
