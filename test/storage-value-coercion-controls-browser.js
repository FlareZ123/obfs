'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {fixtures}=require('./storage-value-coercion-fixtures');

/** @type {Array<keyof typeof fixtures>} */
const caseNames=['ownToString','ownSymbolToPrimitive','directBypass','prototypeOverride','patchedFunctionToString'];
/** @type {Map<string,string>} */
const bodies=new Map();
/** @type {Record<string,any>} */
const metrics={};

for(const name of caseNames) {
  const source=fixtures[name];
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',
    seed:'storage-value-hooks/'+name,
    properties:false,
    identifiers:true,
    strings:false
  });
  const file=result.files[0];
  if(!file)throw Error('Expected emitted '+name+' module');
  const emitted=String(file.code);
  metrics[name]=file.metrics;
  if(name==='ownToString'||name==='prototypeOverride') {
    assert.ok(file.metrics.bindings>=2,name+': expected positive private rewrite yield');
    assert.ok(!emitted.includes('privateLocal'));
    assert.ok(!emitted.includes('independentLocal'));
  } else {
    assert.equal(file.metrics.bindings,0,name+': expected current conservative refusal');
    assert.ok(emitted.includes('privateLocal'),name);
    assert.ok(emitted.includes('independentLocal'),name);
  }
  bodies.set('/native-'+name+'.mjs',source);
  bodies.set('/compiled-'+name+'.mjs',emitted);
}

const sourceObserverCases=[
  {name:'destructuredLocal',setup:'const {setItem}=localStorage;'},
  {name:'destructuredPrototype',setup:'const {setItem}=Storage.prototype;'},
  {name:'descriptorValue',setup:"const setItem=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem').value;"},
  {name:'reflectGet',setup:"const setItem=Reflect.get(Storage.prototype,'setItem');"},
  {name:'assignmentDestructured',setup:'let setItem; ({setItem}=localStorage);'},
  {name:'descriptorAliasChain',setup:"const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem'); const setItem=descriptor.value;"},
  {name:'reflectGetAlias',setup:"const get=Reflect.get; const setItem=get(Storage.prototype,'setItem');"},
  {name:'descriptorReaderAlias',setup:"const descriptorReader=Object.getOwnPropertyDescriptor; const setItem=descriptorReader(Storage.prototype,'setItem').value;"},
  {name:'descriptorValueDestructure',setup:"const {value:setItem}=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem');"}
];
for(const {name,setup:methodSetup} of sourceObserverCases) {
  const source=[
    'const owner={secretField:7};',
    methodSetup,
    'export function outer(){',
    " const internal=()=>{const x=owner.secretField;setItem.call(localStorage,'agent10-" + name + "',new.target);return x;};",
    ' return {result:internal()};',
    '}'
  ].join('\n');
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',seed:'storage-source-observer/'+name,
    properties:true,identifiers:false,strings:false
  });
  const file=result.files[0];
  if(!file)throw Error('Expected emitted Storage source-observer '+name+' module');
  assert.equal(file.metrics.properties,0,
    name+': source-observer must decline owner property renaming');
  bodies.set('/native-source-'+name+'.mjs',source);
  bodies.set('/compiled-source-'+name+'.mjs',String(file.code));
  metrics['sourceObserver/'+name]=file.metrics;
}
const crossFileStorageSource='const {setItem}=localStorage; export {setItem};';
const crossFileAppSource=[
  "import {setItem} from './storage.mjs';",
  'const owner={secretField:7};',
  'export function outer(){',
  " const internal=()=>{const x=owner.secretField;setItem.call(localStorage,'agent10-cross-file',new.target);return x;};",
  ' return {result:internal()};',
  '}'
].join('\n');
const crossFileResult=obfuscateFiles([
  {path:'storage.mjs',sourceType:'module',code:crossFileStorageSource},
  {path:'app.mjs',sourceType:'module',code:crossFileAppSource}
],{
  mode:'coo',closedWorld:true,seed:'storage-source-observer/cross-file',
  properties:true,identifiers:false,strings:false
});
const crossStorageFile=crossFileResult.files.find(file=>file.path==='storage.mjs');
const crossAppFile=crossFileResult.files.find(file=>file.path==='app.mjs');
if(!crossStorageFile||!crossAppFile)throw Error('Expected emitted cross-file Storage modules');
assert.equal(crossAppFile.metrics.properties,0,
  'cross-file imported Storage method must block property renaming');
