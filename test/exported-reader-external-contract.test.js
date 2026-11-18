'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/**
 * An undeclared ESM consumer can pass a different own-data record into a
 * publicly exported helper. The local private-record call sites are not
 * enough to authorize changing that public function's property spelling.
 */
const variants=[
  {name:'direct-exported-const',
    method:'export const read=(input)=>{const value=input.secretAlpha;return value;};',
    importClause:'{get,read}'},
  {name:'named-local-reexport',
    method:'const read=(input)=>{const value=input.secretAlpha;return value;};export {read};',
    importClause:'{get,read}'},
  {name:'renamed-local-reexport',
    method:'const read=(input)=>{const value=input.secretAlpha;return value;};export {read as publicRead};',
    importClause:'{get,publicRead as read}'},
  {name:'default-local-export',
    method:'const read=(input)=>{const value=input.secretAlpha;return value;};export default read;',
    importClause:'read,{get}'},
  {name:'direct-exported-function-expression',
    method:'export const read=function(input){const value=input.secretAlpha;return value;};',
    importClause:'{get,read}'},
  {name:'exported-alias-binding',
    method:'const read=(input)=>{const value=input.secretAlpha;return value;};export const alias=read;',
    importClause:'{get,alias as read}'}
];

/**
 * Execute a genuine native ES module link using an external host file absent
 * from the compiler input. Returns behavioral value and function source.
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} sources
 * @param {string} importClause
 * @returns {Promise<{privateValue:number,externalValue:string,sourceSpelling:boolean}>}
 */
async function execute(sources,importClause){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-public-reader-'));
  try{
    for(const source of sources)await atomicWrite(path.join(folder,source.path),source.code);
    const host=[
      'import '+importClause+' from "./owner.mjs";',
      'console.log(JSON.stringify({privateValue:get(),',
      'externalValue:String(read({secretAlpha:71})),',
      'sourceSpelling:read.toString().includes("secretAlpha")}));'
    ].join('\n');
    await atomicWrite(path.join(folder,'external-host.mjs'),host);
    const child=spawnSync(process.execPath,[path.join(folder,'external-host.mjs')],{
      encoding:'utf8',cwd:folder,timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout.trim());
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
}

test('six public immutable reader export shapes preserve foreign-owner and function source contracts',async()=>{
  let checked=0;
  for(const variant of variants){
    /** @type {SourceFile[]} */
    const sources=[{path:'owner.mjs',sourceType:'module',code:[
      'const privateRecord={secretAlpha:23};',
      variant.method,
      'export const get=()=>read(privateRecord);'
    ].join('\n')}];
    const native=await execute(sources,variant.importClause);
    assert.deepEqual(native,{privateValue:23,externalValue:'71',sourceSpelling:true},
      variant.name+': native control');
    for(const mode of /** @type {const} */ (['coo','sno','sco'])){
      const generated=obfuscateFiles(sources,{
        mode,closedWorld:false,seed:'public-reader-contract-'+variant.name+'-'+mode,
        strings:false,identifiers:false
      });
      assert.equal(generated.files[0].metrics.properties,0,
        mode+'/'+variant.name+': public reader may observe a foreign own key');
      const observed=await execute(generated.files,variant.importClause);
      assert.deepEqual(observed,native,mode+'/'+variant.name+': native host contract');
      checked++;
    }
  }
  assert.equal(checked,18);
  console.log('PUBLIC_READER_EXTERNAL_CONTRACT '+JSON.stringify({
    variants:variants.map(item=>item.name),modes:['coo','sno','sco'],
    nativeAndEmittedComparisons:checked,exportedFunctionsPreserved:true
  }));
});
