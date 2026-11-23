'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function fixture(){
  return [
    'const exposedLexical=()=>{',
    ' const marker="CLASSIC_SCRIPT_LEXICAL_FUNCTION_SOURCE_MARKER_0123456789_ABCDEF";',
    ' return marker.length;',
    '};',
    'exposedLexical();'
  ].join('\n');
}

/**
 * A top-level classic script const is visible to later scripts in the same
 * realm despite not becoming an own property of globalThis.
 * @param {string} code
 * @returns {string}
 */
function observe(code){
  const context=vm.createContext({});
  vm.runInContext(code,context,{filename:'first-classic-script.js',timeout:1500});
  return /** @type {string} */(vm.runInContext('String(exposedLexical)',context,
    {filename:'second-classic-script.js',timeout:1500}));
}

test('top-level classic script lexical function source is observable by later scripts',()=>{
  const input=fixture();
  const native=observe(input);
  assert.match(native,/CLASSIC_SCRIPT_LEXICAL_FUNCTION_SOURCE_MARKER_0123456789_ABCDEF/);
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'entry.js',sourceType:'script',code:input}];
  const result=obfuscateFiles(files,{
    mode:'coo',seed:'agent44-classic-script-lexical-source',
    strings:true,identifiers:true,properties:true,preservePublicCallableSource:true
  });
  const file=result.files[0],output=String(file.code);
  const compiled=observe(output);
  process.stdout.write('CLASSIC_LEXICAL_PROBE '+JSON.stringify({
    native,compiled,changed:output!==input,
    literals:file.metrics.literals,bindings:file.metrics.bindings
  })+'\n');
  assert.equal(compiled,native,'Later script must observe original const callable');
});


for(const bindingKind of /** @type {const} */ (['let','var'])){
  test('subsequent script observes '+bindingKind+' top-level callable source',()=>{
    const input=fixture().replace('const exposedLexical=',bindingKind+' exposedLexical=');
    const native=observe(input);
    /** @type {import('../src/core').SourceFile[]} */
    const files=[{path:'entry.js',sourceType:'script',code:input}];
    const result=obfuscateFiles(files,{
      mode:'coo',seed:'agent44-script-'+bindingKind+'-observable',
      strings:true,identifiers:true,properties:true,preservePublicCallableSource:true
    });
    const emitted=observe(String(result.files[0].code));
    assert.equal(emitted,native);
  });
}
