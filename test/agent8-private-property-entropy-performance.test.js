'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} File */
/** @type {File[]} */
const source=[
  {path:'state.mjs',sourceType:'module',code:
    'export const state={secretField:41,otherField:13,sessionMark:7};'},
  {path:'kernel.mjs',sourceType:'module',code:[
    'import {state} from "./state.mjs";',
    'export function run(count){',
    'let value=0x12345678;',
    'for(let i=0;i<count;i++){',
    'value=(Math.imul(value ^ state.secretField,1664525) + state.otherField)|0;',
    'value^=state.sessionMark;',
    '}',
    'return value>>>0;',
    '}'
  ].join('\n')}
];

/**
 * The isolated child imports three real native ESM graphs and measures
 * paired warmed *process CPU* and wall time in rotated execution order.
 * This evaluates only one selected compute boundary, not an arbitrary
 * JavaScript or startup performance guarantee.
 */
const DRIVER=[
  "import path from 'node:path';",
  "import {pathToFileURL} from 'node:url';",
  "const root=process.argv[1];",
  "const modes=['native','deterministic','entropy'];",
  "const modules={};",
  "for(const mode of modes){",
  " const file=pathToFileURL(path.join(root,mode,'kernel.mjs')).href;",
  " modules[mode]=await import(file);",
  "}",
  "const input=3500000;",
  "for(let warm=0;warm<4;warm++){",
  " for(const mode of modes){",
  "  const result=modules[mode].run(1000000);",
  "  if(!Number.isSafeInteger(result))throw Error('Invalid warmup result');",
  " }",
  "}",
  "const rounds=[];",
  "for(let i=0;i<18;i++){",
  " const order=modes.map((_,j)=>modes[(i+j)%modes.length]);",
  " const row={index:i};",
  " let expected=null;",
  " for(const mode of order){",
  "  const cpuBefore=process.cpuUsage();",
  "  const wallBefore=process.hrtime.bigint();",
  "  const value=modules[mode].run(input);",
  "  const wallNs=Number(process.hrtime.bigint()-wallBefore);",
  "  const cpu=process.cpuUsage(cpuBefore);",
  "  if(expected!==null&&value!==expected)throw Error('Native/emitted mismatch: '+mode);",
  "  expected=value;",
  "  row[mode]={value,wallMs:wallNs/1e6,cpuMs:(cpu.user+cpu.system)/1e3};",
  " }",
  " rounds.push(row);",
  "}",
  "process.stdout.write(JSON.stringify({input,rounds,node:process.version,platform:process.platform})+'\\n');"
].join('\n');

/** @param {number[]} values @returns {number} */
function median(values){
  assert.ok(values.length>0);
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

test('private field entropy: source-pinned paired process-CPU comparison with native ESM',{
  timeout:60000
},async()=>{
  const opts={mode:/** @type {'coo'} */('coo'),
    closedWorld:true,seed:'PUBLIC_BENCH_SEED',
    properties:true,strings:false,identifiers:false};
  const deterministic=obfuscateFiles(source,opts);
  const entropy=obfuscateFiles(source,{
    ...opts,experimentalEntropyPropertyNames:true
  });
  assert.equal(deterministic.crossFile.properties,3);
  assert.equal(entropy.crossFile.properties,3);
  /** @type {Array<[string,Array<{path:string,code:string|Buffer}>]>} */
  const graphs=[
    ['native',source],['deterministic',deterministic.files],
    ['entropy',entropy.files]
  ];
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-entropy-cpu-'));
  try{
    for(const [tag,files] of graphs) {
      for(const file of files)await atomicWrite(path.join(root,tag,file.path),file.code);
    }
    const child=spawnSync(process.execPath,['--input-type=module','-e',DRIVER,root],{
      encoding:'utf8',timeout:50000,maxBuffer:1024*1024
    });
    assert.equal(child.error,undefined,child.error?.message);
    assert.equal(child.status,0,child.stderr);
    const report=JSON.parse(child.stdout);
    assert.equal(report.rounds.length,18);
    for(const row of report.rounds){
      assert.equal(row.native.value,row.deterministic.value);
      assert.equal(row.native.value,row.entropy.value);
      for(const mode of ['native','deterministic','entropy']){
        assert.ok(row[mode].cpuMs>0&&row[mode].wallMs>0,
          'Measurement must capture positive CPU and wall time');
      }
    }
    const cpuPairs=report.rounds.map(
      (/** @type {any} */ row)=>row.entropy.cpuMs/row.native.cpuMs
    );
    const deterministicPairs=report.rounds.map(
      (/** @type {any} */ row)=>row.deterministic.cpuMs/row.native.cpuMs
    );
    const summary={
      nativeMs:median(report.rounds.map((/** @type {any} */ row)=>row.native.cpuMs)),
      deterministicMs:median(report.rounds.map((/** @type {any} */ row)=>row.deterministic.cpuMs)),
      entropyMs:median(report.rounds.map((/** @type {any} */ row)=>row.entropy.cpuMs)),
      deterministicPairedMedian:median(deterministicPairs),
      entropyPairedMedian:median(cpuPairs),
      deterministicStrictOver2point5:deterministicPairs.filter((/** @type {number} */ n)=>n>2.5).length,
      entropyStrictOver2point5:cpuPairs.filter((/** @type {number} */ n)=>n>2.5).length,
      maxEntropyPair:Math.max(...cpuPairs)
    };
    process.stdout.write('PRIVATE_PROPERTY_ENTROPY_PAIRED_CPU '+JSON.stringify({
      graph:'two actual ESM modules with 3 cross-file renamed fields',
      node:report.node,platform:report.platform,
      testedIterationsPerCall:report.input,pairedWarmedRounds:report.rounds.length,
      rotatingOrder:true,processCpuMs:summary,
      raw:report.rounds.map((/** @type {any} */ row)=>({
        i:row.index,native:row.native.cpuMs,
        deterministic:row.deterministic.cpuMs,entropy:row.entropy.cpuMs
      })),
      limits:'hot process-CPU only; not browser, SCO HTTP, SNO initialization or arbitrary code'
    })+'\n');
  }finally {await fs.rm(root,{recursive:true,force:true});}
});
