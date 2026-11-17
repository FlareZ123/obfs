'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * The only moving parts are the object field name and a parameter-supplied
 * value. Every source has a fixed set of own-field reads and an external
 * primitive result, so any surviving transform is demonstrably nonvacuous.
 * Randomization is deterministic and published for reproduction.
 */
let state=0x4fc79b13;
/** @returns {number} */
function random() {
  state^=state<<13;
  state^=state>>>17;
  state^=state<<5;
  return state>>>0;
}

/** @param {string} code @returns {string} */
function evaluate(code) {
  const realm={module:{exports:null}};
  vm.runInNewContext(code,realm,{timeout:1000});
  return JSON.stringify(realm.module.exports);
}

const names=['secretField','privateValue','cacheIndex','hiddenScore',
  'sessionPayload','stateToken','alphaBeta','internalCount'];
const values=[
  'undefined','null','true','false','0','1','-17','42','43n',
  '"alpha"','Symbol.for("sample")','NaN','Infinity',
  '(()=>17)','(function named(){return 4;})',
  '({score:12})','[1,2,3]','Object.freeze({score:5})',
  'new Date(0)'
];

/**
 * @param {number} iteration
 * @returns {string}
 */
function positive(iteration) {
  const key=names[random()%names.length];
  const value=values[random()%values.length];
  const bias=1+(random()%31);
  return [
    'function inspect(payload){',
    ' const owner={'+key+':payload,bias:'+bias+'};',
    ' const observed=owner.'+key+';',
    ' return [observed===payload,typeof owner.'+key+',owner.bias,',
    '  typeof observed==="function"?observed.name:""];',
    '}',
    'module.exports=inspect('+value+');',
    '// fixture '+iteration
  ].join('\n');
}

/** @typedef {'coo'|'sno'} Mode */
/**
 * @param {string} source
 * @param {Mode} mode
 * @param {number} expectedObjects
 * @param {number} index
 */
function preserve(source,mode,expectedObjects,index) {
  const baseline=evaluate(source);
  const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'formal-provenance-fuzz-'+index,
    strings:false,identifiers:false,properties:true
  }).files[0];
  assert.equal(output.metrics.objects,expectedObjects,
    'Invalid transformation count for '+mode+' case '+index+': '+output.code);
  assert.equal(evaluate(output.code),baseline,
    'Behavior mismatch for '+mode+' case '+index+': '+output.code);
}

test('512 deterministic lexical-formal value types preserve exact COO/SNO output with real owner rewrites',()=>{
  for(let index=0;index<512;index++) {
    const source=positive(index);
    const mode=/** @type {Mode} */ (index%2===0?'coo':'sno');
    preserve(source,mode,1,index);
  }
});

const negative=[
  'function run(payload){const owner={secretField:payload};return Object.keys(owner).join(",");}module.exports=run(17);',
  'function run(payload){const owner={secretField:payload};return Reflect.ownKeys(owner).join(",");}module.exports=run(17);',
  'function run(payload){const owner={secretField:payload};return Object.entries(owner).length;}module.exports=run(17);',
  'function run(payload){const owner={secretField:payload};return owner;}module.exports=Object.keys(run(17));',
  'function run(payload,key){const owner={secretField:payload};return owner[key];}module.exports=run(17,"secretField");',
  'function run(payload){const owner={secretField:payload};delete owner.secretField;return Object.keys(owner);}module.exports=run(17);',
  'function run(payload){const owner={secretField:payload};const keys=[];for(const key in owner)keys.push(key);return keys;}module.exports=run(17);',
  'function run(payload){const owner={secretField:payload};return owner.secretField();}module.exports=run(function(){return Object.keys(this).join(",");});',
  'function run(payload){const owner={secretField:payload};const reveal=()=>Object.keys(owner);return [owner.secretField,reveal()];}module.exports=run(17);',
  'function run(payload){const owner={secretField:payload};owner.secretField=function(){return Object.keys(this)};return owner.secretField();}module.exports=run(17);'
];

test('bounded identifier-value candidate still refuses 20 reflected, escaped and opaque-flow cases',()=>{
  for(let index=0;index<negative.length;index++) {
    for(const mode of /** @type {const} */ (['sno','coo'])) {
      preserve(negative[index],mode,0,1000+index*2+(mode==='coo'?1:0));
    }
  }
});
