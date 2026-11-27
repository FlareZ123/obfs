'use strict';

/**
 * V8 sampling CPU profile for one generated closed-world ESM graph. It
 * intentionally captures compile-time stacks only (no runtime execution),
 * aggregating hot self-sample sites and absolute source file locations.
 * Used to investigate why a 22 KB graph takes seconds to compile even
 * after replacing an alias-propagation quadratic rescan with a worklist.
 */
const path=require('node:path');
const inspector=require('node:inspector');
const {obfuscateFiles}=require(path.join(process.cwd(),'src'));

/** @returns {Array<{path:string,sourceType:'module',code:string}>} */
function graph(){
  const length=480;
  const names=Array.from({length:length+1},(_,i)=>'v'+i);
  const declarations=names.map((_,i)=>
    'function step'+i+'(){v'+i+'='+(i===length?'inspect':'v'+(i+1))+';}');
  const observer=[
    'import {inspect} from "./logic.mjs";',
    'import {independent} from "./pure.mjs";',
    'const target=document.createElement("div");',
    'let '+names.join(',')+';',
    ...declarations,
    ...names.map((_,i)=>'step'+(length-i)+'();'),
    'target.id=v0;',
    'export const observed={value:inspect(),source:target.id,independent};'
  ].join('\n');
  return [
    {path:'logic.mjs',sourceType:'module',code:
      'const owner={secretField:57};export function inspect(){return owner.secretField;}'},
    {path:'pure.mjs',sourceType:'module',code:
      'const record={privateField:73};export const independent=record.privateField;'},
    {path:'observer.mjs',sourceType:'module',code:observer}
  ];
}

/** @returns {Promise<void>} */
async function main(){
  const session=new inspector.Session();
  session.connect();
  /** @param {string} method @param {Record<string,unknown>} [params] @returns {Promise<any>} */
  const post=(method,params={})=>new Promise((resolve,reject)=>{
    session.post(method,params,(error,result)=>error?reject(error):resolve(result));
  });
  try {
    await post('Profiler.enable');
    await post('Profiler.setSamplingInterval',{interval:1000});
    await post('Profiler.start');
    const t=process.hrtime.bigint();
    const result=obfuscateFiles(graph(),{
      mode:'coo',seed:'agent42-cpu-hotspots-480',
      closedWorld:true,identifiers:false,strings:false,properties:true
    });
    const ms=Number(process.hrtime.bigint()-t)/1e6;
    const {profile}=await post('Profiler.stop');
    const samples=profile.nodes.map(node=>({
      name:node.callFrame.functionName,
      file:node.callFrame.url.replace(/^file:\/\//u,''),
      line:node.callFrame.lineNumber+1,
      self:node.hitCount??0
    })).filter(x=>x.self>0);
    samples.sort((a,b)=>b.self-a.self);
    /** @type {Map<string,number>} */
    const byFile=new Map();
    for(const sample of samples) {
      const name=sample.file||'<native>';
      byFile.set(name,(byFile.get(name)??0)+sample.self);
    }
    const fileTotals=[...byFile].sort((a,b)=>b[1]-a[1]).slice(0,15).
      map(([file,self])=>({file,self}));
    console.log('DOM_FLOW_CPU_PROFILE '+JSON.stringify({
      candidate:process.env.CANDIDATE_SHA??null,
      compile_ms:Math.round(ms),
      node_count:profile.nodes.length,
      samples_total:samples.reduce((sum,x)=>sum+x.self,0),
      top: samples.slice(0,25),
      files:fileTotals,
      producerRewrites:result.files.find(x=>x.path==='logic.mjs')?.metrics.properties,
      unrelatedRewrites:result.files.find(x=>x.path==='pure.mjs')?.metrics.properties
    }));
  }finally {
    session.disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
