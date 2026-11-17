'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * The same local private owner is created on every invocation, making this
 * a representative sustained execution test for the new parameter-value path.
 * A separate one-event case includes process startup and module loading.
 */
const original=[
  'function calculate(payload){',
  '  const owner={secretField:payload,bias:7};',
  '  return owner.secretField+owner.bias;',
  '}',
  'const rounds=Number(process.argv[2]);',
  'let checksum=0;',
  'for(let index=0;index<rounds;index++)checksum+=calculate(index&1023);',
  'console.log(checksum);'
].join('\n');

/**
 * @param {string} directory
 * @param {number} rounds
 * @returns {{ms:number,output:string}}
 */
function run(directory,rounds) {
  const before=performance.now();
  const child=spawnSync(process.execPath,[path.join(directory,'entry.cjs'),String(rounds)],{
    encoding:'utf8',timeout:30000,maxBuffer:1024*1024
  });
  const elapsed=performance.now()-before;
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return {ms:elapsed,output:child.stdout};
}

/** @param {number[]} samples @returns {number} */
function median(samples) {
  const sorted=[...samples].sort((left,right)=>left-right);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @typedef {{
 *   rounds:number,
 *   samples:number,
 *   nativeMs:number,
 *   emittedMs:number,
 *   ratio:number,
 *   within2point5:boolean,
 *   equalOutput:boolean,
 *   publicCloneEqual:boolean,
 *   renamedProperties:number
 * }} ProfileRow
 */

/** @returns {Promise<{rows:ProfileRow[]}>} */
async function main() {
  const obfuscated=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:original
  }],{mode:'sno',seed:'private-formal-value-profile-20261117',
    identifiers:false,strings:false,properties:true}).files[0];
  assert.equal(obfuscated.metrics.objects,1,'Expected actual local-owner transformation');
  assert.equal(obfuscated.metrics.properties,2,'Expected two private own keys renamed');
  const native=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-formal-value-native-'));
  const emitted=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-formal-value-emitted-'));
  const cloned=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-formal-value-public-clone-'));
  /** @type {ProfileRow[]} */
  const rows=[];
  try {
    await atomicWrite(path.join(native,'entry.cjs'),original);
    await atomicWrite(path.join(emitted,'entry.cjs'),obfuscated.code);
    // The adversary obtains only the distributed bytes, and can run an exact
    // functional clone as-is. Property spelling changes are not an anti-copy
    // mechanism under SNO's full-runtime-control threat model.
    await atomicWrite(path.join(cloned,'entry.cjs'),obfuscated.code);
    for(const rounds of [1,100_000,1_000_000]) {
      const expected=run(native,rounds).output;
      const nativeTimes=[];
      const emittedTimes=[];
      for(let sample=0;sample<9;sample++) {
        const order=sample%2===0?['native','emitted']:['emitted','native'];
        for(const variant of order) {
          const result=run(variant==='native'?native:emitted,rounds);
          assert.equal(result.output,expected,'Native/emitted output parity at '+rounds);
          if(variant==='native')nativeTimes.push(result.ms);
          else emittedTimes.push(result.ms);
        }
      }
      const publicCloneEqual=run(cloned,rounds).output===expected;
      assert.ok(publicCloneEqual,'Publicly delivered script must run unchanged elsewhere');
      const nativeMs=median(nativeTimes);
      const emittedMs=median(emittedTimes);
      const ratio=emittedMs/nativeMs;
      assert.ok(Number.isFinite(ratio)&&ratio>0);
      rows.push({rounds,samples:9,nativeMs,emittedMs,ratio,
        within2point5:ratio<=2.5,equalOutput:true,publicCloneEqual,
        renamedProperties:obfuscated.metrics.properties});
    }
  } finally {
    await Promise.all([native,emitted,cloned].map(directory=>
      fs.rm(directory,{recursive:true,force:true})));
  }
  process.stdout.write('LOCAL_PARAMETER_FIELD_PROFILE '+JSON.stringify({
    node:process.version,platform:process.platform,rows,
    scope:'Paired fresh Node CJS processes with one-event and repeated local owner construction. No WAN or hostile instrumentation included.'
  })+'\n');
  assert.ok(rows.every(row=>row.within2point5),
    'A measured native/emitted paired process ratio exceeded 2.5x');
  return {rows};
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
