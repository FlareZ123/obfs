'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src/core');

/** @type {Array<'coo'|'sno'|'sco'>} */
const MODES = ['coo','sno','sco'];

/** @param {string} expression @returns {string} */
function sourceFor(expression) {
  return [
    "'use strict';",
    'const owner={secretAlpha:'+expression+',secretBeta:7};',
    'class Reader{read(){return owner.secretAlpha;}}',
    'const reader=new Reader();',
    'module.exports=[reader.read(),reader.read(),owner.secretBeta];'
  ].join('\n');
}

/** @param {string} code @returns {unknown[]} */
function run(code) {
  const context = {module:{exports:/** @type {unknown} */(null)}};
  vm.runInNewContext(code,context,{filename:'class-value.cjs',timeout:2000});
  assert.ok(Array.isArray(context.module.exports));
  return Array.from(context.module.exports);
}

/**
 * @param {string} code
 * @param {'coo'|'sno'|'sco'} mode
 * @param {string} label
 */
function compile(code,mode,label) {
  const output = obfuscateFiles([{path:'class-value.cjs',sourceType:'commonjs',code}],{
    mode,seed:'class-value-fidelity/'+label+'/'+mode,
    properties:true,identifiers:false,strings:false
  }).files[0];
  assert.equal(typeof output.code,'string');
  return {code:/** @type {string} */(output.code),properties:output.metrics.properties};
}

test('JSON equality is not a JavaScript value-equivalence oracle',()=>{
  assert.equal(JSON.stringify([0]),JSON.stringify([-0]));
  assert.equal(JSON.stringify([NaN]),JSON.stringify([null]));
  assert.equal(JSON.stringify([undefined]),JSON.stringify([null]));
  assert.equal(JSON.stringify([Infinity]),JSON.stringify([-Infinity]));
  assert.notEqual(Object.is(0,-0),true);
  assert.notEqual(Object.is(NaN,null),true);
  assert.notEqual(Object.is(undefined,null),true);
  assert.notEqual(Object.is(Infinity,-Infinity),true);
  assert.throws(()=>JSON.stringify([1n]),TypeError);
});

/** @type {Array<{label:string,expression:string,expected:unknown}>} */
const scalars = [
  {label:'ordinary-number',expression:'23',expected:23},
  {label:'positive-zero',expression:'0',expected:0},
  {label:'negative-zero',expression:'-0',expected:-0},
  {label:'nan',expression:'0/0',expected:NaN},
  {label:'positive-infinity',expression:'1/0',expected:Infinity},
  {label:'negative-infinity',expression:'-1/0',expected:-Infinity},
  {label:'undefined',expression:'void 0',expected:undefined},
  {label:'null',expression:'null',expected:null},
  {label:'false',expression:'false',expected:false},
  {label:'bigint',expression:'9007199254740993n',expected:9007199254740993n},
  {label:'negative-bigint',expression:'-9007199254740993n',expected:-9007199254740993n},
  {label:'escaped-lone-surrogate',expression:'"\\ud800"',expected:'\ud800'},
  {label:'astral-string',expression:'"\\u{1F680}"',expected:'🚀'},
  {label:'nul-string',expression:'"a\\u0000b"',expected:'a\u0000b'}
];

test('class leaf scalar fidelity: compare exact JS values, not serialized JSON',()=>{
  /** @type {Array<{label:string,mode:string,rewritten:number}>} */
  const observations=[];
  for (const {label,expression,expected} of scalars) {
    const code=sourceFor(expression);
    const before=run(code);
    assert.equal(before.length,3);
    assert.ok(Object.is(before[0],expected),label+': native value');
    assert.ok(Object.is(before[1],expected),label+': repeated native value');
    assert.equal(before[2],7);
    for (const mode of MODES) {
      const compiled=compile(code,mode,label);
      const after=run(compiled.code);
      assert.equal(after.length,before.length);
      for(let i=0;i<before.length;i++)
        assert.ok(Object.is(after[i],before[i]),label+'/'+mode+': slot '+i+' exact parity');
      observations.push({label,mode,rewritten:compiled.properties});
    }
  }
  // Require a nonvacuous candidate positive and keep refusal counts visible.
  for(const mode of MODES) {
    assert.equal(observations.find(o=>o.label==='ordinary-number'&&o.mode===mode)?.rewritten,2);
    assert.ok(observations.some(o=>o.mode===mode&&o.label!=='ordinary-number'&&o.rewritten===2),
      mode+': at least one nontrivial scalar must actually be transformed');
  }
  process.stdout.write('CLASS_VALUE_SCALARS '+JSON.stringify(observations)+'\n');
});

/** @type {Array<{label:string,expression:string,inspect:(value:unknown)=>unknown}>} */
const referenceCases=[
  {label:'array',expression:'[0,-0,0/0,void 0,9007199254740993n]',
    inspect:value=>{
      assert.ok(Array.isArray(value));
      return Array.from(value);
    }},
  {label:'record',expression:'{publicLabel:-0,publicValue:0/0}',
    inspect:value=>{
      assert.ok(value!==null&&typeof value==='object');
      const obj=/** @type {{publicLabel:unknown,publicValue:unknown}} */(value);
      return [Reflect.ownKeys(obj),obj.publicLabel,obj.publicValue];
    }},
  {label:'regexp',expression:'/a+/gi',
    inspect:value=>{
      assert.equal(Object.prototype.toString.call(value),'[object RegExp]');
      const obj=/** @type {RegExp} */(value);
      return [obj.source,obj.flags,obj.lastIndex];
    }}
];

test('class leaf reference fidelity: identity, public keys and native value state',()=>{
  /** @type {Array<{label:string,mode:string,rewritten:number}>} */
  const observations=[];
  for(const {label,expression,inspect} of referenceCases) {
    const code=sourceFor(expression),before=run(code);
    assert.equal(before.length,3);
    assert.ok(Object.is(before[0],before[1]),label+': native identity');
    assert.equal(before[2],7);
    const original=inspect(before[0]);
    for(const mode of MODES) {
      const compiled=compile(code,mode,label),after=run(compiled.code);
      assert.equal(after.length,before.length);
      assert.ok(Object.is(after[0],after[1]),label+'/'+mode+': repeated reference identity');
      assert.equal(after[2],before[2]);
      assert.deepEqual(inspect(after[0]),original,label+'/'+mode+': native object-state parity');
      observations.push({label,mode,rewritten:compiled.properties});
    }
  }
  // A refusal is a correctness observation, not proof that an actual rewrite
  // preserves object identity. Keep each transformation count in the receipt.
  process.stdout.write('CLASS_VALUE_REFERENCES '+JSON.stringify(observations)+'\n');
});
