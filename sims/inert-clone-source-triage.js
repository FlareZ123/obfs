'use strict';

const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');
const {renameLocalProperties}=require('../src/properties');

/** @type {import('../src/core').SourceFile[]} */
const graph=[
  {path:'state.mjs',sourceType:'module',code:
    "const hidden={secretField:17};"+
    "export function inspect(){const marker='opaque-literal';return hidden.secretField+marker.length;}"},
  {path:'observer.mjs',sourceType:'module',code:
    "const observed=structuredClone({kind:'ping',records:[1,{ready:true}]});"+
    "export {observed};"},
  {path:'entry.mjs',sourceType:'module',code:
    "import {inspect} from './state.mjs';"+
    "import {observed} from './observer.mjs';"+
    "process.stdout.write(JSON.stringify({value:inspect(),observed})+'\\n');"}
];
const states=graph.map(file=>{
  const ast=parse(file.code,'module');
  const direct=renameLocalProperties(file.code,ast,{seed:'clone-source-probe'});
  return {
    name:file.path,
    sourceObservation:observesFunctionSource(ast),
    distributedObservation:observesDistributedSource(ast),
    localRenamed:direct.properties,
    localOutput:direct.code
  };
});
for(const mode of ['coo','sno']) {
  for(const files of [graph.slice(0,1),graph.slice(0,2),graph]) {
    for(const closedWorld of [false,true]) {
      const output=obfuscateFiles(files,{
        mode,
        seed:'cross-esm-clone-inert',
        strings:false,
        closedWorld
      });
      console.log('INERT_CLONE_TRIAGE',JSON.stringify({
        mode,closedWorld,fileCount:files.length,
        crossFile:output.crossFile,
        files:output.files.map(x=>({path:x.path,metrics:x.metrics,code:x.code}))
      }));
    }
  }
}
console.log('INERT_CLONE_LOCAL',JSON.stringify(states));
