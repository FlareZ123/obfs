'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');
const {recoverPublicWasmExpression,extractPublicWasm}=
  require('../sims/wasm-i32-static-recover');

/** @param {string} code @returns {(...args:number[])=>number} */
function load(code) {
  /** @type {{exports:unknown}} */
  const module={exports:null};
  vm.runInNewContext(code,{module,globalThis},{timeout:3000});
  return /** @type {(...args:number[])=>number} */ (module.exports);
}

let seed=0x67c9b5a1;
/** @returns {number} */
function nextI32() {
  seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
  return seed|0;
}
const boundary=[-2147483648,-2147483647,-1,0,1,2,31,32,2147483647];

/** @type {{params:string,expr:string}[]} */
const samples=[
  {params:'a,b',expr:'((a-b)|0)'},
  {params:'a,b',expr:'((a-b)>>>0)'},
  {params:'a,b,c',expr:'(((a-b)-(c>>>0))|0)'},
  {params:'a,b,c,d',expr:'(((a-b)>>>(c-d))^a)'},
  {params:'a,b,c,d',expr:'((a?((b-c)|0):((b-d)|0))^d)'},
  {params:'a,b,c',expr:'(~((a-b)-c))'},
  {params:'a,b,c,d',expr:'(((a-b)-(c-d))&255)'},
  {params:'a,b,c,d',expr:'((a?b-c:d-b)>>>0)'}
];

test('bitwise-coerced subtraction preserves typed native outputs and remains statically recoverable',()=>{
  let variants=0,comparisons=0;
  for(const [index,fixture] of samples.entries()) {
    const source='function f('+fixture.params+'){return '+fixture.expr+';}module.exports=f;';
    const native=load(source),parameters=fixture.params.split(',');
    for(let nonce=0;nonce<8;nonce++) {
      const built=lowerWasmI32Functions(source,'commonjs',{
        names:['f'],seed:'coerced-subtraction-'+index+'-'+nonce,
        conditionalStrategy:nonce%2===0?'select':'if'
      });
      assert.equal(built.functions,1,fixture.expr);
      assert.equal(built.declined,0);
      assert.ok(extractPublicWasm(built.code).includes(0x6b),'Wasm i32.sub must be published');
      const wasm=load(built.code);
      const sourceOnly=recoverPublicWasmExpression(built.code,parameters);
      assert.ok(sourceOnly.expression.includes('-'),'Attacker must decode subtraction');
      const cloned=load('function f('+fixture.params+'){return '+
        sourceOnly.expression+';}module.exports=f;');
      for(let trial=0;trial<512;trial++) {
        const args=parameters.map((_,i)=>trial<boundary.length?
          boundary[(trial+i)%boundary.length]:nextI32());
        const expected=native(...args);
        assert.ok(Object.is(wasm(...args),expected),
          'native/Wasm '+index+'/'+nonce+'/'+trial);
        assert.ok(Object.is(cloned(...args),expected),
          'native/source-only-clone '+index+'/'+nonce+'/'+trial);
        comparisons++;
      }
      variants++;
    }
  }
  assert.equal(variants,64);
  assert.equal(comparisons,32768);
  console.log(JSON.stringify({subtractionVariants:variants,
    nativeWasmCloneComparisons:comparisons,seed:'0x67c9b5a1'}));
});

test('raw subtraction, uncoerced branches and subtraction used as conditional test decline',()=>{
  const rejected=[
    'a-b','a?(b-c):d','(a-b)?c:d','((a-b)?c:d)|0',
    '((a-b)?(c^d):(c&d))','(((a-b)?c:d)^a)',
    '((a-b)?(c+d):a)|0','((a-b)?c:d)>>>0',
    '((a-b)?c:d)&3','((a-b)*c)|0'
  ];
  for(const [index,expr] of rejected.entries()) {
    const source='function f(a,b,c,d){return '+expr+';}module.exports=f;';
    const out=lowerWasmI32Functions(source,'commonjs',{
      seed:'subtraction-declined-'+index,names:['f']
    });
    assert.equal(out.functions,0,expr);
    assert.equal(out.declined,1,expr);
    assert.equal(out.code,source,expr);
  }
  // A native numeric subtraction can be -2**32 (truthy), while Wasm wraps
  // it to i32 zero. The admission guard must not lower such branch tests.
  const a=-1,b=-1;
  assert.equal((a-(b>>>0))?1:0,1);
  assert.equal(((a-(b>>>0))|0)?1:0,0);
});

test('COO ESM and SNO CommonJS opt-in work for modular subtraction',async()=>{
  const expr='((a-b)-(c-d))|0';
  const esm='export function f(a,b,c,d){return '+expr+';}';
  const cjs='function f(a,b,c,d){return '+expr+';}module.exports=f;';
  const coo=obfuscateFiles([{path:'sub.mjs',sourceType:'module',code:esm}],{
    mode:'coo',seed:'coerced-sub-browser',strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'sub.mjs':['f']}
  });
  const sno=obfuscateFiles([{path:'sub.cjs',sourceType:'commonjs',code:cjs}],{
    mode:'sno',seed:'coerced-sub-server',strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'sub.cjs':['f']}
  });
  assert.equal(coo.files[0].metrics.wasmI32Functions,1);
  assert.equal(sno.files[0].metrics.wasmI32Functions,1);
  const originalEsm=await import('data:text/javascript;base64,'+Buffer.from(esm).toString('base64'));
  const transformedEsm=await import('data:text/javascript;base64,'+
    Buffer.from(String(coo.files[0].code)).toString('base64'));
  const originalCjs=load(cjs),transformedCjs=load(String(sno.files[0].code));
  for(let i=0;i<2048;i++) {
    const args=i<boundary.length?
      [boundary[i],boundary[(i+1)%boundary.length],
        boundary[(i+2)%boundary.length],boundary[(i+3)%boundary.length]]:
      [nextI32(),nextI32(),nextI32(),nextI32()];
    assert.ok(Object.is(transformedEsm.f(...args),originalEsm.f(...args)));
    assert.ok(Object.is(transformedCjs(...args),originalCjs(...args)));
  }
});


