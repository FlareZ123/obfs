'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles,createScoHandler,createScoRpcClientSource}=require('../src');

/** @param {string} binary @param {string} url @returns {Promise<string>} */
async function dumpDom(binary,url) {
  const args=[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=4000','--dump-dom',url
  ];
  try {
    const {stdout}=await promisify(execFile)(binary,args,{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    return stdout;
  } catch(error) {
    const message=error instanceof Error ? error.message : String(error);
    const stderr=error && typeof error==='object' && 'stderr' in error ? String(error.stderr) : '';
    throw new Error(`${message}\nChromium stderr: ${stderr}`);
  }
}

async function main(){
  const chromium=process.env.CHROMIUM_BIN ?? 'chromium';
  const sources=[
    {path:'state.mjs',code:'export const state={privateValue:41};'},
    {path:'entry.mjs',code:'import {state} from "./state.mjs";document.getElementById("answer").textContent=state.privateValue;'}
  ];
  const moduleSet=obfuscateFiles(sources,{mode:'coo',closedWorld:true,seed:'chrome-modules'});
  assert.equal(moduleSet.crossFile.properties,1);
  // A local closed owner may contain a direct lexical function parameter
  // without deriving an anonymous function name from its field spelling.
  const parameterSet=obfuscateFiles([{
    path:'parameter-owner.mjs',sourceType:'module',
    code:'function compute(payload){const owner={secretField:payload,bias:3};'+
      'return owner.secretField+owner.bias;}'+
      'document.getElementById("answer").textContent=compute(39);'
  }],{mode:'coo',seed:'chrome-local-formal-owner',
    identifiers:false,strings:false,properties:true});
  assert.equal(parameterSet.files[0].metrics.objects,1);
  // Two actual browser ESM files retain their public import and DOM
  // contracts while a bound formal supplies a shorthand private own field.
  const parameterShorthandSet=obfuscateFiles([
    {path:'parameter-shorthand-helper.mjs',sourceType:'module',
      code:'function compute(payload){const owner={payload,bias:3};'+
        'return owner.payload+owner.bias;}'+
         'export function publicCompute(input){return compute(input);}'},
    {path:'parameter-shorthand-entry.mjs',sourceType:'module',
      code:'import {publicCompute} from "./parameter-shorthand-helper.mjs";'+
        'document.getElementById("answer").textContent=publicCompute(39);'}
  ],{mode:'coo',closedWorld:false,seed:'chrome-local-formal-shorthand',
    identifiers:false,strings:false,properties:true});
  assert.equal(parameterShorthandSet.files.reduce((sum,file)=>sum+file.metrics.objects,0),1);
  // Calling a passed function as an owner method exposes its receiver's
  // original enumerable key. Keep that owner unrenamed.
  const parameterRefusalSet=obfuscateFiles([{
    path:'parameter-refusal.mjs',sourceType:'module',
    code:'function inspect(payload){const owner={secretField:payload};'+
      'return owner.secretField();}'+
      'document.getElementById("answer").textContent='+
      'inspect(function(){return Object.keys(this).join(",")});'
  }],{mode:'coo',seed:'chrome-local-formal-method-refusal',
    identifiers:false,strings:false,properties:true});
  assert.equal(parameterRefusalSet.files[0].metrics.objects,0);
  // The published HTML remains opaque, so the compiler conservatively avoids
  // private-key renames in the adjacent module graph. A real browser must
  // still execute the audited page and its separately emitted module files.
  const auditedHtml='<!doctype html><html><body><div id="answer">initial</div>'+
    '<script type="module" src="/audited-entry.mjs"></script></body></html>';
  /** @type {import('../src/core').SourceFile[]} */
  const auditedSources=[
    {path:'audited-state.mjs',sourceType:'module',code:'export const state={privateValue:41};'},
    {path:'audited-entry.mjs',sourceType:'module',
      code:'import {state} from "./audited-state.mjs";document.getElementById("answer").textContent=state.privateValue;'},
    {path:'audited-module.html',sourceType:'asset',code:Buffer.from(auditedHtml)}
  ];
  const auditedSet=obfuscateFiles(auditedSources,{
    mode:'coo',closedWorld:true,seed:'chrome-audited-html'
  });
  assert.equal(auditedSet.crossFile.properties,0);
  assert.deepEqual(auditedSet.files.find(file=>file.path==='audited-module.html')?.code,
    Buffer.from(auditedHtml));
  assert.throws(()=>obfuscateFiles([
    ...auditedSources.slice(0,2),
    {path:'inline.html',sourceType:'asset',
      code:'<script type="module">window.leakedSource=41;</script>'}
  ],{mode:'coo',closedWorld:true}),/HTML asset contains inline script source/);

  const namedJsSet=obfuscateFiles([
    {path:'js-state.js',sourceType:'module',code:'export const state={internalValue:23};'},
    {path:'js-entry.js',sourceType:'module',
      code:'import {state} from "./js-state.js";document.getElementById("answer").textContent=state.internalValue;'}
  ],{mode:'coo',closedWorld:true,seed:'chrome-js-modules'});
  assert.equal(namedJsSet.crossFile.properties,1);
  const defaultSet=obfuscateFiles([
    {path:'default-state.mjs',sourceType:'module',
      code:'export const state={privateScore:17,cacheWeight:5};'},
    {path:'default-entry.mjs',sourceType:'module',
      code:'import {state} from "./default-state.mjs";'+
        'let captured=0,fallbackCalls=0;'+
        'function fallback(){fallbackCalls++;return 99;}'+
        '({privateScore:captured=fallback()}=state);'+
        'const displayed=[captured,fallbackCalls,state.cacheWeight];'+
        'document.getElementById("answer").textContent=displayed.join(",");'}
  ],{mode:'coo',closedWorld:true,seed:'chrome-default-assignment',
    identifiers:false,strings:false});
  assert.equal(defaultSet.crossFile.properties,2);

  // Direct literal-key reflection participates in the same closed-world
  // owner mapping in a real browser ESM graph.
  const reflectionSet=obfuscateFiles([
    {path:'reflection-state.mjs',sourceType:'module',
      code:'export const state={secretValue:29,otherValue:12};'},
    {path:'reflection-entry.mjs',sourceType:'module',
      code:'import {state} from "./reflection-state.mjs";'+
        'const value=Reflect.get(state,"secretValue")+state.otherValue;'+
        'const own=Object.hasOwn(state,"otherValue");'+
        'document.getElementById("answer").textContent='+
        '(value===41&&own?"reflection-ok":"reflection-fail");'}
  ],{mode:'coo',closedWorld:true,seed:'chrome-direct-reflection',
    identifiers:false,strings:false});
  assert.equal(reflectionSet.crossFile.properties,2);

  // The imported reader receives a state object through nested identity
  // forwarding. Prove both private fields, while preserving the page-owned
  // window.hostApi.accept interface exactly as written.
  const readerSet=obfuscateFiles([
    {path:'reader-state.mjs',sourceType:'module',
      code:'export const state={secretValue:29,otherValue:12};'+
        'export const peek=value=>value.secretValue;'},
    {path:'reader-identity.mjs',sourceType:'module',
      code:'export const identity=payload=>payload;'},
    {path:'reader-entry.mjs',sourceType:'module',
      code:'import {state,peek} from "./reader-state.mjs";'+
        'import {identity} from "./reader-identity.mjs";'+
        'const forward=part=>part;'+
        'window.hostApi.accept(peek(forward(identity(state)))+state.otherValue);'}
  ],{mode:'coo',closedWorld:true,seed:'chrome-nested-readers',
    identifiers:false,strings:false});
  assert.equal(readerSet.crossFile.properties,2);
  const readerEntry=readerSet.files.find(file=>file.path==='reader-entry.mjs');
  assert.ok(readerEntry);
  assert.ok(String(readerEntry.code).includes('window.hostApi.accept('));

  // The same browser host API must survive a private owner passed through
  // an imported identity function and then statically destructured.
  const patternSet=obfuscateFiles([
    {path:'pattern-state.mjs',sourceType:'module',
      code:'export const state={secretValue:29,otherValue:12};'},
    {path:'pattern-identity.mjs',sourceType:'module',
      code:'export const identity=packet=>packet;'},
    {path:'pattern-entry.mjs',sourceType:'module',
      code:'import {state} from "./pattern-state.mjs";'+
        'import {identity} from "./pattern-identity.mjs";'+
        'const {secretValue:read}=identity(state);'+
        'window.hostApi.accept(read+state.otherValue);'}
  ],{mode:'coo',closedWorld:true,seed:'chrome-forwarded-destructure',
    identifiers:false,strings:false});
  assert.equal(patternSet.crossFile.properties,2);
  const patternEntry=patternSet.files.find(file=>file.path==='pattern-entry.mjs');
  assert.ok(patternEntry);
  assert.ok(String(patternEntry.code).includes('window.hostApi.accept('));

  // A later immutable key exported from an acyclic producer can be
  // reexported, used as a computed destructuring field and rewritten without
  // disturbing a separately supplied browser host API.
  const computedSet=obfuscateFiles([
    {path:'computed-state.mjs',sourceType:'module',
      code:'export const bag={privateScore:17,bias:5};'+
        'export const key="privateScore";'},
    {path:'computed-relay.mjs',sourceType:'module',
      code:'export {key as choice} from "./computed-state.mjs";'},
    {path:'computed-entry.mjs',sourceType:'module',
      code:'import {bag} from "./computed-state.mjs";'+
        'import {choice} from "./computed-relay.mjs";'+
        'const {[choice]:value=99}=bag;'+
        'window.hostApi.accept(value+bag.bias);'}
  ],{mode:'coo',closedWorld:true,seed:'chrome-acyclic-late-computed',
    identifiers:false,strings:false});
  assert.equal(computedSet.crossFile.properties,2);
  const computedEntry=computedSet.files.find(file=>file.path==='computed-entry.mjs');
  assert.ok(String(computedEntry?.code).includes('window.hostApi.accept('));

  // A private factory-created owner remains private across browser ESM
  // imports. The host-provided window API key is intentionally untouched.
  const factorySet=obfuscateFiles([
    {path:'factory-state.mjs',sourceType:'module',
      code:'const make=()=>({secretValue:29,otherValue:12});export const state=make();'},
    {path:'factory-entry.mjs',sourceType:'module',
      code:'import {state} from "./factory-state.mjs";'+
        'window.hostApi.accept(state.secretValue+state.otherValue);'}
  ],{mode:'coo',closedWorld:true,seed:'chrome-private-factory',
    identifiers:false,strings:false});
  assert.equal(factorySet.crossFile.properties,2);
  const factoryEntry=factorySet.files.find(file=>file.path==='factory-entry.mjs');
  assert.ok(String(factoryEntry?.code).includes('window.hostApi.accept('));

  const iifeSet=obfuscateFiles([
    {path:'factory-iife-state.mjs',sourceType:'module',
      code:'export const state=(()=>({secretValue:29,otherValue:12}))();'},
    {path:'factory-iife-entry.mjs',sourceType:'module',
      code:'import {state} from "./factory-iife-state.mjs";'+
        'window.hostApi.accept(state.secretValue+state.otherValue);'}
  ],{mode:'coo',closedWorld:true,seed:'chrome-private-iife',
    identifiers:false,strings:false});
  assert.equal(iifeSet.crossFile.properties,2);

  // Private tuple and record carriers hold the same object without exposing
  // their shapes. Verify the new fixed-slot ownership proof in actual
  // Chromium and preserve a host-provided global API member unchanged.
  const containerSet=obfuscateFiles([
    {path:'container-state.mjs',sourceType:'module',
      code:'const vault={hiddenCount:17,secretDelta:3};'+
        'const tuple=[false,vault];const fromTuple=tuple[1];'+
        'const record={tag:"private",privateOwner:vault};'+
        'const fromRecord=record.privateOwner;'+
        'function privateCalculate(n){return fromTuple.hiddenCount*n+fromRecord.secretDelta;}'+
        'export function calculate(n){return privateCalculate(n);}'},
    {path:'container-entry.mjs',sourceType:'module',
      code:'import {calculate} from "./container-state.mjs";'+
        'window.hostApi.accept(calculate(2));'}
  ],{mode:'coo',closedWorld:true,seed:'chrome-private-containers',
    identifiers:false,strings:false});
  assert.equal(containerSet.files.reduce((total,file)=>total+file.metrics.properties,0),2);
  assert.ok(String(containerSet.files.find(file=>file.path==='container-entry.mjs')?.code)
    .includes('window.hostApi.accept('));

  const cycleSet=obfuscateFiles([
    {path:'cycle-a.mjs',sourceType:'module',
      code:'import "./cycle-b.mjs";export function get(){return "browser-cycle-ok";}'},
    {path:'cycle-b.mjs',sourceType:'module',
      code:'import {get} from "./cycle-a.mjs";document.getElementById("answer").textContent=get();'}
  ],{mode:'coo',strings:true,properties:false,identifiers:false,seed:'chrome-esm-cycle'});
  assert.equal(cycleSet.files[0].metrics.literals,0);

  // A selected primitive ESM island may rename its private owner binding
  // while preserving exact exported callable source for an external browser
  // importer. A sibling module observes the watched callable and activates
  // the group-wide source observer veto.
  /** @type {import('../src/core').SourceFile} */
  const islandWatched={
    path:'island-watched.mjs',sourceType:'module',
    code:'const recordA={privateA:17};const valueA=recordA.privateA;'+
      'export function watched(){return valueA;}'
  };
  /** @type {import('../src/core').SourceFile} */
  const islandIndependent={
    path:'island-independent.mjs',sourceType:'module',
    code:'const recordB={privateB:23,otherB:19};const valueB=recordB.privateB;'+
      'export function unrelated(){return valueB;}'
  };
  /** @type {import('../src/core').SourceFile} */
  const islandAnother={
    path:'island-another.mjs',sourceType:'module',
    code:'const recordC={privateC:43};const valueC=recordC.privateC;'+
      'export function third(){return valueC;}'
  };
  /** @type {import('../src/core').SourceFile} */
  const islandEntry={
    path:'island-entry.mjs',sourceType:'module',
    code:'import {watched} from "./island-watched.mjs";'+
      'import {unrelated} from "./island-independent.mjs";'+
      'import {third} from "./island-another.mjs";'+
      'console.log(JSON.stringify({source:watched.toString(),'+
        'values:[unrelated(),third()]}));'
  };
  const islandSet=obfuscateFiles([
    islandWatched,islandIndependent,islandAnother,islandEntry
  ],{
    mode:'coo',closedWorld:true,seed:'chrome-source-island-identifiers',
    strings:false,
    experimentalSourceObserverIslands:['island-independent.mjs','island-another.mjs']
  });
  assert.equal(islandSet.crossFile.properties,0);
  for(const [path,outer,captured,fn] of [
    ['island-independent.mjs','recordB','valueB','unrelated'],
    ['island-another.mjs','recordC','valueC','third']
  ]) {
    const emitted=islandSet.files.find(file=>file.path===path);
    assert.ok(emitted);
    assert.ok(emitted.metrics.properties>=1);
    assert.equal(emitted.metrics.bindings,1);
    assert.equal(String(emitted.code).includes(outer),false);
    assert.ok(String(emitted.code).includes(
      'export function '+fn+'(){return '+captured+';}'));
  }
  const islandProbe='import {watched} from "./island-watched.mjs";'+
    'import {unrelated} from "./island-independent.mjs";'+
    'import {third} from "./island-another.mjs";'+
    'const ok=watched.toString()==="function watched(){return valueA;}"&&'+
      'unrelated.toString()==="function unrelated(){return valueB;}"&&'+
      'third.toString()==="function third(){return valueC;}"&&'+
      'unrelated()===23&&third()===43;'+
    'document.getElementById("answer").textContent=ok?"island-ok":"island-fail";';

  const good=obfuscateFiles([{
    path:'good.js',sourceType:'script',code:'document.getElementById("answer").textContent="permitted";'
  }],{mode:'coo',seed:'chrome-good',allowedHosts:['127.0.0.1']}).files[0].code;
  const bad=obfuscateFiles([{
    path:'blocked.js',sourceType:'script',code:'document.getElementById("answer").textContent="unauthorized";'
  }],{mode:'coo',seed:'chrome-blocked',allowedHosts:['forbidden.example']}).files[0].code;
  // Real Chromium canonicalizes 127.1 to 127.0.0.1 before evaluating the
  // location.hostname guard. The configured alias must authorize that page.
  const ipv4Alias=obfuscateFiles([{
    path:'ipv4-alias.js',sourceType:'script',
    code:'document.getElementById("answer").textContent="alias-authorized";'
  }],{mode:'coo',seed:'chrome-ipv4-alias',allowedHosts:['127.1']}).files[0].code;
  // An instrumented browser can intercept eager string decoding before the
  // client script initializes, even when its dormant function never executes.
  const traceCanary='browser-dormant-plaintext-canary';
  const traceOutput=obfuscateFiles([{
    path:'trace.js',sourceType:'script',
    code:'function dormant(){return '+JSON.stringify(traceCanary)+';}'+
      'globalThis.__obfsTraceResult=37;'
  }],{mode:'coo',seed:'chrome-runtime-extraction',strings:true,
    properties:false,identifiers:false}).files[0];
  assert.ok(traceOutput.metrics.literals>0);
  assert.equal(typeof traceOutput.code,'string');
  assert.ok(!/** @type {string} */ (traceOutput.code).includes(traceCanary));
  // Exercise server-resident SCO computation from a real Chromium module.
  // The remote module contains no protected method body. Browser cookies are
  // passed automatically to same-origin fetch with credentials:'same-origin'.
  const rpcHandler=createScoHandler([
    {path:'remote.mjs',sourceType:'module',code:createScoRpcClientSource(['score'])}
  ],{
    remoteMethods:{
      /** @param {number} value */
      score:value=>value*3
    },
    authorizeRead:()=>true,
    authorizeRpc:request=>request.headers.cookie==='session=accepted',
    authorizeOperation:(request,method,args)=>method==='score' &&
      args.length===1 && args[0]===19 &&
      request.headers.cookie==='session=accepted'
  });
  const content=new Map([...moduleSet.files,...parameterSet.files,...parameterShorthandSet.files,...parameterRefusalSet.files,...auditedSet.files,...namedJsSet.files,...defaultSet.files,...reflectionSet.files,...readerSet.files,...patternSet.files,...computedSet.files,...factorySet.files,...iifeSet.files,...containerSet.files,...cycleSet.files,...islandSet.files].map(x=>['/'+x.path,x.code]));
  content.set('/island-probe.mjs',islandProbe);
  content.set('/good.js',good);
  content.set('/blocked.js',bad);
  content.set('/ipv4-alias.js',ipv4Alias);
  content.set('/trace.js',traceOutput.code);
  content.set('/trace.html','<!doctype html><html><body><span id="answer">initial</span>'+ 
    '<script>globalThis.__capture=[];const original=String.fromCharCode;'+
    'String.fromCharCode=function(...values){const part=Reflect.apply(original,String,values);'+
    '__capture.push(part);return part;};</script>'+ 
    '<script src="/trace.js"></script>'+ 
    '<script>document.getElementById("answer").textContent='+
    'String(globalThis.__obfsTraceResult)+":"+__capture.join("");</script></body></html>');
  content.set('/parameter-shorthand.html','<!doctype html><html><body><div id="answer">initial</div><script type="module" src="/parameter-shorthand-entry.mjs"></script></body></html>');
  content.set('/parameter-owner.html','<!doctype html><html><body><div id="answer">initial</div><script type="module" src="/parameter-owner.mjs"></script></body></html>');
  content.set('/parameter-refusal.html','<!doctype html><html><body><div id="answer">initial</div><script type="module" src="/parameter-refusal.mjs"></script></body></html>');
  content.set('/module.html','<!doctype html><html><body><div id="answer">initial</div><script type="module" src="/entry.mjs"></script></body></html>');
  content.set('/js-module.html','<!doctype html><html><body><div id="answer">initial</div><script type="module" src="/js-entry.js"></script></body></html>');
  content.set('/default-module.html','<!doctype html><html><body><div id="answer">initial</div><script type="module" src="/default-entry.mjs"></script></body></html>');
  content.set('/reflection.html','<!doctype html><html><body><div id="answer">initial</div><script type="module" src="/reflection-entry.mjs"></script></body></html>');
  content.set('/cycle.html','<!doctype html><html><body><div id="answer">initial</div><script type="module" src="/cycle-a.mjs"></script></body></html>');
  content.set('/island.html','<!doctype html><html><body><div id="answer">initial</div>'+
    '<script type="module" src="/island-entry.mjs"></script>'+
    '<script type="module" src="/island-probe.mjs"></script></body></html>');
  content.set('/reader.html','<!doctype html><html><body><div id="answer">initial</div>'+
    '<script>window.hostApi={accept:function(value){document.getElementById("answer").textContent=String(value)}};</script>'+
    '<script type="module" src="/reader-entry.mjs"></script></body></html>');
  content.set('/pattern.html','<!doctype html><html><body><div id="answer">initial</div>'+
    '<script>window.hostApi={accept:function(value){document.getElementById("answer").textContent=String(value)}};</script>'+
    '<script type="module" src="/pattern-entry.mjs"></script></body></html>');
  content.set('/computed-pattern.html','<!doctype html><html><body><div id="answer">initial</div>'+
    '<script>window.hostApi={accept:function(value){document.getElementById("answer").textContent=String(value)}};</script>'+
    '<script type="module" src="/computed-entry.mjs"></script></body></html>');
  content.set('/factory.html','<!doctype html><html><body><div id="answer">initial</div>'+
    '<script>window.hostApi={accept:function(value){document.getElementById("answer").textContent=String(value)}};</script>'+
    '<script type="module" src="/factory-entry.mjs"></script></body></html>');
  content.set('/factory-iife.html','<!doctype html><html><body><div id="answer">initial</div>'+
    '<script>window.hostApi={accept:function(value){document.getElementById("answer").textContent=String(value)}};</script>'+
    '<script type="module" src="/factory-iife-entry.mjs"></script></body></html>');
  content.set('/container.html','<!doctype html><html><body><div id="answer">initial</div>'+
    '<script>window.hostApi={accept:function(value){document.getElementById("answer").textContent=String(value)}};</script>'+
    '<script type="module" src="/container-entry.mjs"></script></body></html>');
  content.set('/good.html','<!doctype html><html><body><div id="answer">initial</div><script src="/good.js"></script></body></html>');
  content.set('/blocked.html','<!doctype html><html><body><div id="answer">initial</div><script src="/blocked.js"></script></body></html>');
  content.set('/ipv4-alias.html','<!doctype html><html><body><div id="answer">initial</div><script src="/ipv4-alias.js"></script></body></html>');
  content.set('/rpc-good.html','<!doctype html><html><body><div id="answer">initial</div><script type="module">import remote from "/obfs/remote.mjs";try{document.getElementById("answer").textContent=await remote.score(19)}catch{document.getElementById("answer").textContent="denied"}</script></body></html>');
  content.set('/rpc-bad.html','<!doctype html><html><body><div id="answer">initial</div><script type="module">import remote from "/obfs/remote.mjs";try{document.getElementById("answer").textContent=await remote.score(19)}catch{document.getElementById("answer").textContent="denied"}</script></body></html>');
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url??'/', 'http://127.0.0.1');
    if(url.pathname.startsWith('/obfs/')){rpcHandler(request,response);return;}
    const body=content.get(url.pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    if(url.pathname==='/rpc-good.html') response.setHeader('set-cookie','session=accepted; Path=/; SameSite=Lax');
    response.setHeader('content-type',url.pathname.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');
    response.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const addr=server.address();
    if(typeof addr==='string'||!addr)throw Error('Missing TCP address');
    const base=`http://127.0.0.1:${addr.port}`;
    for(const [path,result] of [
      ['/module.html','41'],['/parameter-owner.html','42'],
      ['/parameter-shorthand.html','42'],
      ['/parameter-refusal.html','secretField'],
      ['/audited-module.html','41'],['/js-module.html','23'],
      ['/default-module.html','17,0,5'],['/reflection.html','reflection-ok'],
      ['/cycle.html','browser-cycle-ok'],
      ['/island.html','island-ok'],
      ['/reader.html','41'],
      ['/pattern.html','41'],['/computed-pattern.html','22'],
      ['/factory.html','41'],['/factory-iife.html','41'],
      ['/container.html','37'],
      ['/good.html','permitted'],['/blocked.html','initial'],
      ['/trace.html','37:browser-dormant-plaintext-canary'],
      ['/rpc-good.html','57'],['/rpc-bad.html','denied']
    ]){
      const html=await dumpDom(chromium,base+path);
      assert.match(html,new RegExp(`id="answer">${result}<`),`Browser ${path}: ${html}`);
      process.stdout.write(`Chromium PASS: ${path}: ${result}\n`);
    }
    const aliasHtml=await dumpDom(chromium,
      `http://127.1:${addr.port}/ipv4-alias.html`);
    assert.match(aliasHtml,/id="answer">alias-authorized</,
      'Chromium should canonicalize the configured IPv4 alias');
    process.stdout.write('Chromium PASS: /ipv4-alias.html: alias-authorized\n');
  }finally{await new Promise(resolve=>server.close(resolve));}
}

main().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;});
