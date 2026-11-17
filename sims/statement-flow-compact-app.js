'use strict';

const assert=require('node:assert/strict');
const {mkdtemp,rm,readFile}=require('node:fs/promises');
const path=require('node:path');
const {tmpdir}=require('node:os');
const {pathToFileURL}=require('node:url');
const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {recoverStatementFlow}=require('./statement-flow-recover');

const math=[
  'export function route(value,kind,notify){',
  'var x=value|0;',
  'var y=Math.imul(x,31)|0;',
  'var z=(y^0x45d9f3b)|0;',
  'if(kind==="up"){',
  'notify("up");',
  'x=(x+13)|0;',
  'x=(x^71)|0;',
  'x=(x+37)|0;',
  'y=(y-x)|0;',
  'y=(y^0x1f1f)|0;',
  'y=(y+143)|0;',
  '}else if(kind==="down"){',
  'notify("down");',
  'x=(x-29)|0;',
  'x=(x^19)|0;',
  'x=(x+53)|0;',
  'y=(y+x)|0;',
  'y=(y^0x3333)|0;',
  'y=(y-113)|0;',
  '}else{',
  'notify("flat");',
  'x=(x^11)|0;',
  'x=(x+83)|0;',
  'y=(y-x)|0;',
  'y=(y^0x7777)|0;',
  'y=(y+67)|0;',
  '}',
  'var t=(x^y^z)|0;',
  't=(Math.imul(t,73)+131)|0;',
  't=(t^0x12345)|0;',
  'return t|0;',
  '}'
].join('\n');

const state=[
  'import {route} from "./math.mjs";',
  'export function runSession(seed,events,host){',
  'let accumulator=seed|0;',
  'const history=[];',
  'const hostKeys=Object.keys(host).sort();',
  'for(const event of events){',
  'const reflected=Object.keys(event).sort();',
  'const amount=Number(event.amount);',
  'const callTrace=[];',
  'const transformed=route((accumulator+amount)|0,event.kind,tag=>{',
  'callTrace.push(tag);',
  'host.emit(tag,reflected);',
  '});',
  'accumulator=(Math.imul(accumulator^transformed,16777619)+event.kind.length)|0;',
  'history.push({result:transformed,keys:reflected,calls:callTrace});',
  '}',
  'return JSON.stringify({accumulator,history,hostKeys,hostTag:globalThis.appTag});',
  '}'
].join('\n');

const entry=[
  'export {runSession} from "./state.mjs";'
].join('\n');

/** @typedef {{path:string,sourceType:'module',code:string}} File */
/** @type {File[]} */
const originals=[
  {path:'math.mjs',sourceType:'module',code:math},
  {path:'state.mjs',sourceType:'module',code:state},
  {path:'entry.mjs',sourceType:'module',code:entry}
];

/** @param {number} seed @param {number} count */
function events(seed,count){
  const kinds=['up','down','flat'];
  return Array.from({length:count},(_,index)=>({
    kind:kinds[(index+seed)%3],amount:(index*17+seed)%307-153,
    id:'e'+index
  }));
}

/** @param {number[]} xs @returns {number} */
function median(xs){const ys=[...xs].sort((a,b)=>a-b);return ys[Math.floor(ys.length/2)];}

/** @param {string} text @returns {string} */
function digest(text){return createHash('sha256').update(text).digest('hex');}

/**
 * @param {string} base
 * @param {File[]} files
 */
async function writeGraph(base,files){
  for(const file of files)await atomicWrite(path.join(base,file.path),file.code);
}

/** @param {string} dir @returns {Promise<{runSession:(seed:number,events:unknown[],host:{emit:(tag:string,keys:string[])=>void})=>string}>} */
async function importGraph(dir){
  const namespace=await import(pathToFileURL(path.join(dir,'entry.mjs')).href);
  assert.equal(typeof namespace.runSession,'function');
  return /** @type {any} */ (namespace);
}

/**
 * @param {{runSession:(seed:number,events:unknown[],host:{emit:(tag:string,keys:string[])=>void})=>string}} mod
 * @param {number} seed
 * @param {number} count
 * @returns {{output:string,events:string[]}}
 */
function execute(mod,seed,count){
  /** @type {string[]} */
  const sent=[];
  const host={emit:(/** @type {string} */ tag,/** @type {string[]} */ keys)=>{
    sent.push(tag+':'+keys.join(','));
  }};
  const output=mod.runSession(seed,events(seed,count),host);
  return {output,events:sent};
}

/**
 * @param {ReturnType<typeof importGraph> extends Promise<infer T> ? T : never} mod
 * @param {number} count
 * @param {number} repetitions
 */
