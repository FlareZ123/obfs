'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} privateBody @param {string} [publicBody] */
function partition(privateBody,publicBody='return 7;') {
  return partitionScoSelectedAsyncExports({
    path:'intl-host-data.mjs',
    code:'export async function privateOp(){'+privateBody+'}'+
      'export function visible(){'+publicBody+'}',
    sourceType:'module'
  },{seed:'intl-host-data-admission-20261123',privateNames:['privateOp']});
}

test('SCO rejects selected-private Intl supported-values reads that depend on host ICU data',()=>{
  for(const body of [
    "return Intl.supportedValuesOf('currency').length;",
    "return Intl.supportedValuesOf('collation').includes('phonetic');",
    "return globalThis.Intl.supportedValuesOf('currency').includes('ZWG');",
    "return Intl['supported'+'ValuesOf']('currency').length;",
    "const NativeIntl=Intl;return NativeIntl.supportedValuesOf('currency').length;",
    "const values=Intl.supportedValuesOf;return values('currency').length;",
    "const {supportedValuesOf:values}=Intl;return values('currency').length;"
  ])assert.throws(()=>partition(body),/realm-local configuration/,body);
});

test('SCO keeps harmless local static data and public-side Intl usage',()=>{
  for(const body of [
    'return Math.imul(7,13);',
    'const record={supportedValuesOf:7};return record.supportedValuesOf;'
  ])assert.deepEqual(partition(body).privateNames,['privateOp'],body);
  const client=partition('return 7;',
    "return Intl.supportedValuesOf('currency').length;").clientFile.code;
  assert.match(client,/Intl\.supportedValuesOf\('currency'\)/u);
});
