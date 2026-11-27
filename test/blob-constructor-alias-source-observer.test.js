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
  return "'use strict';"+
    'function protectedLabel(x){return ((x^173)&255);}'+declarations+
    'module.exports=function observe(){return '+expression+';};';
}

const cases=[
  {name:'Blob bound with no arguments',
    declarations:'const make=Blob.bind(null);',
    expression:'new make([],{type:protectedLabel}).type'},
  {name:'Blob bound first parts argument',
    declarations:'const make=Blob.bind(null,[]);',
    expression:'new make({type:protectedLabel}).type'},
  {name:'Blob bound options dictionary',
    declarations:'const make=Blob.bind(null,[],{type:protectedLabel});',
    expression:'new make().type'},
  {name:'Blob inline binding',
    declarations:'',
    expression:'new (Blob.bind(null))([],{type:protectedLabel}).type'},
  {name:'Blob bound Reflect.construct',
    declarations:'',
    expression:'Reflect.construct(Blob.bind(null),[[],{type:protectedLabel}]).type'},
  {name:'Blob constructor in object property',
    declarations:'const registry={Make:Blob};',
    expression:'new registry.Make([],{type:protectedLabel}).type'},
  {name:'Blob constructor object destructuring',
    declarations:'const registry={Make:Blob};const {Make:make}=registry;',
    expression:'new make([],{type:protectedLabel}).type'},
  {name:'Blob constructor object owner alias',
    declarations:'const registry={Make:Blob};const later=registry;',
    expression:'new later.Make([],{type:protectedLabel}).type'},
  {name:'Blob constructor post-declaration member assignment',
    declarations:'const registry={};registry.Make=Blob;',
    expression:'new registry.Make([],{type:protectedLabel}).type'},
  {name:'Blob constructor sequence expression alias',
    declarations:'const make=(0,Blob);',
    expression:'new make([],{type:protectedLabel}).type'},
  {name:'bound Blob constructor in object property',
    declarations:'const registry={Make:Blob.bind(null)};',
    expression:'new registry.Make([],{type:protectedLabel}).type'},
  {name:'bound Blob constructor object destructuring',
    declarations:'const registry={Make:Blob.bind(null)};const {Make:make}=registry;',
    expression:'new make([],{type:protectedLabel}).type'},
  {name:'bound Blob constructor object owner alias',
    declarations:'const registry={Make:Blob.bind(null)};const later=registry;',
    expression:'new later.Make([],{type:protectedLabel}).type'},
  {name:'bound Blob constructor post-declaration member assignment',
    declarations:'const registry={};registry.Make=Blob.bind(null);',
    expression:'new registry.Make([],{type:protectedLabel}).type'},
  {name:'bound Blob constructor through independent identifier',
    declarations:'const make=Blob.bind(null);const registry={Make:make};',
    expression:'new registry.Make([],{type:protectedLabel}).type'}
];

test('bound and owned Blob constructors natively expose the same function source',()=>{
  for(const item of cases) {
    const original=source(item.declarations,item.expression);
    const native=execute(original);
    assert.match(native,/protectedlabel/iu,item.name);
    assert.notEqual(native,execute(original.replaceAll('protectedLabel','changedLabel')),
      item.name+' native name-sensitive witness');
  }
});

test('bound and owned Blob constructors must preserve COO/SNO source spelling',()=>{
  for(const item of cases) {
    const original=source(item.declarations,item.expression);
    assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
      item.name+' must be recognized as source observer');
    const expected=execute(original);
    for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
      const compiled=obfuscateFiles([{
        path:'owned-blob.cjs',sourceType:'commonjs',code:original
      }],{mode,closedWorld:true,seed:'owned-blob-'+item.name,
        identifiers:true,strings:true,properties:true});
      assert.equal(execute(String(compiled.files[0].code)),expected,
        mode+' '+item.name+' native parity');
    }
  }
});

test('bound Blob constructor with primitive input retains private property rename',()=>{
  const original='const owner={hiddenCount:41,secretDelta:2};'+
    'const make=Blob.bind(null);new make([],{type:"text/plain"});'+
    'module.exports=owner.hiddenCount+owner.secretDelta;';
  assert.equal(observesFunctionSource(parse(original,'commonjs')),false);
  /** @param {string} code @returns {number} */
  const numericValue=code=>{
    const module={exports:/** @type {unknown} */ (null)};
    new Function('module',code)(module);
    return /** @type {number} */ (module.exports);
  };
  for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
    const compiled=obfuscateFiles([{
      path:'owned-blob-positive.cjs',sourceType:'commonjs',code:original
    }],{mode,seed:'owned-blob-primitive',closedWorld:true,
      properties:true,identifiers:false,strings:false});
    assert.equal(compiled.files[0].metrics.properties,2,mode);
    assert.equal(numericValue(String(compiled.files[0].code)),numericValue(original));
  }
});

test('bound Blob constructor retains exported callable source without rewriting its private fields',()=>{
  const original='const owner={hiddenCount:41,secretDelta:2};'+
    'const make=Blob.bind(null);new make([],{type:"text/plain"});'+
    'module.exports=()=>owner.hiddenCount+owner.secretDelta;';
  assert.equal(observesFunctionSource(parse(original,'commonjs')),false,
    'whole-source observer scanner alone does not prove callable privacy');
  const originalSource=executeFunctionSource(original);
  for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
    const compiled=obfuscateFiles([{
      path:'owned-blob-exported.cjs',sourceType:'commonjs',code:original
    }],{mode,seed:'owned-blob-exported',closedWorld:true,
      properties:true,identifiers:false,strings:false});
    assert.equal(compiled.files[0].metrics.properties,0,mode);
    assert.equal(execute(String(compiled.files[0].code)),execute(original),mode);
    assert.equal(executeFunctionSource(String(compiled.files[0].code)),originalSource,mode);
  }
});

/** @param {string} code @returns {string} */
function executeFunctionSource(code) {
  const module={exports:/** @type {unknown} */ (null)};
  new Function('module',code)(module);
  return Function.prototype.toString.call(module.exports);
}
