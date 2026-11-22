'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src/core');

/** @param {string} code @returns {string} */
function execute(code) {
  const module={exports:/** @type {unknown} */(null)};
  new Function('module',code)(module);
  return /** @type {()=>string} */(module.exports)();
}

/** @param {string} declarations @param {string} expression @returns {string} */
function source(declarations,expression) {
  return "'use strict';function protectedLabel(x){return ((x^173)&255);}"+
    declarations+'module.exports=function observe(){try{return '+expression+
    ';}catch(error){return error.message;}};';
}

const cases=[
  {name:'RegExp bound pattern',
    declarations:'',
    expression:'new (RegExp.bind(null))(protectedLabel).source'},
  {name:'RegExp bound flags',
    declarations:'',
    expression:'new (RegExp.bind(null))("abc",protectedLabel).source'},
  {name:'RegExp prebound pattern',
    declarations:'',
    expression:'new (RegExp.bind(null,"abc"))(protectedLabel).source'},
  {name:'RegExp prebound flags',
    declarations:'',
    expression:'new (RegExp.bind(null,"abc",protectedLabel))().source'},
  {name:'RegExp bound Reflect.construct',
    declarations:'',
    expression:'Reflect.construct(RegExp.bind(null),["abc",protectedLabel]).source'},
  {name:'RegExp bound identifier invoked as function',
    declarations:'const make=RegExp.bind(null);',
    expression:'make("abc",protectedLabel).source'},
  {name:'RegExp bound constructor in owned record',
    declarations:'const make=RegExp.bind(null);const registry={Make:make};',
    expression:'new registry.Make("abc",protectedLabel).source'},
  {name:'RegExp bound constructor destructured from owned record',
    declarations:'const make=RegExp.bind(null);const registry={Make:make};'+
      'const {Make:later}=registry;',
    expression:'new later("abc",protectedLabel).source'},
  {name:'String bound new constructor',
    declarations:'',
    expression:'new (String.bind(null))(protectedLabel).toString()'},
  {name:'String bound identifier invoked as function',
    declarations:'const make=String.bind(null);',
    expression:'make(protectedLabel)'},
  {name:'String bound Reflect.construct',
    declarations:'',
    expression:'Reflect.construct(String.bind(null),[protectedLabel]).toString()'},
  {name:'String prebound protected argument',
    declarations:'const make=String.bind(null,protectedLabel);',
    expression:'make()'}
];

test('native bound String and RegExp constructors observe function source',()=>{
  for(const item of cases) {
    const original=source(item.declarations,item.expression);
    const native=execute(original);
    assert.match(native,/protectedLabel/u,item.name);
    assert.notEqual(native,execute(original.replaceAll('protectedLabel','changedLabel')),
      item.name+' native source sensitivity');
  }
});

test('bound native source coercion preserves COO and SNO semantics',()=>{
  for(const item of cases) {
    const original=source(item.declarations,item.expression);
    assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
      item.name+' must be a source observer');
    const native=execute(original);
    for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
      const compiled=obfuscateFiles([{
        path:'bound-native.cjs',sourceType:'commonjs',code:original
      }],{mode,closedWorld:true,seed:'bound-native-'+item.name,
        properties:true,identifiers:true,strings:true});
      assert.equal(execute(String(compiled.files[0].code)),native,
        mode+' '+item.name+' must preserve function source spelling');
    }
  }
});

test('bound native constructors with primitive arguments retain private-key renaming',()=>{
  const original='const owner={hiddenCount:41,secretDelta:2};'+
    'const makeRe=RegExp.bind(null,"abc","i");'+
    'const makeText=String.bind(null,"safe");makeRe();makeText();'+
    'function privateCompute(){return owner.hiddenCount+owner.secretDelta;}'+
    'module.exports=()=>privateCompute();';
  assert.equal(observesFunctionSource(parse(original,'commonjs')),false);
  for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
    const output=obfuscateFiles([{
      path:'bound-native-positive.cjs',sourceType:'commonjs',code:original
    }],{mode,closedWorld:true,seed:'bound-native-primitive',
      properties:true,identifiers:false,strings:false});
    assert.equal(output.files[0].metrics.properties,2,mode);
    assert.equal(execute(String(output.files[0].code)),execute(original));
  }
});
