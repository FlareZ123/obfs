'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * @param {string} body
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function partition(body){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',
    sourceType:'module',
    code:'export async function protectedOp(){'+body+'}\n'+
      'export function visible(){return 7;}'
  },{
    seed:'sco-blob-instance-constructor-escape-20261122',
    privateNames:['protectedOp']
  });
}

test('Blob instance constructor extraction may not reenable OS-native newline output',()=>{
  const inputs=[
    "const Ctor=(new Blob([])).constructor;const blob=new Ctor(['A\\nB'],{endings:'native'});",
    "const source=new Blob([]);const Ctor=source.constructor;const blob=new Ctor(['A\\nB'],{endings:'native'});",
    "const source=new Blob([]);const alias=source;const Ctor=alias['constructor'];const blob=new Ctor(['A\\nB'],{endings:'native'});",
    "const {constructor:Ctor}=new Blob([]);const blob=Reflect.construct(Ctor,[['A\\nB'],{endings:'native'}]);",
    "const source=new Blob([]);const Ctor=Reflect.get(source,'constructor');const blob=new Ctor(['A\\nB'],{endings:'native'});",
    "const source=new Blob([]);const prop='constructor';const Ctor=source[prop];const blob=new Ctor(['A\\nB'],{endings:'native'});",
    "const source=new Blob([]);const read=x=>x.constructor;const Ctor=read(source);const blob=new Ctor(['A\\nB'],{endings:'native'});",
    "const source=new Blob([]);const list=[source];const Ctor=list[0].constructor;const blob=new Ctor(['A\\nB'],{endings:'native'});"
  ];
  for(const source of inputs){
    assert.throws(()=>partition(source+
      'return [...new Uint8Array(await blob.arrayBuffer())];'),TypeError,
      'Blob instance constructor recovery must not bypass native-endings gate: '+source);
  }
});

test('direct known-configuration Blob instance methods remain admitted',()=>{
  const body="const blob=new Blob(['A\\nB'],{endings:'transparent'});"+
    'return [...new Uint8Array(await blob.arrayBuffer())];';
  assert.deepEqual(partition(body).privateNames,['protectedOp']);
});
