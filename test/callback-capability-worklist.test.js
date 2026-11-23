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
