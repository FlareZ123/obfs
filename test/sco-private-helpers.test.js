'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse}=require('../src/ast');
const {partitionScoSelectedAsyncExports,bindScoModuleExports}=require('../src');

const SEED='sco-private-helpers-20261115';

/**
 * @param {string} code
 * @returns {import('../src/sco-selective-partition').ScoSelectivePartition}
 */
function partition(code){
  return partitionScoSelectedAsyncExports({path:'mixed.mjs',sourceType:'module',code},{
    seed:SEED,privateNames:['secret']
  });
}

test('private synchronous helper call graph stays off the public ESM facade',async()=>{
  const source=[
    'function twist(value){return (value*17)^0x5a;}',
    'function fold(value){return twist(value)+3;}',
    'export async function secret(value){return fold(value);}',
    'export function local(value){return value+4;}',
    'export async function run(value){return (await secret(value))+local(value);}'
  ].join('\n');
  const generated=partition(source);
  assert.deepEqual(generated.privateNames,['secret']);
  assert.deepEqual(generated.publicNames,['local','run']);
  assert.doesNotMatch(generated.clientFile.code,/\b(?:twist|fold)\b/u);
  assert.match(generated.clientFile.code,/export function local/u);
  assert.doesNotThrow(()=>parse(generated.clientFile.code,'module'));
  const native=await import('data:text/javascript,'+encodeURIComponent(source));
  const methods=bindScoModuleExports(generated,native);
  const method=generated.methodNames.secret;
  for(const value of [-37,-1,0,1,13,100000]){
    assert.equal(await methods[method](value),await native.secret(value));
    assert.equal(native.local(value),value+4);
  }
});

test('private helpers fail closed on cross-boundary references and stateful identities',()=>{
  const exported='export async function secret(){return helper();}'+
    'export function local(){return 7;}';
  /** @type {[string,RegExp][]} */
  const invalid=[
    ['function helper(){return 1;}'+
       'export async function secret(){return helper;}export function local(){return 7;}',
      /helper may only be called directly/u],
    ['function helper(){return 1;}'+
       'export async function secret(){return helper.call(null);}export function local(){return 7;}',
      /helper may only be called directly/u],
    ['function helper(){return 1;}'+
       'export async function secret(){return helper();}export function local(){return helper();}',
      /public SCO export references a server-only helper/i],
    ['function helper(){return local();}'+exported,
      /separated public binding/u],
    ['function helper(){return globalThis.shared;}'+
       'export async function secret(){return helper();}'+
       'export function local(){return window.shared;}',
      /share ambient state/u],
    ['async function helper(){return 1;}'+exported,
      /synchronous private helper/u],
    ['function* helper(){yield 1;}'+exported,
      /synchronous private helper/u],
    ['function helper(value=local()){return value;}'+exported,
      /synchronous private helper/u],
    ['function helper({value}){return value;}'+exported,
      /synchronous private helper/u],
    ['function helper(...values){return values.length;}'+exported,
      /synchronous private helper/u],
    ['const helper=()=>1;'+exported,
      /primitive literal/u]
  ];
  for(const [code,error] of invalid){
    assert.throws(()=>partition(code),error,code);
  }
});

test('private helper names used as literal property keys do not trigger false dependency',()=>{
  const source=[
    'function helper(value){return value+1;}',
    'export async function secret(value){return helper(value);}',
    'export function local(value){return {helper:value}.helper;}'
  ].join('\n');
  const generated=partition(source);
  assert.match(generated.clientFile.code,/\{helper:value\}\.helper/u);
  assert.doesNotMatch(generated.clientFile.code,/function helper\(/u);
});
