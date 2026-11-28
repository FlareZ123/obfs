'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {(n:number)=>number} */
function load(code){
  const child=new Module('multi-slot-fuzz.cjs');
  child.filename='multi-slot-fuzz.cjs';
  child.paths=Module._nodeModulePaths(process.cwd());
  child._compile(code,child.filename);
  return /** @type {(n:number)=>number} */(child.exports);
}

/** @param {string} code @param {'coo'|'sno'} mode */
function compile(code,mode){
  return obfuscateFiles([{path:'fuzz.cjs',sourceType:'commonjs',code}],{
    mode,seed:'agent6-multi-owner-fuzz-20261128',
    strings:false,identifiers:false,properties:true
  });
}

/**
 * Deterministic varied closed-world private carriers. Every record contains
 * 2-5 references to the same private owner plus 0-2 inert primitive fields.
 * All holder reads are assigned to unique immutable aliases; owner accesses
 * traverse both aliases and direct references. Random insertion order and
 * alternating bracket/dot names exercise the exact slot-set proof.
 * @param {number} seed
 * @returns {string}
 */
function sourceFrom(seed){
  let state=(Math.imul(seed+1,0x9e3779b1)>>>0)||1;
  /** @returns {number} */
  function rand(){
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return state>>>0;
  }
  const count=2+rand()%4,metadata=rand()%3;
  const keys=Array.from({length:count},(_,i)=>'slot'+i);
  const fields=[];
  for(let j=0;j<metadata;j++)fields.push('tag'+j+':'+['true','12','9n'][j]);
  for(const key of keys)fields.splice(rand()%(fields.length+1),0,key+':vault');
  const reads=keys.map((key,i)=>'const alias'+i+'=holder'+
    (i%2?'["'+key+'"]':'.'+key)+';');
  const terms=keys.map((_,i)=>'(alias'+i+'.hiddenCount+alias'+i+
    '.privateDelta*'+(i+1)+')').join('+');
  return [
    'const vault={hiddenCount:41,privateDelta:3,checksum:7};',
    'const holder={'+fields.join(',')+'};',
    ...reads,
    'function privateRun(n){return n*('+terms+')+vault.checksum;}',
    'module.exports=function run(n){return privateRun(n);}'
  ].join('\n');
}

test('256 seeded private multi-slot carrier records match native in COO and SNO',{
  timeout:60000
},()=>{
  for(let seed=0;seed<256;seed++){
    const source=sourceFrom(seed);
    const native=load(source);
    for(const mode of ['coo','sno']){
      const output=compile(source,/** @type {'coo'|'sno'} */ (mode));
      assert.equal(output.files[0].metrics.properties,3,
        'seed '+seed+' mode '+mode+' should rename three true owner fields');
      const encoded=String(output.files[0].code);
      assert.doesNotMatch(encoded,/hiddenCount|privateDelta|checksum/u);
      const run=load(encoded);
      for(const n of [-101,-17,-1,0,1,19,127])
        assert.equal(run(n),native(n),'seed '+seed+' mode '+mode+' n '+n);
    }
  }
});

test('64 seeded records refuse when the carrier is exposed or mutated',{
  timeout:30000
},()=>{
  for(let seed=0;seed<64;seed++){
    const source=sourceFrom(seed);
    const mutations=[
      source.replace('module.exports=function run(n){',
        'Object.keys(holder);module.exports=function run(n){'),
      source.replace('module.exports=function run(n){',
        'const escaped=holder;module.exports=function run(n){'),
      source.replace('module.exports=function run(n){',
        'holder.slot0={hiddenCount:0};module.exports=function run(n){')
    ];
    for(const unsafe of mutations) {
      for(const mode of ['coo','sno']){
        const result=compile(unsafe,/** @type {'coo'|'sno'} */ (mode));
        assert.equal(result.files[0].metrics.objects,0,
          'seed '+seed+' mode '+mode+' dangerous holder access');
        assert.match(String(result.files[0].code),/hiddenCount/u);
      }
    }
  }
});

test('static attacker still reconstructs all three source-only renamed fields',()=>{
  const {neutralizeHashedNames}=require('../sims/offline-normalize');
  const source=sourceFrom(23),compiled=compile(source,'coo');
  assert.equal(compiled.files[0].metrics.properties,3);
  const attacker=neutralizeHashedNames([{
    path:'fuzz.cjs',sourceType:'commonjs',code:String(compiled.files[0].code)
  }]);
  assert.equal(attacker.properties,3,
    'Code-size-neutral property renaming is not a static secrecy guarantee');
  const baseline=load(source),recovered=load(String(attacker.files[0].code));
  for(let n=-100;n<=100;n++)assert.equal(recovered(n),baseline(n));
});
