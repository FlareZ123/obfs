'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} SourceFile */
/** @typedef {'function'|'arrow'|'blockArrow'|'expression'} Style */

/**
 * Generate a cross-file ESM function with one plain member read.
 * @param {Style} style
 * @param {number} index
 * @param {string} field
 * @returns {string}
 */
function reader(style,index,field) {
  const params=['a','b','c'].slice(0,index+1);
  const body=params[index]+field;
  const list=params.join(',');
  if(style==='function')return 'export function peek('+list+'){return '+body+';}';
  if(style==='arrow')return 'export const peek=('+list+')=>'+body+';';
  if(style==='blockArrow')return 'export const peek=('+list+')=>{return '+body+';};';
  return 'export const peek=function('+list+'){return '+body+';};';
}

/**
 * Run one complete module graph through Node's native ESM linker.
 * @param {string} dir
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} sources
 * @returns {Promise<string>}
 */
async function execute(dir,sources) {
  for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
    encoding:'utf8',timeout:10000
  });
  assert.equal(child.status,0,child.stderr);
  return child.stdout;
}

test('144 generated cross-file reader variants preserve native ESM behavior',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reader-matrix-'));
  try {
    let cases=0;
    const styles=/** @type {const} */ (['function','arrow','blockArrow','expression']);
    const fields=['.secretField','["secretField"]','["secret"+"Field"]'];
    for(const style of styles)for(const argIndex of [0,1,2])for(const field of fields)
      for(const aliased of [false,true])for(const value of ['17','"payload"']) {
        const args=['1','2','3'].slice(0,argIndex+1);
        args[argIndex]=aliased?'alias':'state';
        const fileName=style+'/'+argIndex+'/'+field+'/'+aliased+'/'+value;
        const code='export const state={secretField:'+value+'};'+reader(style,argIndex,field);
        const main='import {state,peek} from "./state.mjs";'+
          (aliased?'const alias=state;':'')+
          'console.log(peek('+args.join(',')+'),state.secretField);';
        /** @type {SourceFile[]} */
        const files=[
          {path:'state.mjs',sourceType:'module',code},
          {path:'main.mjs',sourceType:'module',code:main}
        ];
        const baseline=await execute(dir,files);
        const output=obfuscateFiles(files,{mode:'coo',closedWorld:true,
          seed:'reader-matrix/'+fileName,strings:false,identifiers:false});
        assert.equal(output.crossFile.properties,1,fileName);
        assert.equal(await execute(dir,output.files),baseline,fileName);
        cases++;
      }
    assert.equal(cases,144);
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
});

test('reader called on another object refuses the entire property mapping',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reader-matrix-refusal-'));
  try {
    for(const style of /** @type {const} */ (['function','arrow','blockArrow','expression'])) {
      for(const index of [0,1,2]) {
        const inputs=['1','2','3'].slice(0,index+1);
        inputs[index]='state';
        const alternate=[...inputs];
        alternate[index]='{secretField:99}';
        /** @type {SourceFile[]} */
        const files=[
          {path:'state.mjs',sourceType:'module',code:
            'export const state={secretField:17};'+reader(style,index,'.secretField')},
          {path:'main.mjs',sourceType:'module',code:
            'import {state,peek} from "./state.mjs";'+
            'console.log(peek('+inputs.join(',')+'),peek('+alternate.join(',')+'));'}
        ];
        const baseline=await execute(dir,files);
        const output=obfuscateFiles(files,{mode:'coo',closedWorld:true,
          seed:'reader-matrix-refusal/'+style+'/'+index,strings:false,identifiers:false});
        assert.equal(output.crossFile.properties,0,style+'/'+index);
        assert.equal(await execute(dir,output.files),baseline,style+'/'+index);
      }
    }
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
});
