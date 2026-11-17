'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {normalizePublicFields}=require('../sims/public-token-normalizer');

/** @param {string} code @returns {string} */
function execute(code) {
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

test('seedless Acorn tokenizer normalizes identifiers and key strings without touching comments',()=>{
  const first='_p123456789abc';
  const second='_paabbccddeeff';
  const source="const state={"+first+":11,"+second+":17};\n"+
    "module.exports=[state."+first+",state['"+second+"']];\n"+
    "// Public observer may discuss "+first+" in a comment.\n";
  const attack=normalizePublicFields([{path:'entry.cjs',sourceType:'commonjs',code:source}]);
  assert.equal(attack.properties,2);
  assert.equal(attack.files.length,1);
  assert.equal(execute(attack.files[0].code),execute(source));
  assert.ok(attack.files[0].code.includes('state._publicField0'));
  assert.ok(attack.files[0].code.includes('state["_publicField1"]'));
  assert.ok(attack.files[0].code.includes('discuss '+first+' in a comment'));
});

test('shared public field spelling receives the same neutral token in separate files',()=>{
  const name='_pabcdef123456';
  const [owner,consumer]=normalizePublicFields([
    {path:'state.mjs',sourceType:'module',code:'export const state={'+name+':41};'},
    {path:'consumer.mjs',sourceType:'module',code:'import {state} from "./state.mjs";'+
      'export const value=state["'+name+'"];'}
  ]).files;
  assert.ok(owner.code.includes('_publicField0'));
  assert.ok(consumer.code.includes('["_publicField0"]'));
  assert.equal(owner.code.includes(name),false);
  assert.equal(consumer.code.includes(name),false);
});

test('hash-shaped ordinary data never gets rewritten as a protected property',()=>{
  const name='_pabcdef123456';
  const source='const state={'+name+':17};'+
    'const payload="'+name+'";module.exports=[state.'+name+',payload];';
  const attacked=normalizePublicFields([{path:'entry.cjs',sourceType:'commonjs',code:source}]);
  assert.equal(attacked.properties,1);
  assert.equal(execute(attacked.files[0].code),execute(source));
  assert.ok(attacked.files[0].code.includes('const payload="'+name+'"'));
  assert.ok(attacked.files[0].code.includes('state._publicField0'));
});

test('quoted destructuring keys and computed member keys remain jointly normalizable',()=>{
  const name='_p123456789abc';
  const source='const state={"'+name+'":29};'+
    'const {"'+name+'":reading}=state;'+
    'module.exports=[reading,state["'+name+'"]];';
  const attacked=normalizePublicFields([{path:'entry.cjs',sourceType:'commonjs',code:source}]);
  assert.equal(attacked.properties,1);
  assert.equal(execute(attacked.files[0].code),execute(source));
  assert.equal(attacked.files[0].code.includes(name),false);
});

test('source-only label normalization has a documented external API collision limit',()=>{
  const field='_pabcdef123456';
  const source='const hidden={'+field+':17};'+
    'module.exports=[hidden.'+field+',HOST.'+field+'];';
  const attacked=normalizePublicFields([
    {path:'synthetic.cjs',sourceType:'commonjs',code:source}
  ]);
  assert.equal(attacked.properties,1);
  /**
   * The source-only attacker cannot infer that HOST is owned by a caller
   * and that its public property spelling is fixed outside the input graph.
   * This deliberate negative control measures attack overreach; it is not a
   * claimed compiler native/emitted mismatch or obfuscation security gain.
   * @param {string} code
   * @returns {string}
   */
  function run(code){
    const context={module:{exports:null},HOST:{[field]:31,api:{[field]:43}}};
    vm.runInNewContext(code,context,{timeout:1000});
    return JSON.stringify(context.module.exports);
  }
  assert.equal(run(source),'[17,31]');
  assert.equal(run(attacked.files[0].code),'[17,null]');
  const guarded=normalizePublicFields([
    {path:'synthetic.cjs',sourceType:'commonjs',code:source}
  ],{preserveFreeMemberReceivers:true});
  assert.equal(guarded.properties,1,
    'A protected local field must still be independently neutralized');
  assert.equal(run(guarded.files[0].code),'[17,31]',
    'The unbound HOST API receiver cannot be relabeled');
  assert.ok(guarded.files[0].code.includes('HOST.'+field));
  const nested=source.replace('HOST.'+field,'HOST.api.'+field);
  const nestedGuarded=normalizePublicFields([
    {path:'nested.cjs',sourceType:'commonjs',code:nested}
  ],{preserveFreeMemberReceivers:true});
  assert.equal(nestedGuarded.properties,1);
  assert.equal(run(nestedGuarded.files[0].code),'[17,43]');
  assert.ok(nestedGuarded.files[0].code.includes('HOST.api.'+field));
});

test('free-root guard still normalizes same public label across relative ESM imports',()=>{
  const name='_p123456789abc';
  const guarded=normalizePublicFields([
    {path:'state.mjs',sourceType:'module',code:'export const state={'+name+':41};'},
    {path:'bridge.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";export const result=state.'+name+';'}
  ],{preserveFreeMemberReceivers:true});
  assert.equal(guarded.properties,1);
  assert.ok(guarded.files[0].code.includes('state={_publicField0:41}'));
  assert.ok(guarded.files[1].code.includes('state._publicField0'));
});
