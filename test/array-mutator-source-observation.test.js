'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function protectedSource() {
  let result='(input|0)';
  for(const step of [17,-8,213,-55,64,-2,34,-10]) {
    result='('+result+(step>=0?'+':'')+step+')';
  }
  return 'function protectedSum(input){return ('+result+'|0);}\n';
}

/** @param {string} code @returns {unknown} */
function execute(code) {
  /** @type {{exports:unknown}} */
  const module={exports:undefined};
  Function('module','exports',code)(module,module.exports);
  return module.exports;
}

/** @param {string} code @returns {ReturnType<typeof obfuscateFiles>} */
function protect(code) {
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode:'coo',seed:'array-mutator-function-source',strings:false,
    identifiers:false,properties:false,
    experimentalPolyvariantAffine:{'entry.cjs':['protectedSum']},
    experimentalPolyvariantCount:2
  });
}

for(const [name,body] of [
  ['push','const list=[];list.push(protectedSum);module.exports=list.join(",");'],
  ['unshift','const list=[];list.unshift(protectedSum);module.exports=list.join(",");'],
  ['splice','const list=[];list.splice(0,0,protectedSum);module.exports=list.join(",");'],
  ['fill','const list=[0];list.fill(protectedSum);module.exports=list.join(",");'],
  ['alias pushed before owner joins',
    'const list=[];const alias=list;alias.push(protectedSum);module.exports=list.join(",");'],
  ['spread of known function array',
    'const inner=[protectedSum];const list=[];list.push(...inner);module.exports=list.join(",");'],
  ['generic detached join after push',
    'const list=[];list.push(protectedSum);module.exports=Array.prototype.join.call(list,",");'],
  ['numeric assignment via alias',
    'const list=[];const alias=list;alias[0]=protectedSum;module.exports=list.join(",");']
]) {
  test('array mutator '+name+' exposes protected source through later stringification',()=>{
    const code=protectedSource()+body;
    assert.match(String(execute(code)),/function protectedSum\(input\)/);
    assert.throws(()=>protect(code),/(?:source observation|declined)/i,name);
  });
}

test('primitive-only Array mutators preserve eligibility of unrelated protected function',()=>{
  const code=protectedSource()+'const list=[];list.push(3);list.unshift(2);'+
    'list.splice(2,0,1);module.exports=[protectedSum(9),list.join(",")];';
  const emitted=protect(code);
  assert.equal(emitted.files[0].metrics.polyvariantFunctions,1);
  assert.deepEqual(execute(String(emitted.files[0].code)),execute(code));
});
