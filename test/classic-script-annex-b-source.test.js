'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {string} */
function observe(code){
  const ctx=vm.createContext({});
  vm.runInContext(code,ctx,{timeout:1500,filename:'annex-b-classic.js'});
  const fn=/** @type {Function} */(ctx.annexB);
  assert.equal(typeof fn,'function');
  return String(fn);
}

test('sloppy classic-script Annex B block function can be globally observed',()=>{
  const input=[
    'if(true){',
    ' function annexB(){',
    '  const marker="ANNEX_B_BLOCK_FUNCTION_GLOBAL_SOURCE_MARKER_0123456789_ABCDEF";',
    '  return marker.length;',
    ' }',
    '}',
    'annexB();'
  ].join('\n');
  const native=observe(input);
  assert.match(native,/ANNEX_B_BLOCK_FUNCTION_GLOBAL_SOURCE_MARKER_0123456789_ABCDEF/);
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'entry.js',sourceType:'script',code:input}];
  const result=obfuscateFiles(files,{
    mode:'coo',seed:'agent44-annexb-block-global-source',
    strings:true,identifiers:true,properties:true,preservePublicCallableSource:true
  });
  const file=result.files[0],out=String(file.code);
  const compiled=observe(out);
  process.stdout.write('ANNEX_B_SOURCE_PROBE '+JSON.stringify({
    native,compiled,literals:file.metrics.literals,bindings:file.metrics.bindings,changed:out!==input
  })+'\n');
  assert.equal(compiled,native,'Annex B globally exposed function must preserve source');
});
