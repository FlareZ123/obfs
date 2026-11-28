'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CapabilityFlowGraph}=require('../sims/callback-capability-worklist');

test('ESM callback scheduling and Promise return retain one source-to-sink witness',()=>{
  const g=new CapabilityFlowGraph();
  g.seed('host:Function','host-callable');
  g.addEdge('host:Function','wrapper.mjs::factory','return');
  g.addEdge('wrapper.mjs::factory','wrapper.mjs::holder:callback','heap-field-write');
  g.addEdge('wrapper.mjs::holder:callback','entry.mjs::callback','esm-import');
  g.addEdge('entry.mjs::callback','entry.mjs::Promise.then','callback-schedule');
  g.addEdge('entry.mjs::Promise.then','entry.mjs::await','promise-fulfillment');
  g.addEdge('entry.mjs::await','entry.mjs::dynamic-import','opaque-call');
  const stats=g.solve();
  assert.equal(stats.facts,7);
  assert.equal(g.has('entry.mjs::dynamic-import','host-callable'),true);
  assert.equal(g.has('entry.mjs::unrelated','host-callable'),false);
  const path=g.explain('entry.mjs::dynamic-import','host-callable');
  assert.ok(path);
  assert.deepEqual(path.map(x=>x.at),[
    'host:Function','wrapper.mjs::factory','wrapper.mjs::holder:callback',
    'entry.mjs::callback','entry.mjs::Promise.then','entry.mjs::await',
    'entry.mjs::dynamic-import']);
  assert.equal(path.at(-1).via.kind,'opaque-call');
});

test('heap aliases and loops terminate without discarding host provenance',()=>{
  const g=new CapabilityFlowGraph();
  g.seed('alias','host-callable');
  g.addEdge('root','alias','assignment');
  g.addEdge('alias','root','assignment');
  g.addEdge('root','heap:callback','heap-field-write');
  g.addEdge('heap:callback','Promise.then','heap-field-read');
  const stats=g.solve();
  assert.equal(stats.facts,4);
  assert.equal(g.has('Promise.then','host-callable'),true);
  assert.equal(g.explain('Promise.then','host-callable').length,4);
  assert.ok(stats.propagations<=5);
});

test('unknown and dynamically imported facts join independently',()=>{
  const g=new CapabilityFlowGraph();
  g.seed('opaque','opaque-host');
  g.seed('loader','dynamic-import');
  g.addEdge('opaque','sink','opaque-call');
  g.addEdge('loader','sink','return');
  g.addEdge('sink','reader','other');
  g.solve();
  assert.equal(g.has('reader','opaque-host'),true);
  assert.equal(g.has('reader','dynamic-import'),true);
  assert.equal(g.has('reader','host-callable'),false);
  assert.equal(g.explain('reader','opaque-host').at(-1).via.kind,'other');
});

test('newly added ESM edge is recomputed without stale false negatives',()=>{
  const g=new CapabilityFlowGraph();
  g.seed('a','returned-holder');
  g.addEdge('a','b','return');
  let stats=g.solve();
  assert.equal(stats.facts,2);
  assert.equal(g.has('c','returned-holder'),false);
  g.addEdge('b','c','esm-import');
  stats=g.solve();
  assert.equal(stats.facts,3);
  assert.deepEqual(g.explain('c','returned-holder').map(x=>x.at),['a','b','c']);
  assert.deepEqual(g.solve(),stats);
});

test('1,200-node cycle has a finite work bound and a complete witness',()=>{
  const g=new CapabilityFlowGraph();
  const n=1200;
  g.seed('n0','host-callable');
  for(let i=0;i<n-1;i++){
    g.addEdge('n'+i,'n'+(i+1),'assignment');
    if(i>0)g.addEdge('n'+i,'n'+(i-1),'assignment');
  }
  const stats=g.solve({maxSteps:3000});
  assert.equal(stats.nodes,n);
  assert.equal(stats.facts,n);
  assert.equal(g.has('n'+(n-1),'host-callable'),true);
  assert.ok(stats.propagations<=2*n);
  assert.equal(g.explain('n'+(n-1),'host-callable').length,n);
});

test('invalid contracts and explicit caps throw, never authorize a rename',()=>{
  const g=new CapabilityFlowGraph();
  assert.throws(()=>g.seed('x',/** @type {any} */('not-fact')),TypeError);
  assert.throws(()=>g.addEdge('','x','assignment'),TypeError);
  assert.throws(()=>g.addEdge('x','y',/** @type {any} */('not-edge')),TypeError);
  g.seed('x','host-callable');
  g.addEdge('x','y','other');
  g.addEdge('y','z','other');
  assert.throws(()=>g.solve({maxSteps:1}),RangeError);
  assert.equal(g.solve({maxSteps:2}).facts,3);
});


test('unsolved and mutated graph queries fail closed, rather than returning false negatives',()=>{
  const g=new CapabilityFlowGraph();
  assert.throws(()=>g.has('unseen','host-callable'),/solve\(\) did not complete/);
  assert.throws(()=>g.explain('unseen','host-callable'),/solve\(\) did not complete/);
  g.seed('origin','host-callable');
  g.solve();
  assert.equal(g.has('sink','host-callable'),false);
  g.addEdge('origin','sink','assignment');
  assert.throws(()=>g.has('sink','host-callable'),/solve\(\) did not complete/);
  assert.throws(()=>g.explain('sink','host-callable'),/solve\(\) did not complete/);
  g.solve();
  assert.equal(g.has('sink','host-callable'),true);
  g.seed('origin','owner-reflection');
  assert.throws(()=>g.has('sink','owner-reflection'),/solve\(\) did not complete/);
  g.solve();
  assert.equal(g.has('sink','owner-reflection'),true);
});

test('bounded solve failures never authorize stale or partial negative reachability',()=>{
  const g=new CapabilityFlowGraph();
  g.seed('a','host-callable');
  g.addEdge('a','b','return');
  g.addEdge('b','c','assignment');
  assert.equal(g.solve().facts,3);
  assert.equal(g.has('c','host-callable'),true);
  assert.throws(()=>g.solve({maxSteps:1}),/step limit exceeded/);
  assert.throws(()=>g.has('c','host-callable'),/solve\(\) did not complete/);
  assert.throws(()=>g.explain('c','host-callable'),/solve\(\) did not complete/);
  assert.equal(g.solve({maxSteps:2}).facts,3);
  assert.equal(g.has('c','host-callable'),true);
});

test('new isolated graph node invalidates solution, repeated solve is deterministic',()=>{
  const g=new CapabilityFlowGraph();
  g.seed('root','opaque-host');
  const before=g.solve();
  g.addNode('isolated');
  assert.throws(()=>g.has('isolated','opaque-host'),/solve\(\) did not complete/);
  const after=g.solve();
  assert.equal(after.nodes,before.nodes+1);
  assert.equal(g.has('isolated','opaque-host'),false);
  assert.deepEqual(g.solve(),after);
});
