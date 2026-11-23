'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function fixture(){
  return [
    "'use strict';",
    "let observer='none';",
    'function spy(){',
    " try{observer=spy.caller===null?'null':'unexpected-caller';}",
    ' catch(error){observer=error.name;}',
    '}',
    'function strictPrivate(){',
    ' const privateMarker="STRICT_CALLER_PRIVATE_BODY_MARKER_0123456789_ABCDEF";',
    ' spy();',
    ' return privateMarker.length;',
    '}',
    'module.exports=[strictPrivate(),observer];'
  ].join('\n');
}

/** @param {string} code @returns {[number,string]} */
function execute(code){
  /** @type {{module:{exports:unknown}}} */
  const state={module:{exports:null}};
  vm.runInNewContext(code,state,{timeout:1500,filename:'strict-caller.cjs'});
  const result=/** @type {[number,string]} */(state.module.exports);
  assert.equal(typeof result[0],'number');
  assert.equal(typeof result[1],'string');
  return [result[0],result[1]];
}

test('strict source blocks legacy caller reflection and preserves direct-helper yield',()=>{
  const source=fixture();
  const expected=execute(source);
  assert.equal(expected[1],'TypeError');
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'entry.cjs',sourceType:'commonjs',code:source}];
  const result=obfuscateFiles(files,{
    mode:'sno',seed:'agent44-strict-caller-positive-control',
    strings:true,identifiers:true,properties:true,preservePublicCallableSource:true
  });
  const file=result.files[0];
  const output=String(file.code);
  const actual=execute(output);
  process.stdout.write('STRICT_CALLER_POSITIVE '+JSON.stringify({
    expected,actual,literals:file.metrics.literals,bindings:file.metrics.bindings,
    changed:output!==source
  })+'\n');
  assert.equal(JSON.stringify(actual),JSON.stringify(expected));
  assert.ok(file.metrics.literals>0,
    'Strict function source must remain transformable despite a caller read');
});
