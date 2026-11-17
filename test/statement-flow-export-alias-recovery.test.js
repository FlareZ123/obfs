'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {flattenStatementFlow}=require('../src/statement-flow');
const {recoverStatementFlow}=require('../sims/statement-flow-recover');

const implementation='function internal(x){var y=x|0;'+
  'if((y&1)!==0){y=(y+7)|0;}else{y=(y-3)|0;}'+
  'if(y>21)return y+5;return y|0;}';

/** @param {string} source @returns {Promise<Record<string,(x:number)=>number>>} */
async function load(source){
  const data='data:text/javascript;charset=utf-8,'+encodeURIComponent(source);
  return /** @type {Promise<Record<string,(x:number)=>number>>} */(import(data));
}

test('source-only CFG recovery resolves local ESM named-export aliases',async()=>{
  const specimens=[
    {source:implementation+'export {internal as visible};',publicName:'visible'},
    {source:'export '+implementation+'export {internal as visible};',publicName:'visible'},
    {source:implementation+'export {internal};',publicName:'internal'},
    {source:implementation+'export {internal as "visible-hyphen"};',publicName:'visible-hyphen'}
  ];
  for(const [caseIndex,sample] of specimens.entries()){
    for(const compactCases of [false,true]){
      for(const denseStateIds of [false,true]){
        const generated=flattenStatementFlow(sample.source,'module',{
          names:['internal'],seed:'alias-recovery-'+caseIndex+'-'+compactCases+'-'+denseStateIds,
          compactCases,denseStateIds
        });
        assert.equal(generated.functions,1);
        const reconstructed=recoverStatementFlow(generated.code,sample.publicName,'module');
        const native=await load(sample.source);
        const obfuscated=await load(generated.code);
        const clone=await load(reconstructed.code);
        assert.equal(typeof clone[sample.publicName],'function');
        for(let x=-35;x<=35;x++){
          const value=native[sample.publicName](x);
          assert.equal(obfuscated[sample.publicName](x),value);
          assert.equal(clone[sample.publicName](x),value);
        }
      }
    }
  }
});

test('source-only CFG recovery refuses external reexports with no local dispatcher',()=>{
  const source='export {f as visible} from "./external.mjs";';
  assert.throws(()=>recoverStatementFlow(source,'visible','module'),
    /Public function not found/u);
});


test('public-only attacker follows full COO identifier/string layers through export aliases',async()=>{
  const {obfuscateFiles}=require('../src');
  const source=implementation+'export {internal as visible};';
  const native=await load(source);
  for(let i=0;i<6;i++){
    const output=obfuscateFiles([{
      path:'math.mjs',sourceType:'module',code:source
    }],{
      mode:'coo',seed:'alias-layered-'+i,
      allowedHosts:['127.0.0.1'],
      strings:true,properties:true,identifiers:true,
      experimentalStatementFlow:{'math.mjs':['internal']}
    });
    assert.equal(output.files[0].metrics.statementFlowFunctions,1);
    const attacker=recoverStatementFlow(String(output.files[0].code),
      'visible','module');
    const clone=await load(attacker.code);
    for(let value=-40;value<=40;value++){
      assert.equal(clone.visible(value),native.visible(value));
    }
  }
});
