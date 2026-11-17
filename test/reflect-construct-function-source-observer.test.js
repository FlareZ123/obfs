'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src/core');

/** @param {string} code @returns {string} */
function execute(code) {
  const module={exports:/** @type {unknown} */(null)};
  vm.runInNewContext(code,{module},{timeout:3000});
  return /** @type {()=>string} */(module.exports)();
}

/** @param {string} declarations @param {string} expression @returns {string} */
function source(declarations,expression) {
  return "'use strict';\n"+
    'function protectedLabel(x){return ((x^137)&255);}\n'+
    declarations+'\n'+
    'module.exports=function observe(){return '+expression+';};';
}

const cases=[
  {name:'RegExp direct',declarations:'',
    expression:'Reflect.construct(RegExp,[protectedLabel]).source'},
  {name:'Error direct',declarations:'',
    expression:'Reflect.construct(Error,[protectedLabel]).message'},
  {name:'String direct',declarations:'',
    expression:'Reflect.construct(String,[protectedLabel]).valueOf()'},
  {name:'Reflect namespace alias',declarations:'const make=Reflect;',
    expression:'make.construct(RegExp,[protectedLabel]).source'},
  {name:'Reflect alias chain',declarations:'const a=Reflect;const b=a;',
    expression:'b.construct(RegExp,[protectedLabel]).source'},
  {name:'Reflect.construct direct alias',declarations:'const make=Reflect.construct;',
    expression:'make(RegExp,[protectedLabel]).source'},
  {name:'Reflect.construct alias chain',
    declarations:'const make=Reflect.construct;const construct=make;',
    expression:'construct(Error,[protectedLabel]).message'},
  {name:'Reflect.construct destructured',
    declarations:'const {construct:make}=Reflect;',
    expression:'make(RegExp,[protectedLabel]).source'},
  {name:'global Reflect.construct',
    declarations:'const make=globalThis.Reflect.construct;',
    expression:'make(RegExp,[protectedLabel]).source'},
  {name:'unknown computed Reflect method',
    declarations:'const method=String.fromCharCode(99,111,110,115,116,114,117,99,116);',
    expression:'Reflect[method](RegExp,[protectedLabel]).source'},
  {name:'indirect constructor argument list',
    declarations:'const args=[protectedLabel];',
    expression:'Reflect.construct(RegExp,args).source'},
  {name:'Reflect.construct via call',declarations:'',
    expression:'Reflect.construct.call(Reflect,RegExp,[protectedLabel]).source'},
  {name:'Reflect.construct via apply',declarations:'',
    expression:'Reflect.construct.apply(Reflect,[RegExp,[protectedLabel]]).source'},
  {name:'Reflect.apply invoking construct',declarations:'',
    expression:'Reflect.apply(Reflect.construct,Reflect,[RegExp,[protectedLabel]]).source'},
  {name:'Reflect.construct bound method',
    declarations:'const make=Reflect.construct.bind(Reflect);',
    expression:'make(RegExp,[protectedLabel]).source'},
  {name:'Reflect.construct alias via call',
    declarations:'const make=Reflect.construct;',
    expression:'make.call(Reflect,RegExp,[protectedLabel]).source'},
  {name:'Reflect.construct alias via apply',
    declarations:'const make=Reflect.construct;',
    expression:'make.apply(Reflect,[RegExp,[protectedLabel]]).source'},
  {name:'Reflect.apply alias invoking construct',
    declarations:'const invoke=Reflect.apply;',
    expression:'invoke(Reflect.construct,Reflect,[RegExp,[protectedLabel]]).source'}
];

test('native Reflect.construct can expose original Function source',()=>{
  const original=source('','Reflect.construct(RegExp,[protectedLabel]).source');
  const changed=original.replaceAll('protectedLabel','differentLabel');
  assert.match(execute(original),/protectedLabel/u);
  assert.notEqual(execute(original),execute(changed));
  assert.match(execute(source('','Reflect.construct(Error,[protectedLabel]).message')),
    /protectedLabel/u);
});

test('Reflect.construct source-observer analysis and COO/SNO parity',()=>{
  for(const item of cases) {
    const original=source(item.declarations,item.expression);
    assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
      item.name+' must preserve original source spelling');
    const expected=execute(original);
    for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
      const transformed=obfuscateFiles([{
        path:'main.cjs',sourceType:'commonjs',code:original
      }],{mode,seed:'reflect-construct-'+item.name,closedWorld:true,
        strings:true,properties:true,identifiers:true});
      assert.equal(execute(String(transformed.files[0].code)),expected,
        item.name+' '+mode+' must preserve native source bytes');
    }
  }
});

test('proven primitive Reflect.construct arguments retain obfuscation',()=>{
  const original="'use strict';function active(x){return (x^37);};"+
    'Reflect.construct(RegExp,["^abc$"]);module.exports=active;';
  assert.equal(observesFunctionSource(parse(original,'commonjs')),false);
  const emitted=obfuscateFiles([{
    path:'main.cjs',sourceType:'commonjs',code:original
  }],{mode:'sno',seed:'reflect-construct-positive',closedWorld:true,
    strings:false,properties:false,identifiers:true});
  assert.notEqual(String(emitted.files[0].code),original);
});
