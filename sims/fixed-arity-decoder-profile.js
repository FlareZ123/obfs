'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {recoverObfuscatedStrings}=require('./static-string-recovery');

/** @typedef {'native'|'spread'|'fixedArity'} Candidate */
/** @typedef {{medianMs:number,minMs:number,maxMs:number,ratioToNative:number}} Times */

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @param {string} code
 * @param {vm.Script|null} compiled
 * @returns {{output:string,ms:number}}
 */
function execute(code,compiled) {
  const context={module:{exports:''}};
  const start=performance.now();
  (compiled??new vm.Script(code,{filename:'sample.cjs'})).runInNewContext(context,{timeout:12000});
  return {output:JSON.stringify(context.module.exports),ms:performance.now()-start};
}

/** @param {number} utf16Units @param {number} work @returns {string} */
function workload(utf16Units,work) {
  const motif='A😀Z'+String.fromCharCode(0xD800,0xDC00,0,0xFFFF);
  const units=motif.repeat(Math.ceil(utf16Units/motif.length)).slice(0,utf16Units);
  return 'const literal='+JSON.stringify(units)+';'+
    'let acc=0;for(let k=0;k<'+work+';k++){'+
    'acc=(Math.imul(acc^literal.length^k,1664525)+1013904223)|0;'+
    '}module.exports={checksum:acc,literal};';
}

/**
 * @param {string} source
 * @param {boolean} fixedArity
 * @returns {{code:string,literals:number}}
 */
function transform(source,fixedArity) {
  const generated=obfuscateFiles([{path:'sample.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'fixed-arity-comparison-'+source.length,
    strings:true,properties:false,identifiers:false,
    experimentalFixedArityStrings:fixedArity
  }).files[0];
  return {code:String(generated.code),literals:generated.metrics.literals};
}

/** @param {number} units @param {number} work @returns {object} */
function profile(units,work) {
  const native=workload(units,work);
  const spread=transform(native,false);
  const fixed=transform(native,true);
  assert.ok(spread.literals>0&&fixed.literals>0);
  const code={native,spread:spread.code,fixedArity:fixed.code};
  const expected=execute(native,null).output;
  for(const [name,program] of Object.entries(code)) {
    assert.equal(execute(program,null).output,expected,name+' native parity');
    if(name==='native')continue;
    const attacker=recoverObfuscatedStrings(program,'commonjs');
    assert.ok(attacker.literals>0,name+' source-only recoverability');
    assert.equal(execute(attacker.code,null).output,expected,name+' static clone parity');
  }

  /** @type {{[strategy:string]:{[candidate:string]:number[]}}} */
  const measurements={cold:{native:[],spread:[],fixedArity:[]},
    precompiled:{native:[],spread:[],fixedArity:[]}};
  /** @type {Candidate[]} */
  const candidates=['native','spread','fixedArity'];
  const compiled=Object.fromEntries(candidates.map(name=>[name,new vm.Script(code[name])]));
  for(let repeat=0;repeat<29;repeat++) {
    const ordered=[...candidates.slice(repeat%3),...candidates.slice(0,repeat%3)];
    for(const name of ordered) {
      const cold=execute(code[name],null);
      const precompiled=execute(code[name],compiled[name]);
      assert.equal(cold.output,expected);
      assert.equal(precompiled.output,expected);
      if(repeat>=7) {
        measurements.cold[name].push(cold.ms);
        measurements.precompiled[name].push(precompiled.ms);
      }
    }
  }
  /** @type {Record<string,Record<string,Times>>} */
  const timings={};
  for(const [kind,samples] of Object.entries(measurements)) {
    timings[kind]={};
    const base=median(samples.native);
    for(const name of candidates) {
      const values=samples[name];
      timings[kind][name]={medianMs:median(values),minMs:Math.min(...values),
        maxMs:Math.max(...values),ratioToNative:median(values)/base};
    }
  }
  return {utf16Units:units,workIterations:work,sourceBytes:{
    native:code.native.length,spread:code.spread.length,fixedArity:code.fixedArity.length
  },encodedLiterals:{spread:spread.literals,fixedArity:fixed.literals},timings};
}

const observations=[];
for(const units of [2049,52500]) {
  for(const work of [0,100000])observations.push(profile(units,work));
}
process.stdout.write(JSON.stringify({node:process.version,platform:process.platform,
  experiment:'paired native/legacy-spread/fixed-arity exact-source comparison',
  warning:'VM-local process/realm samples only; not a general 2.5x runtime bound, and source-only recovery succeeds',
  observations},null,2)+'\n');
