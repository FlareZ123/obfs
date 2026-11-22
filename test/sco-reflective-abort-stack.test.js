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

test('SCO refuses first-class AbortController constructors whose default reason exposes stack',()=>{
  const variants=[
    ['reflected','const controller=Reflect.construct(AbortController,[]);'],
    ['global member','const controller=Reflect.construct(globalThis.AbortController,[]);'],
    ['aliased reflected','const Ctor=AbortController;const controller=Reflect.construct(Ctor,[]);'],
    ['bound constructor','const controller=new (AbortController.bind(null))();'],
    ['owned registry','const controller=new ({Ctor:AbortController}).Ctor();'],
    ['reflective apply','const controller=Reflect.apply(Reflect.construct,Reflect,[AbortController,[]]);']
  ];
  for(const [name,setup] of variants){
    assert.throws(()=>compile(setup+
      'controller.abort();return controller.signal.reason.stack;'),TypeError,name);
  }
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


test('SCO keeps an identifier-aliased AbortController with explicit primitive reason',()=>{
  const body='const Ctor=AbortController;const controller=new Ctor();'+
    'controller.abort("intentional");return controller.signal.reason;';
  assert.deepEqual(compile(body).privateNames,['protectedOp']);
});
