'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');
const {neutralizeHashedNames}=require('../sims/offline-normalize');
const {obfuscateFiles}=require('../src/core');

/**
 * @param {string} code
 * @returns {string}
 */
function execute(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{filename:'leaf.cjs',timeout:2000});
  return JSON.stringify(context.module.exports);
}

/**
 * @param {string} source
 * @param {'coo'|'sno'|'sco'} mode
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(source,mode){
  return obfuscateFiles([{
    path:'leaf.cjs',sourceType:'commonjs',code:source
  }],{mode,seed:'private-class-leaf-v1/'+mode,
    properties:true,strings:false,identifiers:false}).files[0];
}

const positive=[
  "'use strict';",
  'const owner={secretAlpha:23,secretBeta:7};',
  'class Reader{read(){return owner.secretAlpha;}}',
  'const reader=new Reader();',
  'module.exports=[reader.read(),owner.secretBeta];'
].join('\n');

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+': confined leaf class preserves native behavior and two own-field renames',()=>{
    const output=compile(positive,mode);
    assert.equal(execute(positive),'[23,7]');
    assert.equal(execute(/** @type {string} */ (output.code)),execute(positive));
    assert.equal(output.metrics.objects,1);
    assert.equal(output.metrics.properties,2);
    assert.doesNotMatch(/** @type {string} */ (output.code),/\bsecretAlpha\b|\bsecretBeta\b/u);
    const neutralized=neutralizeHashedNames([{
      path:'leaf.cjs',sourceType:'commonjs',code:/** @type {string} */ (output.code)
    }]);
    assert.equal(neutralized.properties,2,
      'A source-only attacker reconstructs both emitted private-key labels');
    assert.equal(execute(neutralized.files[0].code),execute(positive));
  });
}

const negatives=[
  ['class method escapes via bound method',
    'const escaped=reader.read;module.exports=escaped.call(reader);'],
  ['class method source is observed',
    'module.exports=reader.read.toString();'],
  ['class constructor escapes',
    'module.exports={reader,answer:reader.read()};'],
  ['class prototype is inspected',
    'module.exports=[Reader.prototype.read,reader.read()];'],
  ['instance escapes through alias',
    'const alias=reader;module.exports=alias.read();'],
  ['class has a second method',
    'module.exports=reader.read();',
    'class Reader{read(){return owner.secretAlpha;}other(){return 4;}}'],
  ['class has a getter',
    'module.exports=reader.read;',
    'class Reader{get read(){return owner.secretAlpha;}}'],
  ['class method has an extra statement',
    'module.exports=reader.read();',
    'class Reader{read(){const copy=owner.secretAlpha;return copy;}}'],
  ['two instances exist',
    'const other=new Reader();module.exports=reader.read()+other.read();'],
  ['computed method dispatch',
    'module.exports=reader["read"]();'],
  ['unproved class call arguments',
    'module.exports=reader.read();',
    undefined,
    'const reader=new Reader(13);']
];

for(const [name,body,classText,instanceText] of negatives){
  test('decline unsafe class source: '+name,()=>{
    const source=[
      "'use strict';",
      'const owner={secretAlpha:23,secretBeta:7};',
      classText??'class Reader{read(){return owner.secretAlpha;}}',
      instanceText??'const reader=new Reader();',
      body
    ].join('\n');
    for(const mode of /** @type {const} */ (['coo','sno','sco'])){
      const result=compile(source,mode);
      assert.equal(result.metrics.properties,0,mode+': '+name);
      assert.equal(execute(/** @type {string} */ (result.code)),execute(source));
    }
  });
}

/**
 * Execute a genuine ESM module graph in a separate Node.js process.
 * @param {Array<{path:string,code:string}>} files
 * @returns {Promise<string>}
 */
async function runEsm(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-class-leaf-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      cwd:root,encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('private class leaf in native multi-file ESM preserves values and key-label reconstruction',async()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:[
      'const owner={secretAlpha:23,secretBeta:7};',
      'class Reader{read(){return owner.secretAlpha;}}',
      'const reader=new Reader();',
      'const snapshot=reader.read()+owner.secretBeta;',
      'export const value=snapshot;'
    ].join('\n')},
    {path:'compute.mjs',sourceType:'module',code:[
      'import {value} from "./state.mjs";',
      'export {value};'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {value} from "./compute.mjs";',
      'process.stdout.write(value===30?"[30]":"invalid");'
    ].join('\n')}
  ];
  const native=await runEsm(files);
  assert.equal(native,'[30]');
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const compiled=obfuscateFiles(files,{mode,seed:'class-leaf-crossfile-'+mode,
      closedWorld:true,strings:false,identifiers:false});
    const state=compiled.files.find(file=>file.path==='state.mjs');
    assert.ok(state && state.metrics.properties===2,
      mode+': private leaf own fields remain transformable');
    assert.equal(await runEsm(compiled.files),native);
    const clone=neutralizeHashedNames(compiled.files.map(file=>({
      path:file.path,sourceType:'module',code:/** @type {string} */ (file.code)
    })));
    assert.ok(clone.properties>=2);
    assert.equal(await runEsm(clone.files),native);
  }
});
