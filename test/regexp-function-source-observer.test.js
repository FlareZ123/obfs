'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');

/** @param {string} source @returns {unknown} */
function run(source){
  const module={exports:undefined};
  vm.runInNewContext(source,{module,globalThis},{timeout:3000});
  return module.exports;
}

const examples=[
  {
    name:'regular expression literal test',
    tail:'module.exports=/a\\^17/.test(f);'
  },
  {
    name:'aliased regular expression literal test',
    tail:'const matcher=/a\\^17/;const alias=matcher;module.exports=alias.test(f);'
  },
  {
    name:'constructed regular expression exec',
    tail:'const match=new RegExp("a\\\\^17").exec(f);module.exports=match?.[0]??null;'
  },
  {
    name:'detached RegExp prototype method through call',
    tail:'const method=RegExp.prototype.test;module.exports=method.call(/a\\^17/,f);'
  },
  {
    name:'bound RegExp prototype method',
    tail:'const bound=RegExp.prototype.test.bind(/a\\^17/);module.exports=bound(f);'
  },
  {
    name:'Reflect.apply of RegExp prototype method',
    tail:'module.exports=Reflect.apply(RegExp.prototype.test,/a\\^17/,[f]);'
  },
  {
    name:'RegExp Symbol.match direct',
    tail:'module.exports=/a\\^17/[Symbol.match](f)?.[0]??null;'
  },
  {
    name:'RegExp Symbol.search direct',
    tail:'module.exports=/a\\^17/[Symbol.search](f)>=0;'
  },
  {
    name:'RegExp Symbol.replace direct',
    tail:'module.exports=/a\\^17/[Symbol.replace](f,"MATCH").includes("MATCH");'
  },
  {
    name:'RegExp Symbol.split direct',
    tail:'module.exports=/a\\^17/[Symbol.split](f).length>1;'
  },
  {
    name:'RegExp Symbol.matchAll direct',
    tail:'module.exports=Array.from(/a\\^17/g[Symbol.matchAll](f)).length>0;'
  },
  {
    name:'RegExp Symbol.match detached alias',
    tail:'const match=RegExp.prototype[Symbol.match];module.exports=match.call(/a\\^17/,f)?.[0]??null;'
  },
  {
    name:'RegExp Symbol.match key alias',
    tail:'const key=Symbol.match;module.exports=/a\\^17/[key](f)?.[0]??null;'
  },
  {
    name:'RegExp Symbol.search transitive key alias',
    tail:'const key=Symbol.search;const alias=key;module.exports=/a\\^17/[alias](f)>=0;'
  },
  {
    name:'RegExp Symbol.match key through constructor alias',
    tail:'const Sy=Symbol;const key=Sy.match;module.exports=/a\\^17/[key](f)?.[0]??null;'
  },
  {
    name:'RegExp prototype test method destructuring',
    tail:'const {test: check}=RegExp.prototype;module.exports=check.call(/a\\^17/,f);'
  },
  {
    name:'RegExp Symbol.match method destructuring',
    tail:'const {[Symbol.match]: matcher}=RegExp.prototype;module.exports=matcher.call(/a\\^17/,f)?.[0]??null;'
  }
];

test('native RegExp text-matching consumes exact function source and must decline Wasm source rewrites',()=>{
  for(const entry of examples){
    const source='function f(a){return a^17;}'+entry.tail;
    const native=run(source);
    assert.ok(native,'Positive native source observer: '+entry.name);
    const result=lowerWasmI32Functions(source,'commonjs',{
      seed:'regexp-function-source-observer-'+entry.name,names:['f']
    });
    assert.equal(result.functions,0,'Must decline: '+entry.name);
    assert.equal(result.declined,1,'Must record decline: '+entry.name);
    assert.equal(result.code,source,'Must preserve source: '+entry.name);
    assert.deepEqual(run(result.code),native,'Native/generator parity: '+entry.name);
  }
});

test('explicit Wasm selection rejects RegExp function-source consumers',()=>{
  const source='function f(a){return a^17;}module.exports=/a\\^17/.test(f);';
  assert.throws(()=>obfuscateFiles([
    {path:'entry.cjs',sourceType:'commonjs',code:source}
  ],{
    mode:'sno',seed:'regex-observer-integration',strings:false,
    identifiers:false,properties:false,experimentalWasmI32:{'entry.cjs':['f']}
  }),/Wasm i32 declined/u);
});

test('RegExp of a known static primitive remains a genuine transformed positive control',()=>{
  const source='function f(a){return a^17;}module.exports=[f(3),/a\\^17/.test("a^17")];';
  const result=lowerWasmI32Functions(source,'commonjs',{
    seed:'regex-static-primitive-positive',names:['f']
  });
  assert.equal(result.functions,1);
  assert.equal(result.declined,0);
  assert.deepEqual(Array.from(/** @type {unknown[]} */(run(result.code))),
    Array.from(/** @type {unknown[]} */(run(source))));
});


test('cross-file ESM RegExp consumers reject source-rewriting Wasm while static-string checks remain eligible',()=>{
  const exported='export function f(a){return a^17;}';
  /** @type {import('../src/core').SourceFile[]} */
  const observed=[
    {path:'state.mjs',sourceType:'module',code:exported},
    {path:'entry.mjs',sourceType:'module',
      code:'import {f} from "./state.mjs";console.log(/a\\^17/.test(f));'}
  ];
  const options={
    mode:/** @type {const} */('coo'),closedWorld:true,strings:false,
    seed:'cross-ESM-RegExp-source',experimentalWasmI32:{'state.mjs':['f']}
  };
  assert.throws(()=>obfuscateFiles(observed,options),
    /Wasm i32 requires a module\/CommonJS without cross-file source observation/u);
  const primitive=[
    observed[0],
    {path:'entry.mjs',sourceType:/** @type {const} */('module'),
      code:'import {f} from "./state.mjs";console.log(f(3),/a\\^17/.test("a^17"));'}
  ];
  const eligible=obfuscateFiles(primitive,options);
  assert.equal(eligible.files[0].metrics.wasmI32Functions,1);
  assert.equal(eligible.files[1].metrics.wasmI32Functions??0,0);
});
