'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {flattenStatementFlow}=require('../src/statement-flow');
const {recoverStatementFlow}=require('../sims/statement-flow-recover');

/** @param {string} source @returns {Function} */
function load(source){
  return /** @type {Function} */ (vm.runInNewContext(source+'\n;f;'));
}

/** @param {string} source @param {any} value @returns {{status:string,value:unknown,events:string[]}} */
function run(source,value){
  const events=[];
  const input={
    get flag(){events.push('flag');return value.flag;},
    valueOf(){events.push('valueOf');return value.value;},
    toString(){events.push('toString');return String(value.value);}
  };
  try{return {status:'return',value:load(source)(input),events};}
  catch(error){return {status:'throw',value:/** @type {Error} */(error).name+': '+/** @type {Error} */(error).message,events};}
}

const cases=[
  'function f(x){var a=x.valueOf();if(x.flag){a+=12;}else{a-=5;}return a;}',
  'function f(x){var a=0;if(x.flag){var y=x.valueOf();a=y+2;}else{a=x.valueOf()-4;}return [a,typeof y].join(":");}',
  'function f(x){"use strict";var out=x.valueOf();if(x.flag){out+=3;}else if(out>5){out-=4;}else{out*=2;}return out;}',
  'function f(x){var a=x.valueOf();if(x.flag){a++;if(a>10){a+=8;}}else{a-=9;}return function(){return a;};}',
  'function f(x){var a=0;if(x.flag){a=x.valueOf();return "Boom "+a;}else{a=x.valueOf();}return a;}',
  'function f(x){var a=x.valueOf();if(x.flag){a=a/2;}else{a=a*3;}return a;}'
];

test('multi-statement native CFG preserves branch side effects and return behavior',()=>{
  const values=[{value:-8,flag:false},{value:4,flag:true},{value:11,flag:true},
    {value:Infinity,flag:false},{value:NaN,flag:true},{value:0,flag:false}];
  for(let index=0;index<cases.length;index++){
    const original=cases[index];
    const generated=flattenStatementFlow(original,'commonjs',{
      seed:'statement-flow-differential-20261116',names:['f']
    });
    assert.equal(generated.functions,1,original);
    assert.ok(generated.blocks>=4);
    assert.doesNotMatch(generated.code,/case 0:/u);
    assert.ok(generated.code.includes('switch('));
    for(const value of values){
      const a=run(original,value),b=run(generated.code,value);
      if(typeof a.value==='function'&&typeof b.value==='function'){
        assert.equal(a.value(),b.value());
        assert.deepEqual(a.events,b.events);
      }else assert.deepEqual(b,a,JSON.stringify({original,value}));
    }
  }
});

test('seedless attacker reconstructs executable source from every randomized state layout',()=>{
  const original='function f(x){var a=x*3;if(a>50){a-=9;}else if(a>10){a+=7;}else{a^=12;}return a;}';
  for(let index=0;index<16;index++){
    const generated=flattenStatementFlow(original,'commonjs',{
      seed:'variant-'+index,names:['f']
    });
    assert.equal(generated.functions,1);
    const recovered=recoverStatementFlow(generated.code,'f');
    assert.ok(recovered.blocks>=5);
    const native=load(original),actual=load(generated.code),clone=load(recovered.code);
    for(let x=-50;x<=50;x++){
      assert.equal(actual(x),native(x));
      assert.equal(clone(x),native(x),'Reconstruction failed at '+x);
    }
  }
});

test('opt-in native CFG declines lexical declarations, unsupported control and source inspection',()=>{
  for(const code of [
    'function f(x){let y=x;if(y)y++;return y;}',
    'function f(x){const y=x;if(y)return 1;return y;}',
    'function f(x){var a=x;while(a>1)a--;if(a)return 2;return a;}',
    'function f(x){var a=x;try{if(a)return 1;}finally{a++;}return a;}',
    'function f(x){var a=x;for(var i=0;i<3;i++)a++;if(a)return 1;return a;}',
    'function f(x){var a=x; if(a) eval("a=3");else a=1;return a;}',
    'async function f(x){var a=await x;if(a)return 1;return 0;}',
    'function* f(x){var a=x;if(a)yield 1;return 0;}',
    'function f(x){var a=x;if(a)a++;return a;} String(f);'
  ]){
    const compiled=flattenStatementFlow(code,'commonjs',{seed:'decline',names:['f']});
    assert.equal(compiled.functions,0,code);
    assert.equal(compiled.code,code);
  }
  assert.throws(()=>flattenStatementFlow('','script',{seed:'x',names:['f']}),/Expected source/);
});

