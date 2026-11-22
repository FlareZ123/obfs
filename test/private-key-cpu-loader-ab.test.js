'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

const original="'use strict';"+
  'const owner={acc:5,step:3};'+
  'function hidden(x){owner.acc+=((x&7)+owner.step);return owner.acc|0;}'+
  'module.exports=function compute(x){return hidden(x);};';

/** @typedef {{checksum:number,cpuMs:number,wallMs:number}} Sample */
/** @typedef {{cpuRatio:number,wallRatio:number,native:Sample,emitted:Sample}} Pair */

/** @param {string} s @returns {string} */
function sha(s){return createHash('sha256').update(s).digest('hex');}

/** @param {(x:number)=>number} fn @param {number} n @returns {number} */
function work(fn,n) {
  let checksum=0;
  for(let i=0;i<n;i++)checksum^=fn(((i*13)^(i>>>5))|0);
  return checksum|0;
}

/** @param {(x:number)=>number} fn @param {number} warm @param {number} hot @returns {Sample} */
function measure(fn,warm,hot){
  work(fn,warm);
  const cpu=process.cpuUsage();
  const wall=process.hrtime.bigint();
  const checksum=work(fn,hot);
  const elapsed=process.cpuUsage(cpu);
  return {checksum,cpuMs:(elapsed.user+elapsed.system)/1000,
    wallMs:Number(process.hrtime.bigint()-wall)/1e6};
}

/** @param {number[]} x @returns {number} */
function median(x){const a=[...x].sort((p,q)=>p-q);return a[Math.floor(a.length/2)];}

test('byte-identical generated Symbol CPU across native require and dynamic Function in one work callsite',
  async()=>{
    const f=obfuscateFiles([{path:'entry.cjs',
      sourceType:/** @type {const} */ ('commonjs'),code:original}],{
      mode:'coo',seed:'symbol-private-hot-cpu-20261122',
      strings:false,identifiers:false,properties:true,experimentalSymbolKeys:true
    }).files[0];
    assert.equal(f.metrics.symbolKeys,2);
    assert.equal(typeof f.code,'string');
    const emitted=/** @type {string} */ (f.code);
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-loader-ab-'));
    const nativePath=path.join(directory,'native.cjs');
    const emittedPath=path.join(directory,'emitted.cjs');
    try {
      await atomicWrite(nativePath,original);
      await atomicWrite(emittedPath,emitted);
      const warm=15000000,hot=25000000,pre=2000000,counts=7;
      /** @type {Array<{loader:string,pairs:Pair[],medianCpuRatio:number,medianWallRatio:number,strictCpuBreaches:number}>} */
      const results=[];
      for(const loader of /** @type {Array<'require'|'newFunction'>} */ (['require','newFunction'])){
        /** @param {'native'|'emitted'} kind @returns {(x:number)=>number} */
        const fresh=kind=>{
          const source=kind==='native'?original:emitted;
          if(loader==='newFunction'){
            /** @type {{exports:unknown}} */
            const module={exports:null};
            new Function('module','exports',source)(module,module.exports);
            assert.equal(typeof module.exports,'function');
            return /** @type {(x:number)=>number} */ (module.exports);
          }
          const file=kind==='native'?nativePath:emittedPath;
          const resolved=require.resolve(file);
          delete require.cache[resolved];
          const fn=require(resolved);
          assert.equal(typeof fn,'function');
          return /** @type {(x:number)=>number} */ (fn);
        };
        work(fresh('native'),pre);
        work(fresh('emitted'),pre);
        /** @type {Pair[]} */
        const pairs=[];
        for(let i=0;i<counts;i++){
          const native=fresh('native');
          const candidate=fresh('emitted');
          const first=i%2===0?measure(native,warm,hot):measure(candidate,warm,hot);
          const second=i%2===0?measure(candidate,warm,hot):measure(native,warm,hot);
          const control=i%2===0?first:second;
          const alternative=i%2===0?second:first;
          assert.equal(alternative.checksum,control.checksum);
          assert.ok(alternative.cpuMs>0&&control.cpuMs>0);
          pairs.push({native:control,emitted:alternative,
            cpuRatio:alternative.cpuMs/control.cpuMs,
            wallRatio:alternative.wallMs/control.wallMs});
        }
        const ratios=pairs.map(p=>p.cpuRatio);
        results.push({loader,pairs,medianCpuRatio:median(ratios),
          medianWallRatio:median(pairs.map(p=>p.wallRatio)),
          strictCpuBreaches:ratios.filter(r=>r>2.5).length});
      }
      console.log('BYTE_EXACT_LOADER_AB_PROFILE '+JSON.stringify({
        node:process.version,platform:process.platform,
        source:{sha256:sha(original),bytes:Buffer.byteLength(original)},
        emitted:{sha256:sha(emitted),bytes:Buffer.byteLength(emitted)},
        warmCallsPerArm:warm,hotCallsPerArm:hot,
        preconditioningCallsPerCallable:pre,pairedSamplesPerLoader:counts,
        identicalWorkFunction:true,results
      }));
      assert.equal(results.length,2);
    }finally{
      await fs.rm(directory,{recursive:true,force:true});
    }
  }
);
