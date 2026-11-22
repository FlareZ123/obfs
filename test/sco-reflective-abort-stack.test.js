'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} body @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function compile(body){
  return partitionScoSelectedAsyncExports({
    path:'abort-selective.mjs',
    sourceType:'module',
    code:'export async function protectedOp(){'+body+
      '}export function visible(){return 7;}'
  },{
    seed:'sco-reflected-abort-source-coordinate-20261122',
    privateNames:['protectedOp']
  });
}

test('native reflected AbortController abort creates a readable DOMException stack',()=>{
  const controller=Reflect.construct(AbortController,[]);
  controller.abort();
  const reason=controller.signal.reason;
  assert.equal(reason.name,'AbortError');
  assert.equal(typeof reason.stack,'string');
  assert.match(reason.stack,/AbortError/u);
  assert.match(reason.stack,/sco-reflective-abort-stack\.test\.js/u);
});

test('SCO refuses relocated reflected default-abort reason stack',()=>{
  const body='const controller=Reflect.construct(AbortController,[]);'+
    'controller.abort();return controller.signal.reason.stack;';
  assert.throws(()=>compile(body),TypeError);
});

test('SCO already refuses direct new AbortController default-abort reason stack',()=>{
  const body='const controller=new AbortController();'+
    'controller.abort();return controller.signal.reason.stack;';
  assert.throws(()=>compile(body),TypeError);
});

test('SCO can relocate explicit primitive AbortController reason',()=>{
  const body='const controller=new AbortController();'+
    'controller.abort("intentional");return controller.signal.reason;';
  assert.deepEqual(compile(body).privateNames,['protectedOp']);
});
