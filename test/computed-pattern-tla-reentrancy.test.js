'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {parse,walk}=require('../src/ast');
const {ownPropertyName}=require('../src/properties');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{label:string,kind:'local'|'cross',files:ModuleFile[],expectPositive:boolean}} Case */

/** @type {Case[]} */
const cases=[
  {
    label:'acyclic imported late key after producer top-level await',
    kind:'cross',expectPositive:true,
    files:[
      {path:'state.mjs',sourceType:'module',
        code:'export const bag={secretField:41,bias:2};'+
          'await Promise.resolve();export const key="secretField";'},
      {path:'main.mjs',sourceType:'module',
        code:'import {bag,key} from "./state.mjs";'+
          'const {[key]:value}=bag;console.log(value,key);'}
    ]
  },
  {
    label:'top-level await timer callback observes owner before late key',
    kind:'cross',expectPositive:false,
    files:[
      {path:'state.mjs',sourceType:'module',
        code:'export const bag={secretField:41,bias:2};'+
          'export const observed=await new Promise(resolve=>'+
          'setTimeout(()=>resolve(Object.keys(bag).join(",")),0));'+
          'export const key="secretField";'},
      {path:'main.mjs',sourceType:'module',
        code:'import {bag,key,observed} from "./state.mjs";'+
          'const {[key]:value}=bag;console.log(value,key,observed);'}
    ]
  },
  {
    label:'acyclic imported async observer reenters during producer top-level await',
    kind:'cross',expectPositive:false,
    files:[
      {path:'observer.mjs',sourceType:'module',
        code:'export async function observe(record){'+
          'await new Promise(resolve=>setTimeout(resolve,0));'+
          'return Object.keys(record).join(",");}'},
      {path:'state.mjs',sourceType:'module',
        code:'import {observe} from "./observer.mjs";'+
          'export const bag={secretField:41,bias:2};'+
          'export const observed=await observe(bag);'+
          'export const key="secretField";'},
      {path:'main.mjs',sourceType:'module',
        code:'import {bag,key,observed} from "./state.mjs";'+
          'const {[key]:value}=bag;console.log(value,key,observed);'}
    ]
  },
  {
    label:'multi-hop named reexport with top-level await in key producer and relay',
    kind:'cross',expectPositive:true,
    files:[
      {path:'keys.mjs',sourceType:'module',
        code:'await Promise.resolve();export const key="secretField";'},
      {path:'relay.mjs',sourceType:'module',
        code:'export {key as lookup} from "./keys.mjs";await Promise.resolve();'},
      {path:'state.mjs',sourceType:'module',
        code:'export const bag={secretField:41,bias:2};'},
      {path:'main.mjs',sourceType:'module',
        code:'import {bag} from "./state.mjs";import {lookup} from "./relay.mjs";'+
          'await Promise.resolve();const {[lookup]:value}=bag;console.log(value,lookup);'}
    ]
  },
  {
    label:'cyclic ESM graph observes owner through imported async function during top-level await',
    kind:'cross',expectPositive:false,
    files:[
      {path:'state.mjs',sourceType:'module',
        code:'import {observe} from "./observer.mjs";'+
          'export const bag={secretField:41,bias:2};'+
          'export const observed=await observe(bag);'+
          'export const key="secretField";'},
      {path:'observer.mjs',sourceType:'module',
        code:'import {key} from "./state.mjs";'+
          'export async function observe(record){'+
          'await new Promise(resolve=>setTimeout(resolve,0));'+
          'return Object.keys(record).join(",");}'},
      {path:'main.mjs',sourceType:'module',
        code:'import {bag,key,observed} from "./state.mjs";'+
          'const {[key]:value}=bag;console.log(value,key,observed);'}
    ]
  },
  {
    label:'local later key after top-level await',
    kind:'local',expectPositive:true,
    files:[
      {path:'main.mjs',sourceType:'module',
        code:'const owner={secretField:41,bias:2};await Promise.resolve();'+
          'const key="secretField";const {[key]:value}=owner;console.log(value);'}
    ]
  },
  {
    label:'local timer callback observes owner before late key',
    kind:'local',expectPositive:false,
    files:[
      {path:'main.mjs',sourceType:'module',
        code:'const owner={secretField:41,bias:2};'+
          'const observed=await new Promise(resolve=>setTimeout(()=>'+
          'resolve(Object.keys(owner).join(",")),0));'+
          'const key="secretField";const {[key]:value}=owner;'+
          'console.log(value,observed);'}
    ]
  }
];

/**
 * Execute one declared ESM graph in a fresh process.
 * @param {string} directory
 * @param {ModuleFile[]} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string,signal:NodeJS.Signals|null}>}
 */
async function execute(directory,files){
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
    encoding:'utf8',timeout:5000
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr,signal:child.signal};
}

/**
 * Assert that the owner fields and the computed consumer key were actually
 * rewritten, rather than relying on a positive counter alone.
 * @param {ModuleFile[]} files
 * @returns {void}
 */
function proveRewrittenOwner(files,ownerPath='state.mjs',readerPath='main.mjs'){
  const owner=files.find(file=>file.path===ownerPath);
  const reader=files.find(file=>file.path===readerPath);
  assert.ok(owner&&reader);
  /** @type {string[]} */
  const fields=[];
  walk(parse(owner.code,'module'),node=>{
    if(node.type!=='ObjectExpression')return;
    for(const property of node.properties){
      if(property.type!=='Property')continue;
      const name=ownPropertyName(property);
      if(name!==null)fields.push(name);
    }
  });
  assert.equal(fields.length,2);
  assert.ok(fields.every(name=>name!=='secretField'&&name!=='bias'),
    'Both private owner fields must be renamed');
  let computedName;
  walk(parse(reader.code,'module'),(node,parent)=>{
    if(node.type==='Property'&&parent?.type==='ObjectPattern'&&node.computed&&
       node.key.type==='Literal'&&typeof node.key.value==='string'){
      computedName=node.key.value;
    }
  });
  assert.ok(computedName&&fields.includes(computedName),
    'The computed consumer key must match a rewritten owner field');
}

for(const [index,fixture] of cases.entries()){
  test('top-level-await computed owner parity: '+fixture.label,async()=>{
    const compiled=obfuscateFiles(fixture.files,{
      mode:'coo',closedWorld:true,identifiers:false,strings:false,
      seed:'computed-tla-reentrancy/'+index
    });
    const yieldCount=fixture.kind==='cross'?compiled.crossFile.properties:
      compiled.files.reduce((sum,file)=>sum+(file.metrics?.objects??0),0);
    if(fixture.expectPositive){
      assert.ok(yieldCount>0,
        fixture.label+' should retain a proved positive rewrite');
      proveRewrittenOwner(/** @type {ModuleFile[]} */ (compiled.files),
        fixture.kind==='local'?'main.mjs':'state.mjs','main.mjs');
    }else{
      assert.equal(yieldCount,0,
        fixture.label+' must refuse an owner observable before key initialization');
    }
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-computed-tla-'));
    try{
      const original=await execute(path.join(directory,'original'),fixture.files);
      assert.equal(original.status,0,original.stderr);
      const generated=await execute(path.join(directory,'generated'),
        /** @type {ModuleFile[]} */ (compiled.files));
      assert.deepEqual(generated,original);
    }finally{
      await fs.rm(directory,{recursive:true,force:true});
    }
  });
}
