'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @typedef {'coo'|'sno'} Mode */

/**
 * Evaluate source in a fresh clean JS realm; do not conflate cross-realm
 * prototypes or property-order formatting with semantic differences.
 * @param {string} code
 * @returns {string|undefined}
 */
function evaluate(code){
  const context={module:{exports:undefined}};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @type {Array<[string,string]>} */
const ownerFlows=[
  ['index', 'const ref=holder[0];'],
  ['at', 'const ref=holder.at(0);'],
  ['find', 'const ref=holder.find(value=>value===owner);'],
  ['findLast', 'const ref=holder.findLast(value=>value===owner);'],
  ['filter', 'const ref=holder.filter(Boolean)[0];'],
  ['map', 'const ref=holder.map(value=>value)[0];'],
  ['reduce', 'const ref=holder.reduce((_,value)=>value,null);'],
  ['slice', 'const ref=holder.slice()[0];'],
  ['concat', 'const ref=holder.concat([])[0];'],
  ['toReversed', 'const ref=holder.toReversed()[0];'],
  ['with', 'const ref=holder.with(0,owner)[0];'],
  ['flat', 'const ref=holder.flat(0)[0];'],
  ['spread', 'const ref=[...holder][0];'],
  ['array destructure', 'const [ref]=holder;'],
  ['Array.from', 'const ref=Array.from(holder)[0];'],
  ['array iterator', 'const ref=holder[Symbol.iterator]().next().value;'],
  ['array values', 'const ref=holder.values().next().value;'],
  ['set iterator', 'const ref=new Set(holder).values().next().value;'],
  ['map retrieval', 'const ref=new Map([["slot",owner]]).get("slot");'],
  ['Object.values', 'const ref=Object.values({slot:owner})[0];'],
  ['Object.entries', 'const ref=Object.entries({slot:owner})[0][1];'],
  ['Reflect.apply', 'const ref=Reflect.apply(Array.prototype.at,holder,[0]);'],
  ['Object.assign clone', 'const ref=Object.assign({},owner);'],
  ['object destructure', 'const {slot:ref}={slot:owner};']
];

/** @param {string} flow @param {number} index @returns {string} */
function makeCase(flow,index){
  const secret=43+(index*17)%103;
  const other=9+(index*7)%59;
  return 'const owner={secretField:'+secret+',auxiliaryFlag:'+other+'};'+
    'const holder=[owner];'+flow+
    'module.exports=[Object.keys(ref),ref.secretField,owner.auxiliaryFlag];';
}

test('24 owner propagation paths preserve reflected key spellings over 240 seeded code builds',{
  timeout:60000
},()=>{
  let trials=0;
  for(let index=0;index<ownerFlows.length;index++){
    const [label,flow]=ownerFlows[index];
    for(const mode of /** @type {const} */(['coo','sno'])){
      for(let seed=0;seed<5;seed++){
        const source=makeCase(flow,index+seed*ownerFlows.length);
        const expected=evaluate(source);
        const transformed=obfuscateFiles([
          {path:'entry.cjs',sourceType:'commonjs',code:source}
        ],{
          mode,seed:'owner-reflect-'+index+'-'+seed,
          properties:true,identifiers:false,strings:false
        }).files[0];
        const observed=evaluate(String(transformed.code));
        assert.equal(observed,expected,
          'Changed reflective owner result in '+label+'/'+mode+'/seed'+seed+
          '\nsource='+source+'\nemitted='+transformed.code);
        trials++;
      }
    }
  }
  assert.equal(trials,240);
});

test('private non-reflective owner remains eligible for property rewrite',()=>{
  const source='const owner={secretField:43,auxiliaryFlag:9};'+
    'function read(value){return value.secretField+value.auxiliaryFlag;}'+
    'module.exports=read(owner);';
  for(const mode of /** @type {const} */(['coo','sno'])){
    const transformed=obfuscateFiles([
      {path:'entry.cjs',sourceType:'commonjs',code:source}
    ],{
      mode,seed:'owner-reflect-positive',
      properties:true,identifiers:false,strings:false
    }).files[0];
    assert.equal(evaluate(String(transformed.code)),evaluate(source));
    assert.ok(transformed.metrics.objects>0,
      'A closed private object should not become an all-decline regression');
  }
});
