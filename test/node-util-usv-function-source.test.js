'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Use actual native Node util.ToUSVString. The returned string may expose
 * Function.prototype.toString without any explicit source-inspection syntax.
 * @param {string} code
 * @returns {unknown}
 */
function runCjs(code) {
  const context={module:{exports:null},require};
  vm.runInNewContext(code,context,{filename:'usv-source.cjs',timeout:1500});
  return context.module.exports;
}

/** @param {string} code @returns {Promise<unknown>} */
async function runEsm(code) {
  return (await import('data:text/javascript;base64,'+
    Buffer.from(code).toString('base64'))).value;
}

const fn="function nativeUsvSourceFunction(){return 'UNTRANSFORMED_USV_FUNCTION_BODY_20261122';}";
const cases=[
  ['direct require', "module.exports=require('node:util').toUSVString(nativeUsvSourceFunction);"],
  ['namespace and alias', "const n=require('node:util');const q=n;module.exports=q.toUSVString(nativeUsvSourceFunction);"],
  ['destructured native method', "const {toUSVString:enc}=require('node:util');module.exports=enc(nativeUsvSourceFunction);"],
  ['detached native method', "const n=require('node:util');const enc=n.toUSVString;module.exports=enc(nativeUsvSourceFunction);"],
  ['computed method', "const n=require('node:util');const name='toUSVString';module.exports=n[name](nativeUsvSourceFunction);"],
  ['direct bind captured callable', "const n=require('node:util');const f=n.toUSVString.bind(null,nativeUsvSourceFunction);module.exports=f();"],
  ['direct call', "const n=require('node:util');module.exports=n.toUSVString.call(null,nativeUsvSourceFunction);"],
  ['direct apply', "const n=require('node:util');module.exports=n.toUSVString.apply(null,[nativeUsvSourceFunction]);"],
  ['reflect apply', "const n=require('node:util');module.exports=Reflect.apply(n.toUSVString,null,[nativeUsvSourceFunction]);"],
  ['assigned destructure', "const n=require('node:util');let enc;({toUSVString:enc}=n);module.exports=enc(nativeUsvSourceFunction);"],
  ['default destructure', "const n=require('node:util');const {toUSVString:enc=(x)=>x}=n;module.exports=enc(nativeUsvSourceFunction);"]
];

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  for(const [label,suffix] of cases) {
    test(mode+' native util.toUSVString callable source '+label,()=>{
      const source="'use strict';"+fn+suffix;
      const result=obfuscateFiles([{
        path:'usv-source.cjs',sourceType:'commonjs',code:source
      }],{mode,seed:'native-usv/'+mode+'/'+label,
        strings:true,identifiers:false,properties:false}).files[0];
      assert.equal(runCjs(String(result.code)),runCjs(source));
      assert.equal(observesFunctionSource(parse(source,'commonjs')),true);
    });
  }

  test(mode+' native util.toUSVString ESM named/default import parity',async()=>{
    for(const suffix of [
      "import {toUSVString as enc} from 'node:util';export const value=enc(nativeUsvSourceFunction);",
      "import util from 'node:util';export const value=util.toUSVString(nativeUsvSourceFunction);"
    ]) {
      const source=fn+suffix;
      const result=obfuscateFiles([{
        path:'usv-source.mjs',sourceType:'module',code:source
      }],{mode,seed:'native-usv-esm/'+mode+'/'+suffix,
        strings:true,identifiers:false,properties:false}).files[0];
      assert.equal(await runEsm(String(result.code)),await runEsm(source));
      assert.equal(observesFunctionSource(parse(source,'module')),true);
    }
  });

  test(mode+' inert util.toUSVString preserves private literal yield',()=>{
    const source="'use strict';const util=require('node:util');"+
      "const owner={secret:'PRIVATE_INERT_USV_20261122'};"+
      "module.exports=[util.toUSVString('plain-value'),owner.secret];";
    const result=obfuscateFiles([{
      path:'usv-positive.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'native-usv-positive/'+mode,strings:true,
      identifiers:false,properties:false}).files[0];
    assert.equal(JSON.stringify(runCjs(String(result.code))),JSON.stringify(runCjs(source)));
    assert.ok(result.metrics.literals>0);
  });
}

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  test(mode+' records same-file private yield under Node util native source observer',()=>{
    const source="'use strict';"+
      "function visibleNativeSource(){return 'PUBLIC_UTIL_SOURCE_BODY';}"+
      "const native=require('node:util');"+
      "const privateLiteral='INERT_PRIVATE_SAMEFILE_UTIL_20261122';"+
      "module.exports={source:native.toUSVString(visibleNativeSource),privateValue:privateLiteral};";
    const emitted=obfuscateFiles([{
      path:'util-source-yield.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'util-samefile-yield/'+mode,
      strings:true,identifiers:false,properties:false}).files[0];
    assert.equal(JSON.stringify(runCjs(String(emitted.code))),
      JSON.stringify(runCjs(source)));
    console.log('NODE_UTIL_SAMEFILE_YIELD '+JSON.stringify({
      mode,nativeSourceParity:true,rewrittenLiterals:emitted.metrics.literals
    }));
  });
}
