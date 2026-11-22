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
  ['detached native method', "const n=require('node:util');const enc=n.toUSVString;module.exports=enc(nativeUsvSourceFunction);"]
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
