'use strict';

/**
 * Real Chromium DOMString setter parity, not a simulated DOM setter.
 * The pinned Node ESM corpus in agent21-dom-binary-coercion.test.js
 * independently covers all three emitted mode flags and a wider flow matrix.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile,spawnSync}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} JsModule */
/** @typedef {{source:string,value:number,independent:number}} Observation */
/** @typedef {{label:string,statement:string}} Scenario */
/** @typedef {{label:string,mode:string,native:string,emitted:string,mutated:string}} BrowserPlan */
/** @typedef {{label:string,mode:string,native:Observation,emitted:Observation,mutated:Observation}} BrowserRow */

/** @type {Scenario[]} */
const scenarios=[
  {label:'alias',statement:'const value=0;function publish(value){target.id=value;}const call=publish;call(inspect);'},
  {label:'call',statement:'const value=0;function publish(value){target.id=value;}publish.call(undefined,inspect);'},
  {label:'concat',statement:'const value=0;function publish(value){target.id="prefix:"+value;}publish.call(undefined,inspect);'}
];

/** @param {Scenario} item @returns {JsModule[]} */
function graph(item){
  return [
    {path:'logic.mjs',sourceType:'module',
      code:'const owner={secretField:57};export function inspect(){return owner.secretField;}'},
    {path:'pure.mjs',sourceType:'module',
      code:'const record={privateField:73};export const independent=73;'+
        'export const locallyOwnedRecordValue=record.privateField;'},
    {path:'observer.mjs',sourceType:'module',code:[
      'import {inspect} from "./logic.mjs";',
      'import {independent} from "./pure.mjs";',
      'const target=document.createElement("div");',
      item.statement,
      'export const observed={source:target.id,value:inspect(),independent};'
    ].join('\n')}
  ];
}

/** @param {JsModule[]} files @param {string} prefix @param {Map<string,string>} resources */
function addFiles(files,prefix,resources){
  for(const file of files)resources.set(prefix+'/'+file.path,file.code);
}

test('Chromium native DOMString source survives ESM shadowed callbacks with positive own rewrite', {
  skip:process.platform!=='linux'
},async()=>{
  const chrome=process.env.CHROMIUM_BIN||'google-chrome';
  const version=spawnSync(chrome,['--version'],{encoding:'utf8',timeout:15000});
  assert.equal(version.status,0,'Real Chromium must be installed for Linux regression');
  /** @type {Map<string,string>} */
  const resources=new Map();
  /** @type {BrowserPlan[]} */
  const plan=[];
  for(const sample of scenarios){
    const original=graph(sample);
    const mutated=original.map(file=>file.path==='logic.mjs'?
      {...file,code:file.code.replaceAll('secretField','controlRenamed')}:file);
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      const result=obfuscateFiles(original,{
        mode,seed:'agent21-real-chromium/'+mode+'/'+sample.label,
        closedWorld:true,properties:true,identifiers:false,strings:false
      });
      const protectedProducer=result.files.find(file=>file.path==='logic.mjs');
      const positiveProducer=result.files.find(file=>file.path==='pure.mjs');
      assert.ok(protectedProducer&&positiveProducer);
      assert.equal(protectedProducer.metrics.properties,0,
        mode+'/'+sample.label+' source-observable producer must stay unchanged');
      assert.ok(positiveProducer.metrics.properties>=1,
        mode+'/'+sample.label+' unrelated private primitive record must rewrite');
      const base='/case/'+sample.label+'/'+mode;
      addFiles(original,base+'/native',resources);
      addFiles(result.files,base+'/emitted',resources);
      addFiles(mutated,base+'/mutated',resources);
      plan.push({label:sample.label,mode,
        native:base+'/native/observer.mjs',
        emitted:base+'/emitted/observer.mjs',
        mutated:base+'/mutated/observer.mjs'});
    }
  }
  // Importing each graph under a unique URL exercises the real browser
  // module linker; all source observation comes from Element.id's native setter.
  const inline=[
    'const plans='+JSON.stringify(plan)+';',
    'try {',
    '  const observed=[];',
    '  for(const item of plans){',
    '    const [native,emitted,mutated]=await Promise.all([',
    '      import(item.native),import(item.emitted),import(item.mutated)]);',
    '    observed.push({label:item.label,mode:item.mode,',
    '      native:native.observed,emitted:emitted.observed,mutated:mutated.observed});',
    '  }',
    '  const pre=document.createElement("pre");pre.id="result";',
    '  pre.textContent=btoa(JSON.stringify(observed));document.body.appendChild(pre);',
    '} catch(e) {',
    '  const pre=document.createElement("pre");pre.id="failure";',
    '  pre.textContent=String(e.stack||e);document.body.appendChild(pre);',
    '}'
  ].join('\n');
  const page='<!doctype html><html><head><meta charset="UTF-8"></head>'+
    '<body><script type="module">'+inline+'</script></body></html>';
  resources.set('/index.html',page);
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url??'/','http://127.0.0.1');
    const body=resources.get(url.pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':url.pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    }).end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('No server address');
    const url='http://127.0.0.1:'+address.port+'/index.html';
    const {stdout,stderr}=await promisify(execFile)(chrome,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=8000','--dump-dom',url
    ],{timeout:45000,maxBuffer:7*1024*1024,encoding:'utf8'});
    const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
    assert.ok(encoded,'Chromium failed: '+stdout.slice(0,1300)+' '+stderr.slice(0,1300));
    const rows=/** @type {BrowserRow[]} */(
      JSON.parse(Buffer.from(encoded,'base64').toString('utf8')));
    assert.equal(rows.length,plan.length);
    for(const row of rows){
      assert.equal(row.native.value,57,row.mode+'/'+row.label+' native value');
      assert.equal(row.native.independent,73,row.mode+'/'+row.label+' native independent');
      assert.ok(row.native.source.includes('secretField'),
        row.mode+'/'+row.label+' real browser source witness');
      assert.deepEqual(row.emitted,row.native,
        row.mode+'/'+row.label+' native-vs-obfuscated Chromium mismatch');
      assert.equal(row.mutated.value,57,row.mode+'/'+row.label+' mutation value control');
      assert.equal(row.mutated.independent,73,row.mode+'/'+row.label+' mutation independent');
      assert.notEqual(row.mutated.source,row.native.source,
        row.mode+'/'+row.label+' source-only mutation must be visible');
    }
    console.log('AGENT21_DOM_SHADOWED_CHROMIUM '+JSON.stringify({
      cases:rows.length,scenarios:scenarios.map(item=>item.label),modeCount:3,
      positivePrimitiveRewrites:true,nativeIDL:true,sourceMutationSensitive:true
    }));
  } finally {
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve(undefined)));
  }
});
