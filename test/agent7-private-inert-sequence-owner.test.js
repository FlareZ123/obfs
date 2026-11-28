'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @param {string} code @returns {string} */
function executeCjs(code){
  const context={module:{exports:/** @type {unknown} */ (undefined)}};
  vm.runInNewContext(code,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} expression @returns {string} */
function privateSequence(expression) {
  return 'const owner={privateKey:17,otherKey:5};'+
    'const alias='+expression+';'+
    'module.exports=[alias.privateKey,alias.otherKey+3];';
}

const inertAliases=[
  '(0,owner)',
  '(true,false,owner)',
  '("ignored",null,owner)',
  '(0n,owner)'
];

test('inert comma expression preserves owner identity and permits both property renames',()=>{
  for(const expression of inertAliases){
    const original=privateSequence(expression);
    const native=executeCjs(original);
    assert.equal(native,'[17,8]');
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      const out=obfuscateFiles([{path:'inert-owner.cjs',sourceType:'commonjs',code:original}],{
        mode,seed:'inert-private-sequence/'+expression+'/'+mode,
        identifiers:false,strings:false,properties:true
      });
      const emitted=out.files[0];
      assert.equal(emitted.metrics.properties,2,
        mode+' must rewrite two proven private properties through '+expression);
      assert.equal(executeCjs(String(emitted.code)),native,
        mode+' exact native output through '+expression);
      assert.doesNotMatch(String(emitted.code),/privateKey|otherKey/u);
    }
  }
});

test('side-effectful or escaping comma expressions remain unchanged',()=>{
  const unsafe=[
    'const owner={privateKey:17};const alias=(globalThis.leaked=owner,owner);'+
      'module.exports=Object.keys(globalThis.leaked);',
    'const owner={privateKey:17};const alias=(unknown(),owner);'+
      'module.exports=alias.privateKey;',
    'const owner={privateKey:17};const alias=(owner,0);'+
      'module.exports=Object.keys(owner);',
    'const owner={privateKey:17};const alias=(0,owner);'+
      'module.exports=alias;',
    'const owner={privateKey:17};const alias=(0,owner);'+
      'module.exports=Object.keys(alias);'
  ];
  for(const source of unsafe){
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      const out=obfuscateFiles([{path:'unsafe-owner.cjs',sourceType:'commonjs',code:source}],{
        mode,seed:'unsafe-private-sequence/'+mode,identifiers:false,strings:false
      });
      assert.equal(out.files[0].metrics.properties,0,
        mode+' must not rewrite escaped or reflected fields');
      if(!source.includes('unknown()'))
        assert.equal(executeCjs(String(out.files[0].code)),executeCjs(source));
    }
  }
});

/** @param {SourceFile[]} files @returns {Promise<string>} */
async function executeEsm(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sequence-owner-'));
  try{
    for(const file of files)await fs.writeFile(path.join(root,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      cwd:root,encoding:'utf8',timeout:12000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  } finally {await fs.rm(root,{recursive:true,force:true});}
}

test('three-module ESM allows private inert-sequence aliases without changing exported API',async()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'core.mjs',sourceType:'module',
      code:'const owner={privateKey:17,otherKey:5};'+
        'const alias=(0,owner);'+
        'export function value(){return alias.privateKey+alias.otherKey;}'},
    {path:'middleware.mjs',sourceType:'module',
      code:'import {value} from "./core.mjs";export const answer=value()+9;'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {answer} from "./middleware.mjs";console.log(answer);'}
  ];
  const native=await executeEsm(files);
  assert.equal(native,'31');
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const output=obfuscateFiles(files,{mode,seed:'inert-owner-3file/'+mode,
      closedWorld:true,identifiers:false,strings:false});
    const selected=output.files.find(x=>x.path==='core.mjs');
    assert.ok(selected,'Expected source module');
    assert.equal(selected.metrics.properties+output.crossFile.properties,2,
      mode+' still rewrites two local own keys');
    assert.equal(await executeEsm(/** @type {SourceFile[]} */(output.files)),native);
  }
});
