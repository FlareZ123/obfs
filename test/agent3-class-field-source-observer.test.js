'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

const modes=['coo','sno','sco'];
const fixtures=[
  {
    name:'exported class declaration with static field',
    path:'state.mjs',
    sourceType:'module',
    code:'const owner={secretAlpha:7};export class Reader{static value=owner.secretAlpha;}'
  },
  {
    name:'local class re-exported after static field initialization',
    path:'state.mjs',
    sourceType:'module',
    code:'const owner={secretAlpha:7};class Reader{static value=owner.secretAlpha;}export {Reader};'
  },
  {
    name:'exported CommonJS class expression with static field',
    path:'state.cjs',
    sourceType:'commonjs',
    code:'const owner={secretAlpha:7};module.exports=class Reader{static value=owner.secretAlpha;};'
  }
];

for(const mode of modes) {
  for(const fixture of fixtures) {
    test(mode+' preserves source-visible owner reads in '+fixture.name,()=>{
      const emitted=obfuscateFiles([{
        path:fixture.path,
        sourceType:fixture.sourceType,
        code:fixture.code
      }],{
        mode,
        seed:'agent3-class-field-source-observer/'+mode+'/'+fixture.name,
        closedWorld:true,
        properties:true,
        identifiers:false,
        strings:false
      });
      const output=emitted.files.find(file=>file.path===fixture.path);
      assert.ok(output,'the input module should be emitted');
      assert.equal(output.metrics.properties,0,
        'a class object exported to the host exposes its class source');
      assert.match(output.code,/owner\\.secretAlpha/u,
        'the source-visible field spelling must remain unchanged');
    });
  }
}
