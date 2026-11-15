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

test('private const arrow and function-expression helpers run only on the server',async()=>{
  const source=[
    'const twist=value=>(value*17)^0x5a;',
    'const fold=function(value){return twist(value)+3;};',
    'export async function secret(value){return fold(value);}',
    'export function local(value){return value+4;}'
  ].join('\n');
  const generated=partition(source);
  assert.deepEqual(generated.publicNames,['local']);
  assert.doesNotMatch(generated.clientFile.code,/\b(?:twist|fold)\b/u);
  assert.doesNotThrow(()=>parse(generated.clientFile.code,'module'));
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  const methods=bindScoModuleExports(generated,original);
  for(const x of [-23,0,1,11,123456]){
    assert.equal(await methods[generated.methodNames.secret](x),await original.secret(x));
  }
});

test('async private declaration and async arrow keep native Node imports server-only',async()=>{
  const source=[
    'async function privateDigest(value){',
    '  const {createHash}=await import("node:crypto");',
    '  return createHash("sha256").update(value).digest("hex");',
    '}',
    'const privateWrap=async value=>await privateDigest(value);',
    'export async function secret(value){return await privateWrap(value);}',
    'export function local(value){return value.length;}'
  ].join('\n');
  const generated=partition(source);
  assert.doesNotMatch(generated.clientFile.code,/privateDigest|privateWrap|createHash|node:crypto/u);
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  const methods=bindScoModuleExports(generated,original);
  for(const value of ['', 'hello', 'Ω', 'a'.repeat(128)]){
    assert.equal(await methods[generated.methodNames.secret](value),await original.secret(value));
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
    ['function* helper(){yield 1;}'+exported,
      /non-generator private helper/u],
    ['function helper(value=local()){return value;}'+exported,
      /non-generator private helper/u],
    ['function helper({value}){return value;}'+exported,
      /non-generator private helper/u],
    ['function helper(...values){return values.length;}'+exported,
      /non-generator private helper/u],
    ['const helper=()=>1;export async function secret(){return helper;}'+
       'export function local(){return 7;}',/helper may only be called directly/u],
    ['const helper=()=>1;'+
       'export async function secret(){return helper();}'+
       'export function local(){return helper();}',/server-only helper/u],
    ['const helper=function*(){yield 1;};'+exported,
      /non-generator private helper/u],
    ['const helper=()=>1,notPrimitive=()=>2;'+exported,
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