test('seeded nested subtractive bitvector grammar preserves native and independent clone',()=>{
  let state=0x14f3b627;
  /** @returns {number} */
  function rand() {
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return state>>>0;
  }
  const names=['a','b','c','d'];
  const constants=['0','1','-1','2147483647','-2147483648'];
  /** @returns {string} */
  function leaf() {
    return rand()%3===0?constants[rand()%constants.length]:
      names[rand()%names.length];
  }
  /**
   * Permit arithmetic only beneath a surrounding bitwise operation; a
   * ternary predicate has its own fresh no-arithmetic boundary.
   * @param {number} depth
   * @param {boolean} coerced
   * @returns {string}
   */
  function tree(depth,coerced) {
    if(depth===0)return leaf();
    const kind=rand()%12;
    if(coerced&&kind<=2) {
      const op=kind===0?'+':'-';
      return '('+tree(depth-1,true)+' '+op+' '+tree(depth-1,true)+')';
    }
    if(kind===3) {
      return '('+tree(depth-1,false)+'?'+
        tree(depth-1,coerced)+':'+tree(depth-1,coerced)+')';
    }
    if(kind===4)return '(~'+tree(depth-1,true)+')';
    const operators=['&','|','^','<<','>>','>>>'];
    return '('+tree(depth-1,true)+operators[rand()%operators.length]+
      tree(depth-1,true)+')';
  }
  let compiledTrees=0,comparisons=0;
  for(let sample=0;sample<72;sample++) {
    const expr='((a - b)^'+tree(2+(sample%3),true)+')';
    const source='function f(a,b,c,d){return '+expr+';}module.exports=f;';
    const native=load(source);
    for(const strategy of /** @type {('if'|'select')[]} */ (['if','select'])) {
      const result=lowerWasmI32Functions(source,'commonjs',{
        names:['f'],seed:'sub-fuzz-'+sample+'/'+strategy,conditionalStrategy:strategy
      });
      assert.equal(result.functions,1,'Unexpected decline '+expr);
      assert.ok(extractPublicWasm(result.code).includes(0x6b));
      const wasm=load(result.code);
      const recovered=recoverPublicWasmExpression(result.code,names);
      const cloned=load('function f(a,b,c,d){return '+
        recovered.expression+';}module.exports=f;');
      for(let trial=0;trial<96;trial++) {
        const args=names.map((_,i)=>trial<boundary.length?
          boundary[(trial+i)%boundary.length]:rand()|0);
        const expected=native(...args);
        assert.ok(Object.is(wasm(...args),expected),
          'Generated Wasm mismatch '+sample+'/'+strategy+'/'+trial);
        assert.ok(Object.is(cloned(...args),expected),
          'Source-only clone mismatch '+sample+'/'+strategy+'/'+trial);
        comparisons++;
      }
      compiledTrees++;
    }
  }
  assert.equal(compiledTrees,144);
  assert.equal(comparisons,13824);
  console.log(JSON.stringify({subtractiveTrees:72,sourceOnlyVariants:compiledTrees,
    typedComparisons:comparisons,fuzzSeed:'0x14f3b627'}));
});


test('all three core mode selections fail closed for uncoerced subtraction',()=>{
  const unsafe='function f(a,b){return a-b;}module.exports=f;';
  const safe='function f(a,b){return (a-b)|0;}module.exports=f;';
  for(const mode of /** @type {('coo'|'sco'|'sno')[]} */ (['coo','sco','sno'])) {
    const options={
      mode,seed:'wasm-sub-three-mode-'+mode,
      strings:false,properties:false,identifiers:false,
      experimentalWasmI32:{'kernel.cjs':['f']}
    };
    assert.throws(()=>obfuscateFiles([
      {path:'kernel.cjs',sourceType:'commonjs',code:unsafe}
    ],options),/Wasm i32 declined 1 explicitly selected function/u);
    const output=obfuscateFiles([
      {path:'kernel.cjs',sourceType:'commonjs',code:safe}
    ],options);
    assert.equal(output.files[0].metrics.wasmI32Functions,1,mode);
    const original=load(safe);
    const generated=load(String(output.files[0].code));
    for(const a of boundary)for(const b of boundary) {
      assert.ok(Object.is(original(a,b),generated(a,b)),
        mode+' typed signed Int32 output mismatch');
    }
  }
});

test('non-Int32 Number inputs remain outside the explicit backend contract',()=>{
  const source='function f(a,b){return (a-b)|0;}module.exports=f;';
  const result=lowerWasmI32Functions(source,'commonjs',{
    seed:'coerced-subtraction-untyped-refusal-scope',names:['f']
  });
  assert.equal(result.functions,1);
  const native=load(source),compiled=load(result.code);
  assert.equal(native(0.75,-0.75),1);
  assert.equal(compiled(0.75,-0.75),0);
  // Typed signed Int32 inputs, not arbitrary Number coercion, are promised.
});
