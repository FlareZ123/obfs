'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{source:string,value:number,independent:number}} Observation */
/** @typedef {{name:string,logic:string,barrel?:string,barrel2?:string,entryPrelude?:string,importCode:string,fn:string,value:string}} Case */

const namedLogic='const owner={secretField:57};export function inspect(){return owner.secretField;}';
/** @type {Case[]} */
const cases=[
  {name:'direct-named-positive',logic:namedLogic,
    importCode:'import {inspect} from "./logic.mjs";',fn:'inspect',value:'inspect()'},
  {name:'named-reexport',logic:namedLogic,
    barrel:'export {inspect} from "./logic.mjs";',
    importCode:'import {inspect} from "./barrel.mjs";',fn:'inspect',value:'inspect()'},
  {name:'aliased-reexport',logic:namedLogic,
    barrel:'export {inspect as api} from "./logic.mjs";',
    importCode:'import {api} from "./barrel.mjs";',fn:'api',value:'api()'},
  {name:'local-aliased-reexport',logic:namedLogic,
    barrel:'import {inspect} from "./logic.mjs";export {inspect as api};',
    importCode:'import {api} from "./barrel.mjs";',fn:'api',value:'api()'},
  {name:'wildcard-reexport',logic:namedLogic,
    barrel:'export * from "./logic.mjs";',
    importCode:'import {inspect} from "./barrel.mjs";',fn:'inspect',value:'inspect()'},
  {name:'namespace-import',logic:namedLogic,
    importCode:'import * as ns from "./logic.mjs";',fn:'ns.inspect',value:'ns.inspect()'},
  {name:'default-named-function',
    logic:'const owner={secretField:57};export default function inspect(){return owner.secretField;}',
    importCode:'import inspect from "./logic.mjs";',fn:'inspect',value:'inspect()'},
  {name:'default-anonymous-function',
    logic:'const owner={secretField:57};export default function(){return owner.secretField;}',
    importCode:'import inspect from "./logic.mjs";',fn:'inspect',value:'inspect()'},
  {name:'specifier-export',
    logic:'const owner={secretField:57};function inspect(){return owner.secretField;}export {inspect};',
    importCode:'import {inspect} from "./logic.mjs";',fn:'inspect',value:'inspect()'},
  {name:'named-arrow-export',
    logic:'const owner={secretField:57};export const inspect=()=>owner.secretField;',
    importCode:'import {inspect} from "./logic.mjs";',fn:'inspect',value:'inspect()'},
  {name:'callable-factory-result',
    logic:'const owner={secretField:57};export function factory(){return function inner(){return owner.secretField;};}',
    importCode:'import {factory} from "./logic.mjs";',fn:'factory()',value:'factory()()'},
  {name:'object-method-export',
    logic:'const owner={secretField:57};export const api={inspect(){return owner.secretField;}};',
    importCode:'import {api} from "./logic.mjs";',fn:'api.inspect',value:'api.inspect()'},
  {name:'two-hop-reexport',logic:namedLogic,
    barrel:'export {inspect} from "./logic.mjs";',
    barrel2:'export {inspect as api} from "./barrel.mjs";',
    importCode:'import {api} from "./barrel2.mjs";',fn:'api',value:'api()'},
  {name:'namespace-through-reexport',logic:namedLogic,
    barrel:'export {inspect} from "./logic.mjs";',
    importCode:'import * as ns from "./barrel.mjs";',fn:'ns.inspect',value:'ns.inspect()'},
  {name:'dynamic-namespace-property-escape',logic:namedLogic,
    importCode:'import * as ns from "./logic.mjs";',entryPrelude:'const key="inspect";',
    fn:'ns[key]',value:'ns.inspect()'},
  {name:'namespace-alias-escape',logic:namedLogic,
    importCode:'import * as ns from "./logic.mjs";',entryPrelude:'const api=ns;',
    fn:'api.inspect',value:'api.inspect()'},
  {name:'namespace-reflection-escape',logic:namedLogic,
    importCode:'import * as ns from "./logic.mjs";',
    fn:'Object.values(ns)[0]',value:'ns.inspect()'},
  {name:'default-reexport',
    logic:'const owner={secretField:57};export default function inspect(){return owner.secretField;}',
    barrel:'export {default as inspect} from "./logic.mjs";',
    importCode:'import {inspect} from "./barrel.mjs";',fn:'inspect',value:'inspect()'},
  {name:'default-namespace-import',
    logic:'const owner={secretField:57};export default function inspect(){return owner.secretField;}',
    importCode:'import * as ns from "./logic.mjs";',fn:'ns.default',value:'ns.default()'}
];

/** @param {Case} spec @returns {SourceFile[]} */
function graph(spec){
  /** @type {SourceFile[]} */
  const files=[
    {path:'logic.mjs',sourceType:'module',code:spec.logic},
    {path:'pure.mjs',sourceType:'module',
      code:'const record={independentPrivate:73};export const independent=record.independentPrivate;'}
  ];
  if(spec.barrel)files.push({path:'barrel.mjs',sourceType:'module',code:spec.barrel});
  if(spec.barrel2)files.push({path:'barrel2.mjs',sourceType:'module',code:spec.barrel2});
  files.push({path:'entry.mjs',sourceType:'module',code:[
    spec.importCode,
    spec.entryPrelude??'',
    'import {independent} from "./pure.mjs";',
    'const node=document.createElement("div");',
    'node.id='+spec.fn+';',
    'console.log(JSON.stringify({source:node.id,value:'+spec.value+',independent}));'
  ].join('\n')});
  return files;
}

/** @param {SourceFile[]} files @returns {Promise<Observation>} */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-export-flow-'));
  try{
    for(const file of files)await fs.writeFile(path.join(dir,file.path),file.code);
    const host=path.join(dir,'host.mjs');
    await fs.writeFile(host,
      'globalThis.document={createElement(){let id="";return {'+
      'set id(value){id=String(value)},get id(){return id}}}};');
    const r=spawnSync(process.execPath,[
      '--import',pathToFileURL(host).href,path.join(dir,'entry.mjs')
    ],{encoding:'utf8',timeout:10000});
    if(r.error)throw r.error;
    assert.equal(r.status,0,r.stderr);
    return JSON.parse(r.stdout);
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

for(const spec of cases){
  test('ESM export/import source-observer flow: '+spec.name,async()=>{
    const originals=graph(spec);
    const result=obfuscateFiles(originals,{
      mode:'coo',seed:'agent25-esm-export-flow-'+spec.name,
      closedWorld:true,properties:true,identifiers:false,strings:false
    });
    const pure=result.files.find(file=>file.path==='pure.mjs');
    assert.ok(pure&&pure.metrics.properties>0,
      'Positive unrelated own-property obfuscation must survive source guard');
    assert.ok(!String(pure.code).includes('independentPrivate'));
    const native=await execute(originals);
    const emitted=await execute(/** @type {SourceFile[]} */(result.files));
    assert.equal(native.value,57);
    assert.equal(native.independent,73);
    assert.ok(native.source.includes('secretField'));
    assert.deepEqual(emitted,native,
      'A source-observable import/reexport chain must preserve Function source exactly');
  });
}
