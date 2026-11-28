'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {(n:number)=>number} */
function load(source){
  const entry=new Module('agent6-symbol-shared-owner.cjs');
  entry.filename='agent6-symbol-shared-owner.cjs';
  entry.paths=Module._nodeModulePaths(process.cwd());
  entry._compile(source,entry.filename);
  return /** @type {(n:number)=>number} */ (entry.exports);
}

/** @param {string} source @param {'sco'|'coo'|'sno'} mode */
function compile(source,mode){
  return obfuscateFiles([{path:'owner.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'agent6-symbol-repeated-carrier-20261128',
    experimentalSymbolKeys:true,properties:true,strings:false,identifiers:false
  });
}

const carriers=[
  ['record',[
    'const owner={hiddenCount:23,secretDelta:3};',
    'const holder={first:owner,second:owner,tag:1};',
    'const a=holder.first,b=holder.second;',
    'function privateRead(n){return a.hiddenCount*n+b.secretDelta;}',
    'module.exports=function run(n){return privateRead(n);}'
  ].join('\n')],
  ['tuple',[
    'const owner={hiddenCount:23,secretDelta:3};',
    'const holder=[owner,12,owner];',
    'const a=holder[0],b=holder[2];',
    'function privateRead(n){return a.hiddenCount*n+b.secretDelta;}',
    'module.exports=function run(n){return privateRead(n);}'
  ].join('\n')]
];

test('Symbol-based private key lowering works for repeated record and tuple owner aliases',{
  timeout:30000
},()=>{
  for(const [kind,source] of carriers){
    for(const mode of /** @type {const} */(['sco','coo','sno'])){
      const output=compile(source,mode);
      assert.equal(output.files[0].metrics.symbolKeys,2,
        kind+' '+mode+' should safely lower both private owner fields to Symbols');
      const code=String(output.files[0].code);
      assert.match(code,/=Symbol\(\)/u);
      assert.doesNotMatch(code,/hiddenCount|secretDelta/u);
      assert.doesNotMatch(code,/Symbol\.for\(/u,
        'Symbol registry must not leak generated property identities');
      const original=load(source),compiled=load(code);
      for(let n=-100;n<=100;n++)
        assert.equal(compiled(n),original(n),kind+' '+mode+' n='+n);
    }
  }
});

test('Symbol backend refuses observable holder and owner reflection',()=>{
  const unsafe=[
    'const owner={hiddenCount:7};const holder={a:owner,b:owner};const x=holder.a;Object.keys(holder);function p(){return x.hiddenCount;}module.exports=()=>p();',
    'const owner={hiddenCount:7};const holder={a:owner,b:owner};const x=holder.a;Object.keys(owner);function p(){return x.hiddenCount;}module.exports=()=>p();',
    'const owner={hiddenCount:7};const holder=[owner,owner];const x=holder[0];Object.keys(holder);function p(){return x.hiddenCount;}module.exports=()=>p();',
    'const owner={hiddenCount:7};const holder=[owner,owner];const x=holder[0];Reflect.ownKeys(owner);function p(){return x.hiddenCount;}module.exports=()=>p();'
  ];
  for(const source of unsafe)
    for(const mode of /** @type {const} */(['sco','coo','sno'])){
      const output=compile(source,mode);
      assert.equal(output.files[0].metrics.symbolKeys,0,
        mode+' must not turn observable private-string keys into Symbols');
      assert.match(String(output.files[0].code),/hiddenCount/u);
      const native=load(source),after=load(String(output.files[0].code));
      for(let n of [-2,0,1,9])assert.equal(after(n),native(n));
    }
});
