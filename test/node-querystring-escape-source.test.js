'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Execute the fixture with the real Node.js querystring implementation.
 * @param {string} code
 * @returns {unknown}
 */
function execute(code) {
  const context={module:{exports:null},require};
  vm.runInNewContext(code,context,{filename:'querystring-source.cjs',timeout:2000});
  return context.module.exports;
}

const callable="function visibleQueryStringFunction(){return 'SOURCE_LITERAL_20261122_QS';}";

/** @type {readonly [string,string][]} */
const cases=[
  ['direct CommonJS namespace',
    "const qs=require('node:querystring');module.exports=qs.escape(visibleQueryStringFunction);"],
  ['direct nested require',
    "module.exports=require('node:querystring').escape(visibleQueryStringFunction);"],
  ['destructured method',
    "const {escape:enc}=require('node:querystring');module.exports=enc(visibleQueryStringFunction);"],
  ['detached namespace alias',
    "const qs=require('node:querystring');const ns=qs;const enc=ns.escape;module.exports=enc(visibleQueryStringFunction);"],
  ['direct unescape function coercion',
    "module.exports=require('node:querystring').unescape(visibleQueryStringFunction);"],
  ['destructured unescape function coercion',
    "const {unescape:dec}=require('node:querystring');module.exports=dec(visibleQueryStringFunction);"]
];

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  for(const [label,suffix] of cases) {
    test(mode+' preserves native querystring.escape function source via '+label,()=>{
      const source="'use strict';"+callable+suffix;
      const result=obfuscateFiles([{
        path:'querystring-source.cjs',sourceType:'commonjs',code:source
      }],{mode,seed:'querystring-native-source/'+mode+'/'+label,
        strings:true,identifiers:false,properties:false}).files[0];
      assert.equal(execute(String(result.code)),execute(source),
        'The escaped function source must not change');
      assert.equal(observesFunctionSource(parse(source,'commonjs')),true,
        'querystring.escape invokes String(function), exposing its source');
    });
  }

  test(mode+' still encodes private literals without a callable observer',()=>{
    const source="'use strict';const q=require('node:querystring');"+
      "const data={secret:'PRIVATE_INERT_LITERAL_QS_20261122'};"+
      "module.exports=[q.escape('plain-value'),data.secret];";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),false);
    const result=obfuscateFiles([{
      path:'querystring-positive.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'querystring-positive/'+mode,
      strings:true,identifiers:false,properties:false}).files[0];
    assert.equal(JSON.stringify(execute(String(result.code))),
      JSON.stringify(execute(source)));
    assert.ok(result.metrics.literals>0,'Inert literals remain eligible');
  });
}

/**
 * Dynamic data-URL ESM import gives the source and generated module their
 * actual native Node built-in bindings without a wrapper inside protected code.
 * @param {string} code
 * @returns {Promise<unknown>}
 */
async function executeEsm(code) {
  const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
  return (await import(url)).result;
}

/** @type {readonly [string,string][]} */
const esmCases=[
  ['named export alias',
    "import {escape as enc} from 'node:querystring';export const result=enc(visibleQueryStringFunction);"],
  ['named unescape alias',
    "import {unescape as dec} from 'node:querystring';export const result=dec(visibleQueryStringFunction);"],
  ['namespace import',
    "import * as ns from 'node:querystring';export const result=ns.escape(visibleQueryStringFunction);"],
  ['default import',
    "import ns from 'node:querystring';export const result=ns.unescape(visibleQueryStringFunction);"]
];

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  for(const [label,suffix] of esmCases) {
    test(mode+' preserves native ESM querystring callable source via '+label,async()=>{
      const source=callable+suffix;
      assert.equal(observesFunctionSource(parse(source,'module')),true);
      const result=obfuscateFiles([{
        path:'querystring-source.mjs',sourceType:'module',code:source
      }],{mode,seed:'querystring-esm-native-source/'+mode+'/'+label,
        strings:true,identifiers:false,properties:false}).files[0];
      assert.equal(await executeEsm(String(result.code)),await executeEsm(source));
    });
  }
}
