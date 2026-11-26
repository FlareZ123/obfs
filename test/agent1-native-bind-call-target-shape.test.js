'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,hasUnsafeNativeBindMutationSurface}=require('../src/ast');

const cases=[
  ['local const arrow target','const internal=()=>1;internal.bind(null);',false],
  ['local const constructible function-expression target','const internal=function named(){return 1;};internal.bind(null);',true],
  ['local constructible function-declaration target','function internal(){return 1;}internal.bind(null);',true],
  ['local const async arrow target','const internal=async()=>1;internal.bind(null);',false],
  ['import.meta host metadata read','const env=import.meta.env;const internal=()=>1;internal.bind(null);',true],
  ['imported function receiver',"import {internal} from './reader.mjs';internal.bind(null);",true],
  ['namespace custom bind method',"import * as custom from './custom.mjs';custom.bind(null);",true],
  ['optional host-object bind call','import.meta.bind?.(null);',true],
  ['optional call on local function','const internal=()=>1;internal.bind?.(null);',true],
  ['inline function-expression receiver','(()=>1).bind(null);',true],
  ['unproved function alias receiver','const internal=()=>1;const alias=internal;alias.bind(null);',true]
];

for(const [name,source,expected] of cases){
  test('native-bound target gate: '+name,()=>{
    assert.equal(
      hasUnsafeNativeBindMutationSurface(parse(source,'module')),
      expected,
      'unexpected native-bind admission for: '+source
    );
  });
}
