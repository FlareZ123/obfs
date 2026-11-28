'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {observesFunctionSource,parse}=require('../src/ast');
const {fixtures}=require('./storage-value-coercion-fixtures');

const modes=['coo','sco','sno'];
const cases=[
  {
    name:'known-local-identity-return-is-not-an-exposure',
    expectedExposure:false,
    source:fixtures.prototypeOverride.replace(
      'const captured=new WeakMap();',
      [
        'function hold(map){return map;}',
        'const privateMap=hold(new WeakMap());',
        'const captured=new WeakMap();'
      ].join('\n')
    )
  },
  {
    name:'known-local-read-only-consumer-is-not-an-exposure',
    expectedExposure:false,
    source:fixtures.prototypeOverride.replace(
      'const captured=new WeakMap();',
      [
        'const privateMap=new WeakMap();',
        'function consume(map){return map.get("key");}',
        'consume(privateMap);',
        'const captured=new WeakMap();'
      ].join('\n')
    )
  },
  {
    name:'known-local-prototype-reader-is-an-exposure',
    expectedExposure:true,
    source:fixtures.prototypeOverride.replace(
      'const captured=new WeakMap();',
      [
        'function inspectPrototype(map){return Object.getPrototypeOf(map);}',
        'const sharedPrototype=inspectPrototype(new WeakMap());',
        'sharedPrototype.set=function(){};',
        'const captured=new WeakMap();'
      ].join('\n')
    )
  }
];

/**
 * @param {string} source
 * @param {'coo'|'sco'|'sno'} mode
 * @returns {{observed:boolean,bindings:number,code:string}}
 */
function compile(source,mode){
  const observed=observesFunctionSource(parse(source,'module'));
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode,seed:'agent4-weakmap-call-summary-'+mode,
    properties:false,identifiers:true,strings:false
  });
  const app=result.files.find(file=>file.path==='entry.mjs');
  assert.ok(app);
  return {observed,bindings:app.metrics.bindings,code:String(app.code)};
}

for(const mode of modes){
  for(const fixture of cases){
    test(mode+' '+fixture.name,()=>{
      const result=compile(fixture.source,mode);
      assert.equal(result.observed,fixture.expectedExposure,JSON.stringify(result));
      if(fixture.expectedExposure){
        assert.equal(result.bindings,0,JSON.stringify(result));
      }else{
        assert.ok(result.bindings>=2,JSON.stringify(result));
        assert.ok(!result.code.includes('privateLocal'),JSON.stringify(result));
        assert.ok(!result.code.includes('independentLocal'),JSON.stringify(result));
      }
    });
  }
}
