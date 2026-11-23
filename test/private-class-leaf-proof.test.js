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

test('nested direct-call-only function retains class-leaf property transformation',()=>{
  const source=[
    "'use strict';",
    'function run(){',
    ' const owner={secretAlpha:23,secretBeta:7};',
    ' class Reader{read(){return owner.secretAlpha;}}',
    ' const reader=new Reader();',
    ' return reader.read()+owner.secretBeta;',
    '}',
    'module.exports=run();'
  ].join('\n');
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const result=compile(source,mode);
    assert.equal(result.metrics.properties,2,mode+': nested lexical class is private');
    assert.equal(execute(/** @type {string} */ (result.code)),execute(source));
  }
});

test('externally returned wrapper function retains exact class method source',()=>{
  const source=[
    "'use strict';",
    'function exposed(){',
    ' const owner={secretAlpha:23,secretBeta:7};',
    ' class Reader{read(){return owner.secretAlpha;}}',
    ' const reader=new Reader();',
    ' return reader.read()+owner.secretBeta;',
    '}',
    'module.exports=exposed;'
  ].join('\n');
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const result=compile(source,mode);
    assert.equal(result.metrics.properties,0,mode+': externally readable callable source');
    const before={module:{exports:null}};
    const after={module:{exports:null}};
    vm.runInNewContext(source,before,{timeout:2000});
    vm.runInNewContext(/** @type {string} */ (result.code),after,{timeout:2000});
    assert.equal(String(after.module.exports),String(before.module.exports));
  }
});

test('two independently private class instances preserve both owner-key rewrites',()=>{
  const source=positive
    .replace('const reader=new Reader();',
      'const reader=new Reader();const another=new Reader();')
    .replace('module.exports=[reader.read(),owner.secretBeta];',
      'module.exports=[reader.read(),another.read(),owner.secretBeta];');
  assert.equal(execute(source),'[23,23,7]');
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const result=compile(source,mode);
    assert.equal(result.metrics.properties,2,mode+': independent private instances');
    assert.equal(execute(/** @type {string} */(result.code)),execute(source));
  }
});

const classExpressionSource=[
  "'use strict';",
  'const owner={secretAlpha:23,secretBeta:7};',
  'const Reader=class{read(){return owner.secretAlpha;}};',
  'const first=new Reader();',
  'const second=new Reader();',
  'module.exports=[first.read(),second.read(),owner.secretBeta];'
].join('\n');

test('const-bound anonymous class expression is private for two independent instances',()=>{
  assert.equal(execute(classExpressionSource),'[23,23,7]');
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const result=compile(classExpressionSource,mode);
    assert.equal(result.metrics.properties,2,mode+': anonymous class own keys');
    assert.equal(execute(/** @type {string} */(result.code)),execute(classExpressionSource));
  }
});

test('named or mutable class expressions conservatively retain owner key spellings',()=>{
  for(const source of [
    classExpressionSource.replace('const Reader=class{','const Reader=class Internal{'),
    classExpressionSource.replace('const Reader=class{','let Reader=class{')
  ]){
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      const result=compile(source,mode);
      assert.equal(result.metrics.properties,0,mode+': unsupported class binding');
      assert.equal(execute(/** @type {string} */(result.code)),execute(source));
    }
  }
});

test('exported class expression source is externally observable',()=>{
  const source=classExpressionSource.replace(
    'module.exports=[first.read(),second.read(),owner.secretBeta];',
    'module.exports=Reader;');
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const result=compile(source,mode);
    assert.equal(result.metrics.properties,0,mode+': class escapes');
    const before={module:{exports:null}};
    const after={module:{exports:null}};
    vm.runInNewContext(source,before,{timeout:2000});
    vm.runInNewContext(/** @type {string} */(result.code),after,{timeout:2000});
    assert.equal(String(after.module.exports),String(before.module.exports));
  }
});

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
  ['second instance escapes as a value',
    'const other=new Reader();module.exports=[other,reader.read()];'],
  ['second instance method escapes',
    'const other=new Reader();module.exports=other.read;'],
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


test('cross-file ESM class source observers refuse private rewrites while private graph retains two',async()=>{
  const base=[
    'const owner={secretAlpha:23,secretBeta:7};',
    'class Reader{read(){return owner.secretAlpha;}}',
    'const reader=new Reader();',
    'const snapshot=reader.read()+owner.secretBeta;',
    'export const value=snapshot;'
  ];
  const cases=[
    {
      label:'private primitive export',
      extra:'',
      entry:'import {value} from "./state.mjs";process.stdout.write(JSON.stringify(value));',
      rewritten:2
    },
    {
      label:'direct exported method source',
      extra:'export const method=Reader.prototype.read;',
      entry:'import {value,method} from "./state.mjs";process.stdout.write(JSON.stringify([value,method.toString()]));',
      rewritten:0
    },
    {
      label:'exported method-returning closure',
      extra:'export function obtainMethod(){return Reader.prototype.read;}',
      entry:'import {value,obtainMethod} from "./state.mjs";process.stdout.write(JSON.stringify([value,String(obtainMethod())]));',
      rewritten:0
    }
  ];
  for(let index=0;index<cases.length;index++){
    const scenario=cases[index];
    /** @type {import('../src/core').SourceFile[]} */
    const files=[
      {path:'state.mjs',sourceType:'module',
        code:[...base,scenario.extra].filter(Boolean).join('\n')},
      {path:'entry.mjs',sourceType:'module',code:scenario.entry}
    ];
    const expected=await runEsm(files.map(file=>({
      path:file.path,code:/** @type {string} */(file.code)
    })));
    assert.ok(expected.length>0,scenario.label+': native response');
    for(const mode of /** @type {const} */ (['coo','sno','sco'])){
      const compiled=obfuscateFiles(files,{mode,closedWorld:true,
        seed:'class-leaf-crossfile-source/'+index+'/'+mode,
        properties:true,identifiers:false,strings:false});
      const state=compiled.files.find(file=>file.path==='state.mjs');
      assert.ok(state&&state.metrics.properties===scenario.rewritten,
        scenario.label+'/'+mode+': correct transformation count');
      assert.equal(await runEsm(compiled.files.map(file=>({
        path:file.path,code:/** @type {string} */(file.code)
      }))),expected,scenario.label+'/'+mode+': native source/value parity');
      const recovered=neutralizeHashedNames(compiled.files.map(file=>({
        path:file.path,sourceType:'module',code:/** @type {string} */(file.code)
      })));
      assert.equal(recovered.properties,scenario.rewritten,
        scenario.label+'/'+mode+': visible source-only key reconstruction count');
      assert.equal(await runEsm(recovered.files),expected,
        scenario.label+'/'+mode+': public source-only clone parity');
    }
  }
});
