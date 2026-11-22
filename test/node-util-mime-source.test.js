'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {unknown} */
function runCjs(code) {
  const context={module:{exports:null},require};
  vm.runInNewContext(code,context,{filename:'util-mime.cjs',timeout:1500});
  return context.module.exports;
}

/** @param {string} code @returns {Promise<unknown>} */
async function runEsm(code) {
  return (await import('data:text/javascript;base64,'+
    Buffer.from(code).toString('base64'))).value;
}

const fn="function nativeMimeVisibleFunction(){return 'PRIVATE_MIME_SOURCE_MARKER_20261122';}";
/** @type {readonly [string,string][]} */
const cjsCases=[
  ['direct require', "try{new (require('node:util').MIMEType)(nativeMimeVisibleFunction);}catch(error){module.exports=error.message;}"],
  ['namespace alias', "const util=require('node:util');const ns=util;try{new ns.MIMEType(nativeMimeVisibleFunction);}catch(error){module.exports=error.message;}"],
  ['destructured native constructor', "const {MIMEType:Type}=require('node:util');try{new Type(nativeMimeVisibleFunction);}catch(error){module.exports=error.message;}"],
  ['computed constructor member', "const util=require('node:util');const key='MIMEType';try{new util[key](nativeMimeVisibleFunction);}catch(error){module.exports=error.message;}"],
  ['Reflect.construct', "const util=require('node:util');try{Reflect.construct(util.MIMEType,[nativeMimeVisibleFunction]);}catch(error){module.exports=error.message;}"],
  ['bound constructor captures callable', "const {MIMEType:Type}=require('node:util');const Bound=Type.bind(null,nativeMimeVisibleFunction);try{new Bound();}catch(error){module.exports=error.message;}"],
  ['defaulted destructuring', "const {MIMEType:Type=class{}}=require('node:util');try{new Type(nativeMimeVisibleFunction);}catch(error){module.exports=error.message;}"],
  ['computed unknown destructuring', "function selected(){return 'MIMEType';}const {[selected()]:Type}=require('node:util');try{new Type(nativeMimeVisibleFunction);}catch(error){module.exports=error.message;}"],
  ['Reflect.construct bound method alias', "const {construct:make}=Reflect;const {MIMEType:Type}=require('node:util');try{make(Type,[nativeMimeVisibleFunction]);}catch(error){module.exports=error.message;}"]
];

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  for(const [label,suffix] of cjsCases) {
    test(mode+' native util.MIMEType diagnostic callable source '+label,()=>{
      const source="'use strict';"+fn+suffix;
      const emitted=obfuscateFiles([{
        path:'util-mime.cjs',sourceType:'commonjs',code:source
      }],{mode,seed:'native-mime/'+mode+'/'+label,
        strings:true,identifiers:false,properties:false}).files[0];
      const native=runCjs(source);
      assert.match(String(native),/PRIVATE_MIME_SOURCE_MARKER_20261122/);
      assert.equal(runCjs(String(emitted.code)),native);
      assert.equal(observesFunctionSource(parse(source,'commonjs')),true);
    });
  }

  test(mode+' native util.MIMEType ESM constructor diagnostic',async()=>{
    const source=fn+"import {MIMEType as Type} from 'node:util';"+
      "export let value;try{new Type(nativeMimeVisibleFunction);}catch(error){value=error.message;}";
    const emitted=obfuscateFiles([{
      path:'util-mime.mjs',sourceType:'module',code:source
    }],{mode,seed:'native-mime-esm/'+mode,
      strings:true,identifiers:false,properties:false}).files[0];
    assert.equal(await runEsm(String(emitted.code)),await runEsm(source));
    assert.equal(observesFunctionSource(parse(source,'module')),true);
  });

  test(mode+' valid primitive MIMEType keeps private literals eligible',()=>{
    const source="'use strict';const {MIMEType}=require('node:util');"+
      "const result=new MIMEType('text/plain').essence;"+
      "module.exports=[result,'INERT_PRIVATE_MIME_LITERAL_20261122'];";
    const emitted=obfuscateFiles([{
      path:'util-mime-positive.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'native-mime-positive/'+mode,
      strings:true,identifiers:false,properties:false}).files[0];
    assert.equal(JSON.stringify(runCjs(String(emitted.code))),
      JSON.stringify(runCjs(source)));
    assert.ok(emitted.metrics.literals>0);
  });
}
