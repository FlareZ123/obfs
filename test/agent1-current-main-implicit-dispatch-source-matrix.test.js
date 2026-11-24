'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Build a host-controlled value whose implicit protocol operation calls external().
 * Trap/callback functions use Function() so the caller chain remains sloppy.
 * @param {string} kind
 * @param {(...args:unknown[])=>void} external
 * @returns {unknown[]}
 */
function makeHostArgs(kind,external) {
  switch(kind) {
    case 'for-of':
    case 'array-destructure': {
      const iterable=Function('external',
        'return {'+
          '[Symbol.iterator]:function iterator(){return this;},'+
          'next:function next(){external();return {done:true};}'+
        '};'
      )(external);
      return [iterable];
    }
    case 'in': {
      const has=/** @type {ProxyHandler<object>['has']} */(Function('external',
        'return function has(target,key){external();return false;}'
      )(external));
      return [new Proxy({}, {has})];
    }
    case 'for-in-ownKeys': {
      const ownKeys=/** @type {ProxyHandler<object>['ownKeys']} */(Function('external',
        'return function ownKeys(target){external();return [];}'
      )(external));
      return [new Proxy({}, {ownKeys})];
    }
    case 'for-in-getPrototypeOf': {
      const getPrototypeOf=/** @type {ProxyHandler<object>['getPrototypeOf']} */(Function('external',
        'return function getPrototypeOf(target){external();return null;}'
      )(external));
      return [new Proxy({}, {getPrototypeOf})];
    }
    case 'instanceof': {
      const hasInstance=/** @type {(value:unknown)=>boolean} */(Function('external',
        'return function hasInstance(value){external();return false;}'
      )(external));
      const ctor=/** @type {{[Symbol.hasInstance]:(value:unknown)=>boolean}} */(
        {[Symbol.hasInstance]:hasInstance}
      );
      return [{},ctor];
    }
    case 'delete': {
      const deleteProperty=/** @type {ProxyHandler<object>['deleteProperty']} */(Function('external',
        'return function deleteProperty(target,key){external();return true;}'
      )(external));
      return [new Proxy({}, {deleteProperty})];
    }
    case 'object-destructure': {
      const get=/** @type {ProxyHandler<object>['get']} */(Function('external',
        'return function get(target,key,receiver){if(key===\'x\')external();return 1;}'
      )(external));
      return [new Proxy({}, {get})];
    }
    case 'with': {
      const has=/** @type {ProxyHandler<object>['has']} */(Function('external',
        'return function has(target,key){if(key===\'x\'){external();return true;}return false;}'
      )(external));
      return [new Proxy({}, {has})];
    }
    case 'proxy-set': {
      const set=/** @type {ProxyHandler<object>['set']} */(Function('external',
        'return function set(target,key,value,receiver){external();return true;}'
      )(external));
      return [new Proxy({}, {set})];
    }
    case 'accessor-setter': {
      const setter=/** @type {(value:unknown)=>void} */(Function('external',
        'return function setX(value){external();}'
      )(external));
      const value={};
      Object.defineProperty(value,'x',{set:setter});
      return [value];
    }
    default:
      throw new Error('Unknown implicit-dispatch case: '+kind);
  }
}

/**
 * Execute a generated module with a host-controlled value and capture the
 * active hidden() function from the external callback.
 * @param {string} code
 * @param {string} kind
 * @returns {{value:unknown,source:string}}
 */
function observe(code,kind) {
  /** @type {{captured:unknown}} */
  const observation={captured:null};
  const external=/** @type {(...args:unknown[])=>void} */(Function('observation',
    'return function external(){observation.captured=arguments.callee.caller.caller;}'
  )(observation));
  const args=makeHostArgs(kind,external);
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2500});
  assert.equal(typeof context.module.exports,'function');
  const reader=/** @type {(...args:unknown[])=>unknown} */(context.module.exports);
  const value=reader(...args);
  assert.equal(typeof observation.captured,'function',kind+' must capture hidden()');
  return {value,source:Function.prototype.toString.call(observation.captured)};
}

/**
 * @param {'coo'|'sno'} mode
 * @param {string} code
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(mode,code) {
  const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode,seed:'agent1-current-main-implicit-dispatch-matrix',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(result.files.length,1);
  return result.files[0];
}

const cases=[
  {kind:'for-of',body:'for(const item of value){}'},
  {kind:'in',body:"'x' in value;"},
  {kind:'for-in-ownKeys',body:'for(const key in value){}'},
  {kind:'for-in-getPrototypeOf',body:'for(const key in value){}'},
  {kind:'instanceof',body:'value instanceof aux;'},
  {kind:'delete',body:'delete value.x;'},
  {kind:'object-destructure',body:'const {x}=value;'},
  {kind:'array-destructure',body:'const [x]=value;'},
  {kind:'with',body:'with(value){x;}'},
  {kind:'proxy-set',body:'value.x=1;'},
  {kind:'accessor-setter',body:'value.x=1;'}
];

for(const mode of /** @type {const} */(['coo','sno'])) {
  for(const scenario of cases) {
    test(mode+' diagnostic current-main source observation: '+scenario.kind,()=>{
      const source=
        'const owner={secretField:1};'+
        'const other={unrelatedField:2};'+
        'function hidden(value,aux){'+scenario.body+'return owner.secretField;}'+
        'function plain(){return other.unrelatedField;}'+
        'function publicReader(value,aux){return hidden(value,aux)+plain();}'+
        'module.exports=publicReader;';
      const before=observe(source,scenario.kind);
      const output=compile(mode,source);
      const after=observe(String(output.code),scenario.kind);
      assert.equal(after.value,before.value,scenario.kind+' must preserve returned value');
      assert.ok(before.source.includes('owner.secretField'),scenario.kind+' native source must contain the owner key');
      const result={
        mode,kind:scenario.kind,
        sourceParity:after.source===before.source,
        properties:output.metrics.properties,
        ownerKeyStillSpelled:String(output.code).includes('secretField'),
        unrelatedKeyStillSpelled:String(output.code).includes('unrelatedField'),
        nativeSource:before.source,emittedSource:after.source
      };
      console.log('IMPLICIT_DISPATCH_RESULT '+JSON.stringify(result));
      assert.equal(after.source,before.source,
        'Current-main implicit-dispatch source mismatch: '+JSON.stringify(result));
      assert.equal(after.source,before.source,
        'Current-main implicit-dispatch source mismatch: '+JSON.stringify(result));
    });
  }
}
