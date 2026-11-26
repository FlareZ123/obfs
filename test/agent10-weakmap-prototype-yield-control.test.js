'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const common=[
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){captured.set(this,value);}',
  '  });',
  '  localStorage.setItem("storage-prototype-override",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '}'
];

/**
 * @param {string} extra
 * @returns {string}
 */
function buildSource(extra) {
  return [extra,...common].filter(Boolean).join('\n');
}

/**
 * @param {string} source
 * @param {string} seed
 * @returns {{observed:boolean,bindings:number,code:string}}
 */
function compile(source,seed) {
  const observed=observesFunctionSource(parse(source,'module'));
  const compiled=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',seed,properties:false,identifiers:true,strings:false
  });
  const app=compiled.files.find(file=>file.path==='entry.mjs');
  assert.ok(app);
  return {observed,bindings:app.metrics.bindings,code:String(app.code)};
}

test('unrelated prototype operations do not invalidate the WeakMap Storage proof',()=>{
  const baseline=compile(buildSource(''),'agent10-unrelated-prototype-baseline');
  assert.equal(baseline.observed,false);
  assert.ok(baseline.bindings>=2,JSON.stringify(baseline));
  const unrelated=[
    {
      name:'Object.getPrototypeOf on an unrelated plain object',
      extra:'const unrelated={}; const unrelatedPrototype=Object.getPrototypeOf(unrelated);'
    },
    {
      name:'__proto__ on an unrelated plain object',
      extra:'const unrelated={}; const unrelatedPrototype=unrelated.__proto__;'
    },
    {
      name:'unrelated object-literal getPrototypeOf data key',
      extra:'const unrelated={"getPrototypeOf":1};'
    }
  ];
  for(const [index,variant] of unrelated.entries()) {
    const result=compile(buildSource(variant.extra),'agent10-unrelated-prototype-'+index);
    assert.equal(result.observed,false,variant.name);
    assert.ok(result.bindings>=2,
      JSON.stringify({variant:variant.name,baseline,actual:result}));
  }
});

test('unrelated prototype access in a sibling file does not invalidate the Storage proof',()=>{
  const files=[
    {path:'entry.mjs',sourceType:'module',code:"import './unrelated.mjs'; export {sample} from './storage.mjs';"},
    {path:'unrelated.mjs',sourceType:'module',code:'const unrelated={}; Object.getPrototypeOf(unrelated);'},
    {path:'storage.mjs',sourceType:'module',code:buildSource('')}
  ];
  const compiled=obfuscateFiles(files,{
    mode:'coo',seed:'agent10-unrelated-sibling-prototype',
    properties:false,identifiers:true,strings:false,closedWorld:true
  });
  const storage=compiled.files.find(file=>file.path==='storage.mjs');
  assert.ok(storage);
  assert.ok(storage.metrics.bindings>=2,
    JSON.stringify({metrics:storage.metrics,files:compiled.files.map(file=>({path:file.path,metrics:file.metrics}))}));
});
