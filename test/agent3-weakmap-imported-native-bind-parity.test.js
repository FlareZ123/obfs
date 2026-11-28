'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,hasWeakMapPrototypeExposure,observesFunctionSource}=require('../src/ast');

// Existing candidate fixture, copied unchanged from test/agent1-weakmap-flow-residuals.test.js.
const storageSource=[
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){captured.set(this,value);}',
  '  });',
  '  localStorage.setItem("storage-prototype-override",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '}'
].join('\n');

const entrySource=[
  "import './mutate.mjs';",
  "export {sample} from './storage.mjs';"
].join('\n');

const runnerSource=[
  'class Storage {',
  '  constructor(){this.data=new Map();}',
  '  setItem(key,value){this.data.set(String(key),String(value));}',
  '}',
  'globalThis.Storage=Storage;',
  'globalThis.localStorage=new Storage();',
  'let documentTitle="";',
  'globalThis.document={};',
  'Object.defineProperty(globalThis.document,"title",{',
  '  get(){return documentTitle;},',
  '  set(value){documentTitle=String(value);}',
  '});',
  "const {sample}=await import('./entry.mjs');",
  'const result=sample();',
  'process.stdout.write(JSON.stringify({result,capturedSource:document.title})+"\\n");'
].join('\n');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */

/**
 * Execute the three-file ESM graph with a DOMString-compatible Document.title.
 * @param {Source[]} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function run(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-weakmap-subclass-prototype-'));
  try {
    for(const file of files)fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
    fs.writeFileSync(path.join(directory,'runner.mjs'),runnerSource,'utf8');
    const child=spawnSync(process.execPath,[path.join(directory,'runner.mjs')],{
      cwd:directory,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}


/** @type {ReadonlyArray<readonly [string,string,string]>} */
const cases=[
  ['imported-native-bind','export const nativeBind=Function.prototype.bind;',
   'const C=Reflect.apply(nativeBind,WeakMap,[null]); const carrier={instance:new C()};',
   'carrier.instance'],
  ['imported-reexported-native-bind','const local=Function.prototype.bind;export {local as nativeBind};',
   'const C=Reflect.apply(nativeBind,WeakMap,[null]); const carrier={instance:new C()};',
   'carrier.instance'],
  ['imported-native-bind-ordinary-control','export const nativeBind=Function.prototype.bind;',
   'class Ordinary{}; const C=Reflect.apply(nativeBind,Ordinary,[null]); const carrier={instance:new C()};',
   'carrier.instance']
];
const tail='\nconst nativeSet=nativePrototype.set;\n'+
'nativePrototype.set=function(key,value){ document.title=value; return Reflect.apply(nativeSet,this,[key,value]); };';

for(const [name,binderSource,setup,access] of cases) {
  test('Imported native bind three-mode parity: '+name,()=>{
    const nativeShared=Function('"use strict";const nativeBind=Function.prototype.bind;\n'+setup+'\nreturn Object.getPrototypeOf('+access+')===WeakMap.prototype;')();
    const mutateSource='import {nativeBind} from "./binder.mjs";\n'+setup+'\nconst nativePrototype=Object.getPrototypeOf('+access+');'+tail;
    const mutationAst=parse(mutateSource,'module');
    const group=hasWeakMapPrototypeExposure(mutationAst);
    const local=observesFunctionSource(mutationAst);
    const sourceFiles=[
      {path:'entry.mjs',sourceType:'module',code:entrySource},
      {path:'binder.mjs',sourceType:'module',code:binderSource},
      {path:'mutate.mjs',sourceType:'module',code:mutateSource},
      {path:'storage.mjs',sourceType:'module',code:storageSource}
    ];
    const native=run(sourceFiles);
    const evidence=[];
    for(const mode of ['coo','sco','sno']) {
      const compiled=obfuscateFiles(sourceFiles,{
        mode,seed:'agent3-imported-bind-carrier-'+name+'-'+mode,
        properties:false,identifiers:true,strings:false,closedWorld:true
      });
      const storage=compiled.files.find(file=>file.path==='storage.mjs');
      assert.ok(storage);
      const emitted=run(compiled.files.map(file=>({
        path:file.path,sourceType:'module',code:String(file.code)
      })));
      evidence.push({mode,bindings:storage.metrics.bindings,
        nativeSource:native.capturedSource,emittedSource:emitted.capturedSource,
        parity:JSON.stringify(native)===JSON.stringify(emitted)});
    }
    console.log('IMPORTED_BOUND_CARRIER '+JSON.stringify({name,nativeShared,group,local,evidence}));
    if(nativeShared) {
      assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
      assert.ok(evidence.every(row=>row.parity),JSON.stringify(evidence));
    } else {
      assert.ok(evidence.every(row=>row.parity&&row.bindings>0),JSON.stringify(evidence));
    }
  });
}
