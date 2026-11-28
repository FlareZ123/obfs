'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {createScoHandler}=require('../src');

/** @param {string} source @returns {Promise<string[]>} */
async function serveVariants(source) {
  const server=http.createServer(createScoHandler([
    {path:'timing.js',sourceType:'script',code:source}
  ]));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected SCO HTTP test port');
    const uri='http://127.0.0.1:'+address.port+'/obfs/timing.js';
    /** @type {string[]} */
    const variants=[];
    for(let i=0;i<2;i++) {
      const response=await fetch(uri);
      assert.equal(response.status,200,'SCO path must be served');
      variants.push(await response.text());
    }
    return variants;
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

/** @param {string} source @returns {{text:string,value:number}} */
function execute(source) {
  const sandbox={performance};
  vm.runInNewContext(source,sandbox,{timeout:3000});
  return JSON.parse(JSON.stringify(sandbox.out));
}

/** @param {string} body @returns {string} */
function fixture(body) {
  return "'use strict';"+
    "function inspect(){const owner={secretField:73};return owner.secretField;}"+
    "let text='';"+body+
    "globalThis.out={text,value:inspect()};";
}

const cases=[
  ['name argument','text=performance.mark(inspect).name;'],
  ['direct detail clone','try{performance.mark("fixed",{detail:inspect});}catch(e){text=e.message;}'],
  ['nested detail clone','try{performance.mark("fixed",{detail:{nested:[inspect]}});}catch(e){text=e.message;}'],
  ['measure detail clone','try{performance.measure("fixed",{start:0,end:1,detail:inspect});}catch(e){text=e.message;}'],
  ['record-carried method','const hooks={native:performance.mark};text=hooks.native.call(performance,inspect).name;'],
  ['interprocedural native receiver','function publish(timing,fn){return timing.mark(fn).name;}text=publish(performance,inspect);']
];

for(const [label,body] of cases) {
  test('SCO HTTP response preserves native User Timing exact source: '+label,async()=>{
    const source=fixture(body);
    const expected=execute(source);
    assert.match(expected.text,/secretField/u);
    assert.equal(expected.value,73);
    const variants=await serveVariants(source);
    assert.equal(variants.length,2);
    for(const variant of variants)assert.deepEqual(execute(variant),expected,
      'HTTP-served SCO source-observed variant changed native source text');
  });
}

test('SCO HTTP source guard leaves primitive mark and independent literal rewriting usable',async()=>{
  const source="'use strict';const owner={secretField:73};"+
    "performance.mark('fixed',{detail:{nested:[12,14]}});"+
    "globalThis.out={text:'source-control-literal-7364',value:owner.secretField};";
  const expected=execute(source);
  const variants=await serveVariants(source);
  for(const variant of variants) {
    assert.deepEqual(execute(variant),expected);
    assert.ok(!variant.includes("'source-control-literal-7364'"),
      'Proven primitive User Timing options should not veto unrelated literal obfuscation');
  }
});
