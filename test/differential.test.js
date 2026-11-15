'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/**
 * Deterministic xorshift32 generator for reproducible differential fixtures.
 * @param {number} seed
 * @returns {()=>number}
 */
function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/**
 * @param {string} source
 * @returns {string}
 */
function evaluate(source) {
  const context={module:{exports:null},console};
  vm.runInNewContext(source,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

/**
 * @param {string} name
 * @param {number} value
 * @param {number} choice
 * @returns {string}
 */
function fixture(name,value,choice) {
  const key=JSON.stringify(name);
  const owner=`const state={${key}:${value},other:'another-value'};`;
  const get=`state[${key}]`;
  const member=`alias[${key}]`;
  const input=JSON.stringify(name);
  const cases=[
    `const alias=state;module.exports=[${get},${member}];`,
    `function read(p){return p[${key}];}module.exports=read(state);`,
    `function forward(p){return p;}const alias=forward(state);module.exports=${member};`,
    `const k=${input};module.exports=state[k];`,
    `module.exports=Object.keys(state);`,
    `function inspect(p){return arguments[0][${key}];}module.exports=inspect(state);`,
    `const another={${key}:7,other:'other'};function g(p){return p[${key}];}module.exports=g(state)+g(another);`,
    `const alias=state;const clone={...alias};module.exports=[clone[${key}],${member}];`,
    `let alias=state;alias={${key}:7};module.exports=${member};`,
    `const alias=state;delete alias[${key}];module.exports=${key} in state;`,
    `const alias=state;Object.freeze(alias);module.exports=${member};`,
    `const alias=state;module.exports=Reflect.ownKeys(alias);`,
    `function f(p){p[${key}]+=5;return p[${key}];}module.exports=f(state);`,
    `function f(p){return p?.[${key}]??0;}module.exports=f(state);`,
    `const alias=state;module.exports=JSON.stringify(alias);`,
    `const {${key}: x}=state;module.exports=x;`,
    `const alias=state;function f(){return ${member};}module.exports=f();`,
    `const result=${get};module.exports=result;`,
    `const object={${key}:12};module.exports=${get}+object[${key}];`,
    `const alias=state;function f(p){return p[${key}];}module.exports=f(alias);`,
    `const alias=state;function f(p){return p[${key}];}module.exports=f({${key}:5})+f(alias);`,
    `const alias=state;module.exports=Object.getOwnPropertyDescriptor(alias,${key}).value;`,
    `function outer(p){const alias=p;return alias[${key}];}module.exports=outer(state);`,
    `function f(p){return [p[${key}],p.other];}module.exports=f(state);`
  ];
  return owner+cases[choice % cases.length];
}

test('1,200 differential state/alias/reflection programs',()=>{
  const next=generator(0x4b5c6d7e);
  const keys=['secret','then','toString','__proto__','constructor','a-b','σ','hello'];
  let transformedObjects=0;
  let transformedStrings=0;
  for(let i=0;i<1200;i++){
    const key=keys[next()%keys.length];
    const value=next()%1000;
    const choice=next()%24;
    const source=fixture(key,value,choice);
    let expected;
    try {expected=evaluate(source);}catch(e){continue;}
    const output=obfuscateFiles([{path:'case.cjs',code:source}],{mode:'sno',seed:`case-${i}`}).files[0];
    let received;
    try {received=evaluate(output.code);}catch(e){
      throw new Error(`Obfuscated exception case=${i}, key=${key}, choice=${choice}\n${source}\n${output.code}\n${e.stack}`);
    }
    assert.equal(received,expected,`case=${i}; key=${key}; choice=${choice}\n${source}\n${output.code}`);
    transformedObjects+=output.metrics.objects;
    transformedStrings+=output.metrics.literals;
  }
  assert.ok(transformedObjects>80,`Expected meaningful property coverage; got ${transformedObjects}`);
  assert.ok(transformedStrings>100,`Expected string coverage; got ${transformedStrings}`);
});
