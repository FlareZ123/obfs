'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * Compile a single selected browser-origin function and a retained public
 * control. Every accepted case must still export real private work.
 *
 * @param {string} body
 * @param {string} name
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function partition(body,name){
  return partitionScoSelectedAsyncExports({
    path:'free-reference-scope.mjs',sourceType:'module',
    code:'export async function protectedOp(){'+body+'}\n'+
      'export function visible(){return 7;}'
  },{
    privateNames:['protectedOp'],
    seed:'agent18-free-reference-scope-20261123/'+name
  });
}

/** @type {Array<{name:string,body:string}>} */
const ownedCases=[
  {name:'const record',body:'const externalBridge={value:41};return externalBridge.value;'},
  {name:'let binding',body:'let externalBridge=41;return externalBridge;'},
  {name:'var binding',body:'var externalBridge=41;return externalBridge;'},
  {name:'function declaration',body:'function externalBridge(){return 41;}return externalBridge();'},
  {name:'arrow formal',body:'const f=externalBridge=>externalBridge;return f(41);'},
  {name:'nested block',body:'{const externalBridge=41;return externalBridge;}'},
  {name:'catch formal',body:'try{throw 41;}catch(externalBridge){return externalBridge;}'},
  {name:'array pattern',body:'const [externalBridge]=[41];return externalBridge;'},
  {name:'record pattern',body:'const {externalBridge}=({externalBridge:41});return externalBridge;'},
  {name:'loop binding',body:'for(const externalBridge of [41]){return externalBridge;}'},
  {name:'for let binding',body:'for(let externalBridge=41;externalBridge<42;externalBridge++){return externalBridge;}'},
  {name:'local class',body:'class externalBridge{static answer=41;}return externalBridge.answer;'},
  {name:'nested local function',body:'function outer(){const externalBridge=41;return externalBridge;}return outer();'},
  {name:'named function expression',body:'const f=function externalBridge(){return 41;};return f();'},
  {name:'arrow closure',body:'const externalBridge=41;const f=()=>externalBridge;return f();'},
  {name:'inert data key',body:'const record={externalBridge:41};return record.externalBridge;'},
  {name:'inert quoted key',body:"const record={'externalBridge':41};return record['externalBridge'];"},
  {name:'inert class method name',body:'class A{externalBridge(){return 41;}}return new A().externalBridge();'},
  {name:'nested var hoist',body:'function read(){return externalBridge;var externalBridge=41;}return read();'},
  {name:'inert label',body:'externalBridge:{break externalBridge;}return 41;'}
];

/** @type {Array<{name:string,body:string}>} */
const externalCases=[
  {name:'bare return',body:'return externalBridge;'},
  {name:'typeof absent',body:'return typeof externalBridge;'},
  {name:'bare arithmetic',body:'return externalBridge+41;'},
  {name:'nested missing',body:'function read(){return externalBridge;}return read();'},
  {name:'sibling formal',body:'const f=externalBridge=>externalBridge;return f(1)+externalBridge;'},
  {name:'inner block shadow',body:'{const externalBridge=41;}return externalBridge;'},
  {name:'arrow body shadow',body:'const f=()=>{const externalBridge=41;return externalBridge;};return externalBridge;'},
  {name:'catch shadow',body:'try{throw 41;}catch(externalBridge){}return externalBridge;'},
  {name:'loop shadow',body:'for(const externalBridge of [41]){}return externalBridge;'},
  {name:'named expression shadow',body:'const f=function externalBridge(){return 41;};return externalBridge;'},
  {name:'function formal shadow',body:'function f(externalBridge){return externalBridge;}return externalBridge;'},
  {name:'computed record key',body:'const x={[externalBridge]:1};return x.value;'},
  {name:'shorthand property',body:'return ({externalBridge});'},
  {name:'default destructure',body:'const {value=externalBridge}={};return value;'},
  {name:'parameter initializer before var',body:'function f(x=externalBridge){var externalBridge=41;return x;}return f();'},
  {name:'parameter initializer before let',body:'function f(x=externalBridge){let externalBridge=41;return x;}return f();'},
  {name:'for let postscope',body:'for(let externalBridge=0;externalBridge<1;externalBridge++){}return externalBridge;'},
  {name:'switch local postscope',body:'switch(41){case 41:let externalBridge=41;}return externalBridge;'},
  {name:'nested function name shadow',body:'function f(){function externalBridge(){return 41;}return externalBridge();}return externalBridge;'}
];

test('selected SCO admits locally owned bindings and inert external-spelled keys',()=>{
  for(const {name,body} of ownedCases){
    const compiled=partition(body,name);
    assert.deepEqual(compiled.privateNames,['protectedOp'],name);
    assert.deepEqual(compiled.publicNames,['visible'],name);
    assert.doesNotMatch(compiled.clientFile.code,/externalBridge/u,
      'Private source must be absent from emitted client for '+name);
  }
});

test('selected SCO refuses unqualified browser-only custom globals',()=>{
  for(const {name,body} of externalCases){
    assert.throws(
      ()=>partition(body,name),
      /unproved unqualified free reference|unproved free typeof reference/u,
      name
    );
  }
});

test('matrix actually covers both sides of the lexical boundary',()=>{
  assert.ok(ownedCases.length>=16);
  assert.ok(externalCases.length>=16);
  console.log('SCO_FREE_REFERENCE_SCOPE '+JSON.stringify({
    accepted:ownedCases.map(({name})=>name),
    rejected:externalCases.map(({name})=>name)
  }));
});
