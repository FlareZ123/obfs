'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} source
 * @returns {string}
 */
function execute(source){
  const sandbox={module:{exports:null}};
  vm.runInNewContext(source,sandbox,{timeout:1500});
  return JSON.stringify(sandbox.module.exports);
}

/**
 * @typedef {{name:string,source:string,objects:number}} Case
 */
/** @type {Case[]} */
const scenarios=[
  {name:'simple shorthand formal is a private field',
    source:'function inspect(payload){const owner={payload,bias:3};return owner.payload+owner.bias;}module.exports=inspect(39);',
    objects:1},
  {name:'shorthand retains preexisting anonymous function argument name',
    source:'function inspect(callback){const owner={callback};const fn=owner.callback;return [fn.name,fn()];}module.exports=inspect(()=>17);',
    objects:1},
  {name:'shorthand and explicit computed field keys rewrite together',
    source:'function inspect(payload){const owner={payload,["bias"]:3};return owner["payload"]+owner.bias;}module.exports=inspect(39);',
    objects:1},
  {name:'escaped shorthand owner remains unchanged',
    source:'function inspect(payload){const owner={payload};return owner;}module.exports=Object.keys(inspect(39));',
    objects:0},
  {name:'reflection of shorthand keys remains unchanged',
    source:'function inspect(payload){const owner={payload};return Object.keys(owner);}module.exports=inspect(39);',
    objects:0},
  {name:'direct call receiver reveals shorthand owner',
    source:'function inspect(callback){const owner={callback};return owner.callback();}module.exports=inspect(function(){return Object.keys(this);});',
    objects:0},
  {name:'non-parameter shorthand value is not newly admitted',
    source:'const payload=31;const owner={payload};module.exports=owner.payload;',
    objects:0},
  {name:'special shorthand __proto__ key remains fixed',
    source:'function inspect(__proto__){const owner={__proto__};return owner.__proto__;}module.exports=inspect(39);',
    objects:0},
  {name:'unrecognized shorthand owner member declines',
    source:'function inspect(payload){const owner={payload};return [owner.payload,owner.missing];}module.exports=inspect(39);',
    objects:0}
];

for(const mode of /** @type {const} */ (['coo','sno'])) {
  for(const identifiers of [false,true]) {
    for(const scenario of scenarios) {
      test(mode+' shorthand/private/formal '+identifiers+': '+scenario.name,()=>{
        const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:scenario.source}],{
          mode,seed:'parameter-shorthand/'+scenario.name,
          identifiers,strings:false,properties:true
        }).files[0];
        assert.equal(output.metrics.objects,scenario.objects,output.code);
        assert.equal(execute(output.code),execute(scenario.source),output.code);
      });
    }
  }
}
