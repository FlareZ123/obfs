'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const vm=require('node:vm');
const {createScoHandler}=require('../src');

/** @type {Array<{kind:string,observation:'source'|'frame',expected:'mismatch'|'stable'|'no-yield',body:string}>} */
const cases=[
  {kind:'json-toJSON',observation:'frame',expected:'stable',
    body:'JSON.stringify({toJSON:function(){external();return 1;}});'},
  {kind:'json-replacer',observation:'source',expected:'mismatch',
    body:"JSON.stringify({x:1},function(key,value){if(key==='x')external();return value;});"},
  {kind:'json-reviver',observation:'source',expected:'mismatch',
    body:'JSON.parse(jsonText,function(key,value){if(key===\'x\')external();return value;});'},
  {kind:'array-sort',observation:'frame',expected:'mismatch',
    body:'[2,1].sort(function(a,b){external();return a-b;});'},
  {kind:'string-replace',observation:'frame',expected:'stable',
    body:"inputText.replace(/a/,function(){external();return 'b';});"},
  {kind:'array-map',observation:'frame',expected:'mismatch',
    body:'[1].map(function(value){external();return value;});'},
  {kind:'map-forEach',observation:'frame',expected:'stable',
    body:'new Map(entries).forEach(function(){external();});'},
  {kind:'array-from-map',observation:'frame',expected:'mismatch',
    body:'Array.from([1],function(value){external();return value;});'}
];

/**
 * Fetch one server-generated SCO response over a local HTTP listener.
 * @param {string} source
 * @returns {Promise<string>}
 */
async function fetchVariant(source) {
  const handler=createScoHandler([{path:'entry.cjs',sourceType:'commonjs',code:source}]);
  const server=http.createServer(handler);
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/entry.cjs');
    assert.equal(response.status,200);
    return await response.text();
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

/**
 * Execute a CommonJS source/response with a host-supplied observer callback.
 * @param {string} code
 * @param {'source'|'frame'} observationKind
 * @returns {{value:unknown,source:string|null,frameName:string|null,column:number|null}}
 */
function observe(code,observationKind) {
  /** @type {{source:string|null,frameName:string|null,column:number|null}} */
  const observation={source:null,frameName:null,column:null};
  const external=/** @type {()=>void} */(Function('observation','kind',
    'return function external(){'+
    'if(kind===\'source\'){'+
      'const captured=arguments.callee.caller.caller;'+
      'observation.source=captured?Function.prototype.toString.call(captured):null;'+
    '}else{'+
      'const ErrorCtor=Error;const previous=ErrorCtor.prepareStackTrace;'+
      'try{ErrorCtor.prepareStackTrace=(_error,sites)=>sites;'+
      'const sites=new Error().stack;'+
      'const frame=sites.find(site=>site.getFileName()&&site.getFileName().endsWith(\'entry.cjs\')&&site.getLineNumber()===5);'+
      'observation.frameName=frame?.getFunctionName()??null;'+
      'observation.column=frame?.getColumnNumber()??null;'+
      '}finally{ErrorCtor.prepareStackTrace=previous;}'+
    '}'+
    '}'
  )(observation,observationKind));
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{filename:'entry.cjs',timeout:2500});
  assert.equal(typeof context.module.exports,'function');
  const reader=/** @type {(external:()=>void)=>unknown} */(context.module.exports);
  const value=reader(external);
  return {...observation,value};
}

for(const scenario of cases) {
  test('SCO native intrinsic callback classification: '+scenario.kind+' ('+scenario.expected+')',async()=>{
    const source=[
      'const jsonText=\'{"x":1}\';',
      "const inputText='a';",
      "const entries=[['x',1]];",
      'const other={unrelatedField:2};',
      'function hidden(external){const owner={longPrivatePropertyName:1};'+
        scenario.body+
        'return owner.longPrivatePropertyName;}',
      'function plain(){return other.unrelatedField;}',
      'function publicReader(external){return hidden(external)+plain();}',
      'module.exports=publicReader;'
    ].join('\n');
    const before=observe(source,scenario.observation);
    assert.equal(before.value,3);
    if(scenario.observation==='source') {
      assert.ok(before.source?.includes('owner.longPrivatePropertyName'),
        scenario.kind+' native SCO source must contain the owner key');
    } else {
      assert.ok(Number.isInteger(before.column),
        scenario.kind+' native SCO execution must expose the active hidden frame column');
    }

    const variant=await fetchVariant(source);
    assert.equal(variant.includes('longPrivatePropertyName'),scenario.expected==='no-yield',
      scenario.kind+' SCO owner-key rewrite classification');
    assert.equal(variant.includes('unrelatedField'),scenario.expected==='no-yield',
      scenario.kind+' SCO unrelated positive-control classification');
    const after=observe(variant,scenario.observation);
    assert.equal(after.value,before.value,
      scenario.kind+' SCO response must preserve ordinary return values');
    if(scenario.observation==='source') {
      assert.ok(after.source,scenario.kind+' SCO response must retain source observation');
      if(scenario.expected==='mismatch') {
        assert.ok(!after.source.includes('owner.longPrivatePropertyName'),
          scenario.kind+' SCO response must expose the rewritten owner key in captured source');
      } else {
        assert.ok(after.source.includes('owner.longPrivatePropertyName'),
          scenario.kind+' SCO no-yield control must preserve the owner key');
      }
    } else {
      assert.ok(Number.isInteger(after.column),
        scenario.kind+' SCO response must retain the active hidden frame');
      if(scenario.expected==='mismatch') {
        assert.notEqual(after.column,before.column,
          scenario.kind+' SCO response must change the observed active-frame column');
      } else {
        assert.equal(after.column,before.column,
          scenario.kind+' SCO control must preserve the observed active-frame column');
      }
    }
  });
}
