'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');

/**
 * Source-known private record owners, each consumed only by a lexical,
 * non-exported direct-call helper. No host mutation or exact-source observer.
 * @param {number} size
 * @returns {string}
 */
function fixture(size) {
  /** @type {string[]} */
  const lines=[];
  for(let i=0;i<size;i++) {
    lines.push('const owner'+i+'={secret'+i+':'+(3*i+2)+',salt'+i+':17};');
    lines.push('function reader'+i+'(){return owner'+i+'.secret'+i+
      '+owner'+i+'.salt'+i+';}');
    lines.push('const value'+i+'=reader'+i+'();');
  }
  lines.push('module.exports=['+Array.from({length:size},(_,i)=>'value'+i).join(',')+'];');
  return lines.join('\n');
}

/** @param {number[]} values @returns {number} */
function median(values){
  const s=[...values].sort((a,b)=>a-b);
  return s[Math.floor(s.length/2)];
}

/**
 * @param {{obfuscateFiles:typeof import('../src').obfuscateFiles}} compiler
 * @param {number} size
 * @returns {{ms:number,hash:string,properties:number}}
 */
function compile(compiler,size) {
  const code=fixture(size);
  const start=performance.now();
  const out=compiler.obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode:'coo',seed:'private-callable-matched-'+size,
    identifiers:false,strings:false,properties:true
  });
  const ms=performance.now()-start;
  assert.equal(out.files.length,1);
  const file=out.files[0];
  assert.equal(typeof file.code,'string');
  assert.ok(file.metrics.properties>=size);
  const hash=createHash('sha256').update(String(file.code)).digest('hex');
  return {ms,hash,properties:file.metrics.properties};
}

/**
 * One isolated Node process loads two source-pinned installations. Its
 * balanced orders are matched within an OS/runner, rather than comparing
 * unrelated CI machines or extrapolating universal compiler cost.
 *
 * Usage: node sims/property-private-cache-paired.js <baseline-dir> <candidate-dir>
 *
 * @param {string[]} paths
 */
function main(paths){
  assert.equal(paths.length,2,'Expected baseline and candidate directory');
  const variants=paths.map(dir=>
    /** @type {{obfuscateFiles:typeof import('../src').obfuscateFiles}} */
    (require(path.resolve(dir,'src'))));
  for(const size of [32,128])for(const compiler of variants)compile(compiler,size);
  /** @type {{size:number,sourceBytes:number,baselineMs:number[],candidateMs:number[],baselineMedianMs:number,candidateMedianMs:number,ratio:number,properties:number,hash:string}[]} */
  const rows=[];
  for(const size of [256,512,1024]){
    /** @type {[number[],number[]]} */
    const samples=[[],[]];
    /** @type {[string|null,string|null]} */
    const hashes=[null,null];
    /** @type {[number|null,number|null]} */
    const yields=[null,null];
    for(let trial=0;trial<7;trial++){
      for(const index of trial%2===0?[0,1]:[1,0]){
        const result=compile(variants[index],size);
        samples[index].push(result.ms);
        if(hashes[index]===null)hashes[index]=result.hash;
        assert.equal(result.hash,hashes[index],
          'Non-deterministic generated output in one variant');
        yields[index]=result.properties;
      }
    }
    assert.equal(hashes[0],hashes[1],
      'Cache changed emitted output bytes');
    assert.equal(yields[0],yields[1],
      'Cache changed positive property-renaming yield');
    const base=median(samples[0]),candidate=median(samples[1]);
    const row={
      size,sourceBytes:Buffer.byteLength(fixture(size)),
      baselineMs:samples[0],candidateMs:samples[1],
      baselineMedianMs:base,candidateMedianMs:candidate,
      ratio:candidate/base,properties:/** @type {number} */(yields[0]),
      hash:/** @type {string} */ (hashes[0])
    };
    rows.push(row);
    console.log('private-callable-cache-ab '+JSON.stringify(row));
  }
  console.log('private-callable-cache-ab-done '+JSON.stringify(rows.map(r=>({
    size:r.size,ratio:r.ratio,base:r.baselineMedianMs,cache:r.candidateMedianMs
  }))));
}

if(require.main===module)main(process.argv.slice(2));
module.exports={fixture,median,compile,main};
