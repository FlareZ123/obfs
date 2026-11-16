'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const {obfuscateFiles}=require('../src');

/**
 * Execute the exact CommonJS source under an isolated module instance.
 * @param {string} source
 * @returns {any}
 */
function load(source){
  const instance=new Module('array-owner-test.cjs');
  instance.filename='array-owner-test.cjs';
  instance.paths=Module._nodeModulePaths(process.cwd());
  instance._compile(source,instance.filename);
  return instance.exports;
}

/**
 * @param {string} code
 * @param {'coo'|'sno'} mode
 * @returns {ReturnType<typeof obfuscateFiles>}
 */
function compile(code,mode){
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode,seed:'array-owned-shape-proof-20261116',
    properties:true,identifiers:false,strings:false
  });
}

const positive=[
  "'use strict';",
  'const owner={secretCount:11,privateDelta:7};',
  'const holder=[owner];',
  'const first=holder[0];',
  'const second=holder[0];',
  'function read(v){return v.secretCount+v.privateDelta;}',
  'module.exports=function score(input){return read(first)+second.secretCount*input+first.privateDelta;}'
].join('\n');

test('private one-slot array preserves owned-object property renaming in COO and SNO',()=>{
  for(const mode of ['coo','sno']){
    const result=compile(positive,mode);
    const transformed=String(result.files[0].code);
    assert.ok(result.files[0].metrics.objects>=1,
      mode+' must prove one safe private owner');
    assert.ok(result.files[0].metrics.properties>=2,
      mode+' must rename both proven keys');
    assert.doesNotMatch(transformed,/secretCount|privateDelta/u,
      'Proven private labels must leave emitted source');
    const native=load(positive),encoded=load(transformed);
    for(let input=-250;input<=250;input++){
      assert.equal(encoded(input),native(input),mode+' at input '+input);
    }
  }
});

test('one-slot array that escapes or can change its indexed reference refuses renaming',()=>{
  const unsafe=[
    'module.exports={holder};',
    'holder[0]={secretCount:99,privateDelta:5}; module.exports=()=>first.secretCount;',
    'Object.freeze(holder); module.exports=()=>first.secretCount;',
    'const dynamic=0;const later=holder[dynamic]; module.exports=()=>first.secretCount;',
    'const other=holder; module.exports=()=>other[0].secretCount;',
    'holder.push(owner);module.exports=()=>first.secretCount;',
    'module.exports=()=>holder[0].secretCount;',
    'delete holder[0];module.exports=()=>first.secretCount;',
    'const {length}=holder; module.exports=()=>first.secretCount+length;'
  ];
  const head='const owner={secretCount:11,privateDelta:7};const holder=[owner];const first=holder[0];';
  for(const suffix of unsafe){
    const source=head+suffix;
    for(const mode of ['coo','sno']){
      const result=compile(source,mode);
      assert.equal(result.files[0].metrics.objects,0,
        'Unsafe holder must block the owner proof: '+source);
      const native=load(source);
      const encoded=load(String(result.files[0].code));
      if(typeof native==='function'){
        assert.equal(encoded(),native());
      }else if('holder' in native){
        assert.equal(encoded.holder[0].secretCount,native.holder[0].secretCount);
      }
    }
  }
});

test('single-slot array supports direct owner references and safe aliases in one module',()=>{
  const source=[
    'const owner={secretCount:19};',
    'const holder=[owner];',
    'const alias=holder[0];',
    'module.exports=function compute(n){return alias.secretCount*n+owner.secretCount;}'
  ].join('\n');
  for(const mode of ['coo','sno']){
    const result=compile(source,mode);
    assert.ok(result.files[0].metrics.objects>=1);
    const native=load(source),encoded=load(String(result.files[0].code));
    for(let n=-21;n<=21;n++)assert.equal(encoded(n),native(n));
  }
});
