'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {(value:number)=>number} */
function load(code){
  const context={module:{exports:/** @type {unknown} */(null)}};
  vm.runInNewContext(code,context,{timeout:2000});
  assert.equal(typeof context.module.exports,'function');
  return /** @type {(value:number)=>number} */(context.module.exports);
}

test('audit emitted public wrapper source when ordinary identifier and literal transforms enabled',()=>{
  const source='const owner={secretAlpha:23};'+
    'function read(local){return local.secretAlpha;}'+
    'module.exports=function calculate(x){return read(owner)+x;};';
  const native=load(source);
  /** @type {Array<{mode:string,identifiers:boolean,strings:boolean,properties:number,bindings:number,literals:number,sourceEqual:boolean,outputEqual:boolean}>} */
  const rows=[];
  for(const mode of /** @type {const} */(['coo','sno','sco']))
    for(const identifiers of [false,true])
      for(const strings of [false,true]) {
        const compiled=obfuscateFiles([{
          path:'entry.cjs',sourceType:'commonjs',code:source
        }],{mode,seed:'agent9-default-wrapper/'+mode+'/'+identifiers+'/'+strings,
          identifiers,strings,properties:true});
        const emitted=load(String(compiled.files[0].code));
        const out=compiled.files[0];
        const sourceEqual=Function.prototype.toString.call(emitted)===
          Function.prototype.toString.call(native);
        const outputEqual=[-3,0,2,999].every(x=>emitted(x)===native(x));
        assert.equal(outputEqual,true,'numeric parity');
        rows.push({
          mode,identifiers,strings,properties:out.metrics.properties,
          bindings:out.metrics.bindings,literals:out.metrics.literals,
          sourceEqual,outputEqual
        });
      }
  console.log('AGENT9_DEFAULT_WRAPPER_SOURCE '+JSON.stringify(rows));
  assert.equal(rows.length,12);
  assert.ok(rows.every(row=>row.sourceEqual),
    'The directly exported public wrapper source is observable through native toString');
});
