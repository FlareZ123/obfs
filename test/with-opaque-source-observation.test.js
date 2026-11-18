'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Simulate a host-owned with environment whose property getter observes
 * a function's own source, without any source-visible call to toString.
 *
 * @param {string} code
 * @param {'commonjs'|'script'} sourceType
 * @returns {string}
 */
function execute(code,sourceType) {
  const context=vm.createContext({module:{exports:null}});
  context.opaqueScope=new Proxy(Object.create(null),{
    has(_target,key) {
      return typeof key==='string' &&
        !['globalThis','module'].includes(key);
    },
    get(_target,key) {
      if(key===Symbol.unscopables)return undefined;
      if(key==='inspected')return String(vm.runInContext('observed.toString()',context));
      return undefined;
    }
  });
  vm.runInContext(code,context,{timeout:2500});
  return JSON.stringify(sourceType==='script'?context.result:context.module.exports);
}

/** @type {{kind:string,definition:string,sourceMarker:string}[]} */
const fixtures=[
  {
    kind:'function declaration',
    definition:"function observed(){return 'function-source-payload';}",
    sourceMarker:'function-source-payload'
  },
  {
    kind:'arrow expression',
    definition:"const observed=()=> 'arrow-source-payload';",
    sourceMarker:'arrow-source-payload'
  },
  {
    kind:'object method',
    definition:"const observed=({method(){return 'method-source-payload';}}).method;",
    sourceMarker:'method-source-payload'
  },
  {
    kind:'class static field',
    definition:"const observed=class Record {static payload='class-source-payload';};",
    sourceMarker:'class-source-payload'
  }
];

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  for(const sourceType of /** @type {const} */ (['commonjs','script'])) {
    for(const fixture of fixtures) {
      test(mode+' '+sourceType+' opaque with getter preserves '+fixture.kind+' source',()=>{
      const source=fixture.definition+
        "globalThis.outside='top-level-encoded-payload';"+
        "with(globalThis.opaqueScope){globalThis.captured=inspected;}"+
        (sourceType==='script'?'globalThis.result':'module.exports')+
        '={captured:globalThis.captured,outside:globalThis.outside};';
      const output=obfuscateFiles([{
        path:sourceType==='script'?'opaque.js':'opaque.cjs',sourceType,code:source
      }],{
        mode,seed:'with-opaque-function-source/'+mode+'/'+fixture.kind,
        strings:true,properties:false,identifiers:false
      }).files[0];
      assert.equal(execute(String(output.code),sourceType),execute(source,sourceType),
        'Host-owned with getter observed changed function/class source bytes');
      assert.equal(output.metrics.literals,1,
        'Only outside-function, outside-with primitive literal is admissible');
      assert.ok(String(output.code).includes(fixture.sourceMarker),
        'Function/class source visible to an opaque host must not change');
      assert.ok(!String(output.code).includes('top-level-encoded-payload'),
        'Unrelated top-level literal should retain genuine positive encoding');
    });
    }
  }
}
