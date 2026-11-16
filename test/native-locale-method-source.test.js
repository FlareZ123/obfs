'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const functionText='function inspect(){const state={secretField:71};return state.secretField;}';

/** @param {string} expression @returns {string} */
function fixture(expression) {
  return "'use strict';"+functionText+
    'const observed=(()=>{try{return '+expression+';}catch(error){return error.message;}})();'+
    'module.exports={observed,value:inspect()};';
}

/** @param {string} code @returns {string} */
function execute(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

for(const [name,expression] of [
  ['number currency option', "(1234).toLocaleString('en',{style:'currency',currency:inspect})"],
  ['number unit option', "(1234).toLocaleString('en',{style:'unit',unit:inspect})"],
  ['bigint currency option', "(1234n).toLocaleString('en',{style:'currency',currency:inspect})"],
  ['Date time zone option', "new Date(0).toLocaleString('en',{timeZone:inspect})"],
  ['Date calendar option', "new Date(0).toLocaleDateString('en',{calendar:inspect})"],
  ['Date timeStyle option', "new Date(0).toLocaleTimeString('en',{timeStyle:inspect})"],
  ['String localeCompare option', "'hello'.localeCompare('a','en',{sensitivity:inspect})"],
  ['Array toLocaleString function element', '[inspect].toLocaleString()'],
  ['Array alias toLocaleString function element', '(()=>{const items=[inspect];return items.toLocaleString();})()'],
  ['Number toLocaleString call', "Number.prototype.toLocaleString.call(1234,'en',{style:'unit',unit:inspect})"],
  ['Number toLocaleString captured call', "(()=>{const format=Number.prototype.toLocaleString;return format.call(1234,'en',{style:'currency',currency:inspect});})()"],
  ['Number toLocaleString Reflect.apply', "Reflect.apply(Number.prototype.toLocaleString,1234,['en',{style:'unit',unit:inspect}])"],
  ['Number toLocaleString bound', "Number.prototype.toLocaleString.bind(1234,'en',{style:'unit',unit:inspect})()"],
  ['Date toLocaleDateString call', "Date.prototype.toLocaleDateString.call(new Date(0),'en',{timeZone:inspect})"],
  ['String localeCompare call', "String.prototype.localeCompare.call('hello','a','en',{sensitivity:inspect})"],
  ['Array toLocaleString call', "Array.prototype.toLocaleString.call([inspect])"],
  ['number option record alias', "(()=>{const opts={style:'currency',currency:inspect};return (1234).toLocaleString('en',opts);})()"]
]) {
  test('native locale builtins preserve source: '+name,()=>{
    const original=fixture(expression);
    const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'locale-native/'+name,strings:true,identifiers:true
    }).files[0];
    assert.equal(execute(output.code),execute(original),output.code);
    assert.equal(output.metrics.objects,0,output.code);
    assert.equal(output.metrics.bindings,0,output.code);
    assert.equal(output.metrics.literals,0,output.code);
  });
}

test('primitive native locale calls retain independent safe key renaming',()=>{
  const original="'use strict';const state={secretField:71};"+
    "const money=(1234).toLocaleString('en',{style:'currency',currency:'USD'});"+
    "const text='hello'.localeCompare('a','en',{sensitivity:'base'});"+
    "const dated=new Date(0).toLocaleDateString('en',{timeZone:'UTC'});"+
    "module.exports=state.secretField+money.length+text+dated.length;";
  const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'locale-native-primitive',strings:false,identifiers:false
  }).files[0];
  assert.equal(execute(output.code),execute(original),output.code);
  assert.equal(output.metrics.objects,1,output.code);
});

test('extracted native locale formatter with primitive options preserves owner renaming',()=>{
  const original="'use strict';const state={secretField:71};"+
    "const format=Number.prototype.toLocaleString;"+
    "const value=format.call(1234,'en',{style:'currency',currency:'USD'});"+
    "module.exports=state.secretField+value.length;";
  const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'locale-native-indirect-primitive',strings:false,identifiers:false
  }).files[0];
  assert.equal(execute(output.code),execute(original),output.code);
  assert.equal(output.metrics.objects,1,output.code);
});

test('AST identifies native locale option records and array function formatting',()=>{
  assert.equal(observesFunctionSource(parse("function f(){};(2).toLocaleString('en',{unit:f});",'commonjs')),true);
  assert.equal(observesFunctionSource(parse("function f(){};[f].toLocaleString();",'commonjs')),true);
  assert.equal(observesFunctionSource(parse("function f(){};'x'.localeCompare('y','en',{sensitivity:f});",'commonjs')),true);
  assert.equal(observesFunctionSource(parse("(2).toLocaleString('en',{unit:'hour'});",'commonjs')),false);
  assert.equal(observesFunctionSource(parse("'x'.localeCompare('y','en',{sensitivity:'base'});",'commonjs')),false);
  assert.equal(observesFunctionSource(parse("function f(){};Number.prototype.toLocaleString.call(2,'en',{unit:f});",'commonjs')),true);
  assert.equal(observesFunctionSource(parse("function f(){};const format=Number.prototype.toLocaleString;format.call(2,'en',{unit:f});",'commonjs')),true);
  assert.equal(observesFunctionSource(parse("function f(){};Reflect.apply(Number.prototype.toLocaleString,2,['en',{unit:f}]);",'commonjs')),true);
});
