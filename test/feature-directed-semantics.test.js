'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const {test} = require('node:test');
const {obfuscateFiles} = require('../src');

/**
 * Capture CommonJS observable completion as JSON-safe data.
 * @param {string} source
 * @returns {{kind:'return',value:string}|{kind:'throw',name:string,message:string}}
 */
function capture(source) {
  const context = {module:{exports:{}},exports:{}};
  try {
    vm.runInNewContext(source, context, {timeout:1000});
    return {kind:'return', value:JSON.stringify(context.module.exports)};
  } catch (error) {
    const object = /** @type {{name?:unknown,message?:unknown}} */ (error);
    return {
      kind:'throw',
      name:String(object.name),
      message:String(object.message)
    };
  }
}

/**
 * @param {string} source
 * @returns {import('../src/core').OutputFile}
 */
function transform(source) {
  return obfuscateFiles([{
    path:'feature.cjs',
    sourceType:'commonjs',
    code:source
  }], {
    mode:'sno',
    seed:'feature-directed-semantics'
  }).files[0];
}

const CASES = Object.freeze([
  {
    name:'constructor.name stays observable',
    source:`class FeatureSentinel{};const value=new FeatureSentinel();module.exports=[value.constructor.name,FeatureSentinel.name];`
  },
  {
    name:'direct eval keeps lexical binding identity',
    source:`const lexicalSentinel=37;module.exports=eval('lexicalSentinel');`
  },
  {
    name:'undeclared identifier keeps ReferenceError behavior',
    source:`try{module.exports=missingFeatureSentinel;}catch(error){module.exports=[error.name,/missingFeatureSentinel/u.test(error.message)];}`
  },
  {
    name:'function name observer keeps function identity',
    source:`function visibleFeatureName(){return visibleFeatureName.name;}module.exports=visibleFeatureName();`
  },
  {
    name:'TDZ exception remains observable',
    source:`try{module.exports=temporalFeature;}catch(error){module.exports=[error.name,/initialization|before/u.test(error.message)];}let temporalFeature=9;`
  },
  {
    name:'getter order and receiver identity are preserved',
    source:`const trace=[];const object={get first(){trace.push('first');return 2;},get second(){trace.push('second');return this.first+3;}};module.exports=[object.second,trace];`
  },
  {
    name:'computed Symbol.toPrimitive coercion order is preserved',
    source:`const trace=[];const value={[Symbol.toPrimitive](hint){trace.push(hint);return 5;}};module.exports=[value+'7',trace];`
  },
  {
    name:'class static initialization observes declared name',
    source:`class StaticFeature{static seen=this.name;static value=11;}module.exports=[StaticFeature.seen,StaticFeature.value];`
  },
  {
    name:'caught primitive coercion error keeps error class',
    source:`try{module.exports=1n+1;}catch(error){module.exports=[error.name,/BigInt/u.test(error.message)];}`
  },
  {
    name:'destructuring default executes once and in order',
    source:`let calls=0;function make(){calls++;return 19;}const state={};const {hidden=make()}=state;module.exports=[hidden,calls];`
  },
  {
    name:'constructor property reflection keeps public property name',
    source:`const state={constructor:41,privateValue:7};module.exports=[state.constructor,Object.keys(state).sort()];`
  },
  {
    name:'nested catch binding shadowing remains lexical',
    source:`let value='outer';try{throw new Error('x');}catch(value){module.exports=[value.message,(()=>value.name)(),globalThis.value];}`
  },
  {
    name:'Object.keys keeps private owner spelling observable',
    source:`const state={secretField:41,otherField:7};module.exports=Object.keys(state).sort();`
  },
  {
    name:'monkey-patched Object.hasOwn observes the key argument',
    source:`const state={secretField:41};const nativeHasOwn=Object.hasOwn;Object.hasOwn=(owner,key)=>[key,nativeHasOwn(owner,key)];module.exports=Object.hasOwn(state,'secretField');`
  },
  {
    name:'monkey-patched Reflect.get observes the key argument',
    source:`const state={secretField:41};const nativeGet=Reflect.get;Reflect.get=(owner,key)=>key+':'+nativeGet(owner,key);module.exports=Reflect.get(state,'secretField');`
  },
  {
    name:'monkey-patched descriptor lookup observes the key argument',
    source:`const state={secretField:41};const nativeDescriptor=Object.getOwnPropertyDescriptor;Object.getOwnPropertyDescriptor=(owner,key)=>[key,nativeDescriptor(owner,key).value];module.exports=Object.getOwnPropertyDescriptor(state,'secretField');`
  }
]);

for (const item of CASES) {
  test('feature-directed semantic differential: '+item.name, () => {
    const output = transform(item.source);
    assert.deepEqual(capture(output.code), capture(item.source));
  });
}

test('feature-directed corpus contains both transformed and conservatively refused hazards', () => {
  const metrics = CASES.map(item => transform(item.source).metrics);
  const transformed = metrics.filter(item =>
    item.literals + item.objects + item.properties + item.bindings > 0).length;
  const unchanged = metrics.filter(item =>
    item.literals + item.objects + item.properties + item.bindings === 0).length;
  assert.ok(transformed > 0);
  assert.ok(unchanged > 0);
});


test('reflective owner hazards remain ineligible for private property renaming', () => {
  for (const item of CASES.slice(-4)) {
    const output = transform(item.source);
    assert.equal(output.metrics.properties, 0, item.name);
  }
});
