'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const path=require('node:path');
const {transformSync}=require('esbuild');
const {layerXorFunctions}=require('../workplace/layered-mba');
const {cloneBitwiseBitSlice}=require('../sims/bitwise-bit-slice-clone');

const mathSource=[
  'function roundA(x,y){return (((x^y)&0x55aa00ff)^(x&~y))|0;}',
  'function roundB(x,y){return (((x^y)|(x&y))^((~x)&y))|0;}',
  'module.exports={roundA,roundB};'
].join('\n');
const engineSource=[
  'const math=require("./math.cjs");',
  'module.exports=function start(seed){',
  ' let state=seed|0;',
  ' return {step(a,b,emit){',
  '  const first=math.roundA(state^a,b);',
  '  const second=math.roundB(first,a^b);',
  '  state=(second^first)|0;',
  '  if(emit)emit(state,first,second);',
  '  return state;',
  ' }, current(){return state;}};',
  '};'
].join('\n');
const entrySource='module.exports=require("./engine.cjs");';

/**
 * Load a three-file group in a fresh Node VM realm with relative-only
 * CommonJS loader; all source-dependent modules are actual separate files.
 *
 * @param {Record<string,string>} files
 * @param {string} filename
 * @returns {unknown}
 */
function loadFile(files,filename){
  const realm=vm.createContext({});
  /** @type {Map<string,{exports:unknown}>} */
  const cache=new Map();
  /** @param {string} name @returns {unknown} */
  function local(name){
    const found=cache.get(name);
    if(found)return found.exports;
    const source=files[name];
    if(typeof source!=='string')throw new Error('Unknown file '+name);
    const module={exports:{}};
    cache.set(name,module);
    /** @type {(require:(specifier:string)=>unknown,module:{exports:unknown},exports:unknown)=>void} */
    const run=vm.runInContext('(function(require,module,exports){\n'+source+
      '\n})',realm,{timeout:3000});
    /** @param {string} requested @returns {unknown} */
    const requireLocal=requested=>{
      if(!requested.startsWith('./'))throw new Error('Nonrelative module denied');
      return local(path.posix.normalize(path.posix.join(path.posix.dirname(name),requested)));
    };
    run(requireLocal,module,module.exports);
    return module.exports;
  }
  return local(filename);
}

/**
 * Public-only four-corner oracle attack: synthesize a *standalone JavaScript
 * source module* with the four observed signed32 response masks per function.
 * Do not import the attacker's interpolation helper or original source in
 * the emitted replacement. The source is independent of the defender seed.
 *
 * @param {{roundA:(x:number,y:number)=>number,
 *   roundB:(x:number,y:number)=>number}} oracle
 * @returns {{code:string,queries:number}}
 */
function recoverModule(oracle){
  let queries=0;
  /** @type {string[]} */
  const fragments=[];
  for(const name of /** @type {const} */(['roundA','roundB'])){
    const learned=cloneBitwiseBitSlice((x,y)=>{
      queries++;
      return oracle[name](x,y);
    },2);
    const masks=learned.masks;
    fragments.push('function '+name+'(x,y){return ('+
      '('+masks[0]+'&~x&~y)|'+
      '('+masks[1]+'&x&~y)|'+
      '('+masks[2]+'&~x&y)|'+
      '('+masks[3]+'&x&y))|0;}');
  }
  fragments.push('module.exports={roundA,roundB};');
  return {code:fragments.join('\n'),queries};
}

/** @param {string} math @returns {Record<string,string>} */
function graph(math){
  return {'entry.cjs':entrySource,'engine.cjs':engineSource,'math.cjs':math};
}

/**
 * Exercise stateful engine and external callbacks; no other module's source
 * is changed by the attacker. Reuse 3 file graph but initialize fresh state
 * for each independent test workload.
 * @param {Record<string,string>} files
 * @param {number} count
 * @returns {string}
 */
function exercise(files,count){
  /** @type {(seed:number)=>{step:(a:number,b:number,emit:(state:number,first:number,second:number)=>void)=>number,current:()=>number}} */
  const start=/** @type {any} */(loadFile(files,'entry.cjs'));
  const engine=start(0x13579bdf);
  /** @type {number[][]} */
  const trace=[];
  for(let i=0;i<count;i++){
    const a=(Math.imul(i+1,1103515245)^0x7f3a92b1)|0;
    const b=(Math.imul(i+7,1664525)^0x53bc120f)|0;
    const output=engine.step(a,b,(state,first,second)=>trace.push([state,first,second]));
    trace.push([output,engine.current()]);
  }
  return JSON.stringify(trace);
}

test('real multi-file stateful graph is cloned offline using 8 calls for two bitwise exports',{
  timeout:60000
},()=>{
  const minified=transformSync(mathSource,{
    format:'cjs',loader:'js',target:'node22',minify:true,legalComments:'none'
  }).code;
  const original=graph(mathSource);
  const control=graph(minified);
  let compared=0,queryCalls=0;
  for(let seed=0;seed<20;seed++){
    const protectedMath=layerXorFunctions(mathSource,{
      sourceType:'commonjs',names:['roundA','roundB'],
      seed:'interfile-mba-source-blind-'+seed
    });
    assert.equal(protectedMath.rewrites,2,
      'Both selected functions must be genuinely transformed');
    const candidate=graph(protectedMath.code);
    /** @type {{roundA:(x:number,y:number)=>number,
     * roundB:(x:number,y:number)=>number}} */
    const candidateOracle=/** @type {any} */(loadFile(candidate,'math.cjs'));
    /** @type {typeof candidateOracle} */
    const controlOracle=/** @type {any} */(loadFile(control,'math.cjs'));
    const attackedCandidate=recoverModule(candidateOracle);
    const attackedMinifier=recoverModule(controlOracle);
    assert.equal(attackedCandidate.queries,8);
    assert.equal(attackedMinifier.queries,8);
    assert.doesNotMatch(attackedCandidate.code,/require\s*\(/u,
      'Offline cloned math must not depend on the original artifact or oracle');
    const offline=graph(attackedCandidate.code);
    const offlineMinifier=graph(attackedMinifier.code);
    queryCalls+=attackedCandidate.queries+attackedMinifier.queries;
    for(const count of [1,128,1024]){
      const expected=exercise(original,count);
      for(const files of [candidate,control,offline,offlineMinifier]){
        assert.equal(exercise(files,count),expected,
          'Offline source-only math replacement failed for '+seed+'/'+count);
        compared++;
      }
    }
  }
  assert.equal(queryCalls,320);
  assert.equal(compared,20*3*4);
});
