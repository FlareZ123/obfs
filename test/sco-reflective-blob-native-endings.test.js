'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * Compile an async selected function while retaining one public export.
 * @param {string} expression
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function compile(expression) {
  return partitionScoSelectedAsyncExports({
    path:'blob-selective.mjs',
    sourceType:'module',
    code:'export async function protectedOp(){'+
      'const part='+expression+';'+
      'return Array.from(new Uint8Array(await part.arrayBuffer()));'+
      '}export function visible(){return 7;}'
  }, {
    seed:'sco-reflect-blob-native-20261122',
    privateNames:['protectedOp']
  });
}

test('native Reflect.construct Blob uses exactly the requested Blob constructor',async()=>{
  const parts=['A\nB'];
  const options={endings:'native'};
  const direct=new Blob(parts,options);
  const reflected=Reflect.construct(Blob,[parts,options]);
  const directBytes=Array.from(new Uint8Array(await direct.arrayBuffer()));
  const reflectedBytes=Array.from(new Uint8Array(await reflected.arrayBuffer()));
  assert.deepEqual(reflectedBytes,directBytes);
  assert.deepEqual(reflectedBytes,process.platform==='win32'?
    [65,13,10,66]:[65,10,66]);
});

test('SCO refuses reflective native-endings Blob under an unproved cross-host OS',()=>{
  const reflected="Reflect.construct(Blob,[['A\\nB'],{endings:'native'}])";
  assert.throws(()=>compile(reflected),TypeError);
});

test('SCO retains its supported direct transparent Blob positive',()=>{
  const transparent="new Blob(['A\\nB'],{endings:'transparent'})";
  assert.deepEqual(compile(transparent).privateNames,['protectedOp']);
});
