'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');

const privateBody='function privateRead(){const privateOwner={secretField:17};return privateOwner.secretField;}';
const inspectBody='function inspect(){return 17;}';
const reference="const reference='function inspect(){return 17;}';";

/**
 * @param {string} code
 * @returns {string|undefined}
 */
function execute(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1500});
  return JSON.stringify(context.module.exports,(_name,value)=>
    typeof value==='function'?Function.prototype.toString.call(value):value);
}

/** @type {{name:string,withInspect:boolean,predicate:string,exportCode?:string}[]} */
const variants=[
  {name:'minimal-private',withInspect:false,predicate:'false'},
  {name:'unreferenced-inspect',withInspect:true,predicate:'false'},
  {name:'typeof-inspect',withInspect:true,predicate:"typeof inspect==='function'"},
  {name:'strict-equality',withInspect:true,predicate:'inspect===reference'},
  {name:'strict-inequality',withInspect:true,predicate:'inspect!==reference'},
  {name:'loose-equality',withInspect:true,predicate:'inspect==reference'},
  {name:'source-string',withInspect:true,predicate:'String(inspect)===reference'},
  {name:'export-private-reader',withInspect:true,predicate:'inspect===reference',
    exportCode:'module.exports={observed,privateRead,value:privateRead()};'}
];

test('source-observer positive-yield diagnostic matrix preserves native results',()=>{
  const rows=[];
  for(const variant of variants) {
    const source="'use strict';"+
      (variant.withInspect?inspectBody+reference:'')+
      privateBody+'const observed='+variant.predicate+';'+
      (variant.exportCode??'module.exports={observed,value:privateRead()};');
    const ast=parse(source,'commonjs');
    const flags={functionSource:observesFunctionSource(ast),
      distributedSource:observesDistributedSource(ast)};
    for(const identifiers of [true,false]) {
      const options={mode:'sno',seed:'agent38-yield-matrix/'+variant.name,strings:false,
        identifiers};
      const out=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],
        options).files[0];
      assert.equal(execute(String(out.code)),execute(source),variant.name);
      rows.push({variant:variant.name,identifiers,flags,
        objects:out.metrics.objects,properties:out.metrics.properties,
        bindings:out.metrics.bindings});
    }
  }
  assert.equal(rows.length,16);
  console.log('PRIVATE_YIELD_OBSERVER_MATRIX '+JSON.stringify(rows));
});
