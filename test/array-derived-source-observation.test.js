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
function execute(code){
  /** @type {{exports:unknown}} */
  const module={exports:undefined};
  Function('module','exports',code)(module,module.exports);
  return module.exports;
}

/** @param {string} code @returns {ReturnType<typeof obfuscateFiles>} */
function obfuscate(code){
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode:'coo',seed:'derived-array-functions-source-observer',
    strings:false,identifiers:false,properties:false,
    experimentalPolyvariantAffine:{'entry.cjs':['protectedSum']},
    experimentalPolyvariantCount:2
  });
}
for(const [name,body] of [
  ['slice','const list=[protectedSum];const copy=list.slice();module.exports=copy.join(",");'],
  ['concat','const list=[protectedSum];const copy=list.concat([]);module.exports=copy.join(",");'],
  ['filter','const list=[protectedSum];const copy=list.filter(()=>true);module.exports=copy.join(",");'],
  ['map identity','const list=[protectedSum];const copy=list.map(value=>value);module.exports=copy.join(",");'],
  ['Array.from','const list=[protectedSum];const copy=Array.from(list);module.exports=copy.join(",");'],
  ['Array.of','const copy=Array.of(protectedSum);module.exports=copy.join(",");'],
  ['toReversed','const list=[protectedSum];const copy=list.toReversed();module.exports=copy.join(",");'],
  ['flat','const list=[[protectedSum]];const copy=list.flat();module.exports=copy.join(",");'],
  ['toSpliced','const list=[protectedSum];const copy=list.toSpliced(0,0);module.exports=copy.join(",");'],
  ['with','const list=[protectedSum];const copy=list.with(0,protectedSum);module.exports=copy.join(",");']
]) {
  test('derived function-bearing array '+name+' preserves observable source',()=>{
    const source=protectedSource()+body;
    assert.match(String(execute(source)),/function protectedSum\(input\)/);
    assert.throws(()=>obfuscate(source),/(?:source observation|declined)/i);
  });
}

test('derived primitive-only arrays preserve protected function transformation',()=>{
  const source=protectedSource()+
    'const list=[1,2,3];const copied=list.slice().concat([4]).filter(x=>x>1);'+
    'const wrapped=Array.from(copied);'+
    'module.exports=[protectedSum(8),wrapped.join(",")];';
  const emitted=obfuscate(source);
  assert.equal(emitted.files[0].metrics.polyvariantFunctions,1);
  assert.deepEqual(execute(String(emitted.files[0].code)),execute(source));
});

for(const [name,body] of [
  ['map returns function from numeric carrier',
    'const values=[0,1].map(()=>protectedSum);module.exports=values.join(",");'],
  ['map block returns function from numeric carrier',
    'const values=[0].map(()=>{return protectedSum;});module.exports=values.join(",");'],
  ['flatMap returns function array',
    'const values=[0].flatMap(()=>[protectedSum]);module.exports=values.join(",");'],
  ['Array.from maps numeric source to function',
    'const values=Array.from([0],()=>protectedSum);module.exports=values.join(",");']
]) {
  test('array mapping callback '+name+' leaks exact function source',()=>{
    const source=protectedSource()+body;
    assert.match(String(execute(source)),/function protectedSum\(input\)/);
    assert.throws(()=>obfuscate(source),/(?:source observation|declined)/i);
  });
}

test('primitive-only mapper callback retains unrelated protected function',()=>{
  const source=protectedSource()+
    'const values=Array.from([1,2,3],value=>value+1);'+
    'module.exports=[protectedSum(8),values.join(",")];';
  const emitted=obfuscate(source);
  assert.equal(emitted.files[0].metrics.polyvariantFunctions,1);
  assert.deepEqual(execute(String(emitted.files[0].code)),execute(source));
});
