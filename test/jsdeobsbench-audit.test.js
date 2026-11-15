'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {atomicWrite}=require('../src/atomic');
const {auditCorpus,summarize}=require('../sims/jsdeobsbench-audit');

test('corpus size and quantiles use explicit deterministic ordering',()=>{
  assert.deepEqual(summarize([]),{min:0,median:0,p95:0,max:0});
  assert.deepEqual(summarize([7,1,3,5,9]),{min:1,median:5,p95:9,max:9});
});

test('auditor counts syntactic indicators, duplicates and invalid lines without executing source',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-corpus-audit-'));
  const source=path.join(directory,'sample.jsonl');
  const items=[
    {filename:'a',original:"require('fs').readFileSync('/dev/stdin')",obfuscated:'a',test_cases:[['x','y']]},
    {filename:'b',original:'console.log("é")',obfuscated:'bb',test_cases:[['1','2'],['3','4']]},
    {filename:'a',original:'const f=()=>String(5); f.toString()',obfuscated:'ccc',test_cases:[['x','y']]},
    {filename:'invalid',original:2,test_cases:[]}
  ];
  try {
    await atomicWrite(source,items.map(item=>JSON.stringify(item)).join('\n')+'\nnot-json\n');
    const result=await auditCorpus(source);
    assert.equal(result.count,3);
    assert.equal(result.invalid,2);
    assert.equal(result.duplicates,1);
    assert.equal(result.linuxStdin,1);
    assert.equal(result.nodeRequire,1);
    assert.equal(result.nonAscii,1);
    assert.equal(result.possibleSourceObservers,1);
    assert.deepEqual(result.testCases,{min:1,median:1,max:2});
    assert.deepEqual(result.sourceCharacters,{min:Math.min(...items.slice(0,3).map(x=>x.original.length)),
      median:[...items.slice(0,3).map(x=>x.original.length)].sort((a,b)=>a-b)[1],
      p95:Math.max(...items.slice(0,3).map(x=>x.original.length)),
      max:Math.max(...items.slice(0,3).map(x=>x.original.length))});
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});
