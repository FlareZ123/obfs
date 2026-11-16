'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {lowerPolyvariantAffine}=require('../src/affine-native');

/** @param {{operator:'+'|'-',value:number}[]} steps @returns {string} */
function sourceFor(steps) {
  let expression='(input|0)';
  for(const step of steps)expression='('+expression+step.operator+step.value+')';
  return 'function protectedSum(input){return ('+expression+'|0)}\nmodule.exports=protectedSum;\n';
}

/** @param {string} source @returns {(value:any)=>number} */
function load(source) {
  /** @type {{exports:(value:any)=>number}} */
  const module={exports:()=>0};
  Function('module','exports',source)(module,module.exports);
  return module.exports;
}

/** @param {Function} fn @param {unknown} arg @returns {string} */
function invoke(fn,arg) {
  try {
    const value=fn(arg);
    return typeof value+':'+(Object.is(value,-0)?'-0':String(value));
  } catch(error) {
    return 'throw:'+(error instanceof Error?error.name+':'+error.message:String(error));
  }
}

const steps=/** @type {{operator:'+'|'-',value:number}[]} */ ([
  {operator:'+',value:17},{operator:'-',value:8},
  {operator:'+',value:213},{operator:'-',value:55},
  {operator:'+',value:64},{operator:'-',value:2},
  {operator:'+',value:34},{operator:'-',value:10},
  {operator:'+',value:61},{operator:'-',value:8}
]);

test('numeric branches and generic coercion branch exactly preserve outputs and effects',()=>{
  const source=sourceFor(steps),native=load(source);
  const values=[-2147483649,-2147483648,-32768,-9,-2,-1,-0,0,1,2,3,4,
    255,65535,2147483647,2147483648,Number.MAX_SAFE_INTEGER,
    NaN,Infinity,-Infinity,0.125,-1.125,null,undefined,true,false,
    '17','abc',Symbol('private'),1n,{},()=>3];
  for(const variants of [2,4,8]) {
    for(const seed of ['polyvariant-0','polyvariant-1']) {
      const compiled=lowerPolyvariantAffine(source,'commonjs',{
        seed,names:['protectedSum'],variants
      });
      assert.equal(compiled.functions,1);
      assert.equal(compiled.paths,variants);
      assert.equal(compiled.steps,steps.length);
      assert.equal(compiled.declined,0);
      assert.equal((compiled.code.match(/\bcase \d+:/g)||[]).length,variants);
      const obfuscated=load(compiled.code);
      for(const value of values) {
        assert.equal(invoke(obfuscated,value),invoke(native,value),
          'variant '+variants+' input '+String(value));
      }
      for(let index=0;index<512;index++) {
        const value=(Math.imul(index+1,0x45d9f3b)^-0x42391a20)|0;
        assert.equal(obfuscated(value),native(value),'integer '+index);
      }
      for(const output of [5,'8',null]) {
        let originalCalls=0,modifiedCalls=0;
        const original={ [Symbol.toPrimitive](){originalCalls++;return output;} };
        const transformed={ [Symbol.toPrimitive](){modifiedCalls++;return output;} };
        assert.equal(invoke(obfuscated,transformed),invoke(native,original));
        assert.equal(modifiedCalls,originalCalls);
        assert.equal(originalCalls,1);
      }
    }
  }
});

test('function source observers, dynamic scope and unrecognized grammar fail closed',()=>{
  const source=sourceFor(steps);
  const cases=[
    source+'console.log(protectedSum.toString())',
    source+'eval("protectedSum(1)")',
    source.replace('input|0','input>>0'),
    source.replace('function protectedSum(input)','async function protectedSum(input)'),
    source.replace('module.exports=protectedSum;','protectedSum(2)')+
      '\nfunction protectedSum(input){return 1;}\n'
  ];
  for(const code of cases) {
    const result=lowerPolyvariantAffine(code,'commonjs',{
      seed:'refusal',names:['protectedSum']
    });
    assert.equal(result.functions,0);
    assert.equal(result.code,code);
  }
});

test('output is reproducible, seed-diversified, and validates configuration',()=>{
  const source=sourceFor(steps);
  const opts={seed:'repeatable',names:['protectedSum'],variants:4};
  const first=lowerPolyvariantAffine(source,'commonjs',opts);
  assert.equal(lowerPolyvariantAffine(source,'commonjs',opts).code,first.code);
  assert.notEqual(lowerPolyvariantAffine(source,'commonjs',{
    ...opts,seed:'another'
  }).code,first.code);
  assert.throws(()=>lowerPolyvariantAffine(source,'commonjs',{
    seed:'repeatable',names:['protectedSum'],variants:3
  }),TypeError);
  assert.deepEqual(lowerPolyvariantAffine(source,'commonjs',{
    seed:'repeatable',names:[]
  }),{code:source,functions:0,steps:0,paths:0,declined:0});
});

test('exported ES-module functions retain module shape and output',async()=>{
  const source=sourceFor(steps).replace('function protectedSum','export function protectedSum')
    .replace('module.exports=protectedSum;','');
  const encoded=lowerPolyvariantAffine(source,'module',{
    seed:'esm',names:['protectedSum'],variants:4
  });
  assert.equal(encoded.functions,1);
  const native=await import('data:text/javascript,'+encodeURIComponent(source));
  const transformed=await import('data:text/javascript,'+encodeURIComponent(encoded.code));
  for(const n of [-2147483648,-1,0,1,3,2147483647]) {
    assert.equal(transformed.protectedSum(n),native.protectedSum(n));
  }
});