bodies.set('/native-cross/storage.mjs',crossFileStorageSource);
bodies.set('/native-cross/app.mjs',crossFileAppSource);
bodies.set('/compiled-cross/storage.mjs',String(crossStorageFile.code));
bodies.set('/compiled-cross/app.mjs',String(crossAppFile.code));
metrics['sourceObserver/crossFile']=crossAppFile.metrics;

async function main() {
  const html=[
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<pre id="result">pending</pre><script type="module">',
    'try {',
    '  const names='+JSON.stringify(caseNames)+';',
    '  const nativeSetItem=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem")?.value;',
    '  if(typeof nativeSetItem!=="function"||localStorage.setItem!==nativeSetItem||sessionStorage.setItem!==nativeSetItem)',
    '    throw Error("Expected pristine inherited native Storage.setItem dispatch");',
    '  if(!Function.prototype.toString.call(nativeSetItem).includes("[native code]"))',
    '    throw Error("Storage.setItem was not native in the witness realm");',
    '  const report={nativeStorageIdentity:true,cases:{}};',
    '  report.sourceObservers={};',
    '  const observerNames='+JSON.stringify(sourceObserverCases.map(item=>item.name))+';',
    '  for(const name of observerNames){',
    '    localStorage.clear();',
    '    const nativeModule=await import("/native-source-"+name+".mjs");',
    '    const nativeResult=new nativeModule.outer();',
    '    const nativeStored=localStorage.getItem("agent10-"+name);',
    '    localStorage.clear();',
    '    const compiledModule=await import("/compiled-source-"+name+".mjs");',
    '    const compiledResult=new compiledModule.outer();',
    '    const compiledStored=localStorage.getItem("agent10-"+name);',
    '    const equal=nativeResult.result===7&&compiledResult.result===7&&',
    '      nativeStored===compiledStored&&nativeStored.includes("secretField")&&',
    '      compiledStored.includes("secretField");',
    '    report.sourceObservers[name]={nativeResult:nativeResult.result,compiledResult:compiledResult.result,',
    '      nativeHasOriginal:nativeStored.includes("secretField"),compiledHasOriginal:compiledStored.includes("secretField"),equal};',
    '    if(!equal)throw Error("Storage source-observer mismatch "+name+" "+JSON.stringify(report.sourceObservers[name]));',
    '  }',
    '  localStorage.clear();',
    '  const nativeCrossModule=await import("/native-cross/app.mjs");',
    '  const nativeCrossResult=new nativeCrossModule.outer();',
    '  const nativeCrossStored=localStorage.getItem("agent10-cross-file");',
    '  localStorage.clear();',
    '  const compiledCrossModule=await import("/compiled-cross/app.mjs");',
    '  const compiledCrossResult=new compiledCrossModule.outer();',
    '  const compiledCrossStored=localStorage.getItem("agent10-cross-file");',
    '  const crossEqual=nativeCrossResult.result===7&&compiledCrossResult.result===7&&',
    '    nativeCrossStored===compiledCrossStored&&nativeCrossStored.includes("secretField")&&',
    '    compiledCrossStored.includes("secretField");',
    '  report.sourceObservers.crossFile={nativeResult:nativeCrossResult.result,compiledResult:compiledCrossResult.result,',
    '    nativeHasOriginal:nativeCrossStored.includes("secretField"),compiledHasOriginal:compiledCrossStored.includes("secretField"),equal:crossEqual};',
    '  if(!crossEqual)throw Error("Cross-file Storage source-observer mismatch "+JSON.stringify(report.sourceObservers.crossFile));',
    '  for(const name of names){',
    '    const nativeModule=await import("/native-"+name+".mjs");',
    '    const compiledModule=await import("/compiled-"+name+".mjs");',
    '    localStorage.clear();sessionStorage.clear();',
    '    const native=nativeModule.sample();',
    '    localStorage.clear();sessionStorage.clear();',
    '    const compiled=compiledModule.sample();',
    '    const valuesPreserved=native.value===29&&compiled.value===29&&',
    '      native.independent===7&&compiled.independent===7;',
    '    if(!valuesPreserved)throw Error(name+": runtime values changed "+JSON.stringify({native,compiled}));',
    '    if(name==="ownToString"){',
    '      if(native.stored!=="value"||compiled.stored!=="value"||',
    '         native.hookCalls!==1||compiled.hookCalls!==1||',
    '         !native.receiverMatched||!compiled.receiverMatched)',
    '        throw Error("own toString hook did not intercept native DOMString conversion "+JSON.stringify({native,compiled}));',
    '    }',
    '    if(name==="ownSymbolToPrimitive"){',
    '      if(native.stored!=="storage-own-symbol-value"||compiled.stored!=="storage-own-symbol-value"||',
    '         native.hint!=="string"||compiled.hint!=="string"||',
    '         native.hookCalls!==1||compiled.hookCalls!==1||',
    '         !native.receiverMatched||!compiled.receiverMatched)',
    '        throw Error("own Symbol.toPrimitive hook did not receive string hint "+JSON.stringify({native,compiled}));',
    '    }',
    '    if(name==="directBypass"){',
    '      if(native.stored!==compiled.stored||!native.stored.includes("privateLocal")||',
    '         native.hookCalls!==0||compiled.hookCalls!==0)',
    '        throw Error("Function.prototype.toString.call did not bypass own toString "+JSON.stringify({native,compiled}));',
    '    }',
    '    if(name==="prototypeOverride"){',
    '      if(!native.sameReference||!compiled.sameReference||',
    '         native.storageValue!==null||compiled.storageValue!==null)',
    '        throw Error("prototype override did not retain the exact callable without native string storage "+JSON.stringify({native,compiled}));',
    '    }',
    '    if(name==="patchedFunctionToString"){',
    '      if(native.stored!==compiled.stored||!native.stored.includes("privateLocal")||',
    '         native.hookCalls!==1||compiled.hookCalls!==1)',
    '        throw Error("patched Function.prototype.toString did not expose function source "+JSON.stringify({native,compiled}));',
    '    }',
    '    report.cases[name]={native,compiled,equal:JSON.stringify(native)===JSON.stringify(compiled)};',
    '    if(!report.cases[name].equal)throw Error(name+": native/emitted values differ");',
    '  }',
    '  document.getElementById("result").textContent="PASS "+JSON.stringify(report);',
    '} catch(error) {',
    '  document.getElementById("result").textContent="FAIL "+String(error.stack||error);',
    '}',
    '</script></body></html>'
  ].join('\n');
  bodies.set('/',html);

  const server=http.createServer((request,response)=>{
    const body=bodies.get(request.url??'');
    if(body===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':request.url==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected local TCP server');
    const chrome=process.env.CHROMIUM_BIN??'chromium';
    const args=['--headless','--no-sandbox','--disable-gpu',
      '--disable-dev-shm-usage','--no-first-run',
      '--virtual-time-budget=6000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/'];
    const {stdout,stderr}=await promisify(execFile)(chrome,args,{
      timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'
    });
    assert.match(stdout,/<pre id="result">PASS /,String(stderr));
    const match=stdout.match(/<pre id="result">PASS ([\s\S]*?)<\/pre>/);
    assert.ok(match,'Expected rendered Storage conversion result');
    const summary=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
    console.log(JSON.stringify({browser:'Chromium',metrics,summary}));
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
