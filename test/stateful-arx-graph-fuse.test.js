'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const path=require('node:path');
const {tmpdir}=require('node:os');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {fuseStatefulArxGraph}=require('../sims/stateful-arx-graph-fuse');

const root=path.join(__dirname,'..','examples','stateful-arx-app');
const sourceNames=/** @type {('entry'|'state'|'kernel')[]} */(['entry','state','kernel']);

/** @returns {Promise<import('../sims/stateful-arx-graph-fuse').NativeGraph>} */
async function sourceGraph(){
  const native=path.join(root,'native');
  const [entry,state,kernel]=await Promise.all(sourceNames.map(name=>
    fs.readFile(path.join(native,name+'.mjs'),'utf8')));
  return {entry,state,kernel};
}

/**
 * @param {'native'|'candidate'} selection
 * @returns {Promise<{runScenario:(seed:number,records:unknown[],host?:{emit:(record:unknown)=>void})=>string,dispose:()=>Promise<void>} >}
 */
async function loadFresh(selection){
  const temp=await fs.mkdtemp(path.join(tmpdir(),'obfs-arx-graph-'));
  const sources=await sourceGraph();
  const graph=selection==='native'?sources:fuseStatefulArxGraph(sources);
  await Promise.all(sourceNames.map(name=>
    fs.writeFile(path.join(temp,name+'.mjs'),graph[name])));
  const app=await import(pathToFileURL(path.join(temp,'entry.mjs')).href);
  return {
    runScenario:/** @type {(seed:number,records:unknown[],host?:{emit:(record:unknown)=>void})=>string} */ (app.runScenario),
    dispose:async()=>{await fs.rm(temp,{recursive:true,force:true});}
  };
}

/** @param {number} seed @param {number} count @returns {{kind:unknown,payload:unknown}[]} */
function records(seed,count){
  let current=seed|0;
  const chars=['','\u0000','abc','\ud800','\udfff','\ud83c\udf1f','𝄞','漢字','\n','\u200d','\uffff'];
  return Array.from({length:count},(_,index)=>{
    current^=current<<13;current^=current>>>17;current^=current<<5;
    return {kind:index%17===0?current:chars[(current>>>0)%chars.length],
      payload:chars[((current^index)>>>0)%chars.length]};
  });
}

/**
 * @param {(seed:number,records:unknown[],host?:{emit:(record:unknown)=>void})=>string} run
 * @param {number} seed
 * @param {unknown[]} input
 */
function observed(run,seed,input){
  /** @type {unknown[]} */
  const trace=[];
  const result=run(seed,input,{emit(event){trace.push(JSON.stringify(event));}});
  return {result,trace};
}

test('source-pinned fusion produces byte-exact checked-in application and refuses changed sources',async()=>{
  const original=await sourceGraph();
  const fused=fuseStatefulArxGraph(original);
  const expected=await Promise.all(sourceNames.map(name=>
    fs.readFile(path.join(root,'candidate',name+'.mjs'),'utf8')));
  for(const [index,name] of sourceNames.entries()){
    assert.equal(fused[name],expected[index],name+' candidate artifact drift');
  }
  assert.equal(fused.entry,original.entry,'Source-observable entry is unchanged');
  assert.notEqual(fused.state,original.state);
  assert.notEqual(fused.kernel,original.kernel);
  for(const name of /** @type {('entry'|'state'|'kernel')[]} */(sourceNames)){
    assert.throws(()=>fuseStatefulArxGraph({...original,[name]:original[name]+'\n'}),
      /Unproved source graph/u);
  }
  assert.equal(fused.wasmSha256,'6feb78b5360ad0299cbcdbd5b6dbafb0aa26ce5c3efe3eaaab717da3d8810ebb');
  const publicBytes=/Uint8Array\.from\((\[[0-9,]+\])\)/u.exec(fused.kernel)?.[1];
  assert.ok(publicBytes,'All module bytes are visibly present');
  assert.equal(createHash('sha256').update(Uint8Array.from(JSON.parse(publicBytes))).digest('hex'),
    fused.wasmSha256);
});

test('frozen real three-file app preserves 12,288 record callbacks, state and Unicode code units',async()=>{
  const native=await loadFresh('native'),candidate=await loadFresh('candidate');
  try {
    for(const seed of [-2147483648,0,1,-1,2147483647]){
      const input=records(seed,seed===0?12288:512);
      const expected=observed(native.runScenario,seed,input);
      const actual=observed(candidate.runScenario,seed,input);
      assert.deepEqual(actual,expected,'seed '+seed);
      assert.equal(actual.trace.length,input.length);
    }
    const payload='🎸'.repeat(40000)+'\ud800';
    assert.deepEqual(observed(candidate.runScenario,1,[{kind:'long',payload}]),
      observed(native.runScenario,1,[{kind:'long',payload}]));
    const veryLong='🎸'.repeat(4300000);
    assert.deepEqual(observed(candidate.runScenario,-1,[{kind:'over16MiB',payload:veryLong}]),
      observed(native.runScenario,-1,[{kind:'over16MiB',payload:veryLong}]));
  } finally {await native.dispose();await candidate.dispose();}
});

test('external getters and throwing host callbacks preserve order and error observations',async()=>{
  const native=await loadFresh('native'),candidate=await loadFresh('candidate');
  try {
    /** @param {typeof native.runScenario} run */
    function execute(run){
      /** @type {string[]} */ const events=[];
      const input=[{get kind(){events.push('kind');return '𝄞';},
        get payload(){events.push('payload');return '👌';}},{kind:'after',payload:0}];
      const host={emit(/** @type {unknown} */ record){
        events.push('emit:'+JSON.stringify(record));
        if(events.filter(entry=>entry.startsWith('emit:')).length===2)throw new TypeError('host-stop');
      }};
      let message='';
      try {run(123,input,host);}catch(error){message=/** @type {Error} */(error).name+':'+/** @type {Error} */(error).message;}
      return {events,message};
    }
    assert.deepEqual(execute(candidate.runScenario),execute(native.runScenario));
  }finally{await native.dispose();await candidate.dispose();}
});

test('published bytes can be cloned without the original source or compiler',async()=>{
  const fused=fuseStatefulArxGraph(await sourceGraph());
  const array=/Uint8Array\.from\((\[[0-9,]+\])\)/u.exec(fused.kernel)?.[1];
  assert.ok(array);
  const bytes=Uint8Array.from(JSON.parse(array));
  const module=new WebAssembly.Module(bytes);
  const instance=new WebAssembly.Instance(module);
  const exports=/** @type {{memory:WebAssembly.Memory,mix:(a:number,b:number,c:number,d:number,pointer:number,length:number,serial:number)=>void}} */ (
    /** @type {unknown} */(instance.exports));
  const message='𝄞\udfff漢字';
  const ptr=0x4000;
  const view=new DataView(exports.memory.buffer);
  for(let index=0;index<message.length;index++)view.setUint16(ptr+2*index,message.charCodeAt(index),true);
  exports.mix(1,2,3,4,ptr,message.length,0);
  const observedWords=Array.from({length:4},(_,i)=>view.getUint32(0x400+i*4,true));
  const native=await loadFresh('native');
  try {
    const result=JSON.parse(native.runScenario(0,[{kind:'',payload:''}]));
    assert.equal(result.trace.length,1);
    const words=Uint32Array.from([1,2,3,4]);
    const source=await import(pathToFileURL(path.join(root,'native','kernel.mjs')).href);
    for(let i=0;i<message.length;i++)source.advance(words,message.charCodeAt(i),i);
    assert.deepEqual(observedWords,Array.from(words));
  }finally{await native.dispose();}
});
