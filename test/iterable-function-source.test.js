'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function protectedSource() {
  let expression='(input|0)';
  for(const step of [17,-8,213,-55,64,-2,34,-10])
    expression='('+expression+(step>=0?'+':'')+step+')';
  return 'function protectedSum(input){return ('+expression+'|0);}\n';
}

/** @param {string} code @returns {unknown} */
function execute(code) {
  /** @type {{exports:unknown}} */
  const module={exports:undefined};
  Function('module','exports',code)(module,module.exports);
  return module.exports;
}

/** @param {string} code @returns {ReturnType<typeof obfuscateFiles>} */
function obfuscate(code) {
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode:'coo',seed:'iterable-function-source',
    strings:false,identifiers:false,properties:false,
    experimentalPolyvariantAffine:{'entry.cjs':['protectedSum']},
    experimentalPolyvariantCount:2
  });
}

for(const [name,body] of [
  ['literal Set through Array.from',
    'module.exports=Array.from(new Set([protectedSum])).join(",");'],
  ['Set through spread',
    'const bag=new Set([protectedSum]);module.exports=[...bag].join(",");'],
  ['Set after add',
    'const bag=new Set();bag.add(protectedSum);module.exports=Array.from(bag).join(",");'],
  ['Map values iterator through Array.from',
    'const map=new Map([[1,protectedSum]]);module.exports=Array.from(map.values()).join(",");'],
  ['Map values iterator through spread',
    'const map=new Map([[1,protectedSum]]);module.exports=[...map.values()].join(",");']
]) {
  test(name+' retains exact function source across iterable carriers',()=>{
    const source=protectedSource()+body;
    assert.match(String(execute(source)),/function protectedSum\(input\)/);
    assert.throws(()=>obfuscate(source),/(?:source observation|declined)/i,name);
  });
}


for(const [name,body] of [
  ['Set inserted from for-of binding',
    'const bag=new Set();for(const fn of [protectedSum])bag.add(fn);'+
      'module.exports=Array.from(bag).join(",");'],
  ['Set inserted from forEach callback',
    'const bag=new Set();[protectedSum].forEach(fn=>bag.add(fn));'+
      'module.exports=Array.from(bag).join(",");'],
  ['Map value inserted from for-of binding',
    'const map=new Map();for(const fn of [protectedSum])map.set(0,fn);'+
      'module.exports=Array.from(map.values()).join(",");']
]) {
  test(name+' retains function-source semantics',()=>{
    const source=protectedSource()+body;
    assert.ok(String(execute(source)).includes('function protectedSum(input)'),name);
    assert.throws(()=>obfuscate(source),/(?:source observation|declined)/i,name);
  });
}


// Map#forEach supplies the key as callback argument two. Set#forEach
// supplies its value twice; either position may transport function source.
for(const [name,body] of [
  ['Map forEach function key',
    'const map=new Map([[protectedSum,1]]);const list=[];'+
      'map.forEach((value,key)=>list.push(key));module.exports=list.join(",");'],
  ['Set forEach second argument',
    'const set=new Set([protectedSum]);const list=[];'+
      'set.forEach((value,second)=>list.push(second));module.exports=list.join(",");']
]) {
  test(name+' must preserve observed protected source',()=>{
    const source=protectedSource()+body;
    assert.ok(String(execute(source)).includes('function protectedSum(input)'),name);
    assert.throws(()=>obfuscate(source),/(?:source observation|declined)/i,name);
  });
}


for(const [name,body] of [
  ['Set forEach collection argument',
    'const set=new Set([protectedSum]);let output="";'+
      'set.forEach((v,k,owner)=>{output=Array.from(owner).join(",");});'+
      'module.exports=output;'],
  ['Map forEach collection argument',
    'const map=new Map([[0,protectedSum]]);let output="";'+
      'map.forEach((v,k,owner)=>{output=Array.from(owner.values()).join(",");});'+
      'module.exports=output;']
]) {
  test(name+' preserves exact protected function source',()=>{
    const source=protectedSource()+body;
    assert.ok(String(execute(source)).includes('function protectedSum(input)'),name);
    assert.throws(()=>obfuscate(source),/(?:source observation|declined)/i,name);
  });
}

test('primitive-only iterable copies allow unrelated protected work',()=>{
  const source=protectedSource()+
    'const bag=new Set([3,1,3]);const map=new Map([[1,7]]);'+
    'const copied=[...bag,...map.values()];'+
    'module.exports=[protectedSum(8),copied.join(",")];';
  const result=obfuscate(source);
  assert.equal(result.files[0].metrics.polyvariantFunctions,1);
  assert.deepEqual(execute(String(result.files[0].code)),execute(source));
});
