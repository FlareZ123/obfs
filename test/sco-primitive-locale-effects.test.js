'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} protectedBody @param {string} [visibleBody] */
function source(protectedBody,visibleBody='return 7;') {
  return 'export async function protectedOp(){'+protectedBody+'}\n'+
    'export function visible(){'+visibleBody+'}\n';
}

/** @param {string} protectedBody */
function partition(protectedBody){
  return partitionScoSelectedAsyncExports(
    {path:'locale-methods.mjs',code:source(protectedBody),sourceType:'module'},
    {seed:'locale-methods-20261116',privateNames:['protectedOp']});
}

test('Native numeric and string locale builtins have language-dependent outputs',()=>{
  assert.notEqual((1234.5).toLocaleString('en-US'),
    (1234.5).toLocaleString('de-DE'));
  assert.notEqual('z'.localeCompare('ä','de-DE'),
    'z'.localeCompare('ä','sv-SE'));
  assert.notEqual('I'.toLocaleLowerCase('en-US'),
    'I'.toLocaleLowerCase('tr'));
  assert.notEqual((1234.5).toLocaleString('fr-FR'),
    (1234.5).toString());
});

test('Host default locale differs across separate Linux Node processes',()=>{
  if(process.platform==='win32')return;
  /** @param {string} locale */
  function call(locale){
    return execFileSync(process.execPath,[
      '-p',"(1234.5).toLocaleString()+' / '+new Intl.NumberFormat().resolvedOptions().locale"
    ],{encoding:'utf8',env:{...process.env,LANG:locale,LC_ALL:locale}}).trim();
  }
  const english=call('en_US.UTF-8');
  const german=call('de_DE.UTF-8');
  assert.notEqual(english,german);
});

test('SCO refuses unproved private primitive locale builtins',()=>{
  for(const body of [
    'return (1234.5).toLocaleString();',
    'return (123456n).toLocaleString();',
    'return [1234,5678].toLocaleString();',
    "return 'abc'.localeCompare('xyz');",
    "return 'I'.toLocaleLowerCase();",
    "return 'i'.toLocaleUpperCase();",
    'const value=1234.5;return value.toLocaleString();',
    "const value='I';return value['toLocale'+'LowerCase']();",
    "return (1234.5).toLocaleString('en-US');",
    "return Intl.NumberFormat.supportedLocalesOf(['de-DE']).length;",
    "const format=(1234.5).toLocaleString;return format.call(1234.5);",
    "const compare='z'.localeCompare;return compare.call('z','ä');",
    "const lower='I'.toLocaleLowerCase;return lower.call('I');",
    "const Formatter=Intl.NumberFormat;const supports=Formatter.supportedLocalesOf;return supports(['de-DE']).length;",
    "return Intl.DateTimeFormat.supportedLocalesOf(['de-DE']).length;",
    "const Formatter=Intl.NumberFormat;return Formatter.supportedLocalesOf(['de-DE']).length;"
  ])assert.throws(()=>partition(body),/realm-local configuration/,body);
});

test('SCO retains locale-insensitive primitive methods and client-side formatters',()=>{
  for(const privateBody of [
    'return (1234.5).toString();',
    "return 'abc'.toUpperCase();",
    "return (123456n).toString();",
    'return Math.trunc(1234.5);'
  ]){
    const result=partition(privateBody);
    assert.equal(result.privateNames[0],'protectedOp',privateBody);
  }
  const code=source('return 7;',"return (1234.5).toLocaleString();");
  const output=partitionScoSelectedAsyncExports(
    {path:'locale-client.mjs',code,sourceType:'module'},
    {seed:'locale-client-20261116',privateNames:['protectedOp']});
  assert.match(output.clientFile.code,/toLocaleString/);
});
