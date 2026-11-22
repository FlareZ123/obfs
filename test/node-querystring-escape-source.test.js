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
    "const {unescape:dec}=require('node:querystring');module.exports=dec(visibleQueryStringFunction);"],
  ['computed native member',
    "const ns=require('node:querystring');const method='escape';module.exports=ns[method](visibleQueryStringFunction);"],
  ['computed destructure from native namespace',
    "const ns=require('node:querystring');const method='unescape';const {[method]:dec}=ns;module.exports=dec(visibleQueryStringFunction);"],
  ['bound native callable captures function',
    "const ns=require('node:querystring');const enc=ns.escape.bind(null,visibleQueryStringFunction);module.exports=enc();"],
  ['Reflect.apply on native method',
    "const ns=require('node:querystring');module.exports=Reflect.apply(ns.escape,null,[visibleQueryStringFunction]);"],
  ['assignment destructure from native namespace',
    "const ns=require('node:querystring');let enc;({escape:enc}=ns);module.exports=enc(visibleQueryStringFunction);"],
  ['computed assignment destructure from native namespace',
    "const ns=require('node:querystring');let dec;const method='unescape';({[method]:dec}=ns);module.exports=dec(visibleQueryStringFunction);"],
  ['destructure with default from native namespace',
    "const {escape:enc=(x)=>x}=require('node:querystring');module.exports=enc(visibleQueryStringFunction);"]
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
    "import ns from 'node:querystring';export const result=ns.unescape(visibleQueryStringFunction);"],
  ['computed imported native member',
    "import * as ns from 'node:querystring';const method='escape';export const result=ns[method](visibleQueryStringFunction);"]
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

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  test(mode+' reports same-file private yield under native querystring observer',()=>{
    const source="'use strict';"+
      "function observedNativeSource(){return 'PUBLIC_QUERYSTRING_SOURCE_BODY';}"+
      "const q=require('node:querystring');"+
      "const privatelyHeld='INERT_PRIVATE_SAMEFILE_QUERYSTRING_20261122';"+
      "module.exports={source:q.escape(observedNativeSource),privateValue:privatelyHeld};";
    const emitted=obfuscateFiles([{
      path:'querystring-yield.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'querystring-samefile-yield/'+mode,
      strings:true,identifiers:false,properties:false}).files[0];
    assert.equal(JSON.stringify(execute(String(emitted.code))),
      JSON.stringify(execute(source)));
    console.log('QUERYSTRING_SAMEFILE_YIELD '+JSON.stringify({
      mode,privateValuePresent:true,rewrittenLiterals:emitted.metrics.literals,
      nativeSourceParity:true
    }));
  });
}

test('bounded same-file selective rewrite is semantically possible',()=>{
  const privateLiteral='PRIVATE_OUTSIDE_EXACT_FUNCTION_SOURCE_20261122';
  const source="'use strict';"+
    "function nativeObserved(){return 'PUBLIC_FUNCTION_SOURCE_INTACT';}"+
    "const data='"+privateLiteral+"';"+
    "module.exports={source:require('node:querystring').escape(nativeObserved),data};";
  const xorKey=73;
  const encoded=Array.from(privateLiteral,character=>
    character.charCodeAt(0)^xorKey);
  const decodedExpression="String.fromCharCode(...["+encoded.join(',')+
    "].map(n=>n^"+xorKey+"))";
  const transformed=source.replace("'"+privateLiteral+"'",decodedExpression);
  assert.notEqual(transformed,source);
  assert.ok(!transformed.includes(privateLiteral));
  const expected=execute(source);
  const actual=execute(transformed);
  assert.equal(JSON.stringify(actual),JSON.stringify(expected));
  // The native source observer in the same file continues to see the
  // original callable text because its lexical interval was untouched.
  assert.match(/** @type {{source:string}} */ (actual).source,
    /PUBLIC_FUNCTION_SOURCE_INTACT/);
  console.log('SOURCE_SLICE_COUNTERFACTUAL '+JSON.stringify({
    nativeParity:true,privateLiteralTransformed:true,
    sourceVisibleCallableUnmodified:true
  }));
});
