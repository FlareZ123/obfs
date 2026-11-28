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
// Additional held-out heap-alias and cycle falsifiers. Baseline matrix untouched.
const cases=[
['if-alias-false-write','const carrier={instance:new WeakMap()}; const alias=carrier; if(false) alias.instance={};','carrier.instance'],
['post-if-shared-alias-weakmap','const carrier={instance:{}}; const alias=carrier; if(false) alias.instance={}; alias.instance=new WeakMap();','carrier.instance'],
['post-if-shared-alias-ordinary','const carrier={instance:new WeakMap()}; const alias=carrier; if(false) alias.instance={}; alias.instance={};','carrier.instance'],
['self-cycle-preserve-weakmap','const carrier={instance:new WeakMap()}; carrier.self=carrier; if(false) carrier.instance={};','carrier.instance'],
['self-cycle-ordinary','const carrier={instance:{}}; carrier.self=carrier; if(false) carrier.instance={};','carrier.instance'],
['post-loop-shared-alias','const carrier={instance:{}}; const alias=carrier; for(let i=0;i<0;i++) alias.instance={}; alias.instance=new WeakMap();','carrier.instance'],
['post-try-shared-alias','const carrier={instance:{}}; const alias=carrier; try{}catch{alias.instance={};} alias.instance=new WeakMap();','carrier.instance'],
['post-switch-shared-alias','const carrier={instance:{}}; const alias=carrier; switch(0){case 1:alias.instance={};break;} alias.instance=new WeakMap();','carrier.instance'],
['throw-before-unreachable-write','const carrier={instance:new WeakMap()}; try{throw 1;carrier.instance={};}catch{}','carrier.instance'],
['throw-after-weakmap-before-unreachable-write','const carrier={instance:{}};try{carrier.instance=new WeakMap();throw 1;carrier.instance={};}catch{}','carrier.instance'],
['if-disjunctive-may-alias','const root={instance:{}}; const left=root; let right=root; if(false) right={instance:{}}; left.instance=new WeakMap();','right.instance'],
['if-nested-disjunctive-alias','const root={child:{instance:{}}};const left=root.child;let right=root.child;if(false)right={instance:{}};left.instance=new WeakMap();','right.instance']
];
const tail='\nconst nativeSet=nativePrototype.set;\n'+
'nativePrototype.set=function(key,value){ document.title=value; return Reflect.apply(nativeSet,this,[key,value]); };';

for(const [name,setup,access] of cases) {
  test('CFG heap-alias semantic parity: '+name,()=>{
    const nativeShared=Function('"use strict";\n'+setup+'\nreturn Object.getPrototypeOf('+access+')===WeakMap.prototype;')();
    const mutateSource=setup+'\nconst nativePrototype=Object.getPrototypeOf('+access+');'+tail;
    const mutationAst=parse(mutateSource,'module');
    const group=hasWeakMapPrototypeExposure(mutationAst);
    const local=observesFunctionSource(mutationAst);
    const sourceFiles=[
      {path:'entry.mjs',sourceType:'module',code:entrySource},
      {path:'mutate.mjs',sourceType:'module',code:mutateSource},
      {path:'storage.mjs',sourceType:'module',code:storageSource}
    ];
    const native=run(sourceFiles);
    const evidence=[];
    for(const mode of ['coo','sco','sno']) {
      const compiled=obfuscateFiles(sourceFiles,{
        mode,seed:'agent3-cfg-carrier-'+name+'-'+mode,
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
    console.log('CFG_ALIAS '+JSON.stringify({name,nativeShared,group,local,evidence}));
    if(nativeShared) {
      assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
      assert.ok(evidence.every(row=>row.parity),JSON.stringify(evidence));
    } else {
      assert.ok(evidence.every(row=>row.parity&&row.bindings>0),JSON.stringify(evidence));
    }
  });
}

// Run the unchanged 19-case frozen CFG matrix alongside these held-out cases.
require('./agent3-weakmap-cfg-matrix.test.js');
