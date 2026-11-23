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
    for(const mode of /** @type {const} */(['coo','sno','sco']))for(const identifiers of [true,false]) {
      const options={mode,seed:'agent38-yield-matrix/'+variant.name,strings:false,
        identifiers};
      const out=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],
        options).files[0];
      const actual=execute(String(out.code));
      const expected=execute(source);
      rows.push({variant:variant.name,mode,identifiers,flags,
        parity:actual===expected,expected,actual,
        objects:out.metrics.objects,properties:out.metrics.properties,
        bindings:out.metrics.bindings});
    }
  }
  assert.equal(rows.length,48);
  console.log('PRIVATE_YIELD_OBSERVER_MATRIX '+JSON.stringify(rows));
  assert.deepEqual(rows.filter(row=>!row.parity).map(row=>row.mode+':'+row.variant+':'+row.identifiers),[],
    'Native Function#toString must match for all externally observable exports');
});

/**
 * @param {string} code
 * @returns {Promise<{source:string,value:number,primitive:number}>}
 */
async function externalModuleObservation(code) {
  const url='data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64');
  const namespace=await import(url);
  return {
    source:Function.prototype.toString.call(namespace.published),
    value:namespace.published(7),
    primitive:namespace.primitive
  };
}

test('an unknown ESM importer observes public function source after identifier lowering',async()=>{
  const original=[
    'const privateValue={secretField:17};',
    'export function published(value){const secretLocal=value+privateValue.secretField;return secretLocal;}',
    'export const primitive=published(3);'
  ].join('\n');
  const expected=await externalModuleObservation(original);
  const rows=[];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    for(const identifiers of [true,false]) {
      const out=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:original}],{
        mode,seed:'agent38-public-esm/'+mode,strings:false,identifiers
      }).files[0];
      const actual=await externalModuleObservation(String(out.code));
      rows.push({mode,identifiers,parity:JSON.stringify(actual)===JSON.stringify(expected),
        valuesEqual:actual.value===expected.value&&actual.primitive===expected.primitive,
        originalSource:expected.source,emittedSource:actual.source,
        objects:out.metrics.objects,properties:out.metrics.properties,
        bindings:out.metrics.bindings});
    }
  }
  console.log('PUBLIC_ESM_IDENTIFIER_SOURCE_MATRIX '+JSON.stringify(rows));
  assert.ok(rows.every(row=>row.valuesEqual));
  assert.deepEqual(rows.filter(row=>!row.parity).map(row=>row.mode+':'+row.identifiers),[],
    'External ESM callers can observe original Function#toString of named exports');
});
