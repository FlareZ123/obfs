'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Compare snapshots from isolated VM contexts without relying on cross-realm
 * object prototype identity.
 * @param {string} code
 * @returns {string}
 */
function execute(code) {
  const sandbox={module:{exports:null}};
  vm.runInNewContext(code,sandbox,{timeout:2000});
  return JSON.stringify(sandbox.module.exports);
}

/** @typedef {{name:string,source:string,objects:number}} Scenario */
/** @type {Scenario[]} */
const scenarios=[
  {
    name:'lexical numeric parameter supplies one private owner value',
    source:'function calculate(payload){const owner={secretField:payload,bias:3};return owner.secretField+owner.bias;}module.exports=calculate(39);',
    objects:1
  },
  {
    name:'lexical function argument retains its original name',
    source:'function inspect(payload){const owner={secretField:payload};return [owner.secretField.name,owner.secretField()];}module.exports=inspect(()=>8);',
    objects:0
  },
  {
    name:'anonymous function argument receives no owner-key-inferred name',
    source:'function inspect(payload){const owner={secretField:payload};return owner.secretField.name;}module.exports=inspect(()=>8);',
    objects:1
  },
  {
    name:'plain object parameter value read preserves object identity',
    source:'function inspect(payload){const owner={secretField:payload,bias:7};return [owner.secretField===payload,owner.secretField.score+owner.bias];}module.exports=inspect({score:12});',
    objects:1
  },
  {
    name:'function parameter may be returned by a direct field read',
    source:'function inspect(payload){const owner={secretField:payload};return owner.secretField;}module.exports=inspect(47);',
    objects:1
  },
  {
    name:'reflected owner keys decline',
    source:'function inspect(payload){const owner={secretField:payload};return [owner.secretField,Object.keys(owner)];}module.exports=inspect(6);',
    objects:0
  },
  {
    name:'escaped private owner declines',
    source:'function inspect(payload){const owner={secretField:payload};return owner;}module.exports=Object.keys(inspect(6));',
    objects:0
  },
  {
    name:'parameter function called as owner method declines',
    source:'function inspect(payload){const owner={secretField:payload};return owner.secretField();}module.exports=inspect(function(){return Object.keys(this);});',
    objects:0
  },
  {
    name:'unknown member lookup declines',
    source:'function inspect(payload){const owner={secretField:payload};return [owner.secretField,owner["missing"]];}module.exports=inspect(6);',
    objects:0
  },
  {
    name:'default parameter callback observes owner shape',
    source:'function inspect(payload=()=>Object.keys(owner)){const owner={secretField:payload};return owner.secretField();}module.exports=inspect();',
    objects:0
  },
  {
    name:'unresolved module-level identifier value declines',
    source:'const owner={secretField:unknown};module.exports=owner.secretField;',
    objects:0
  }
];

for(const mode of /** @type {const} */ (['sno','coo'])) {
  for(const scenario of scenarios) {
    test(mode+' private parameter-owned field: '+scenario.name,()=>{
      // The final fixture has an intentionally unbound read. The thrown
      // ReferenceError is an admissible reference observable, and should
      // remain unchanged with the conservative candidate refusal.
      if(scenario.name==='unresolved module-level identifier value declines') {
        const output=obfuscateFiles([{path:'entry.cjs',code:scenario.source}],{
          mode,seed:'parameter-value/'+scenario.name,identifiers:false,strings:false,properties:true
        }).files[0];
        assert.equal(output.metrics.objects,0);
        assert.throws(()=>execute(scenario.source),{name:'ReferenceError'});
        assert.throws(()=>execute(output.code),{name:'ReferenceError'});
        return;
      }
      const reference=execute(scenario.source);
      const output=obfuscateFiles([{path:'entry.cjs',code:scenario.source}],{
        mode,seed:'parameter-value/'+scenario.name,identifiers:false,strings:false,properties:true
      }).files[0];
      assert.equal(output.metrics.objects,scenario.objects,output.code);
      assert.equal(execute(output.code),reference,output.code);
    });
  }
}
