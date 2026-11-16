'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports,createScoHandler}=require('../src');

/** @param {number} seed @returns {()=>number} */
function random(seed){
  let state=seed>>>0;
  return ()=>{
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    return state/0x100000000;
  };
}

/** @param {number} value @returns {string} */
function numbered(value){return String(value).padStart(3,'0');}

/**
 * Produce a closed ESM graph with a guaranteed root-to-leaf chain plus seeded
 * extra cross-file edges. Source order is randomized independently of graph
 * order; the expected manifest comes directly from the generator.
 *
 * @param {number} count
 * @param {number} seed
 * @returns {{sources:{path:string,code:string}[],expected:string[]}}
 */
function makeGraph(count,seed){
  const rand=random(seed);
  /** @type {{path:string,code:string}[]} */
  const sources=[];
  const expected=['private/engine.mjs'];
  for(let i=0;i<count;i++){
    const name='mod'+numbered(i);
    const childNumbers=[];
    if(i+1<count)childNumbers.push(i+1);
    for(let j=i+2;j<count;j++){
      if(rand()<0.09)childNumbers.push(j);
    }
    const deps=childNumbers.map(j=>
      'import {f'+numbered(j)+' as child'+numbered(j)+'} from "./mod'+numbered(j)+'.mjs";');
    const total=childNumbers.map(j=>'child'+numbered(j)+'(v)').join('+')||'v';
    sources.push({
      path:'private/'+name+'.mjs',
      code:deps.join('\n')+'\nexport function f'+numbered(i)+'(v){return '+total+'+'+i+';}'
    });
    expected.push('private/'+name+'.mjs');
  }
  sources.push({
    path:'private/engine.mjs',
    code:'import {f000} from "./mod000.mjs"; export function deriveProof(v){return f000(v);}'
  });
  // Shuffle while retaining a deterministic, independently known expected set.
  for(let i=sources.length-1;i>0;i--){
    const j=Math.floor(rand()*(i+1));
    [sources[i],sources[j]]=[sources[j],sources[i]];
  }
  return {sources,expected};
}

const entry=[
  'import {deriveProof} from "./private/engine.mjs";',
  'export async function privateAnswer(v){return deriveProof(v);}',
  'export function publicAnswer(v){return String(v);}'
].join('\n');

/**
 * @param {{path:string,code:string}[]} sources
 * @param {string} seed
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function compile(sources,seed){
  return partitionScoSelectedAsyncExports({path:'entry.mjs',code:entry,sourceType:'module'},{
    privateNames:['privateAnswer'],privateModuleImports:['./private/engine.mjs'],
    privateModuleSources:sources,seed
  });
}

test('seeded private ESM DAG fuzz verifies every transitive source is denied by handler',()=>{
  const cases=32;
  let auditedPaths=0;
  for(let index=0;index<cases;index++){
    const seed=(0x36c0ffee+Math.imul(index,7919))>>>0;
    const count=3+(index%27);
    const graph=makeGraph(count,seed);
    const partition=compile(graph.sources,'private-dag-'+seed);
    const actual=partition.clientFile.privateModulePaths;
    assert.deepEqual(actual,graph.expected,'seed '+seed+' expected full static graph');
    const selected=graph.sources.find(item=>item.path===graph.expected[graph.expected.length-1]);
    assert.ok(selected);
    assert.throws(()=>createScoHandler([partition.clientFile,
      {path:selected.path,code:selected.code,sourceType:'module'}]),
      /must not serve private source/,'seed '+seed+' exposed private dependency');
    assert.doesNotMatch(partition.clientFile.code,/import.*private/u);
    auditedPaths+=actual.length;
  }
  console.log(JSON.stringify({seed:'0x36c0ffee',cases,auditedPaths,
    result:'all source graphs complete and private paths denied'}));
});

test('seeded ESM graph mutation fuzz refuses incomplete, extra and noncanonical references',()=>{
  const cases=24;
  for(let index=0;index<cases;index++){
    const seed=(0xbad10000+Math.imul(index,104729))>>>0;
    const graph=makeGraph(4+(index%17),seed);
    /** @type {{path:string,code:string}[]} */
    let sources;
    if(index%3===0){
      sources=graph.sources.filter(source=>source.path!=='private/mod001.mjs');
      assert.throws(()=>compile(sources,'missing-'+seed),/source missing/,String(seed));
    }else if(index%3===1){
      sources=[...graph.sources,{path:'private/unknown.mjs',code:'export const value=3;'}];
      assert.throws(()=>compile(sources,'extra-'+seed),/exactly the reachable static graph/,String(seed));
    }else{
      sources=graph.sources.map(source=>source.path==='private/engine.mjs'?
        {...source,code:source.code.replace('./mod000.mjs','./%6dod000.mjs')}:source);
      assert.throws(()=>compile(sources,'noncanonical-'+seed),/canonical relative \.mjs imports/,String(seed));
    }
  }
  console.log(JSON.stringify({seed:'0xbad10000',cases,
    result:'all mutated source graphs declined'}));
});
