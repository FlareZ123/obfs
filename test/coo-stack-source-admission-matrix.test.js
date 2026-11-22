'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');

/** @type {{name:string,sourceType:'script'|'commonjs',code:string}[]} */
const CASES=[
  {name:'nested-arrow-script',sourceType:'script',
    code:'const observedResult=(()=>{function privateHelper(secretLocal){return secretLocal+Math.random();}return privateHelper(17);})();'},
  {name:'nested-arrow-commonjs',sourceType:'commonjs',
    code:'const observedResult=(()=>{function privateHelper(secretLocal){return secretLocal+Math.random();}return privateHelper(17);})();'},
  {name:'nested-function-script',sourceType:'script',
    code:'const observedResult=(function(){function privateHelper(secretLocal){return secretLocal+Math.random();}return privateHelper(17);})();'},
  {name:'top-level-script',sourceType:'script',
    code:'function privateHelper(secretLocal){return secretLocal+Math.random();}const observedResult=privateHelper(17);'},
  {name:'top-level-commonjs',sourceType:'commonjs',
    code:'function privateHelper(secretLocal){return secretLocal+Math.random();}const observedResult=privateHelper(17);'},
  {name:'simple-script',sourceType:'script',
    code:'const observedResult=(()=>{function privateHelper(secretLocal){return secretLocal+1;}return privateHelper(17);})();'},
  {name:'simple-commonjs',sourceType:'commonjs',
    code:'const observedResult=(()=>{function privateHelper(secretLocal){return secretLocal+1;}return privateHelper(17);})();'}
];

test('diagnostic matrix for private callable admission in classic script',()=>{
  const rows=[];
  for(const item of CASES) {
    const ast=parse(item.code,item.sourceType);
    const output=obfuscateFiles([{path:item.sourceType==='script'?'client.js':'entry.cjs',
      sourceType:item.sourceType,code:item.code}],{
      mode:'coo',seed:'browser-stack-source-admission-matrix',
      identifiers:true,properties:false,strings:false
    });
    rows.push({name:item.name,bindings:output.files[0].metrics.bindings,
      sourceObserver:observesFunctionSource(ast),
      distributedObserver:observesDistributedSource(ast),
      renamed:!String(output.files[0].code).includes('secretLocal')});
  }
  process.stdout.write('CLASSIC_SCRIPT_CALLABLE_ADMISSION_MATRIX '+JSON.stringify(rows)+'\n');
  assert.equal(rows.find(row=>row.name==='top-level-commonjs')?.bindings,1);
});
