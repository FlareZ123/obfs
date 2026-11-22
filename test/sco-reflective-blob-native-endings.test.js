'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * Compile an async selected function while retaining one public export.
 * @param {string} expression
 * @param {string} [setup]
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function compile(expression,setup='') {
  return partitionScoSelectedAsyncExports({
    path:'blob-selective.mjs',
    sourceType:'module',
    code:'export async function protectedOp(){'+setup+
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

test('SCO refuses unproved native-endings Blob construction routes',()=>{
  const source="['A\\nB']";
  const options="{endings:'native'}";
  const routes=[
    ['direct reflected',`Reflect.construct(Blob,[${source},${options}])`,''],
    ['reflected global member',`Reflect.construct(globalThis.Blob,[${source},${options}])`,''],
    ['reflected aliased constructor',`Reflect.construct(make,[${source},${options}])`,'const make=Blob;'],
    ['bound constructor',`new (Blob.bind(null))(${source},${options})`,''],
    ['owned constructor registry',`Reflect.construct(({Make:Blob}).Make,[${source},${options}])`,''],
    ['reflected apply',`Reflect.apply(Reflect.construct,Reflect,[Blob,[${source},${options}]])`,''],
    ['direct',`new Blob(${source},${options})`,'']
  ];
  for(const [name,expression,setup] of routes){
    assert.throws(()=>compile(expression,setup),TypeError,name);
  }
});

test('SCO retains its supported direct transparent Blob positive',()=>{
  const transparent="new Blob(['A\\nB'],{endings:'transparent'})";
  assert.deepEqual(compile(transparent).privateNames,['protectedOp']);
});


test('SCO keeps an identifier-aliased directly constructed transparent Blob',()=>{
  const expression="new make(['A\\nB'],{endings:'transparent'})";
  assert.deepEqual(compile(expression,'const make=Blob;').privateNames,['protectedOp']);
});
