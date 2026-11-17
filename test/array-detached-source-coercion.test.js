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

/** @param {string} observer @returns {string} */
function source(observer) {
  return protectedSource()+observer;
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
    mode:'coo',seed:'detached-native-array-source',
    strings:false,identifiers:false,properties:false,
    experimentalPolyvariantAffine:{'entry.cjs':['protectedSum']},
    experimentalPolyvariantCount:2
  });
}

for(const [name,prefix,invoke] of [
  ['direct Array.prototype.sort.call','',
    'Array.prototype.sort.call(list)'],
  ['aliased sort.call','const sorter=Array.prototype.sort;',
    'sorter.call(list)'],
  ['forwarded sort.apply','const sorter=Array.prototype["sort"];const copy=sorter;',
    'copy.apply(list,[])'],
  ['Reflect.apply sort','',
    'Reflect.apply(Array.prototype.sort,list,[])'],
  ['Reflect.apply alias','const sorter=Array.prototype.sort;const copy=sorter;',
    'Reflect.apply(copy,list,[])'],
  ['direct Array.prototype.toSorted.call','',
    'Array.prototype.toSorted.call(list)'],
  ['aliased toSorted.apply','const sortCopy=Array.prototype.toSorted;',
    'sortCopy.apply(list,[])']
]) {
  test('detached '+name+' observes exact function source during default comparison',()=>{
    const code=source('const list=[protectedSum,"function protectedSum(input){m"];'+
      prefix+'const sorted='+invoke+';'+
      'module.exports=sorted.map(x=>typeof x==="function"?"fn":"str").join(",");');
    assert.equal(execute(code),'str,fn',name);
    assert.throws(()=>obfuscate(code),/(?:source observation|declined)/i,name);
  });
}

test('detached native sort on primitive arrays retains transformed-function eligibility',()=>{
  const code=source(
    'const sorter=Array.prototype.sort;const digits=[3,1,2];'+
    'sorter.call(digits);module.exports=[protectedSum(9),digits.join(",")];'
  );
  const result=obfuscate(code);
  assert.equal(result.files[0].metrics.polyvariantFunctions,1);
  assert.deepEqual(execute(String(result.files[0].code)),execute(code));
});

test('detached native array join sources function when receiver contains it',()=>{
  const code=source('const joiner=Array.prototype.join;'+
    'module.exports=joiner.call([protectedSum],",");');
  assert.match(String(execute(code)),/function protectedSum\(input\)/);
  assert.throws(()=>obfuscate(code),/(?:source observation|declined)/i);
});

for(const [name,setup,expression] of [
  ['nested literal array','const list=[[protectedSum]];', 'list.join(",")'],
  ['deep nested literal array','const list=[[[protectedSum]]];', 'list.join(",")'],
  ['nested array alias','const inner=[protectedSum];const list=[inner];', 'list.join(",")'],
  ['direct generic indexed record','const list={0:protectedSum,length:1};', 'Array.prototype.join.call(list,",")'],
  ['aliased generic indexed record','const list={0:protectedSum,length:1};const indirect=list;const join=Array.prototype.join;', 'join.call(indirect,",")'],
  ['assigned generic indexed record','const list={length:1};list[0]=protectedSum;', 'Array.prototype.join.call(list,",")']
]) {
  test('array source coercion observes a function in '+name,()=>{
    const code=source(setup+'module.exports='+expression+';');
    assert.match(String(execute(code)),/function protectedSum\(input\)/,name);
    assert.throws(()=>obfuscate(code),/(?:source observation|declined)/i,name);
  });
}

test('generic array-like default sort observes a function-valued numeric field',()=>{
  const code=source('const list={0:protectedSum,1:"function protectedSum(input){m",length:2};'+
    'const sorter=Array.prototype.sort;sorter.call(list);'+
    'module.exports=[list[0],list[1]].map(x=>typeof x==="function"?"fn":"str").join(",");');
  assert.equal(execute(code),'str,fn');
  assert.throws(()=>obfuscate(code),/(?:source observation|declined)/i);
});

test('detached sort of a primitive-only generic array-like retains protected work',()=>{
  const code=source('const list={0:3,1:1,length:2};'+
    'Array.prototype.sort.call(list);module.exports=[protectedSum(9),list[0]];');
  const out=obfuscate(code);
  assert.equal(out.files[0].metrics.polyvariantFunctions,1);
  assert.deepEqual(execute(String(out.files[0].code)),execute(code));
});
