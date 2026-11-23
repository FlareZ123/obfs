'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Run CommonJS source and observe both the exported callable's behavior and
 * its externally visible native source text.
 * @param {string} source
 * @param {'function'|'method'} kind
 * @returns {{value:unknown,source:string}}
 */
function observeExport(source,kind) {
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  const exported=context.module.exports;
  const callable=kind==='function'?
    exported:
    exported&&typeof exported==='object'?
      /** @type {{read?:unknown}} */(exported).read:null;
  assert.equal(typeof callable,'function');
  const fn=/** @type {()=>unknown & {toString:()=>string}} */(callable);
  return {value:fn(),source:fn.toString()};
}

/** @param {string} source @returns {unknown} */
function observeValue(source) {
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  return context.module.exports;
}

/** @param {'coo'|'sno'} mode @param {string} source @returns {ReturnType<typeof obfuscateFiles>['files'][number]} */
function compile(mode,source) {
  const out=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:source
  }],{
    mode,seed:'legacy-exported-callable-source-boundary',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(out.files.length,1);
  return out.files[0];
}

const cases=[
  {
    name:'anonymous function expression assigned directly to module.exports',
    kind:'function',
    source:'const privateOwner={secretField:17,otherField:5};'+
      'module.exports=function publicReader(){return privateOwner.secretField;};'
  },
  {
    name:'named function declaration exported by assignment',
    kind:'function',
    source:'const privateOwner={secretField:17,otherField:5};'+
      'function publicReader(){return privateOwner.secretField;}'+
      'module.exports=publicReader;'
  },
  {
    name:'arrow callable stored in a local binding and exported',
    kind:'function',
    source:'const privateOwner={secretField:17,otherField:5};'+
      'const publicReader=()=>privateOwner.secretField;'+
      'module.exports=publicReader;'
  },
  {
    name:'method on exported object literal',
    kind:'method',
    source:'const privateOwner={secretField:17,otherField:5};'+
      'module.exports={read(){return privateOwner.secretField;}};'
  },
  {
    name:'function expression stored in exported object property',
    kind:'method',
    source:'const privateOwner={secretField:17,otherField:5};'+
      'module.exports={read:function publicReader(){return privateOwner.secretField;}};'
  }
];

for(const mode of /** @type {const} */ (['coo','sno'])) {
  for(const scenario of cases) {
    test(mode+' legacy local-owner proof preserves exported callable source: '+scenario.name,()=>{
      const native=observeExport(scenario.source,scenario.kind);
      const output=compile(mode,scenario.source);
      assert.equal(output.metrics.properties,0,
        scenario.name+' rewrote a key visible in exported Function#toString: '+output.code);
      assert.deepEqual(observeExport(output.code,scenario.kind),native);
    });
  }

  test(mode+' legacy local-owner proof retains private direct-call function yield',()=>{
    const source='const privateOwner={secretField:17};'+
      'function privateReader(){return privateOwner.secretField;}'+
      'module.exports=privateReader();';
    const output=compile(mode,source);
    assert.equal(output.metrics.properties,1,output.code);
    assert.equal(observeValue(output.code),observeValue(source));
  });
}


/**
 * Evaluate a named ESM export through a data URL so the native and emitted
 * function source strings are observed from outside the module.
 * @param {string} source
 * @returns {Promise<{value:unknown,source:string}>}
 */
async function observeModule(source) {
  const url='data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64');
  const namespace=await import(url);
  const callable=namespace.publicReader;
  assert.equal(typeof callable,'function');
  const fn=/** @type {() => unknown} */(callable);
  return {value:fn(),source:fn.toString()};
}

/** @param {'coo'|'sno'} mode @param {string} source @returns {ReturnType<typeof obfuscateFiles>['files'][number]} */
function compileModule(mode,source) {
  const out=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode,seed:'legacy-exported-callable-esm-source-boundary',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(out.files.length,1);
  return out.files[0];
}

for(const mode of /** @type {const} */ (['coo','sno'])) {
  test(mode+' legacy local-owner proof preserves exported ESM callable source',async()=>{
    const source='const privateOwner={secretField:17,otherField:5};'+
      'export function publicReader(){return privateOwner.secretField;}';
    const native=await observeModule(source);
    const output=compileModule(mode,source);
    assert.equal(output.metrics.properties,0,output.code);
    assert.deepEqual(await observeModule(output.code),native);
  });
}
