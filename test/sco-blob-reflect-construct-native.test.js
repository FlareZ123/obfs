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
    seed:'sco-blob-reflect-native-20261122',
    privateNames:['protectedOp']
  });
}

const bytes='return [...new Uint8Array(await blob.arrayBuffer())];';

test('RED: reflected Blob native endings must not cross browser/Node realms',()=>{
  const sources=[
    "const blob=Reflect.construct(Blob,[['A\\nB'],{endings:'native'}]);",
    "const maker=Reflect.construct;const blob=maker(Blob,[['A\\nB'],{endings:'native'}]);",
    "const Ctor=Blob;const blob=Reflect.construct(Ctor,[['A\\nB'],{endings:'native'}]);",
    "const Ctor=Blob.bind(null);const blob=new Ctor(['A\\nB'],{endings:'native'});",
    "const blob=Reflect.construct(...[Blob,[['A\\nB'],{endings:'native'}]]);",
    "const tuple=[Blob,[['A\\nB'],{endings:'native'}]];const blob=Reflect.construct(...tuple);",
    "const Ctor=new Proxy(Blob,{});const blob=new Ctor(['A\\nB'],{endings:'native'});",
    "const factories={Ctor:Blob};const blob=Reflect.construct(factories.Ctor,[['A\\nB'],{endings:'native'}]);",
    "const factories=[Blob];const blob=new factories[0](['A\\nB'],{endings:'native'});"
  ];
  for(const source of sources){
    assert.throws(()=>partition(source+bytes),TypeError,
      'Unsafe reflective/aliased constructor must fail closed: '+source);
  }
});

test('direct and locally aliased transparent Blob remain portable positives',()=>{
  const safe=[
    "const blob=new Blob(['A\\nB'],{endings:'transparent'});",
    "const Ctor=Blob;const blob=new Ctor(['A\\nB'],{endings:'transparent'});",
    "const Ctor=Blob;const Alias=Ctor;const blob=new Alias(['A\\nB'],{endings:'transparent'});"
  ];
  for(const source of safe){
    const result=partition(source+bytes);
    assert.deepEqual(result.privateNames,['protectedOp'],
      'Proven direct/local construction must remain admitted: '+source);
  }
});

test('native reflected Blob and direct Blob share host line ending semantics',async()=>{
  const parts=['A\nB'];
  const options={endings:'native'};
  const reflected=Reflect.construct(Blob,[parts,options]);
  const direct=new Blob(parts,options);
  const expected=process.platform==='win32'?[65,13,10,66]:[65,10,66];
  assert.deepEqual(Array.from(new Uint8Array(await reflected.arrayBuffer())),expected);
  assert.deepEqual(Array.from(new Uint8Array(await direct.arrayBuffer())),expected);
  const portable=Reflect.construct(Blob,[parts,{endings:'transparent'}]);
  assert.deepEqual(Array.from(new Uint8Array(await portable.arrayBuffer())),
    [65,10,66]);
});


test('global-object Blob aliases remain conservatively refused by ambient guard',()=>{
  const sources=[
    "const Ctor=globalThis.Blob;const blob=new Ctor(['A\\nB'],{endings:'transparent'});",
    "const {Blob:Ctor}=globalThis;const blob=new Ctor(['A\\nB'],{endings:'transparent'});"
  ];
  for(const source of sources){
    assert.throws(()=>partition(source+bytes),TypeError,
      'Cross-host global-object alias has no ambient identity proof: '+source);
  }
});
