'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src/core');

/** @param {string} code @returns {string} */
function execute(code) {
  const context={exports:/** @type {unknown} */(null)};
  // Native Web IDL constructors must come from Node's real realm; a bare vm
  // context intentionally lacks global URL, DOMException and Headers.
  new Function('module',code)(context);
  return /** @type {()=>string} */(context.exports)();
}

/** @param {string} declarations @param {string} expression @returns {string} */
function source(declarations,expression) {
  return "'use strict';"+
    'function protectedLabel(x){return ((x^173)&255);};'+declarations+
    'module.exports=function observe(){try{return '+expression+
    ';}catch(error){return error.message;}};';
}

const cases=[
  {name:'URL original path',declarations:'',
    expression:'Reflect.construct(URL,[protectedLabel,"https://example.com"]).href'},
  {name:'DOMException message',declarations:'',
    expression:'Reflect.construct(DOMException,[protectedLabel]).message'},
  {name:'Headers nested value',declarations:'',
    expression:'Reflect.construct(Headers,[[["X-Name",protectedLabel]]]).get("X-Name")'},
  {name:'Request invalid URL diagnostic',declarations:'',
    expression:'Reflect.construct(Request,[protectedLabel]).url'},
  {name:'Event type',declarations:'',
    expression:'Reflect.construct(Event,[protectedLabel]).type'},
  {name:'URL constructor alias',declarations:'const URLAlias=URL;',
    expression:'Reflect.construct(URLAlias,[protectedLabel,"https://example.com"]).href'},
  {name:'DOMException via detached constructor',declarations:'const make=Reflect.construct;',
    expression:'make(DOMException,[protectedLabel]).message'},
  {name:'DOMException via Reflect.construct.call',declarations:'',
    expression:'Reflect.construct.call(Reflect,DOMException,[protectedLabel]).message'},
  {name:'DOMException via Reflect.construct.apply',declarations:'',
    expression:'Reflect.construct.apply(Reflect,[DOMException,[protectedLabel]]).message'},
  {name:'DOMException via nested Reflect.apply',declarations:'',
    expression:'Reflect.apply(Reflect.construct,Reflect,[DOMException,[protectedLabel]]).message'}
];

test('native Web IDL reflective construction may reveal function spellings',()=>{
  for(const item of cases) {
    const raw=source(item.declarations,item.expression);
    assert.match(execute(raw),/protectedLabel/u,item.name);
    assert.equal(observesFunctionSource(parse(raw,'commonjs')),true,item.name);
    const expected=execute(raw);
    for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
      const emitted=obfuscateFiles([{path:'main.cjs',sourceType:'commonjs',code:raw}],{
        mode,closedWorld:true,seed:'web-reflect-'+item.name,
        identifiers:true,properties:true,strings:true
      });
      assert.equal(execute(String(emitted.files[0].code)),expected,
        item.name+' '+mode+' source spelling parity');
    }
  }
});

test('proved primitive Web IDL Reflect.construct does not disable obfuscation',()=>{
  const raw="'use strict';function privateLogic(x){return x^37;}"+
    'Reflect.construct(URL,["/safe","https://example.com"]);module.exports=privateLogic;';
  assert.equal(observesFunctionSource(parse(raw,'commonjs')),false);
  const emitted=obfuscateFiles([{path:'main.cjs',sourceType:'commonjs',code:raw}],{
    mode:'sno',closedWorld:true,seed:'web-reflect-primitive',
    identifiers:true,properties:false,strings:false
  });
  assert.notEqual(String(emitted.files[0].code),raw);
});
