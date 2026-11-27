'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {parse}=require('../src/ast');
const {firstUnprovedFreeReference}=require('../src/sco-free-references');

/** @type {Set<string>} */
const shared=new Set(['Object','Array','undefined']);

/**
 * @param {string} body
 * @returns {import('../src/ast').AstNode}
 */
function selectedBody(body){
  return parse('export async function protectedOp(){'+body+'}','module')
    .body[0].declaration.body;
}

/**
 * Execute exactly the submitted function body in a fresh strict Node realm.
 * The reference `v` is either absent from that realm or externally provided.
 * @param {string} body
 * @param {boolean} withGlobal
 * @returns {Promise<unknown>}
 */
function execute(body,withGlobal){
  const context=withGlobal?{v:73}:{};
  return vm.runInNewContext('"use strict";(async function(){'+body+'})()',
    context);
}

test('136 actual native realm pairs distinguish owned var and external free reads',async()=>{
  let safeCases=0;
  let globalCases=0;
  for(let i=1;i<=8;i++){
    const safe=[
      ['direct-var','var v='+i+';return v;'],
      ['unreached-if','if(false){var v='+i+';}return v;'],
      ['reached-if','if(true){var v='+i+';}return v;'],
      ['for-of','for(var v of ['+i+']){}return v;'],
      ['switch-case-var','switch(0){case 1:var v='+i+';}return v;'],
      ['nested-closure','function inner(){return v;}var v='+i+';return inner();'],
      ['static-distinct','class C{static {var v='+i+';}}var v='+(i+1)+';return v;'],
      ['outer-lexical-switch','let v='+i+';switch(v){case '+i+
        ':let v='+(i+1)+';break;}return v;'],
      ['catch-var','try{throw 1;}catch(e){var v='+i+';}return v;']
    ];
    const external=[
      ['nested-function','function decoy(){var v='+i+';}return v;'],
      ['class-static','class C{static {var v='+i+';}}return v;'],
      ['switch-let','switch(v){case '+i+':let v='+(i+1)+';break;}return '+i+';'],
      ['switch-const','switch(v){case '+i+':const v='+(i+1)+';break;}return '+i+';'],
      ['switch-class','switch(v){case '+i+':class v{};break;}return '+i+';'],
      ['default-parameter','function local(x=v){var v='+i+
        ';return x;}return local();'],
      ['loop-let','for(let v=0;v<1;v++){}return v;'],
      ['catch-only','try{throw 1;}catch(v){}return v;']
    ];
    for(const [label,body] of safe){
      assert.equal(firstUnprovedFreeReference(selectedBody(body),new Set(),
        new Set(),shared,true),null,label+' #'+i);
      assert.equal(await execute(body,false),await execute(body,true),
        'external global has no effect: '+label+' #'+i);
      safeCases++;
    }
    for(const [label,body] of external){
      assert.equal(firstUnprovedFreeReference(selectedBody(body),new Set(),
        new Set(),shared,true),'v',label+' #'+i);
      await assert.rejects(execute(body,false),/v is not defined/u,
        'absent external binding: '+label+' #'+i);
      await assert.doesNotReject(execute(body,true),
        'provided external binding: '+label+' #'+i);
      globalCases++;
    }
  }
  assert.equal(safeCases,72);
  assert.equal(globalCases,64);
});
