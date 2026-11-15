'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @typedef {'sno'|'coo'} Mode */

/** A reproducible PRNG; no hidden fuzz seed influences reported results. */
let state=0x17f0baf3;
/** @returns {number} */
function random() {
  state^=state<<13;
  state^=state>>>17;
  state^=state<<5;
  return state>>>0;
}

/**
 * Compare text-only results so cross-realm array/object prototypes cannot
 * cause false positives when original and transformed run in separate realms.
 * @param {string} source
 * @returns {string}
 */
function evaluate(source) {
  const sandbox={module:{exports:null}};
  vm.runInNewContext(source,sandbox,{timeout:1000});
  return JSON.stringify(sandbox.module.exports);
}

/**
 * @param {string} source
 * @param {Mode} mode
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function transform(source,mode) {
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'nested-flow-fuzz-'+random(),identifiers:false,strings:false
  }).files[0];
}

const names=['secretField','message','payload','cacheKey','firstValue','hiddenData',
  'logicalFlag','otherField','memberState','internalMeta','primaryKey','secondaryKey'];

/**
 * @param {number} index
 * @returns {string}
 */
function positiveFixture(index) {
  const first=names[index%names.length];
  const second=names[(index+5)%names.length];
  const count=(random()%100000)+1;
  const count2=(random()%100000)+1;
  const firstKey=index%3===0?'['+JSON.stringify(first)+']':first;
  const secondKey=index%5===0?'['+JSON.stringify(second)+']':second;
  const nested=index%4===0 ?
    '{inner:[{value:'+count+'},{value:'+count2+'}]}' :
    '{inner:{value:'+count+',extra:['+count2+',3]}}';
  const source=[
    'const root={'+firstKey+':'+nested+','+secondKey+':['+count+','+count2+']};'
  ];
  let alias='root';
  const steps=index%6;
  for(let j=0;j<steps;j++) {
    const local='alias'+j;
    if(index%5===0&&j===0) {
      source.push('function forward(value){return value;}');
      source.push('const '+local+'=forward('+alias+');');
    }else{
      source.push((j%2===0?'let ':'const ')+local+'='+alias+';');
    }
    alias=local;
  }
  const access=index%2===0?alias+'.'+first:alias+'['+JSON.stringify(first)+']';
  const inner=index%4===0?'.inner[1].value':'.inner.value';
  source.push('module.exports=['+access+inner+','+alias+'.'+second+'[1],'+
    alias+'.'+first+inner+'];');
  return source.join('');
}

/** @param {number} index @returns {string} */
function negativeFixture(index) {
  const name=names[index%names.length];
  const value=(random()%100000)+1;
  const kind=index%6;
  const intro='const root={'+name+':{inner:'+value+'}};';
  switch(kind) {
    case 0:
      return intro+'let alias=root;alias={'+name+':{inner:8}};'+
        'module.exports=alias.'+name+'.inner+root.'+name+'.inner;';
    case 1:
      return intro+'module.exports=[Reflect.ownKeys(root),root.'+name+'.inner];';
    case 2:
      return intro+'let alias=root;Object.assign(alias,{extra:9});'+
        'module.exports=[Object.keys(root),root.'+name+'.inner];';
    case 3:
      return 'const root={'+name+':{get inner(){return '+value+';}}};'+
        'module.exports=root.'+name+'.inner;';
    case 4:
      return 'const items=[7];const root={'+name+':{...{value:items[0]}}};'+
        'module.exports=root.'+name+'.value;';
    default:
      return 'const root={'+name+':{inner:()=>'+value+'}};'+
        'module.exports=root.'+name+'.inner();';
  }
}

test('600 deterministic nested and let-alias flows preserve exact observable results',()=>{
  const totals={sno:0,coo:0};
  for(let i=0;i<600;i++) {
    const source=positiveFixture(i);
    const baseline=evaluate(source);
    const mode=/** @type {Mode} */(i%2===0?'sno':'coo');
    const transformed=transform(source,mode);
    assert.equal(evaluate(transformed.code),baseline,'case '+i+': '+transformed.code);
    assert.equal(transformed.metrics.objects,1,'Expected safe owner rename in case '+i+': '+transformed.code);
    totals[mode]++;
  }
  assert.equal(totals.sno,300);
  assert.equal(totals.coo,300);
});

test('240 deterministic nested escape and side-effect flows conservatively decline',()=>{
  for(let i=0;i<240;i++) {
    const source=negativeFixture(i);
    const baseline=evaluate(source);
    const mode=/** @type {Mode} */(i%2===0?'sno':'coo');
    const transformed=transform(source,mode);
    assert.equal(evaluate(transformed.code),baseline,'negative case '+i);
    assert.equal(transformed.metrics.objects,0,'Unsafe rename in case '+i+': '+transformed.code);
  }
});
