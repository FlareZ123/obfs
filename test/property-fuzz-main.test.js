'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {string|undefined} */
function execute(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

/**
 * Repeatable small grammar for property-flow, alias, prototype, and reflection
 * interactions. Every case is run both before and after actual transformation.
 * @param {number} index
 * @returns {string}
 */
function makeCase(index) {
  const key=`secret${index}`;
  const num=(index*71+29)%997;
  const base=`const a={${key}:${num},other:7};`;
  const reflect=`Object.defineProperty(Object.prototype,'inspect',{get(){return Object.keys(this)[0]}});`;
  switch(index%13) {
    case 0: return `${base}module.exports=a.${key};`;
    case 1: return `${base}const b=a;b.${key}++;module.exports=a.${key};`;
    case 2: return `function identity(x){return x;}${base}const b=identity(a);module.exports=b.${key};`;
    case 3: return `function read(p){return p.${key};}${base}module.exports=read(a);`;
    case 4: return `${reflect}${base}module.exports=[a.inspect,a.${key}].join('|');`;
    case 5: return `${reflect}${base}const {inspect}=a;module.exports=[inspect,a.${key}].join('|');`;
    case 6: return `Object.prototype.${key}=81;${base}delete a.${key};module.exports=a.${key};`;
    case 7: return `${base}module.exports=a?.${key};`;
    case 8: return `${base}a.${key}=${num+1};module.exports=a.${key};`;
    case 9: return `${base}module.exports=a['${key}'];`;
    case 10: return `${base}const k='${key}';module.exports=a[k];`;
    case 11: return `${base}const read=()=>a;module.exports=read().${key};`;
    default: return `Object.defineProperty(Object.prototype,'${key}',{get(){return 100}});${base}const {${key}:v}=a;module.exports=v;`;
  }
}

test('deterministic 260-case property-flow differential corpus',()=>{
  let transformedObjects=0;
  for(let index=0;index<260;index++) {
    const source=makeCase(index);
    const expected=execute(source);
    const result=obfuscateFiles([{path:'main.cjs',sourceType:'commonjs',code:source}],{
      mode:'sno',seed:`flow-fuzz-${index%11}`,strings:false,identifiers:false
    }).files[0];
    const observed=execute(/** @type {string} */ (result.code));
    assert.equal(observed,expected,
      `Case ${index}\nSOURCE: ${source}\nOUTPUT: ${result.code}`);
    transformedObjects+=result.metrics.objects;
  }
  assert.ok(transformedObjects>=60,
    `Corpus was vacuous: only ${transformedObjects} objects transformed`);
});
