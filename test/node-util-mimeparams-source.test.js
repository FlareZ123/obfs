'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {unknown} */
function runCjs(code) {
  const context={module:{exports:null},require};
  vm.runInNewContext(code,context,{filename:'mimeparams-source.cjs',timeout:1500});
  return context.module.exports;
}

/** @param {string} code @returns {Promise<unknown>} */
async function runEsm(code) {
  return (await import('data:text/javascript;base64,'+
    Buffer.from(code).toString('base64'))).value;
}

const fn="function nativeMimeParamsVisibleFunction(){return 'PRIVATE_MIME_PARAMS_BODY_20261122';}";
/** @type {readonly [string,string][]} */
const cjsCases=[
  ['native direct MIMEParams constructor',
    "const {MIMEParams}=require('node:util');const params=new MIMEParams();params.set('label',nativeMimeParamsVisibleFunction);module.exports=params.get('label');"],
  ['MIMEType params member',
    "const {MIMEType}=require('node:util');const mime=new MIMEType('text/plain');mime.params.set('label',nativeMimeParamsVisibleFunction);module.exports=mime.params.get('label');"],
  ['MIMEType params detached alias',
    "const {MIMEType}=require('node:util');const mime=new MIMEType('text/plain');const params=mime.params;const alias=params;alias.set('label',nativeMimeParamsVisibleFunction);module.exports=mime.params.get('label');"],
  ['MIMEType computed params alias',
    "const {MIMEType}=require('node:util');const mime=new MIMEType('text/plain');const key='params';const params=mime[key];params.set('label',nativeMimeParamsVisibleFunction);module.exports=params.get('label');"],
  ['MIMEType params destructuring',
    "const {MIMEType}=require('node:util');const {params}=new MIMEType('text/plain');params.set('label',nativeMimeParamsVisibleFunction);module.exports=params.get('label');"],
  ['MIMEParams Reflect.apply method',
    "const {MIMEParams}=require('node:util');const p=new MIMEParams();Reflect.apply(p.set,p,['label',nativeMimeParamsVisibleFunction]);module.exports=p.get('label');"],
  ['MIMEParams bound method with captured callable',
    "const {MIMEParams}=require('node:util');const p=new MIMEParams();const setter=p.set.bind(p,'label',nativeMimeParamsVisibleFunction);setter();module.exports=p.get('label');"],
  ['MIMEType type setter diagnostic',
    "const {MIMEType}=require('node:util');const mime=new MIMEType('text/plain');try{mime.type=nativeMimeParamsVisibleFunction;}catch(error){module.exports=error.message;}"],
  ['MIMEType subtype setter diagnostic',
    "const {MIMEType}=require('node:util');const mime=new MIMEType('text/plain');try{mime.subtype=nativeMimeParamsVisibleFunction;}catch(error){module.exports=error.message;}"],
  ['MIMEType reflective type setter diagnostic',
    "const {MIMEType}=require('node:util');const mime=new MIMEType('text/plain');try{Reflect.set(mime,'type',nativeMimeParamsVisibleFunction);}catch(error){module.exports=error.message;}"],
  ['MIMEType Object.assign subtype setter diagnostic',
    "const {MIMEType}=require('node:util');const mime=new MIMEType('text/plain');try{Object.assign(mime,{subtype:nativeMimeParamsVisibleFunction});}catch(error){module.exports=error.message;}"],
  ['MIMEParams.set native method call',
    "const {MIMEParams}=require('node:util');const mime=new MIMEParams();mime.set.call(mime,'label',nativeMimeParamsVisibleFunction);module.exports=mime.get('label');"],
  ['MIMEParams constructor alias',
    "const util=require('node:util');const ns=util;const {MIMEParams:Params}=ns;const p=new Params();p.set('label',nativeMimeParamsVisibleFunction);module.exports=p.get('label');"]
];

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  for(const [label,suffix] of cjsCases) {
    test(mode+' native MIME params/function-source parity '+label,()=>{
      const source="'use strict';"+fn+suffix;
      const emitted=obfuscateFiles([{
        path:'mimeparams-source.cjs',sourceType:'commonjs',code:source
      }],{mode,seed:'native-mimeparams/'+mode+'/'+label,
        strings:true,identifiers:false,properties:false}).files[0];
      const original=runCjs(source);
      assert.match(String(original),/PRIVATE_MIME_PARAMS_BODY_20261122/);
      assert.equal(runCjs(String(emitted.code)),original);
      assert.equal(observesFunctionSource(parse(source,'commonjs')),true);
    });
  }

  test(mode+' native MIMEParams ESM named constructor source parity',async()=>{
    const source=fn+
      "import {MIMEParams as Params} from 'node:util';"+
      "const p=new Params();p.set('label',nativeMimeParamsVisibleFunction);"+
      "export const value=p.get('label');";
    const emitted=obfuscateFiles([{
      path:'mimeparams-source.mjs',sourceType:'module',code:source
    }],{mode,seed:'native-mimeparams-esm/'+mode,
      strings:true,identifiers:false,properties:false}).files[0];
    assert.equal(await runEsm(String(emitted.code)),await runEsm(source));
    assert.equal(observesFunctionSource(parse(source,'module')),true);
  });

  test(mode+' native MIME params private-positive primitive-only literal',()=>{
    const source="'use strict';const {MIMEType}=require('node:util');"+
      "const mime=new MIMEType('text/plain');mime.params.set('label','literal');"+
      "module.exports=[mime.params.get('label'),'INERT_PRIVATE_MIME_PARAMS_20261122'];";
    const emitted=obfuscateFiles([{
      path:'mimeparams-positive.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'native-mimeparams-positive/'+mode,
      strings:true,identifiers:false,properties:false}).files[0];
    assert.equal(JSON.stringify(runCjs(String(emitted.code))),
      JSON.stringify(runCjs(source)));
    assert.ok(emitted.metrics.literals>0,'Inert literal remains eligible');
  });
}
