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

test('unrelated prototype inspection should not invalidate the native WeakMap Storage proof',()=>{
  const baseline=compile(buildSource(''),'agent4-unrelated-prototype-baseline');
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
    const result=compile(buildSource(variant.extra),'agent4-unrelated-prototype-'+index);
    assert.equal(result.observed,true,variant.name);
    assert.equal(result.bindings,0,
      JSON.stringify({variant:variant.name,baseline,actual:result}));
  }
  process.stdout.write('UNRELATED_PROTOTYPE_ACCESS_OVERREFUSAL '+JSON.stringify({
    baselineBindings:baseline.bindings,
    variants:unrelated.map(x=>x.name)
  })+'\n');
});
