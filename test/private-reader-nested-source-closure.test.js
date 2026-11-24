'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Execute a small multi-file ESM graph and return the observer's JSON output.
 * @param {Array<{path:string,sourceType:string,code:string}>} files
 * @returns {Promise<string>}
 */
async function runEsm(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-nested-reader-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/**
 * Run a CommonJS program with a sloppy host callback that captures the active
 * helper through arguments.callee.caller, then return the observed source.
 * @param {string} code
 * @returns {{value:unknown,source:string|null}}
 */
function runAmbientCaller(code){
  const observation={caller:null};
  const getExternal=Function('observation',
    'return function external(){observation.caller=arguments.callee.caller;}'
  )(observation);
  const context={module:{exports:null},getExternal};
  vm.runInNewContext(code,context,{timeout:1000});
  const publicReader=/** @type {()=>unknown} */ (context.module.exports);
  const value=publicReader();
  return {
    value,
    source:observation.caller?
      Function.prototype.toString.call(observation.caller):null
  };
}

const nestedFunctionReader=[
  {path:'api.mjs',sourceType:'module',code:[
    'const root={secretAlpha:23};',
    'export function calculate(){',
    '  function read(ownerAlpha){return ownerAlpha.secretAlpha;}',
    '  return read(root);',
    '}'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {calculate} from "./api.mjs";',
    'process.stdout.write(JSON.stringify({value:calculate(),source:calculate.toString()}));'
  ].join('\n')}
];

const nestedArrowReader=[
  {path:'api.mjs',sourceType:'module',code:[
    'const root={secretAlpha:23};',
    'export function calculate(){',
    '  const read=(ownerAlpha)=>ownerAlpha.secretAlpha;',
    '  return read(root);',
    '}'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {calculate} from "./api.mjs";',
    'process.stdout.write(JSON.stringify({value:calculate(),source:calculate.toString()}));'
  ].join('\n')}
];

const ownerInsideCaller=[
  {path:'api.mjs',sourceType:'module',code:[
    'function read(ownerAlpha){return ownerAlpha.secretAlpha;}',
    'export function calculate(){',
    '  const root={secretAlpha:23};',
    '  return read(root);',
    '}'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {calculate} from "./api.mjs";',
    'process.stdout.write(JSON.stringify({value:calculate(),source:calculate.toString()}));'
  ].join('\n')}
];

const nestedClassAmbientCaller=[
  'function hidden(){',
  '  const owner={secretField:7};',
  '  class Reader{read(){return owner.secretField;}}',
  '  const reader=new Reader();',
  '  getExternal();',
  '  return reader.read();',
  '}',
  'function publicReader(){return hidden();}',
  'module.exports=publicReader;'
].join('\n');

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  test(mode+' nested function reader must not rewrite its exported caller source',async()=>{
    const native=await runEsm(nestedFunctionReader);
    const transformed=obfuscateFiles(nestedFunctionReader,{
      mode,closedWorld:true,seed:'nested-function-reader/'+mode,
      strings:false,identifiers:false
    });
    const output=transformed.files.find(file=>file.path==='api.mjs');
    assert.ok(output);
    assert.equal(output.metrics.properties,0,
      mode+': nested reader source is included in calculate.toString()');
    assert.equal(await runEsm(transformed.files),native);
  });

  test(mode+' nested arrow reader must not rewrite its exported caller source',async()=>{
    const native=await runEsm(nestedArrowReader);
    const transformed=obfuscateFiles(nestedArrowReader,{
      mode,closedWorld:true,seed:'nested-arrow-reader/'+mode,
      strings:false,identifiers:false
    });
    const output=transformed.files.find(file=>file.path==='api.mjs');
    assert.ok(output);
    assert.equal(output.metrics.properties,0,
      mode+': nested arrow source is included in calculate.toString()');
    assert.equal(await runEsm(transformed.files),native);
  });

  test(mode+' owner literal inside exported caller must not be rewritten via top-level reader',async()=>{
    const native=await runEsm(ownerInsideCaller);
    const transformed=obfuscateFiles(ownerInsideCaller,{
      mode,closedWorld:true,seed:'owner-inside-caller/'+mode,
      strings:false,identifiers:false
    });
    const output=transformed.files.find(file=>file.path==='api.mjs');
    assert.ok(output);
    assert.equal(output.metrics.properties,0,
      mode+': owner literal spelling is part of calculate.toString()');
    assert.equal(await runEsm(transformed.files),native);
  });

  test(mode+' nested class method must not rewrite source of an ambiently observed outer helper',()=>{
    const native=runAmbientCaller(nestedClassAmbientCaller);
    const transformed=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:nestedClassAmbientCaller
    }],{
      mode,seed:'nested-class-ambient-caller/'+mode,
      strings:false,identifiers:false
    }).files[0];
    assert.equal(transformed.metrics.properties,0,
      mode+': nested class method source is included in hidden.toString()');
    const emitted=runAmbientCaller(String(transformed.code));
    assert.equal(emitted.value,native.value);
    assert.equal(emitted.source,native.source);
    assert.ok(emitted.source);
  });
}


