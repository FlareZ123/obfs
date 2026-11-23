'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

/** @typedef {'direct'|'method'|'getter'|'returned'|'primitive'} Selection */
/** @typedef {{name:string,code:string,selection:Selection}} Fixture */

/** @type {Fixture[]} */
const variants=[
  {name:'named-declaration-direct',selection:'direct',
    code:'function reader(value){const local=value+7;return local;}module.exports=reader;'},
  {name:'function-expression-direct',selection:'direct',
    code:'module.exports=function reader(value){const local=value+7;return local;};'},
  {name:'arrow-direct',selection:'direct',
    code:'module.exports=(value)=>{const local=value+7;return local;};'},
  {name:'object-method',selection:'method',
    code:'module.exports={read(value){const local=value+7;return local;}};'},
  {name:'object-function-property',selection:'method',
    code:'module.exports={read:function(value){const local=value+7;return local;}};'},
  {name:'object-getter',selection:'getter',
    code:'module.exports={get read(){const local=17;return local;}};'},
  {name:'class-instance-method',selection:'method',
    code:'class Api{read(value){const local=value+7;return local;}}module.exports=new Api();'},
  {name:'class-instance-field-arrow',selection:'method',
    code:'class Api{read=(value)=>{const local=value+7;return local;};}module.exports=new Api();'},
  {name:'class-static-method',selection:'method',
    code:'class Api{static read(value){const local=value+7;return local;}}module.exports=Api;'},
  {name:'aliased-function-object',selection:'method',
    code:'const read=function(value){const local=value+7;return local;};'+
      'const publicApi={read};module.exports=publicApi;'},
  {name:'exports-assignment',selection:'method',
    code:'exports.read=function(value){const local=value+7;return local;};'},
  {name:'object-assign-publication',selection:'method',
    code:'const read=(value)=>{const local=value+7;return local;};'+
      'const api={};Object.assign(api,{read});module.exports=api;'},
  {name:'returned-nested-callable',selection:'returned',
    code:'module.exports=function factory(){return function inner(value){'+
      'const local=value+7;return local;};};'},
  {name:'private-direct-call-positive',selection:'primitive',
    code:'function privateReader(value){const local=value+7;return local;}'+
      'module.exports=privateReader(7);'}
];

/**
 * Observe the exported function source using an intrinsic from outside its
 * execution realm. The primitive control exports only a computed number.
 * @param {Fixture} fixture
 * @param {string} code
 * @returns {{source:string,value:number}}
 */
function observe(fixture,code){
  const exported={};
  /** @type {{module:{exports:unknown},exports:object}} */
  const context={module:{exports:exported},exports:exported};
  vm.runInNewContext(code,context,{timeout:2000});
  const pub=context.module.exports;
  if(fixture.selection==='primitive')return {source:'',value:/** @type {number} */(pub)};
  /** @type {unknown} */
  let fn;
  if(fixture.selection==='direct')fn=pub;
  else if(fixture.selection==='method')fn=/** @type {{read:unknown}} */(pub).read;
  else if(fixture.selection==='getter')
    fn=Object.getOwnPropertyDescriptor(/** @type {object} */(pub),'read')?.get;
  else fn=/** @type {()=>unknown} */(pub)();
  assert.equal(typeof fn,'function',fixture.name);
  const callable=/** @type {(value:number)=>number} */(fn);
  return {source:Function.prototype.toString.call(callable),
    value:callable.call(pub,7)};
}

test('externally observable CommonJS function forms remain source-compatible',()=>{
  /** @type {{name:string,mode:string,identifiers:boolean,
   * parity:boolean,valueParity:boolean,bindings:number,originalSource:string,emittedSource:string}[]} */
  const rows=[];
  for(const variant of variants){
    const expected=observe(variant,variant.code);
    for(const mode of /** @type {const} */(['coo','sno','sco']))
      for(const identifiers of [true,false]){
        const result=obfuscateFiles([{
          path:'entry.cjs',sourceType:'commonjs',code:variant.code
        }],{mode,identifiers,properties:false,strings:false,
          seed:'agent38-source-shapes/'+variant.name+'/'+mode}).files[0];
        const actual=observe(variant,String(result.code));
        rows.push({name:variant.name,mode,identifiers,
          parity:actual.source===expected.source&&actual.value===expected.value,
          valueParity:actual.value===expected.value,bindings:result.metrics.bindings,
          originalSource:expected.source,emittedSource:actual.source});
      }
  }
  console.log('CJS_PUBLIC_IDENTIFIER_SHAPES '+JSON.stringify(rows));
  assert.equal(rows.length,14*3*2);
  assert.ok(rows.every(row=>row.valueParity),'All published functions must return original values');
  assert.ok(rows.filter(row=>row.name==='private-direct-call-positive')
    .every(row=>row.parity),'Primitive-only private control must remain compatible');
  assert.ok(rows.filter(row=>row.name==='private-direct-call-positive'&&row.identifiers)
    .every(row=>row.bindings>0),'The private control must retain real binding-renaming yield');
  assert.deepEqual(rows.filter(row=>!row.parity).map(row=>[row.name,row.mode,row.identifiers]),[],
    'Public function source must remain text-identical for every supported export shape');
});
