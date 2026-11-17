'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Evaluate in an isolated CommonJS context so tests cannot contaminate the
 * real process's built-in prototypes or globals.
 * @param {string} code
 * @returns {string}
 */
function run(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{filename:'adversarial-in.cjs',timeout:3000});
  return JSON.stringify(context.module.exports);
}

/**
 * @param {string} source
 * @param {number} expectedRenames
 * @returns {void}
 */
function compare(source,expectedRenames){
  const original=run(source);
  for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])){
    const output=obfuscateFiles([{path:'adversarial-in.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'agent2-independent-in-review-'+mode,
      strings:false,identifiers:false
    });
    const emitted=/** @type {string} */ (output.files[0].code);
    assert.equal(output.files[0].metrics.properties,expectedRenames,
      'unexpected proof admission in '+mode+': '+emitted);
    assert.equal(run(emitted),original,'runtime mismatch in '+mode+': '+emitted);
  }
}

const accepted=[
  [
    'repeated membership, value read, and numeric update',
    'const bag={secretField:3};bag.secretField+=2;module.exports=['+
      '"secretField" in bag,bag.secretField,"secretField" in bag];'
  ],
  [
    'immutable aliased binding',
    'const bag={secretField:3};const alias=bag;module.exports=['+
      '"secretField" in alias,alias.secretField];'
  ],
  [
    'mutable but never reassigned alias',
    'const bag={secretField:3};let alias=bag;module.exports=['+
      '"secretField" in alias,alias.secretField];'
  ],
  [
    'private tuple forwarding',
    'const bag={secretField:3};const holder=[bag,11];const alias=holder[0];'+
      'module.exports=["secretField" in alias,alias.secretField];'
  ],
  [
    'private record forwarding',
    'const bag={secretField:3};const holder={root:bag,count:11};'+
      'const alias=holder.root;module.exports=["secretField" in alias,alias.secretField];'
  ]
];

for(const [label,source] of accepted){
  test('adversarial proven own membership remains transformed: '+label,()=>{
    compare(source,1);
  });
}

const refused=[
  [
    'function alias additionally called with foreign object',
    'function check(o){return "secretField" in o;}'+
      'const alias=check;const bag={secretField:3};'+
      'module.exports=[check(bag),alias({secretField:7})];'
  ],
  [
    'foreign parameter through an implicit default argument',
    'function check(o={secretField:8}){return "secretField" in o;}'+
      'const bag={secretField:3};module.exports=[check(bag),check()];'
  ],
  [
    'tracked owner passed to a proxy has trap',
    'const bag={secretField:3};const proxy=new Proxy(bag,{has(){return false;}});'+
      'module.exports=["secretField" in bag,"secretField" in proxy];'
  ],
  [
    'owner reflection through a spread',
    'const bag={secretField:3};const clone={...bag};'+
      'module.exports=["secretField" in bag,Object.keys(clone)];'
  ],
  [
    'reflective mutation removes an own key',
    'const bag={secretField:3};Reflect.deleteProperty(bag,"secretField");'+
      'module.exports="secretField" in bag;'
  ],
  [
    'opaque assignment replaces the known own value',
    'const bag={secretField:3};Object.assign(bag,{secretField:7});'+
      'module.exports=["secretField" in bag,bag.secretField];'
  ],
  [
    'mutable private tuple slot loses owner identity',
    'const bag={secretField:3};const tuple=[bag,0];'+
      'tuple[0]={secretField:11};const alias=tuple[0];'+
      'module.exports=["secretField" in alias,alias.secretField];'
  ],
  [
    'mutable private record field loses owner identity',
    'const bag={secretField:3};const holder={root:bag,n:0};'+
      'holder.root={secretField:11};const alias=holder.root;'+
      'module.exports=["secretField" in alias,alias.secretField];'
  ],
  [
    'direct source observer on a membership closure',
    'const bag={secretField:3};function check(){return "secretField" in bag;}'+
      'module.exports=[check(),Function.prototype.toString.call(check)];'
  ],
  [
    'error stack source-coordinate observer',
    'const bag={secretField:3};let stack;'+
      'try{throw Error("original");}catch(error){stack=error.stack;}'+
      'module.exports=["secretField" in bag,stack];'
  ],
  [
    'generic call exposes the owner to unknown JS',
    'const bag={secretField:3};function inspect(x){return Object.keys(x);};'+
      'module.exports=["secretField" in bag,inspect(bag)];'
  ]
];

for(const [label,source] of refused){
  test('adversarial owner mutation/escape refuses: '+label,()=>{
    compare(source,0);
  });
}
