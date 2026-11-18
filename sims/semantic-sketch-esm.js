'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{id:number,seed:number,style:string,files:ModuleFile[],safeYield:boolean}} Sketch */

/**
 * Generate an ordinary private-record sketch with one observable operation
 * hole. The placement of property operations in a real 3-file ESM program
 * lets the differential witness cover observable keys, exceptions,
 * callback side effects, async continuation, aliases and prototypes.
 *
 * @param {number} seed
 * @param {number} style
 * @returns {Sketch}
 */
function makeSketch(seed,style){
  const left='privateScore'+seed;
  const right='privateWeight'+seed;
  const val=(seed*37)%97+3;
  const key=JSON.stringify(left);
  /** @type {Array<{name:string,body:string,safeYield?:boolean}>} */
  const sketches=[
    {name:'owned-direct',safeYield:true,
      body:`return [state.${left},state.${right},state.${left}+state.${right}];`},
    {name:'same-module-alias',
      body:`const other=state;other.${left}++;return [state.${left},other.${right}];`},
    {name:'local-parameter-callback',
      body:`function read(object){return object.${left}+object.${right};}return read(state);`},
    {name:'await-then-static',
      body:`await Promise.resolve();state.${left}+=5;return state.${left}+state.${right};`},
    {name:'string-key-reflection',
      body:`const before=Reflect.ownKeys(state).join('|');return [before,state.${left}];`},
    {name:'descriptor-reflection',
      body:`const d=Object.getOwnPropertyDescriptor(state,${key});return [d?.value,Object.entries(state).length];`},
    {name:'proxy-key-capture',
      body:`const p=new Proxy(state,{get(target,k,receiver){trace.push(String(k));return Reflect.get(target,k,receiver);}});return [p.${left},p.${right}];`},
    {name:'dynamic-global-key',
      body:`globalThis.__sketchKey=${key};return [state[globalThis.__sketchKey],state.${right}];`},
    {name:'object-assign-spread',
      body:`const copy={...state};return [Object.keys(Object.assign({},copy)).join(','),copy.${left}];`},
    {name:'structured-clone-keys',
      body:`const copy=structuredClone(state);return [Object.keys(copy).join(','),copy.${right}];`},
    {name:'bad-descriptor-exception',
      body:`try{Object.defineProperty(state,${key},{get:7});}catch(error){trace.push(error.name+':'+error.message);}return state.${left};`},
    {name:'for-in-after-await',
      body:`await Promise.resolve(0);const keys=[];for(const name in state)keys.push(name);return [keys.join(','),state.${left}];`},
    {name:'destructure-then-write',
      body:`const { ${left}:a,${right}:b}=state;state.${left}=a+2;return [a,b,state.${left}];`},
    {name:'has-own',
      body:`return [Object.hasOwn(state,${key}),state.${left},state.${right}];`},
    {name:'prototype-inheritance',
      body:`const child=Object.create(state);return [child.${left},child.${right},Object.getPrototypeOf(child)===state];`},
    {name:'computed-key-walk',
      body:`return Object.keys(state).map(name=>name+':'+state[name]).join(';');`}
  ];
  const selected=sketches[style];
  if(!selected)throw new RangeError('Unknown sketch style '+style);
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:`export const state={${left}:${val},${right}:${val+11}};`},
    {path:'worker.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+
        'async function compute(trace){'+selected.body+'}'+
        'export async function exercise(){const trace=[];try{'+
        'return {value:await compute(trace),trace};'+
        '}catch(error){return {error:{name:error.name,message:error.message},trace};}}'},
    {path:'entry.mjs',sourceType:'module',
      code:'export {exercise} from "./worker.mjs";'}
  ];
  return {id:seed*sketches.length+style,seed,style:selected.name,
    files,safeYield:selected.safeYield===true};
}

/**
 * Execute the actual generated ES module graphs in one fresh Node process.
 * Each case has a unique filesystem namespace and receives a real ESM loader.
 * @param {string} root
 * @param {{id:number,files:ModuleFile[]}[]} cases
 * @returns {Promise<unknown[]>}
 */
async function runGraphs(root,cases){
  await fs.mkdir(root,{recursive:true});
  for(const item of cases){
    for(const file of item.files){
      await atomicWrite(path.join(root,String(item.id),file.path),file.code);
    }
  }
  const runner=path.join(root,'runner.mjs');
  const script='const output=[];'+cases.map(item=>
    `{const module=await import('./${item.id}/entry.mjs');output.push(await module.exercise());}`
  ).join('')+'console.log(JSON.stringify(output));';
  await atomicWrite(runner,script);
  const p=spawnSync(process.execPath,[runner],{
    encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,windowsHide:true
  });
  if(p.error)throw p.error;
  assert.equal(p.status,0,p.stderr);
  return JSON.parse(p.stdout);
}

/**
 * Deterministically sample semantic feature combinations. Source-only
 * obfuscation does not promise universal strong security; the counts
 * distinguish genuine local property rewrites from vacuous parity checks.
 * @param {number} [seedCount]
 * @returns {Promise<{graphs:number,positiveCount:number,positiveRewrites:number,
 *   observationalStyles:string[],refusedOrZero:number,nonzero:number,equal:boolean}>}
 */
async function runSketchMatrix(seedCount=6){
  const cases=[];
  for(let seed=1;seed<=seedCount;seed++){
    for(let style=0;style<16;style++)cases.push(makeSketch(seed,style));
  }
  let positiveCount=0,positiveRewrites=0,refusedOrZero=0,nonzero=0;
  const transformed=cases.map(item=>{
    const result=obfuscateFiles(item.files,{
      mode:'coo',closedWorld:true,seed:'semantic-sketch/'+item.id,
      strings:false,identifiers:false
    });
    const properties=result.crossFile.properties;
    if(item.safeYield){
      assert.ok(properties>=2,
        'Expected real private-field rewrites: '+item.id+'/'+item.style);
      positiveCount++;
      positiveRewrites+=properties;
    }
    if(properties===0)refusedOrZero++;
    else nonzero++;
    return {id:item.id,files:/** @type {ModuleFile[]} */ (result.files)};
  });
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-semantic-sketch-'));
  try{
    const native=await runGraphs(path.join(root,'native'),cases);
    const emitted=await runGraphs(path.join(root,'emitted'),transformed);
    for(let index=0;index<cases.length;index++){
      assert.deepEqual(emitted[index],native[index],
        'Observed ESM behavior mismatch in '+cases[index].id+'/'+cases[index].style);
    }
    return {graphs:cases.length,positiveCount,positiveRewrites,
      observationalStyles:[...new Set(cases.map(item=>item.style))],
      refusedOrZero,nonzero,equal:true};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module)runSketchMatrix().then(result=>
  process.stdout.write('OBFS_SEMANTIC_SKETCH '+JSON.stringify(result)+'\n')
).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={makeSketch,runGraphs,runSketchMatrix};
