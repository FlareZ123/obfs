'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {string|undefined} */
function execute(code) {
  /** @type {{module:{exports:unknown}}} */
  const sandbox={module:{exports:null}};
  vm.runInNewContext(code,sandbox,{timeout:2000});
  if(typeof sandbox.module.exports==='function')return sandbox.module.exports.toString();
  return JSON.stringify(sandbox.module.exports);
}

/**
 * @param {'coo'|'sno'} mode
 * @param {string} source
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(mode,source) {
  const out=obfuscateFiles([{path:'entry.cjs',code:source}],{
    mode,seed:'top-level-primitive-local-owner-proof',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(out.files.length,1);
  return out.files[0];
}

/** @param {string} init @returns {string} */
function positive(init) {
  return 'const seedValue='+init+';'+
    'const privateOwner={secretField:seedValue,otherField:5};'+
    'module.exports=[privateOwner.secretField,privateOwner.otherField];';
}

/** @param {string} label @param {string} source @param {boolean} rewritten */
function check(label,source,rewritten) {
  for(const mode of /** @type {const} */(['coo','sno'])) {
    test(mode+' top-level primitive owner: '+label,()=>{
      const reference=execute(source);
      const output=compile(mode,source);
      assert.equal(output.metrics.objects,rewritten?1:0,label+': '+output.code);
      if(rewritten) {
        assert.equal(output.metrics.properties,2,label);
        assert.doesNotMatch(output.code,/secretField|otherField/u,label);
      }
      assert.equal(execute(output.code),reference,label+': '+output.code);
    });
  }
}

check('preceding simple numeric const',positive('17'),true);
check('preceding string const',positive('"private-value"'),true);
check('preceding boolean const',positive('true'),true);
check('preceding null const',positive('null'),true);
check('preceding pure expression',positive('11*2+3'),true);
check('preceding unary undefined',positive('void 0'),true);
check('preceding concatenated primitive',positive('"prefix"+3'),true);
check('same declaration order',
  'const seedValue=17,privateOwner={secretField:seedValue,otherField:5};'+
  'module.exports=[privateOwner.secretField,privateOwner.otherField];',true);

check('mutable let initializer',
  'let seedValue=17;const privateOwner={secretField:seedValue,otherField:5};'+
  'module.exports=privateOwner.secretField;',false);
check('effectful constant call',
  'const seedValue=(()=>17)();'+
  'const privateOwner={secretField:seedValue,otherField:5};'+
  'module.exports=privateOwner.secretField;',false);
check('object-valued const alias',
  'const seedValue={inner:17};'+
  'const privateOwner={secretField:seedValue,otherField:5};'+
  'module.exports=privateOwner.secretField.inner;',false);
check('BigInt const alias',
  'const seedValue=1n;const privateOwner={secretField:seedValue,otherField:5};'+
  'module.exports=String(privateOwner.secretField);',false);
check('transitive const alias',
  'const first=17;const seedValue=first;'+
  'const privateOwner={secretField:seedValue,otherField:5};'+
  'module.exports=privateOwner.secretField;',false);
check('nested function closure, outside direct top-level proof',
  'const seedValue=17;function run(){'+
  'const privateOwner={secretField:seedValue,otherField:5};'+
  'return privateOwner.secretField;}module.exports=run();',false);
check('owner key reflection',
  'const seedValue=17;const privateOwner={secretField:seedValue,otherField:5};'+
  'module.exports=Object.keys(privateOwner);',false);
check('private object escapes through public module export',
  'const seedValue=17;const privateOwner={secretField:seedValue,otherField:5};'+
  'module.exports=privateOwner;',false);
check('exported function source text remains observable',
  'const seedValue=17;const privateOwner={secretField:seedValue,otherField:5};'+
  'module.exports=function publicReader(){return privateOwner.secretField;};',false);
check('local function toString observes original private property spelling',
  'const seedValue=17;const privateOwner={secretField:seedValue,otherField:5};'+
  'function reader(){return privateOwner.secretField;}'+
  'module.exports=[reader(),reader.toString()];',false);
check('function source from object-valued public result declines',
  'const seedValue=17;const privateOwner={secretField:seedValue,otherField:5};'+
  'module.exports=[privateOwner.secretField,(()=>privateOwner.otherField).toString()];',false);

check('dynamic key from own-key reflection',
  'const seedValue=17;const privateOwner={secretField:seedValue,otherField:5};'+
  'module.exports=privateOwner[Object.keys(privateOwner)[0]];',false);

for(const [label,expression] of /** @type {[string,string][]} */ ([
  ['invalid direct call','privateOwner.secretField()'],
  ['invalid constructor','new privateOwner.secretField()'],
  ['invalid optional call','privateOwner.secretField?.()']
])) {
  check('source-spelled TypeError '+label,
    'const seedValue=17;const privateOwner={secretField:seedValue,otherField:5};'+
    'try{'+expression+';}catch(error){module.exports=error.message;}',false);
}

for(const mode of /** @type {const} */(['coo','sno'])) {
  test(mode+' top-level owner: later const TDZ never authorizes earlier owner',()=>{
    const source='const privateOwner={secretField:seedValue,otherField:5};'+
      'const seedValue=17;module.exports=privateOwner.secretField;';
    const output=compile(mode,source);
    assert.equal(output.metrics.objects,0);
    assert.throws(()=>execute(source),{name:'ReferenceError'});
    assert.throws(()=>execute(output.code),{name:'ReferenceError'});
  });
  test(mode+' top-level owner: earlier hoisted function may run before later const',()=>{
    const source='run();const seedValue=17;'+
      'function run(){const privateOwner={secretField:seedValue,otherField:5};'+
      'module.exports=privateOwner.secretField;}';
    const output=compile(mode,source);
    assert.equal(output.metrics.objects,0);
    assert.throws(()=>execute(source),{name:'ReferenceError'});
    assert.throws(()=>execute(output.code),{name:'ReferenceError'});
  });
}
