'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports,partitionScoSelectedGraph}=require('../src');

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

test('SCO refuses relocation of version-dependent Intl.Locale constructor APIs',()=>{
  for(const body of [
    "return typeof new Intl.Locale('en').getCollations;",
    "return new Intl.Locale('en').collations?.length??0;",
    "return new globalThis.Intl.Locale('en').getCalendars?.().length??0;",
    "const L=Intl.Locale;return typeof new L('en').getHourCycles;",
    "const {Locale:L}=Intl;return typeof new L('en').getCollations;"
  ])assert.throws(()=>partition(body),/realm-local configuration/,body);
});

test('SCO keeps conservative refusals for uncertain assigned Intl namespace escapes',()=>{
  for(const body of [
    "let Native;Native=Intl;return Native.supportedValuesOf('currency').length;",
    "let Native;Native=globalThis.Intl;return typeof new Native.Locale('en').getCollations;",
    "let Native;({Intl:Native}=globalThis);return Native.supportedValuesOf('currency').length;",
    "let Native;({Intl:Native}=globalThis);return typeof new Native.Locale('en').getCollations;"
  ])assert.throws(()=>partition(body),/realm-local/,body);
});

test('SCO also checks host-dependent Intl in a selected private ESM dependency',()=>{
  /** @param {string} leafBody */
  function graph(leafBody){
    return partitionScoSelectedGraph([{
      file:{
        path:'mixed.mjs',
        sourceType:'module',
        code:"import {leaf} from './private/leaf.mjs';"+
          "export async function privateOp(){return leaf();}"+
          "export function visible(){return 7;}"
      },
      options:{
        seed:'sco-intl-leaf-20261123',
        privateNames:['privateOp'],
        privateModuleImports:['./private/leaf.mjs'],
        privateModuleSources:[{
          path:'private/leaf.mjs',
          code:'export function leaf(){'+leafBody+'}'
        }]
      }
    }]);
  }
  for(const body of [
    "return Intl.supportedValuesOf('currency').length;",
    "return typeof new Intl.Locale('en').getCollations;"
  ])assert.throws(()=>graph(body),/realm-local configuration/,body);
  assert.equal(graph('return Math.imul(7,13);').exposedPaths[0],'mixed.mjs');
});

test('SCO keeps harmless local static data and public-side Intl usage',()=>{
  for(const body of [
    'return Math.imul(7,13);',
    'const record={supportedValuesOf:7};return record.supportedValuesOf;'
  ])assert.deepEqual(partition(body).privateNames,['privateOp'],body);
  const client=partition('return 7;',
    "return Intl.supportedValuesOf('currency').length;").clientFile.code;
  assert.match(client,/Intl\.supportedValuesOf\('currency'\)/u);
  const localeClient=partition('return 7;',
    "return typeof new Intl.Locale('en').getCollations;").clientFile.code;
  assert.match(localeClient,/new Intl\.Locale\('en'\)/u);
});