test('ES module function declaration can be transformed with imports untouched',()=>{
  const code='import {helper} from "./helper.mjs";\nexport function f(x){var a=helper(x);if(a>7){a++;}else{a--;}return a;}';
  const generated=flattenStatementFlow(code,'module',{seed:'esm',names:['f']});
  assert.equal(generated.functions,1);
  assert.ok(generated.code.startsWith('import {helper} from "./helper.mjs";'));
  const recovered=recoverStatementFlow(generated.code,'f','module');
  assert.ok(recovered.code.startsWith('export function f('));
});

test('programmatic COO/SNO flow backend retains CommonJS public interface and external calls',()=>{
  const original=[
    "'use strict';",
    'function f(value,notify){var score=value*3;if(score>12){notify("high");score-=5;}else{notify("low");score+=7;}return score;}',
    'module.exports={f};'
  ].join('\n');
  const {obfuscateFiles}=require('../src');
  for(const mode of ['coo','sno']){
    const transformed=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:original
    }],{
      mode,seed:'statement-integrated-20261116',
      experimentalStatementFlow:{'entry.cjs':['f']},
      strings:false,properties:false,identifiers:false
    });
    assert.equal(transformed.files[0].metrics.statementFlowFunctions,1);
    assert.ok((transformed.files[0].metrics.statementFlowBlocks??0)>=5);
    assert.ok(String(transformed.files[0].code).includes('switch('));
    const {createRequire}=require('node:module');
    const Module=require('node:module');
    const compile=source=>{
      const entry=new Module('/virtual/entry.cjs');
      entry.filename='/virtual/entry.cjs';
      entry.paths=Module._nodeModulePaths('/virtual');
      entry._compile(source,entry.filename);
      return entry.exports.f;
    };
    const native=compile(original),encoded=compile(String(transformed.files[0].code));
    for(let value=-128;value<=128;value++){
      const a=[],b=[];
      assert.equal(encoded(value,x=>b.push(x)),native(value,x=>a.push(x)));
      assert.deepEqual(b,a);
    }
  }
});

test('explicitly selected statement flow refuses unsupported source and backend overlap',()=>{
  const {obfuscateFiles}=require('../src');
  const input=[{path:'entry.cjs',sourceType:'commonjs',
    code:'function f(x){const v=x;if(v)return 1;return 0;}module.exports={f};'}];
  const eligible=[{path:'entry.cjs',sourceType:'commonjs',
    code:'function f(x){var a=x;if(a){a++;}else{a--;}return a;}module.exports={f};'}];
  assert.throws(()=>obfuscateFiles(input,{
    mode:'sno',experimentalStatementFlow:{'entry.cjs':['f']}
  }),/Statement flow declined/);
  assert.throws(()=>obfuscateFiles([{path:'entry.js',sourceType:'script',
    code:'function f(x){var v=x;if(v)return 1;return 0;}'}],{
    mode:'coo',experimentalStatementFlow:{'entry.js':['f']}
  }),/Statement flow requires a module\/CommonJS/);
  assert.throws(()=>obfuscateFiles(eligible,{
    mode:'sno',
    experimentalStatementFlow:{'entry.cjs':['f']},
    experimentalWasmI32:{'entry.cjs':['f']}
  }),/multiple experimental backends/);
});

test('CLI parses the opt-in statement-flow selector with an exact per-file target',()=>{
  const {readArgs}=require('../src/cli');
  const args=readArgs(['--root','source','--entry','entry.cjs',
    '--statement-flow','entry.cjs:f','--statement-flow','deep/task.cjs:task']);
  assert.deepEqual(args.experimentalStatementFlow,{
    'entry.cjs':['f'],'deep/task.cjs':['task']
  });
  assert.throws(()=>readArgs(['--root','source','--entry','entry.cjs',
    '--statement-flow','f']),/relative-file:functionName/);
});
