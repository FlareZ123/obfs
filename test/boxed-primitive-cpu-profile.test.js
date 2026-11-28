'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @param {number} size @returns {ModuleFile[]} */
function graph(size) {
  const names=Array.from({length:size+1},(_,i)=>'alias'+i);
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'let '+names.join(',')+';',
      ...names.slice(0,-1).map((name,i)=>name+'='+names[i+1]+';'),
      names[size]+'="boxed";',
      'if(false){void '+names[0]+';}',
      'console.log(state.secretField);'
    ].join('\n')}
  ];
}

test('emit V8 CPU sample hotspots of large closed-world primitive proof',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-provenance-prof-'));
  try {
    const input=graph(768);
    const program=[
      'const {performance}=require("node:perf_hooks");',
      'const {obfuscateFiles}=require('+JSON.stringify(require.resolve('../src'))+');',
      'const files='+JSON.stringify(input)+';',
      'const start=performance.now();',
      'const output=obfuscateFiles(files,{mode:"coo",seed:"profile-768",properties:true,closedWorld:true,identifiers:false,strings:false});',
      'console.log("PROFILER_COMPILATION "+JSON.stringify({ms:performance.now()-start,properties:output.crossFile.properties}));'
    ].join('\n');
    const entry=path.join(directory,'profile.cjs');
    fs.writeFileSync(entry,program);
    const child=spawnSync(process.execPath,['--cpu-prof','--cpu-prof-dir='+directory,entry],
      {encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});
    assert.equal(child.status,0,child.stderr||String(child.error));
    assert.match(child.stdout,/PROFILER_COMPILATION/);
    const profileName=fs.readdirSync(directory).find(filename=>filename.endsWith('.cpuprofile'));
    assert.ok(profileName,'Node must emit a V8 CPU profile');
    /** @type {{nodes:{id:number,callFrame:{functionName:string,url:string,lineNumber:number}}[],samples:number[]}} */
    const profile=JSON.parse(fs.readFileSync(path.join(directory,profileName),'utf8'));
    const nodes=new Map(profile.nodes.map(node=>[node.id,node.callFrame]));
    /** @type {Map<string,number>} */
    const totals=new Map();
    for(const id of profile.samples) {
      const call=nodes.get(id);
      if(!call)continue;
      const key=call.functionName+' @ '+path.basename(call.url||'?')+':'+(call.lineNumber+1);
      totals.set(key,(totals.get(key)||0)+1);
    }
    const top=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([frame,hits])=>({frame,hits}));
    console.log('PRIMITIVE_ALIAS_CPU_PROFILE '+JSON.stringify({platform:process.platform,top,samples:profile.samples.length,summary:child.stdout.trim()}));
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
