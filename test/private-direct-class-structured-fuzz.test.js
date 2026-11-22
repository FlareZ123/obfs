'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @typedef {'coo'|'sno'} Mode */

/**
 * @param {string} code
 * @param {Mode} mode
 * @returns {{code:string,properties:number}}
 */
function compile(code,mode){
  const file=obfuscateFiles([{
    path:'private-direct-class-fuzz.cjs',sourceType:'commonjs',code
  }],{mode,seed:'agent9-private-class-fuzz/'+mode,
    properties:true,identifiers:false,strings:false}).files[0];
  assert.equal(typeof file.code,'string');
  return {code:/** @type {string} */ (file.code),
    properties:file.metrics.properties};
}

/**
 * Run the original and generated programs in equivalent isolated contexts,
 * without cross-realm object identity assumptions.
 * @param {string} code
 * @returns {string}
 */
function evaluate(code){
  const context={module:{exports:/** @type {unknown} */ (null)}};
  vm.runInNewContext(code,context,{filename:'private-direct-class-fuzz.cjs',timeout:2000});
  const result=context.module.exports;
  if(typeof result==='function')return 'function:'+result.toString();
  if(result!==null&&typeof result==='object'){
    const proto=Object.getPrototypeOf(result);
    if(proto&&typeof proto.read==='function')return 'instance:'+proto.read.toString();
  }
  return JSON.stringify(result);
}

const ownerNames=['privateOwner','sourceStore','$owner','item'];
const classNames=['Reader','Signal','Q'];
const fields=['privateField','cachedValue','$hidden','x0'];
const methods=['read','value','getValue','m0'];
const values=['7','0','-11','true','false','null','"safe"','(3*4)'];
const suffixes=[
  'module.exports=reader.read();',
  'module.exports=[reader.read(),reader.read()];',
  'const value=reader.read();module.exports=value;',
  'module.exports=String(reader.read());'
];
const escaped=[
  'module.exports=reader;',
  'module.exports=reader.read;',
  'module.exports=Reader;',
  'module.exports=reader.read.toString();',
  'module.exports=Object.getPrototypeOf(reader).read.toString();',
  'module.exports=eval("reader.read.toString()");',
  'module.exports=Function("return 2")();',
  'const alias=reader;module.exports=alias.read();',
  'module.exports={reader};',
  'const callable=reader.read;module.exports=callable();',
  'module.exports=reader["read"]();',
  'module.exports=reader?.read();',
  'module.exports=reader.read?.();',
  'module.exports=reader.read.call(reader);',
  'module.exports=[reader.read(),reader.read];',
  'module.exports=Reflect.get(reader,"read").toString();'
];

for(const mode of /** @type {Mode[]} */ (['coo','sno'])){
  test(mode+' 128 reproducible primitive class source-positive variants',()=>{
    for(let i=0;i<128;i++){
      const owner=ownerNames[i%ownerNames.length];
      const cls=classNames[Math.floor(i/4)%classNames.length];
      const field=fields[Math.floor(i/3)%fields.length];
      const method=methods[Math.floor(i/5)%methods.length];
      const value=values[Math.floor(i/7)%values.length];
      const suffix=suffixes[Math.floor(i/11)%suffixes.length]
        .replaceAll('reader.read()', 'reader.'+method+'()');
      const code='const '+owner+'={'+field+':'+value+'};'+
        'class '+cls+'{'+method+'(){return '+owner+'.'+field+';}}'+
        'const reader=new '+cls+'();'+suffix;
      const built=compile(code,mode);
      assert.ok(built.properties>0,JSON.stringify({mode,i,code,built}));
      assert.equal(evaluate(built.code),evaluate(code),
        JSON.stringify({mode,i,code,emitted:built.code}));
    }
  });

  test(mode+' 16 escaped class/method source negative controls',()=>{
    const prefix=[
      'const owner={hidden:7};',
      'class Reader{read(){return owner.hidden;}}',
      'const reader=new Reader();'
    ].join('');
    for(let i=0;i<escaped.length;i++){
      const code=prefix+escaped[i];
      const built=compile(code,mode);
      assert.equal(built.properties,0,JSON.stringify({mode,i,code,built}));
      assert.equal(built.code,code,JSON.stringify({mode,i,code,built}));
      assert.equal(evaluate(built.code),evaluate(code),JSON.stringify({mode,i}));
    }
  });
}
