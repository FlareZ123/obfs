'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesFunctionSource}=require('../src/ast');

const variants={
  setOnly:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'export function sample(){localStorage.setItem("key",inspect);return inspect();}'
  ].join('\n'),
  getOnly:[
    'export function sample(){const key="key";return localStorage.getItem(key);}'
  ].join('\n'),
  setThenGetLiteral:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'export function sample(){localStorage.setItem("key",inspect);return localStorage.getItem("key");}'
  ].join('\n'),
  setThenGetParamKey:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'export function sample(prefix){const key=prefix+"-source";localStorage.setItem(key,inspect);return localStorage.getItem(key);}'
  ].join('\n'),
  setFunctionKeyOnly:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'export function sample(){localStorage.setItem(inspect,"value");return inspect();}'
  ].join('\\n'),
  setFunctionValueLiteral:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'export function sample(){localStorage.setItem("key",inspect);return inspect();}'
  ].join('\\n'),
  namedFunctionKey:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'export function sample(){localStorage[inspect]="value";return inspect();}'
  ].join('\\n'),
  namedFunctionValue:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'export function sample(){localStorage["key"]=inspect;return inspect();}'
  ].join('\\n'),
  namedDynamicKey:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'export function sample(prefix){const key=prefix+"-source";localStorage[key]=inspect;return inspect();}'
  ].join('\\n'),
  setThenGetNotReturned:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'export function sample(){localStorage.setItem("key",inspect);const read=localStorage.getItem("key");return inspect();}'
  ].join('\n'),
  sourceObjectLiteral:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'export function sample(prefix){const key=prefix+"-source";localStorage.setItem(key,inspect);return {source:localStorage.getItem(key),value:inspect()};}'
  ].join('\n')
};

test('diagnose which Storage read shape trips the function-source observer',()=>{
  const observed=Object.fromEntries(Object.entries(variants).map(([name,code])=>[
    name,observesFunctionSource(parse(code,'module'))
  ]));
  console.log(JSON.stringify({storageReadObserver:observed}));
  assert.equal(observed.setOnly,false);
});
