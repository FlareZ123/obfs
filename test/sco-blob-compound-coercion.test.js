'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} body @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function compile(body) {
  return partitionScoSelectedAsyncExports({
    path:'blob-compound.mjs',
    sourceType:'module',
    code:'export async function protectedOp(){'+body+
      '}export function visible(){return 7;}'
  }, {
    seed:'sco-blob-compound-first-class-provenance-20261122',
    privateNames:['protectedOp']
  });
}

test('native compound assignment stringifies its Blob function right operand',()=>{
  let captured='';
  captured+=Blob;
  assert.equal(captured,String(Blob));
  assert.ok(captured.length>10);
  assert.match(captured,/Blob/u);
});

test('SCO refuses compound and logical assignment escape of host Blob function',()=>{
  const bodies=[
    "let out='prefix:';out += Blob;return out.slice(0,80);",
    "let out='';out ||= Blob;return String(out).slice(0,80);",
    "let out=null;out ??= Blob;return String(out).slice(0,80);"
  ];
  for(const body of bodies)assert.throws(()=>compile(body),TypeError,body);
});

test('SCO retains proven plain assignment and literal transparent Blob construction',()=>{
  const positives=[
    "const Make=Blob;return new Make(['A'],{endings:'transparent'}).size;",
    "return new Blob(['A'],{endings:'transparent'}).size;"
  ];
  for(const body of positives){
    assert.deepEqual(compile(body).privateNames,['protectedOp'],body);
  }
});
