'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {observesFunctionSource,parse}=require('../src/ast');

const modes=['coo','sco','sno'];
const fixtures=[
  {
    name:'local-identity-return',
    expectedExposure:false,
    source:[
      'function hold(map){return map;}',
      'const localMap=hold(new WeakMap());',
      'function privateHelper(){const privateLocal=29;return privateLocal;}',
      'export function sample(){return privateHelper();}'
    ].join('\n')
  },
  {
    name:'local-read-only-consumer',
    expectedExposure:false,
    source:[
      'function consume(map){return map.get("key");}',
      'const readResult=consume(new WeakMap());',
      'function privateHelper(){const privateLocal=31;return privateLocal;}',
      'export function sample(){return privateHelper();}'
    ].join('\n')
  },
  {
    name:'local-prototype-reader',
    expectedExposure:true,
    source:[
      'function inspectPrototype(map){return Object.getPrototypeOf(map);}',
      'const sharedPrototype=inspectPrototype(new WeakMap());',
      'sharedPrototype.set=function(){};',
      'function privateHelper(){const privateLocal=37;return privateLocal;}',
      'export function sample(){return privateHelper();}'
    ].join('\n')
  },
  {
    name:'local-global-escape',
    expectedExposure:true,
    source:[
      'function leak(map){globalThis.savedWeakMap=map;}',
      'leak(new WeakMap());',
      'function privateHelper(){const privateLocal=41;return privateLocal;}',
      'export function sample(){return privateHelper();}'
    ].join('\n')
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
  for(const fixture of fixtures){
    test(mode+' '+fixture.name+' has the expected exposure classification',()=>{
      const result=compile(fixture.source,mode);
      assert.equal(result.observed,fixture.expectedExposure,JSON.stringify(result));
      if(fixture.expectedExposure){
        assert.equal(result.bindings,0,JSON.stringify(result));
      }else{
        assert.ok(result.bindings>=1,JSON.stringify(result));
        assert.ok(!result.code.includes('privateLocal'),JSON.stringify(result));
      }
    });
  }
}
