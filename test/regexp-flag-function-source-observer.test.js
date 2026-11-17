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

/** @param {string} declarations @param {string} invocation @returns {string} */
function source(declarations,invocation) {
  return "'use strict';\n"+
    'function protectedLabel(x){return ((x^137)&255);}\n'+
    declarations+'\n'+
    'module.exports=function observe(){try{'+invocation+
    ';return "unexpected-success";}catch(error){return error.message;}};';
}

const cases=[
  {name:'RegExp function flags direct call',declarations:'',
    invocation:'RegExp("abc",protectedLabel)'},
  {name:'RegExp function flags native new',declarations:'',
    invocation:'new RegExp("abc",protectedLabel)'},
  {name:'RegExp function flags global member',declarations:'',
    invocation:'new globalThis.RegExp("abc",protectedLabel)'},
  {name:'RegExp function flags constructor alias',
    declarations:'const regex=RegExp;',
    invocation:'regex("abc",protectedLabel)'},
  {name:'RegExp function flags via call',declarations:'',
    invocation:'RegExp.call(null,"abc",protectedLabel)'},
  {name:'RegExp function flags via apply',declarations:'',
    invocation:'RegExp.apply(null,["abc",protectedLabel])'},
  {name:'RegExp function flags via Reflect.apply',declarations:'',
    invocation:'Reflect.apply(RegExp,null,["abc",protectedLabel])'},
  {name:'RegExp function flags via detached Reflect.apply',
    declarations:'const invoke=Reflect.apply;',
    invocation:'invoke(RegExp,null,["abc",protectedLabel])'},
  {name:'RegExp function flags via Reflect.construct',declarations:'',
    invocation:'Reflect.construct(RegExp,["abc",protectedLabel])'},
  {name:'RegExp function flags via detached Reflect.construct',
    declarations:'const make=Reflect.construct;',
    invocation:'make(RegExp,["abc",protectedLabel])'},
  {name:'RegExp function flags via Reflect.construct.call',
    declarations:'',
    invocation:'Reflect.construct.call(Reflect,RegExp,["abc",protectedLabel])'},
  {name:'RegExp function flags via Reflect.construct.apply',
    declarations:'',
    invocation:'Reflect.construct.apply(Reflect,[RegExp,["abc",protectedLabel]])'},
  {name:'RegExp function flags via nested Reflect.apply construct',
    declarations:'',
    invocation:'Reflect.apply(Reflect.construct,Reflect,[RegExp,["abc",protectedLabel]])'},
  {name:'RegExp function flags via bound Reflect.construct',
    declarations:'const make=Reflect.construct.bind(Reflect);',
    invocation:'make(RegExp,["abc",protectedLabel])'}
];

test('native RegExp flags errors stringify a function verbatim',()=>{
  const original=source('','RegExp("abc",protectedLabel)');
  const changed=original.replaceAll('protectedLabel','differentLabel');
  assert.match(execute(original),/protectedLabel/u);
  assert.notEqual(execute(original),execute(changed));
});

test('RegExp flags observers are recognized and preserve COO/SNO error parity',()=>{
  for(const item of cases) {
    const original=source(item.declarations,item.invocation);
    assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
      item.name+' must be a source observer');
    const baseline=execute(original);
    assert.match(baseline,/protectedLabel/u,item.name);
    for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
      const transformed=obfuscateFiles([{
        path:'main.cjs',sourceType:'commonjs',code:original
      }],{mode,seed:'regexp-flags-'+item.name,closedWorld:true,
        strings:true,properties:true,identifiers:true});
      assert.equal(execute(String(transformed.files[0].code)),baseline,
        item.name+' '+mode+' must preserve native error text');
    }
  }
});

test('primitive RegExp flags remain eligible for native obfuscation',()=>{
  const original="'use strict';function active(x){return (x^37);};"+
    'RegExp("abc","i");Reflect.apply(RegExp,null,["abc","i"]);'+
    'Reflect.construct(RegExp,["abc","i"]);module.exports=active;';
  assert.equal(observesFunctionSource(parse(original,'commonjs')),false);
  const emitted=obfuscateFiles([{
    path:'main.cjs',sourceType:'commonjs',code:original
  }],{mode:'sno',seed:'regexp-flags-primitive',closedWorld:true,
    strings:false,properties:false,identifiers:true});
  assert.notEqual(String(emitted.files[0].code),original);
});
