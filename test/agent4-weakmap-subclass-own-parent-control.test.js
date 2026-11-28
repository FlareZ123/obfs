'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {hasWeakMapPrototypeExposure,parse}=require('../src/ast');

const modes=['coo','sco','sno'];
const fixtures=[
  {
    name:'derived-own-prototype-is-not-native-parent',
    source:[
      'class WeakMap extends globalThis.WeakMap {}',
      'WeakMap.prototype.set=function(key,value){this._privateValue=value;};',
      'function privateHelper(){const privateLocal=43;return privateLocal;}',
      'export function sample(){return privateHelper();}'
    ].join('\n'),
    expectedExposure:false
  },
  {
    name:'derived-prototype-parent-is-native-WeakMap-prototype',
    source:[
      'class WeakMap extends globalThis.WeakMap {}',
      'const nativePrototype=Object.getPrototypeOf(WeakMap.prototype);',
      'nativePrototype.set=function(key,value){this._privateValue=value;};',
      'function privateHelper(){const privateLocal=47;return privateLocal;}',
      'export function sample(){return privateHelper();}'
    ].join('\n'),
    expectedExposure:true
  }
];

for(const mode of modes){
  for(const fixture of fixtures){
    test(mode+' '+fixture.name,()=>{
      const observed=hasWeakMapPrototypeExposure(parse(fixture.source,'module'));
      const compiled=obfuscateFiles([{
        path:'entry.mjs',sourceType:'module',code:fixture.source
      }],{
        mode,seed:'agent4-weakmap-subclass-own-parent-'+mode,
        properties:false,identifiers:true,strings:false
      });
      const app=compiled.files.find(file=>file.path==='entry.mjs');
      assert.ok(app);
      assert.equal(observed,fixture.expectedExposure,JSON.stringify({observed,metrics:app.metrics,code:app.code}));
      if(!fixture.expectedExposure){
        assert.ok(app.metrics.bindings>=1,JSON.stringify(app.metrics));
        assert.ok(!String(app.code).includes('privateLocal'),String(app.code));
      }
    });
  }
}