/**
 * Execute a CommonJS module exporting an outer class whose static block
 * contains a private nested class. The outer constructor's native source is
 * an externally observable container for the nested method source.
 * @param {string} code
 * @returns {{value:unknown,source:string}}
 */
function runOuterClassSource(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  const Outer=/** @type {Function & {observed?:unknown}} */ (context.module.exports);
  return {value:Outer.observed,source:Function.prototype.toString.call(Outer)};
}

const nestedStaticBlockClass=[
  'class Outer{',
  '  static{',
  '    const owner={secretField:7};',
  '    class Reader{read(){return owner.secretField;}}',
  '    const reader=new Reader();',
  '    this.observed=reader.read();',
  '  }',
  '}',
  'module.exports=Outer;'
].join('\n');

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  test(mode+' nested class in an outer static block must preserve outer class source',()=>{
    const native=runOuterClassSource(nestedStaticBlockClass);
    const transformed=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:nestedStaticBlockClass
    }],{
      mode,seed:'nested-static-block-class/'+mode,
      strings:false,identifiers:false
    }).files[0];
    assert.equal(transformed.metrics.properties,0,
      mode+': nested class source is embedded in Outer.toString()');
    const emitted=runOuterClassSource(String(transformed.code));
    assert.equal(emitted.value,native.value);
    assert.equal(emitted.source,native.source);
  });
}


/**
 * A function declaration inside an exported class's static block is part of
 * the class's observable source, even when the function and its instance
 * arguments are otherwise direct-call-only.
 */
const nestedStaticBlockFunctionReader=[
  'class Outer{',
  '  static{',
  '    const owner={secretField:7};',
  '    function read(ownerAlpha){return ownerAlpha.secretField;}',
  '    this.observed=read(owner);',
  '  }',
  '}',
  'module.exports=Outer;'
].join('\n');

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  test(mode+' nested function reader in an outer static block must preserve outer class source',()=>{
    const native=runOuterClassSource(nestedStaticBlockFunctionReader);
    const transformed=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:nestedStaticBlockFunctionReader
    }],{
      mode,seed:'nested-static-block-function-reader/'+mode,
      strings:false,identifiers:false
    }).files[0];
    assert.equal(transformed.metrics.properties,0,
      mode+': nested function reader source is embedded in Outer.toString()');
    const emitted=runOuterClassSource(String(transformed.code));
    assert.equal(emitted.value,native.value);
    assert.equal(emitted.source,native.source);
  });
}


const nestedStaticBlockArrowReader=[
  'class Outer{',
  '  static{',
  '    const owner={secretField:7};',
  '    const read=(ownerAlpha)=>ownerAlpha.secretField;',
  '    this.observed=read(owner);',
  '  }',
  '}',
  'module.exports=Outer;'
].join('\n');

const nestedStaticBlockDirectArrowReader=[
  'class Outer{',
  '  static{',
  '    const owner={secretField:7};',
  '    this.observed=(()=>owner.secretField)();',
  '  }',
  '}',
  'module.exports=Outer;'
].join('\n');

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  for(const [label,code] of [
    ['nested arrow binding',nestedStaticBlockArrowReader],
    ['direct invoked arrow',nestedStaticBlockDirectArrowReader]
  ]){
    test(mode+' '+label+' inside an outer static block must preserve outer class source',()=>{
      const native=runOuterClassSource(code);
      const transformed=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code
      }],{
        mode,seed:'nested-static-block-arrow-reader/'+mode+'/'+label,
        strings:false,identifiers:false
      }).files[0];
      assert.equal(transformed.metrics.properties,0,
        mode+': '+label+' source is embedded in Outer.toString()');
      const emitted=runOuterClassSource(String(transformed.code));
      assert.equal(emitted.value,native.value);
      assert.equal(emitted.source,native.source);
    });
  }
}


const nestedStaticBlockFunctionExpressionReader=[
  'class Outer{',
  '  static{',
  '    const owner={secretField:7};',
  '    const read=function(ownerAlpha){return ownerAlpha.secretField;};',
  '    this.observed=read(owner);',
  '  }',
  '}',
  'module.exports=Outer;'
].join('\n');

const nestedStaticBlockClassExpressionReader=[
  'const Outer=class Outer{',
  '  static{',
  '    const owner={secretField:7};',
  '    function read(ownerAlpha){return ownerAlpha.secretField;}',
  '    this.observed=read(owner);',
  '  }',
  '};',
  'module.exports=Outer;'
].join('\n');

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  for(const [label,code] of [
    ['nested function expression',nestedStaticBlockFunctionExpressionReader],
    ['outer class expression',nestedStaticBlockClassExpressionReader]
  ]){
    test(mode+' '+label+' inside class source must preserve outer class source',()=>{
      const native=runOuterClassSource(code);
      const transformed=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code
      }],{
        mode,seed:'nested-class-expression-source/'+mode+'/'+label,
        strings:false,identifiers:false
      }).files[0];
      assert.equal(transformed.metrics.properties,0,
        mode+': '+label+' source is embedded in Outer.toString()');
      const emitted=runOuterClassSource(String(transformed.code));
      assert.equal(emitted.value,native.value);
      assert.equal(emitted.source,native.source);
    });
  }
}
