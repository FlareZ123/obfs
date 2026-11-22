'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {transformSync}=require('esbuild');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

const original = "'use strict';" +
  'const owner={acc:5,step:3};' +
  'function hidden(x){owner.acc+=((x&7)+owner.step);return owner.acc|0;}' +
  'module.exports=function compute(x){return hidden(x);};';
const symbol="'use strict';" +
  'const keyAcc=Symbol(),keyStep=Symbol();' +
  'const owner={[keyAcc]:5,[keyStep]:3};' +
  'function hidden(x){owner[keyAcc]+=((x&7)+owner[keyStep]);return owner[keyAcc]|0;}' +
  'module.exports=function compute(x){return hidden(x);};';
const computed="'use strict';" +
  'const keyAcc="_acc",keyStep="_step";' +
  'const owner={[keyAcc]:5,[keyStep]:3};' +
  'function hidden(x){owner[keyAcc]+=((x&7)+owner[keyStep]);return owner[keyAcc]|0;}' +
  'module.exports=function compute(x){return hidden(x);};';

/** @typedef {{checksum:number,wallMs:number,cpuMs:number}} Sample */
/** @typedef {{native:Sample,emitted:Sample,cpuRatio:number,wallRatio:number}} Pair */

/** @param {string} value @returns {{sha256:string,bytes:number}} */
function hash(value){
  return {sha256:createHash('sha256').update(value).digest('hex'),
    bytes:Buffer.byteLength(value)};
}

/** @param {(x:number)=>number} fn @param {number} n @returns {number} */
function work(fn,n){
  let checksum=0;
  for(let i=0;i<n;i++)checksum^=fn(((i*13)^(i>>>5))|0);
  return checksum|0;
}

/** @param {(x:number)=>number} fn @param {number} warm @param {number} hot @returns {Sample} */
function measure(fn,warm,hot){
  work(fn,warm);
  const cpuStart=process.cpuUsage();
  const wallStart=process.hrtime.bigint();
  const checksum=work(fn,hot);
  const elapsed=process.cpuUsage(cpuStart);
  return {checksum,wallMs:Number(process.hrtime.bigint()-wallStart)/1e6,
    cpuMs:(elapsed.user+elapsed.system)/1000};
}

/** @param {number[]} values @returns {number} */
function median(values){
  const a=[...values].sort((x,y)=>x-y);
  return a[Math.floor(a.length/2)];
}

/** @param {string} filename @returns {Promise<(x:number)=>number>} */
async function load(filename){
  const resolved=require.resolve(filename);
  delete require.cache[resolved];
  const fn=require(resolved);
  assert.equal(typeof fn,'function');
  return /** @type {(x:number)=>number} */ (fn);
}

test('real CommonJS require hot-key CPU compares actual private hashed and Symbol rewrites',
  async()=>{
    const input=[{path:'entry.cjs',sourceType:/** @type {const} */ ('commonjs'),code:original}];
    const base={mode:/** @type {const} */ ('coo'),seed:'symbol-private-hot-cpu-20261122',
      strings:false,identifiers:false,properties:true};
    const hashed=obfuscateFiles(input,base).files[0];
    const sym=obfuscateFiles(input,{...base,experimentalSymbolKeys:true}).files[0];
    assert.equal(hashed.metrics.properties,2);
    assert.equal(sym.metrics.symbolKeys,2);
    assert.equal(typeof hashed.code,'string');
    assert.equal(typeof sym.code,'string');
    const minified=transformSync(original,{loader:'js',
      platform:'node',target:'node22',minify:true}).code;
    const variants=[
      {name:'hashed-string',code:/** @type {string} */ (hashed.code),fields:2},
      {name:'unregistered-symbol',code:/** @type {string} */ (sym.code),fields:2},
      {name:'handwritten-symbol',code:symbol,fields:0},
      {name:'handwritten-computed-string',code:computed,fields:0},
      {name:'ordinary-esbuild-minified',code:minified,fields:0},
      {name:'same-code-control',code:original,fields:0}
    ];
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-hot-cpu-'));
    /** @type {Map<string,string>} */
    const urls=new Map();
    try {
      for(const variant of [{name:'native',code:original,fields:0},...variants]){
        const file=path.join(directory,variant.name+'.cjs');
        await atomicWrite(file,variant.code);
        urls.set(variant.name,file);
      }
      const hot=25000000,warm=15000000,precondition=2000000,pairCount=7;
      /** @param {string} variant @returns {Promise<(x:number)=>number>} */
      const fresh=async variant=>{
        const url=urls.get(variant);
        assert.ok(url);
        return load(url);
      };
      // Prime exactly the same work() callsite for each callable code shape.
      for(const variant of variants)work(await fresh(variant.name),precondition);
      /** @type {Array<{variant:string,fields:number,emitted:{sha256:string,bytes:number},pairs:Pair[],medianCpuRatio:number,medianWallRatio:number,strictCpuBreaches:number,strictWallBreaches:number}>} */
      const results=[];
      for(const variant of variants) {
        /** @type {Pair[]} */
        const pairs=[];
        for(let i=0;i<pairCount;i++) {
          const native=await fresh('native');
          const emitted=await fresh(variant.name);
          const first=i%2===0?measure(native,warm,hot):measure(emitted,warm,hot);
          const second=i%2===0?measure(emitted,warm,hot):measure(native,warm,hot);
          const control=i%2===0?first:second;
          const candidate=i%2===0?second:first;
          assert.equal(candidate.checksum,control.checksum);
          assert.ok(control.cpuMs>0&&candidate.cpuMs>0);
          pairs.push({native:control,emitted:candidate,
            cpuRatio:candidate.cpuMs/control.cpuMs,
            wallRatio:candidate.wallMs/control.wallMs});
        }
        const cpu=pairs.map(x=>x.cpuRatio),wall=pairs.map(x=>x.wallRatio);
        results.push({variant:variant.name,fields:variant.fields,
          emitted:hash(variant.code),pairs,medianCpuRatio:median(cpu),
          medianWallRatio:median(wall),
          strictCpuBreaches:cpu.filter(r=>r>2.5).length,
          strictWallBreaches:wall.filter(r=>r>2.5).length});
      }
      console.log('CJS_REQUIRE_PRIVATE_KEY_CPU_PROFILE '+JSON.stringify({
        source:hash(original),node:process.version,platform:process.platform,
        moduleSystem:'real Node CommonJS require with cleared cache',
        warmCallsPerArm:warm,hotCallsPerArm:hot,
        preconditioningCallsPerVariant:precondition,
        pairedSamplesPerVariant:pairCount,
        results
      }));
      assert.equal(results.length,6);
    }finally{
      await fs.rm(directory,{recursive:true,force:true});
    }
  }
);
