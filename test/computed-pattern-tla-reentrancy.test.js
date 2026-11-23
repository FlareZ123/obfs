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
/** @typedef {{label:string,files:ModuleFile[],expectPositive:boolean}} Case */

/** @type {Case[]} */
const cases=[
  {
    label:'acyclic imported late key after producer top-level await',
    expectPositive:true,
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
    expectPositive:false,
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
    expectPositive:false,
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
function proveRewrittenOwner(files){
  const owner=files.find(file=>file.path==='state.mjs');
  const reader=files.find(file=>file.path==='main.mjs');
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
    if(fixture.expectPositive){
      assert.ok(compiled.crossFile.properties>0,
        fixture.label+' should retain a proved positive rewrite');
      proveRewrittenOwner(/** @type {ModuleFile[]} */ (compiled.files));
    }else{
      assert.equal(compiled.crossFile.properties,0,
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
