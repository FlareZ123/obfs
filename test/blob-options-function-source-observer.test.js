'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src/core');

/** @param {string} code @returns {string} */
function execute(code) {
  const module={exports:/** @type {unknown} */(null)};
  // Use the real Node realm for Blob and Reflect; a vm realm may omit Blob.
  new Function('module',code)(module);
  return /** @type {()=>string} */(module.exports)();
}

/** @param {string} declarations @param {string} expression @returns {string} */
function source(declarations,expression) {
  return "'use strict';"+
    'function protectedLabel(x){return ((x^173)&255);}'+declarations+
    'module.exports=function observe(){try{return '+expression+
    ';}catch(error){return error.message;}};';
}

const cases=[
  {name:'Blob options.type direct',declarations:'',
    expression:'new Blob([],{type:protectedLabel}).type'},
  {name:'Blob options.endings error',declarations:'',
    expression:'new Blob([],{endings:protectedLabel}).type'},
  {name:'Blob via globalThis',declarations:'',
    expression:'new globalThis.Blob([],{type:protectedLabel}).type'},
  {name:'Blob assigned alias',declarations:'const make=Blob;',
    expression:'new make([],{type:protectedLabel}).type'},
  {name:'Blob destructured from global',declarations:'const {Blob:make}=globalThis;',
    expression:'new make([],{type:protectedLabel}).type'},
  {name:'Blob alias chain',declarations:'const a=globalThis.Blob;const b=a;',
    expression:'new b([],{type:protectedLabel}).type'},
  {name:'Reflect.construct Blob',declarations:'',
    expression:'Reflect.construct(Blob,[[],{type:protectedLabel}]).type'},
  {name:'Reflect.construct aliased Blob',declarations:'const make=Blob;',
    expression:'Reflect.construct(make,[[],{type:protectedLabel}]).type'},
  {name:'detached Reflect.construct',declarations:'const construct=Reflect.construct;',
    expression:'construct(Blob,[[],{type:protectedLabel}]).type'},
  {name:'Reflect.construct.call',declarations:'',
    expression:'Reflect.construct.call(Reflect,Blob,[[],{type:protectedLabel}]).type'},
  {name:'Reflect.construct.apply',declarations:'',
    expression:'Reflect.construct.apply(Reflect,[Blob,[[],{type:protectedLabel}]]).type'},
  {name:'nested Reflect.apply',declarations:'',
    expression:'Reflect.apply(Reflect.construct,Reflect,[Blob,[[],{type:protectedLabel}]]).type'}
];

test('native Blob options reveal function source through type or endings',()=>{
  for(const item of cases) {
    const original=source(item.declarations,item.expression);
    const renamed=original.replaceAll('protectedLabel','changedLabel');
    const actual=execute(original);
    assert.notEqual(actual,execute(renamed),item.name);
    assert.match(actual,/protectedlabel/iu,item.name);
  }
});

test('Blob options source observer preserves COO/SNO native output',()=>{
  for(const item of cases) {
    const original=source(item.declarations,item.expression);
    assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
      item.name+' needs a source-spelling guard');
    const native=execute(original);
    for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
      const emitted=obfuscateFiles([{
        path:'blob.cjs',sourceType:'commonjs',code:original
      }],{mode,closedWorld:true,seed:'blob-options-'+item.name,
        properties:true,identifiers:true,strings:true});
      assert.equal(execute(String(emitted.files[0].code)),native,
        item.name+' '+mode+' must preserve native function source');
    }
  }
});

test('primitive Blob options preserve genuinely renamed private fields',()=>{
  const original='const owner={hiddenCount:41,secretDelta:2};'+
    'new Blob([],{type:"text/plain",endings:"transparent"});'+
    'module.exports=owner.hiddenCount+owner.secretDelta;';
  assert.equal(observesFunctionSource(parse(original,'commonjs')),false);
  /** @param {string} code @returns {number} */
  const numericValue=code=>{
    const module={exports:/** @type {unknown} */ (null)};
    new Function('module',code)(module);
    return /** @type {number} */ (module.exports);
  };
  for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
    const emitted=obfuscateFiles([{
      path:'blob-positive.cjs',sourceType:'commonjs',code:original
    }],{mode,seed:'blob-primitive-positive',closedWorld:true,
      properties:true,identifiers:false,strings:false});
    assert.equal(emitted.files[0].metrics.properties,2,mode);
    assert.doesNotMatch(String(emitted.files[0].code),/hiddenCount|secretDelta/u);
    assert.equal(numericValue(String(emitted.files[0].code)),numericValue(original));
  }
});

test('primitive Blob options do not justify rewriting exported callable source',()=>{
  const original='const owner={hiddenCount:41,secretDelta:2};'+
    'new Blob([],{type:"text/plain",endings:"transparent"});'+
    'module.exports=()=>owner.hiddenCount+owner.secretDelta;';
  assert.equal(observesFunctionSource(parse(original,'commonjs')),false);
  /** @param {string} code */
  const callableSource=code=>{
    const module={exports:/** @type {unknown} */ (null)};
    new Function('module',code)(module);
    return Function.prototype.toString.call(module.exports);
  };
  const originalSource=callableSource(original);
  for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
    const emitted=obfuscateFiles([{
      path:'blob-exported.cjs',sourceType:'commonjs',code:original
    }],{mode,seed:'blob-primitive-exported',closedWorld:true,
      properties:true,identifiers:false,strings:false});
    assert.equal(emitted.files[0].metrics.properties,0,mode);
    assert.equal(execute(String(emitted.files[0].code)),execute(original),mode);
    assert.equal(callableSource(String(emitted.files[0].code)),originalSource,mode);
  }
});
