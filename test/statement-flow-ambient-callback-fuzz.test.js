'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {flattenStatementFlow}=require('../src/statement-flow');
const {recoverStatementFlow}=require('../sims/statement-flow-recover');

/**
 * Test a restricted but genuinely effectful native JS graph, including an
 * imported-style host API. The callback method is dynamically retrieved
 * through a getter; an explicit finally must run when a foreign iterator
 * throws, and a lexical function source is never observed.
 * @param {number} index
 * @returns {string}
 */
function source(index){
  const a=(index*41+7)%197;
  const b=(index*17+23)%127;
  return [
    'function f(input,host){',
    'var a=input|0;',
    'var b=(a^'+a+')|0;',
    'if(host.gate(a)){',
    "host.tick('yes');",
    'a=(a+host.step('+b+'))|0;',
    'if(host.fault(a)){throw host.makeError(a);}',
    '}else{',
    "host.tick('no');",
    'b=(b+host.step('+a+'))|0;',
    '}',
    'try{',
    'for(var item of host.items(a)){',
    'b=(b+item)|0;',
    "host.tick('iter');",
    '}',
    '}finally{',
    "host.tick('finally');",
    '}',
    'if(host.done(b)){',
    "host.tick('return');",
    'return (a+b)|0;',
    '}',
    'return host.finish(a,b);',
    '}'
  ].join('\n');
}

/**
 * @param {string} code
 * @returns {(input:unknown,host:Host)=>unknown}
 */
function load(code){
  const value=vm.runInNewContext(code+'\n;f;');
  return /** @type {(input:unknown,host:Host)=>unknown} */(value);
}

/**
 * @typedef {{
 *  gate:(value:number)=>boolean,
 *  tick:(value:string)=>void,
 *  step:(value:number)=>number,
 *  fault:(value:number)=>boolean,
 *  makeError:(value:number)=>Error,
 *  items:(value:number)=>Iterable<number>,
 *  done:(value:number)=>boolean,
 *  finish:(a:number,b:number)=>unknown
 * }} Host
 */

/**
 * Every program variant gets fresh, identical host state. A getter on gate
 * observes property retrieval order. Iterator.next may throw in a try/finally,
 * and a supplied object input may call host-observed valueOf.
 * @param {(value:unknown,host:Host)=>unknown} fn
 * @param {number} seed
 * @param {number} value
 * @param {boolean} objectArg
 * @returns {{kind:'return'|'throw',value:unknown,effects:string[]}}
 */
function observe(fn,seed,value,objectArg){
  /** @type {string[]} */
  const effects=[];
  let state=seed|0;
  /** @type {Host} */
  const host={
    gate(){return false;},
    tick(tag){effects.push('tick:'+tag);},
    step(x){
      effects.push('step:'+x);
      state=(state+x+1)|0;
      if((state&31)===7)throw new TypeError('foreign step');
      return (state^x)|0;
    },
    fault(x){effects.push('fault:'+x);return ((x^seed)&31)===5;},
    makeError(x){effects.push('make-error:'+x);return new RangeError('foreign fault '+x);},
    items(x){
      effects.push('items:'+x);
      let index=0;
      return {
        [Symbol.iterator](){
          effects.push('iterator');
          return {
            next(){
              effects.push('next:'+index);
              if((x+seed)%11===0 && index===1)
                throw new SyntaxError('foreign iterator');
              if(index>=3)return {done:true,value:undefined};
              const n=(x+seed+index++)&7;
              return {done:false,value:n};
            }
          };
        }
      };
    },
    done(x){effects.push('done:'+x);return ((x+seed)&3)===1;},
    finish(a,b){effects.push('finish:'+a+':'+b);return (a^b)|0;}
  };
  Object.defineProperty(host,'gate',{
    configurable:true,
    get(){
      effects.push('get-gate');
      return /** @param {number} x */ x=>{
        effects.push('gate:'+x);
        return ((x+seed)&1)===0;
      };
    }
  });
  const input=objectArg?{
    valueOf(){
      effects.push('coerce');
      return value;
    }
  }:value;
  try{
    return {kind:'return',value:fn(input,host),effects};
  }catch(error){
    const failure=/** @type {Error} */(error);
    return {kind:'throw',value:failure.name+': '+failure.message,effects};
  }
}

test('independent hostile-host callback and exceptional-iterator compatibility over compact native CFG',{
  timeout:120000
},()=>{
  let checked=0;
  let fused=0;
  for(let seed=0;seed<48;seed++){
    const text=source(seed);
    const plain=flattenStatementFlow(text,'commonjs',{
      seed:'ambient-'+seed,names:['f']
    });
    const compact=flattenStatementFlow(text,'commonjs',{
      seed:'ambient-'+seed,names:['f'],compactCases:true
    });
    assert.equal(plain.functions,1);
    assert.equal(compact.functions,1);
    const recovered=recoverStatementFlow(compact.code,'f');
    /** @param {string} input @returns {number} */
    const caseCount=input=>(input.match(/case\s+\d+:/gu)||[]).length;
    assert.ok(caseCount(compact.code)<=caseCount(plain.code));
    if(caseCount(compact.code)<caseCount(plain.code))fused++;
    const baseline=load(text);
    const alternatives=[load(plain.code),load(compact.code),load(recovered.code)];
    for(const input of [-2147483648,-127,-7,-1,-0,0,1,2,7,11,31,127,2147483647,
      NaN,Infinity,-Infinity]){
      for(const objectArg of [false,true]){
        const expected=observe(baseline,seed,input,objectArg);
        for(const alternative of alternatives){
          assert.deepEqual(observe(alternative,seed,input,objectArg),expected,
            'Effects/return/exception differ at graph '+seed+' for '+String(input));
          checked++;
        }
      }
    }
  }
  assert.equal(fused,48);
  assert.equal(checked,48*16*2*3);
});