function timed(mod,count,repetitions){
  const input=events(19,count);
  let checksum=0;
  const started=performance.now();
  for(let i=0;i<repetitions;i++){
    let callbacks=0;
    const output=mod.runSession(19,input,{emit:()=>{callbacks++;}});
    checksum=(checksum+output.length+callbacks)|0;
  }
  return {ms:(performance.now()-started)/repetitions,checksum};
}

/** @returns {Promise<void>} */
async function main(){
  const tmp=await mkdtemp(path.join(tmpdir(),'obfs-cfg-full-app-'));
  const prevTag=globalThis.appTag;
  globalThis.appTag='externally-owned-tag';
  try{
    const common={mode:'coo',seed:'compact-app-20261117',
      identifiers:false,strings:false,properties:false,
      experimentalStatementFlow:{'math.mjs':['route']}};
    const plain=obfuscateFiles(originals,common);
    const compact=obfuscateFiles(originals,{...common,experimentalStatementFlowCompact:true});
    const a=plain.files.map(file=>({path:file.path,sourceType:/** @type {'module'} */ ('module'),code:String(file.code)}));
    const b=compact.files.map(file=>({path:file.path,sourceType:/** @type {'module'} */ ('module'),code:String(file.code)}));
    const am=a.find(file=>file.path==='math.mjs');
    const bm=b.find(file=>file.path==='math.mjs');
    assert.ok(am&&bm);
    assert.equal(plain.files.find(file=>file.path==='math.mjs')?.metrics.statementFlowFunctions,1);
    assert.equal(compact.files.find(file=>file.path==='math.mjs')?.metrics.statementFlowFunctions,1);
    const cases=/** @param {string} code */ code=>(code.match(/case\s+\d+:/gu)||[]).length;
    assert.ok(cases(bm.code)<cases(am.code));
    const recovered=recoverStatementFlow(bm.code,'route','module');
    const clone=b.map(file=>file.path==='math.mjs'?{...file,code:recovered.code}:file);

    await Promise.all([
      writeGraph(path.join(tmp,'native'),originals),
      writeGraph(path.join(tmp,'standard'),a),
      writeGraph(path.join(tmp,'compact'),b),
      writeGraph(path.join(tmp,'attacker'),clone)
    ]);
    const modules=await Promise.all(['native','standard','compact','attacker'].map(name=>
      importGraph(path.join(tmp,name))));
    let scenarios=0;
    for(let seed=1;seed<=24;seed++){
      for(const count of [0,1,4,32]){
        const expected=execute(modules[0],seed,count);
        for(const mod of modules.slice(1)){
          assert.deepEqual(execute(mod,seed,count),expected,
            'Native/obfuscated/attacker full-app behavior diverged');
        }
        scenarios++;
      }
    }
    const measured=[];
    for(const count of [1,50,1000,10000]){
      const native=[],standard=[],optimized=[];
      const samples=[native,standard,optimized];
      const repetitions=count<=50?100:count===1000?25:5;
      for(let trial=0;trial<7;trial++){
        let checksum=null;
        const order=[trial%3,(trial+1)%3,(trial+2)%3];
        for(const index of order){
          const result=timed(modules[index],count,repetitions);
          if(checksum!==null)assert.equal(result.checksum,checksum);
          checksum=result.checksum;
          samples[index].push(result.ms);
        }
      }
      const n=median(native),p=median(standard),c=median(optimized);
      measured.push({events:count,repetitionsPerTrial:repetitions,trials:7,
        nativeMedianMs:n,standardMedianMs:p,compactMedianMs:c,
        standardVsNative:p/n,compactVsNative:c/n,
        compactPasses2_5x:c<=n*2.5});
    }
    const sourceBytes=originals.reduce((sum,file)=>sum+file.code.length,0);
    const outputBytes=files=>files.reduce((sum,file)=>sum+file.code.length,0);
    const summary={
      platform:process.platform,node:process.version,sourceBytes,
      selectedOriginalMathBytes:math.length,
      selectedSourceFraction:math.length/sourceBytes,
      standardBytes:outputBytes(a),compactBytes:outputBytes(b),
      caseCounts:{standard:cases(am.code),compact:cases(bm.code)},
      compiler:{standardTransformed:plain.files.find(file=>file.path==='math.mjs')?.metrics.statementFlowFunctions,
        compactTransformed:compact.files.find(file=>file.path==='math.mjs')?.metrics.statementFlowFunctions},
      nativeHashes:Object.fromEntries(originals.map(file=>[file.path,digest(file.code)])),
      compactHashes:Object.fromEntries(b.map(file=>[file.path,digest(file.code)])),
      attackerRecoveredHash:digest(recovered.code),
      scenarios,checkedModules:['native','standard','compact','attacker-only-recovered'],
      measured
    };
    process.stdout.write(JSON.stringify(summary,null,2)+'\n');
  }finally{
    globalThis.appTag=prevTag;
    await rm(tmp,{recursive:true,force:true});
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
