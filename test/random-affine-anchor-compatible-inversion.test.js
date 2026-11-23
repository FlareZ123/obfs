'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runEvidence,invertByReanchoring,invertWithUniformAnchors,
  poisonCanonicalAnchor}=require('../sims/random-affine-anchor-compatible-inversion');

test('random affine reanchoring recovers forced rare targets after canonical base poisoning',()=>{
  const evidence=runEvidence();
  assert.equal(evidence.poisonedSources,6);
  assert.equal(evidence.rareRecovered,6);
  assert.equal(evidence.controlRecovered,6);
  assert.equal(evidence.heldouts,384);
  assert.ok(evidence.rows.every(row=>row.canonicalMismatches===32));
  assert.ok(evidence.rows.every(row=>row.rare.queries<=260&&row.control.queries<=260));
  assert.equal(evidence.dense.length,3);
  assert.ok(evidence.dense.every(row=>row.sources===8&&row.exact+row.failures===8));
  console.log('SPARSE_REANCHOR '+JSON.stringify(evidence));
});

test('source-isolated random-anchor callback and unbiased production sampler',()=>{
  const source=poisonCanonicalAnchor(3188840621);
  let anchor=1;
  while(anchor<10000&&!source.cleanAt(anchor))anchor++;
  assert.ok(anchor<10000);
  const recovered=invertByReanchoring(source.oracle,source.oracle(source.secret),
    ()=>anchor,1,false);
  assert.equal(recovered.value,source.secret);
  assert.equal(recovered.anchor,anchor);
  assert.equal(recovered.basesTried,1);
  assert.ok(recovered.queries<=65);
  // The cryptographic variant draws uniformly even for the first anchor.
  // This affine oracle gives a deterministic success independent of the draw.
  const offset=0x1234abcd,target=0xdeadbeef;
  const uniform=invertWithUniformAnchors(x=>(x^offset)>>>0,target,1);
  assert.equal(uniform.value,(target^offset)>>>0);
  assert.equal(uniform.basesTried,1);
  assert.ok(uniform.queries<=65);
});

test('reanchoring rejects invalid uint32 targets before querying',()=>{
  for(const target of [-1,2**32,1.5,NaN,Infinity,-Infinity]) {
    let queries=0;
    assert.throws(()=>invertByReanchoring(x=>{queries++;return x;},target,0,1),
      {name:'RangeError',message:'target must be an unsigned 32-bit integer'});
    assert.equal(queries,0,'Invalid target must not reach the oracle');
  }
});

test('reanchoring refuses non-uint32 oracle outputs without claiming a preimage',()=>{
  for(const output of [-1,2**32,0.25,NaN,Infinity,-Infinity]) {
    let queries=0;
    assert.throws(()=>invertByReanchoring(()=>{queries++;return output;},0,0,1),
      {name:'RangeError',message:'oracle result must be an unsigned 32-bit integer'});
    assert.equal(queries,1,'Invalid first output must stop the attack');
  }
});

test('reanchoring validates supplied anchor words and preserves uint32 boundaries',()=>{
  for(const anchor of [-1,2**32,0.5,NaN,Infinity,-Infinity]) {
    let queries=0;
    assert.throws(()=>invertByReanchoring(x=>{queries++;return x;},
      0,()=>anchor,1,false),
    {name:'RangeError',message:'anchor must be an unsigned 32-bit integer'});
    assert.equal(queries,0,'Invalid anchor must not reach the oracle');
  }
  const max=0xffffffff;
  const result=invertByReanchoring(x=>x,max,()=>max,1,false);
  assert.equal(result.value,max);
  assert.equal(result.anchor,max);
  assert.ok(result.queries<=65);
});
