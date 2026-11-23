'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {transformSync}=require('esbuild');
const {layerXorFunctions}=require('../workplace/layered-mba');

/** @typedef {{cpuUs:number,wallMs:number,checksum:number,steps:number}} Sample */
/** @typedef {'native'|'placebo'|'layered'|'minified'} Arm */

const mathematical=[
  'function roundA(x,y){return (((x^y)&0x55aa00ff)^(x&~y))|0;}',
  'function roundB(x,y){return (((x^y)|(x&y))^((~x)&y))|0;}',
  'module.exports={roundA,roundB};'
].join('\n');
const engine=[
  'const math=require("./math.cjs");',
  'module.exports=function start(seed){',
  ' let state=seed|0;',
  ' return {step(a,b){',
  '  const first=math.roundA(state^a,b);',
  '  const second=math.roundB(first,a^b);',
  '  state=(second^first)|0;',
  '  return state;',
  ' },current(){return state;}};',
  '};'
].join('\n');
const runner=[
  "'use strict';",
  "const start=require('./engine.cjs');",
  'const warm=Number(process.argv[2]);',
  'const steps=Number(process.argv[3]);',
  'function execute(count){',
  ' const instance=start(0x13579bdf);',
  ' for(let i=0;i<count;i++){',
  '  const x=(Math.imul(i+1,1103515245)^0x7f3a92b1)|0;',
  '  const y=(Math.imul(i+7,1664525)^0x53bc120f)|0;',
  '  instance.step(x,y);',
  ' }',
  ' return instance.current();',
  '}',
  'execute(warm);',
  'const before=process.cpuUsage();const wall=process.hrtime.bigint();',
  'const checksum=execute(steps);',
  'const usage=process.cpuUsage(before);',
  'const wallMs=Number(process.hrtime.bigint()-wall)/1e6;',
  'process.stdout.write(JSON.stringify({cpuUs:usage.user+usage.system,wallMs,checksum,steps}));'
].join('\n');

/** @param {string} content @returns {string} */
function sha256(content){
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Execute physically separate, same-layout CommonJS files in a fresh Node
 * process, with warm JIT state but no init cost in the measured CPU section.
 * @param {string} folder
 * @param {number} warm
 * @param {number} steps
 * @returns {Sample}
 */
function run(folder,warm,steps){
  const output=spawnSync(process.execPath,[path.join(folder,'runner.cjs'),
    String(warm),String(steps)],{
    encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024
  });
  if(output.error)throw output.error;
  assert.equal(output.status,0,output.stderr||folder);
  const result=/** @type {Sample} */ (JSON.parse(output.stdout));
  assert.ok(Number.isInteger(result.cpuUs)&&result.cpuUs>0,
    'Nonpositive CPU time: '+output.stdout);
  assert.ok(result.wallMs>0&&Number.isFinite(result.wallMs));
  assert.equal(result.steps,steps);
  return result;
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:
    (sorted[middle-1]+sorted[middle])/2;
}

test('same-source stateful graph process-CPU profile records every paired strict ratio',{
  timeout:120000
},()=>{
  const transformed=layerXorFunctions(mathematical,{
    sourceType:'commonjs',names:['roundA','roundB'],
    seed:'stateful-three-file-hotpath-v1'
  });
  assert.equal(transformed.rewrites,2,'Two math exports must actually transform');
  const minified=transformSync(mathematical,{
    format:'cjs',loader:'js',target:'node22',minify:true,legalComments:'none'
  }).code;
  const sources={native:mathematical,placebo:mathematical,
    layered:transformed.code,minified};
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-bitwise-app-hotpath-'));
  try{
    /** @type {Record<Arm,string>} */
    const folders=/** @type {Record<Arm,string>} */({});
    for(const arm of /** @type {const} */(['native','placebo','layered','minified'])){
      const dir=path.join(root,arm);
      fs.mkdirSync(dir,{recursive:true});
      fs.writeFileSync(path.join(dir,'math.cjs'),sources[arm],'utf8');
      fs.writeFileSync(path.join(dir,'engine.cjs'),engine,'utf8');
      fs.writeFileSync(path.join(dir,'runner.cjs'),runner,'utf8');
      folders[arm]=dir;
    }
    assert.equal(sha256(sources.native),sha256(sources.placebo));
    const warm=200000,steps=1200000,replicates=7;
    /** @type {Array<Record<Arm,Sample>>} */
    const rows=[];
    for(let index=0;index<replicates;index++){
      /** @type {Record<Arm,Sample>} */
      const samples=/** @type {Record<Arm,Sample>} */({});
      const order=/** @type {Arm[]} */(
        index%2?['placebo','minified','layered','native']:
          ['native','layered','minified','placebo']);
      for(const arm of order)samples[arm]=run(folders[arm],warm,steps);
      const checksum=samples.native.checksum;
      for(const arm of order)assert.equal(samples[arm].checksum,checksum,
        'Stateful application mismatch under '+arm+' iteration '+index);
      rows.push(samples);
    }
    /** @type {Record<'placebo'|'layered'|'minified',number[]>} */
    const ratios={placebo:[],layered:[],minified:[]};
    for(const samples of rows)
      for(const arm of /** @type {const} */(['placebo','layered','minified']))
        ratios[arm].push(samples[arm].cpuUs/samples.native.cpuUs);
    const profile=Object.fromEntries(
      /** @type {const} */(['placebo','layered','minified']).map(arm=>
        [arm,{
          ratios:ratios[arm].map(ratio=>Number(ratio.toFixed(5))),
          medianRatio:Number(median(ratios[arm]).toFixed(5)),
          observedMaxRatio:Number(Math.max(...ratios[arm]).toFixed(5)),
          strictOver2point5:ratios[arm].filter(ratio=>ratio>2.5).length
        }])
    );
    console.log('BITWISE_MBA_STATEFUL_CPU_PROFILE '+JSON.stringify({
      sourceSha256:sha256(mathematical),layeredSha256:sha256(transformed.code),
      minifiedSha256:sha256(minified),
      warmEvents:warm,measuredEvents:steps,replicates,units:'process user+system CPU microseconds',
      initExcluded:true,profile
    }));
    assert.equal(rows.length,7);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
