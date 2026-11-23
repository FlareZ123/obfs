'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

test('a parameter named window is not a browser-global source-coordinate observer',()=>{
  const source=[
    'function localWindow(window,handler){',
    '  window.onerror=handler;',
    '  return 7;',
    '}',
    'const owner={privateKey:11};',
    'function independent(){const privateLocal=29;return owner.privateKey+privateLocal;}',
    'module.exports={value:localWindow({})+independent()};'
  ].join('\n');

  assert.equal(observesFunctionSource(parse(source,'commonjs')),false,
    'the window reference resolves to a function parameter, not the browser global');

  const result=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:source
  }],{
    mode:'coo',
    seed:'shadowed-window-root',
    properties:true,
    identifiers:true,
    strings:false
  });
  const file=result.files[0];
  assert.ok(file);
  assert.ok(file.metrics.properties>=1,'unrelated private owner property should still rename');
  assert.ok(file.metrics.bindings>=1,'unrelated private local binding should still rename');
  assert.ok(!file.code.includes('privateKey'),String(file.code));
  assert.ok(!file.code.includes('privateLocal'),String(file.code));
});

test('an unshadowed global window.onerror remains a source-coordinate observer',()=>{
  const source='window.onerror=function handler(){};';
  assert.equal(observesFunctionSource(parse(source,'script')),true);
});
