'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {observesFunctionSource,parse}=require('../src/ast');

const modes=['coo','sco','sno'];
const fixtures=[
  {
    name:'identity-return',
    source:[
      'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
      'const captured=new WeakMap();',
      'function inspect(){const privateLocal=29;return privateLocal;}',
      'function hold(map){return map;}',
      'const localMap=hold(new WeakMap());',
      'export function sample(){',
      '  Object.defineProperty(Storage.prototype,"setItem",{...descriptor,value:function(_key,value){captured.set(this,value);}});',
      '  localStorage.setItem("local-helper-control",inspect);',
      '  return inspect();',
      '}'
    ].join('\n')
  },
  {
    name:'read-only-consumer',
    source:[
      'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
      'const captured=new WeakMap();',
      'function inspect(){const privateLocal=29;return privateLocal;}',
      'function consume(map){return map.get("key");}',
      'const readResult=consume(new WeakMap());',
      'export function sample(){',
      '  Object.defineProperty(Storage.prototype,"setItem",{...descriptor,value:function(_key,value){captured.set(this,value);}});',
      '  localStorage.setItem("local-reader-control",inspect);',
      '  return inspect();',
      '}'
    ].join('\n')
  }
];

/**
 * @param {string} source
 * @param {'coo'|'sco'|'sno'} mode
 * @returns {{observed:boolean,bindings:number,compiled:string}}
 */
function compile(source,mode) {
  const observed=observesFunctionSource(parse(source,'module'));
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode,seed:'agent4-local-helper-'+mode,
    properties:false,identifiers:true,strings:false
  });
  const app=result.files.find(file=>file.path==='entry.mjs');
  assert.ok(app);
  return {observed,bindings:app.metrics.bindings,compiled:String(app.code)};
}

for(const mode of modes){
  for(const fixture of fixtures){
    test(mode+' keeps '+fixture.name+' local without a prototype exposure',()=>{
      const result=compile(fixture.source,mode);
      assert.equal(result.observed,false,JSON.stringify(result));
      assert.ok(result.bindings>=2,JSON.stringify(result));
    });
  }
}
