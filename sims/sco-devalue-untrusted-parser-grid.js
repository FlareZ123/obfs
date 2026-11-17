'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');

/**
 * Bounded, deterministic malformed-wire study for the *experimental* codec.
 * This does not connect to a server or modify SCO production RPC admission.
 *
 * @typedef {{name:string,wire:string}} Case
 */

/** @param {number} depth @returns {string} */
function nestedReferences(depth){
  const rows=Array.from({length:depth+1},(_,index)=>
    index===depth?'bottom':[index+1]);
  return JSON.stringify(rows);
}

/** @param {number} seed @returns {()=>number} */
function seededGenerator(seed){
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/**
 * @param {string} source
 * @param {()=>number} random
 * @returns {string}
 */
function mutate(source,random){
  const first=random()%source.length;
  const ops=['0','1','{','}','[',']','"',':',',','-','a','n','u','l',' '];
  return source.slice(0,first)+ops[random()%ops.length]+source.slice(first+1);
}

/** @returns {Promise<object>} */
async function run(){
  const {parse,stringify}=await import('devalue');
  const sentinel='__obfsDevalueParserProbe';
  let constructorInvocations=0;
  class HarmlessProbe{
    /** @param {unknown} value */
    constructor(value){void value;constructorInvocations++;}
  }
  Object.defineProperty(globalThis,sentinel,{value:HarmlessProbe,configurable:true});

  const base=stringify({
    items:[{safe:true},[1,2,3],new Map([['k',12]])],
    literal:'__proto__',empty:null
  });
  /** @type {Case[]} */
  const cases=[
    {name:'valid-ground-truth',wire:base},
    {name:'unknown-ambient-tag',wire:'[["__obfsDevalueParserProbe",1],"x"]'},
    {name:'object-prototype-key',wire:'[{"__proto__":1},"pollution"]'},
    {name:'null-object-prototype-key',wire:'[["null","__proto__",1],"pollution"]'},
    {name:'constructor-key-own',wire:'[{"constructor":1},"own"]'},
    {name:'bad-index',wire:'[[999999]]'},
    {name:'short-buffer-type',wire:'[["Uint8Array",1,0,1000000000],["ArrayBuffer","AA=="]]'},
    {name:'oversized-sparse-length',wire:'[[-2,4294967295,0,1],"first"]'},
    {name:'nested-ref-depth-64',wire:nestedReferences(64)},
    {name:'nested-ref-depth-1024',wire:nestedReferences(1024)},
    {name:'nested-ref-depth-4096',wire:nestedReferences(4096)}
  ];
  const random=seededGenerator(0xC0FFEE);
  for(let i=0;i<256;i++)cases.push({
    name:'seeded-mutant-'+i,
    wire:mutate(base,random)
  });

  /** @type {{name:string,bytes:number,ms:number,accepted:boolean,error?:string}[]} */
  const observations=[];
  try{
    for(const scenario of cases){
      assert.ok(Buffer.byteLength(scenario.wire,'utf8')<=65536,
        'Case exceeds real HTTP sized-profile cap: '+scenario.name);
      const started=performance.now();
      let accepted=false,error;
      try{
        const parsed=parse(scenario.wire);
        accepted=true;
        void parsed;
      }catch(reason){
        error=reason instanceof Error?reason.name:'non-Error thrown';
      }
      observations.push({
        name:scenario.name,bytes:Buffer.byteLength(scenario.wire,'utf8'),
        ms:performance.now()-started,accepted,...error?{error}:{}
      });
      assert.equal(constructorInvocations,0,
        'Untrusted tag must not call ambient constructor');
      assert.equal(Object.hasOwn(Object.prototype,'__obfsDevalueParserProbe'),false);
    }
    assert.equal(observations[0].accepted,true);
    assert.equal(observations[1].accepted,false);
    assert.equal(observations[2].accepted,false);
    assert.equal(observations[3].accepted,false);

    const sorted=observations.slice().sort((a,b)=>b.ms-a.ms);
    return {
      candidate:'devalue@6.0.3',platform:process.platform,node:process.version,
      seed:0xC0FFEE,count:observations.length,
      accepted:observations.filter(x=>x.accepted).length,
      refused:observations.filter(x=>!x.accepted).length,
      harmlessAmbientConstructorInvocations:constructorInvocations,
      maxElapsedMs:sorted[0].ms,maxElapsedCase:sorted[0].name,
      topSlowest:sorted.slice(0,12),
      targeted:observations.slice(0,11),
      contract:'bounded deterministic local malformed-wire probe only; no general security approval'
    };
  }finally{
    Reflect.deleteProperty(globalThis,sentinel);
  }
}

if(require.main===module)run().then(value=>{
  process.stdout.write('SCO_DEVALUE_PARSE_GRID '+JSON.stringify(value)+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports={run,mutate,nestedReferences,seededGenerator};
