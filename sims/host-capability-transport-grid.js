'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */
/** @typedef {{label:string,transport:string}} Case */

/**
 * Independently chosen source-visible transports of a runtime-supplied
 * function. An external preloader can import the static owner and observe
 * the original own-field spelling when the delivered JS invokes it.
 * This is an adversarial host-envelope measurement, not a theorem about
 * all valid source-only / pristine-host executions.
 * @type {Case[]}
 */
const cases=[
  {label:'direct-global-call',transport:'globalThis.HOST_BRIDGE();'},
  {label:'reflect-apply',transport:'Reflect.apply(globalThis.HOST_BRIDGE,null,[]);'},
  {label:'promise-then',transport:'Promise.resolve().then(globalThis.HOST_BRIDGE);'},
  {label:'queue-microtask',transport:'queueMicrotask(globalThis.HOST_BRIDGE);'},
  {label:'new-promise-executor',transport:'new Promise(globalThis.HOST_EXECUTOR);'},
  {label:'direct-host-construction',transport:'new globalThis.HOST_BRIDGE();'},
  {label:'alias-host-construction',transport:'const cb=globalThis.HOST_BRIDGE;new cb();'},
  {label:'assigned-local-host',transport:'let cb;cb=globalThis.HOST_BRIDGE;cb();'},
  {label:'array-destructure-host',transport:'const [cb]=[globalThis.HOST_BRIDGE];cb();'},
  {label:'array-literal-read',transport:'const cb=[globalThis.HOST_BRIDGE][0];cb();'},
  {label:'sequence-host',transport:'const cb=(0,globalThis.HOST_BRIDGE);cb();'},
  {label:'nullish-host',transport:'const cb=globalThis.HOST_BRIDGE??(()=>0);cb();'},
  {label:'logical-host',transport:'const cb=globalThis.HOST_BRIDGE||(()=>0);cb();'},
  {label:'promise-resolve-argument',transport:'Promise.resolve(globalThis.HOST_BRIDGE).then(cb=>cb());'},
  {label:'map-container',transport:"const map=new Map([['a',globalThis.HOST_BRIDGE]]);map.get('a')();"},
  {label:'object-values',transport:'const cb=Object.values({bridge:globalThis.HOST_BRIDGE})[0];cb();'},
  {label:'object-freeze',transport:'const holder=Object.freeze({bridge:globalThis.HOST_BRIDGE});holder.bridge();'},
  {label:'closure-return',transport:'const getter=()=>globalThis.HOST_BRIDGE;getter()();'},
  {label:'bind-host',transport:'const cb=globalThis.HOST_BRIDGE.bind(null);cb();'},
  {label:'reflect-get-alias',transport:'const cb=Reflect.get(globalThis,"HOST_BRIDGE");cb();'},
  {label:'object-literal-host',transport:'const holder={bridge:globalThis.HOST_BRIDGE};holder.bridge();'},
  {label:'object-literal-aliased-host',transport:'const cb=globalThis.HOST_BRIDGE;const holder={bridge:cb};holder.bridge();'}
];

/**
 * @param {Case} item
 * @returns {Source[]}
 */
function graph(item){
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){',
      '  return {keys:Reflect.ownKeys(schema).sort(),',
      '    value:schema[key],',
      '    enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true};',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      "const result=inspectRecord('externalFormat');",
      item.transport,
      'await Promise.resolve();',
      'const observed=await globalThis.HOST_OBSERVATION;',
      'console.log(JSON.stringify([state.secretField,result.value,observed]));'
    ].join('\n')}
  ];
}

/**
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<unknown[]>}
 */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-host-transport-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preload=[
      "'use strict';",
      "const path=require('node:path');",
      "const {pathToFileURL}=require('node:url');",
      "const uri=pathToFileURL(path.join(__dirname,'state.mjs')).href;",
      'globalThis.HOST_BRIDGE=function(){',
      '  const operation=import(uri).then(ns=>Object.keys(ns.state));',
      '  globalThis.HOST_OBSERVATION=operation;',
      '  return operation;',
      '};',
      'globalThis.HOST_EXECUTOR=function(resolve,reject){',
      '  globalThis.HOST_BRIDGE().then(resolve,reject);',
      '};'
    ].join('\n');
    const loader=path.join(root,'preload.cjs');
    await atomicWrite(loader,preload);
    const child=spawnSync(process.execPath,['--require',loader,path.join(root,'entry.mjs')],{
      encoding:'utf8',timeout:20000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return /** @type {unknown[]} */ (JSON.parse(child.stdout.trim()));
  } finally {
    await fs.rm(root,{force:true,recursive:true});
  }
}

/** @returns {Promise<void>} */
async function main(){
  const rows=[];
  for(const item of cases){
    const files=graph(item);
    const native=await execute(files);
    assert.deepEqual(native,[41,'audit-v1',['secretField']],
      'Original host fixture unexpectedly changed for '+item.label);
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'host-transport-'+item.label,
      identifiers:false,strings:false,properties:true
    });
    const delivered=await execute(compiled.files);
    const equal=JSON.stringify(native)===JSON.stringify(delivered);
    const propertyCount=compiled.crossFile.properties;
    const outcome=propertyCount===0 ? 'declined' : equal ? 'transformed-equal' : 'host-observed-rename';
    rows.push({label:item.label,properties:propertyCount,equal,outcome,
      observedKeys:delivered[2]});
    process.stdout.write(JSON.stringify(rows[rows.length-1])+'\n');
  }
  const summary={
    cases:rows.length,
    refused:rows.filter(r=>r.outcome==='declined').length,
    transformedEqual:rows.filter(r=>r.outcome==='transformed-equal').length,
    transformedWithHostObservedRename:rows.filter(r=>r.outcome==='host-observed-rename').length
  };
  process.stdout.write('SUMMARY '+JSON.stringify(summary)+'\n');
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error?.stack??error)+'\n');
  process.exitCode=1;
});

module.exports={cases,graph,execute,main};
