'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const acorn=require('acorn');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');

const root=path.join(__dirname,'../examples/polyvariant-app');
const files=['math.mjs','state.mjs','entry.mjs'];
const targets=Object.freeze(['round1','round2','round3']);

/** @typedef {{path:string,code:string}[]} Graph */
/** @typedef {{kind:string,payload:string}[]} Events */

/**
 * Adversary hypothesis: each exported function is a modular signed Int32
 * translation of its input. ONE zero-input oracle response identifies the
 * additive constant conditional on this restricted hypothesis. No original
 * source or obfuscator implementation enters this inference.
 *
 * The public module's residual digest function and import interface stay
 * intact; only the three public function declarations are replaced.
 *
 * @param {string} publicSource Distributed math.mjs text.
 * @param {Record<string,number>} zeroResponses Oracle replies at x=0.
 * @returns {string}
 */
function synthesizeTranslationClone(publicSource,zeroResponses){
  const ast=acorn.parse(publicSource,{ecmaVersion:'latest',sourceType:'module'});
  /** @type {{start:number,end:number,text:string}[]} */
  const replacements=[];
  for(const name of targets){
    const statement=ast.body.find(item=>
      item.type==='ExportNamedDeclaration' &&
      item.declaration?.type==='FunctionDeclaration' &&
      item.declaration.id?.name===name
    );
    const value=zeroResponses[name];
    if(!statement || !Number.isInteger(value) || (value|0)!==value){
      throw new TypeError('Expected public named function and signed Int32 oracle response: '+name);
    }
    replacements.push({start:statement.start,end:statement.end,
      text:'export function '+name+'(input){return (((input|0)+('+value+'))|0);}'});
  }
  let code=publicSource;
  for(const item of replacements.sort((a,b)=>b.start-a.start)){
    code=code.slice(0,item.start)+item.text+code.slice(item.end);
  }
  acorn.parse(code,{ecmaVersion:'latest',sourceType:'module'});
  return code;
}

/**
 * A second, weaker structural assumption: each selected Int32 leaf is
 * f(x) = a*x+b modulo 2^32. Two chosen inputs, x=0 and x=1, identify the
 * coefficients. This attack does not assume in advance that a=1.
 *
 * The result is conditioned on the affine model, which must be tested on
 * held-out inputs; arbitrary nonlinear code can agree at both query points.
 *
 * @param {string} publicSource
 * @param {Record<string,{atZero:number,atOne:number}>} responses
 * @returns {string}
 */
function synthesizeAffineClone(publicSource,responses){
  const ast=acorn.parse(publicSource,{ecmaVersion:'latest',sourceType:'module'});
  /** @type {{start:number,end:number,text:string}[]} */
  const replacements=[];
  for(const name of targets){
    const statement=ast.body.find(item=>
      item.type==='ExportNamedDeclaration'&&
      item.declaration?.type==='FunctionDeclaration'&&
      item.declaration.id?.name===name
    );
    const pair=responses[name];
    if(!statement||!pair||
       !Number.isInteger(pair.atZero)||(pair.atZero|0)!==pair.atZero||
       !Number.isInteger(pair.atOne)||(pair.atOne|0)!==pair.atOne){
      throw new TypeError('Expected public function and two signed Int32 oracle responses: '+name);
    }
    const slope=(pair.atOne-pair.atZero)|0;
    replacements.push({
      start:statement.start,end:statement.end,
      text:'export function '+name+'(input){return ((Math.imul((input|0),('+slope+'))+('+pair.atZero+'))|0);}'
    });
  }
  let code=publicSource;
  for(const item of replacements.sort((a,b)=>b.start-a.start)){
    code=code.slice(0,item.start)+item.text+code.slice(item.end);
  }
  acorn.parse(code,{ecmaVersion:'latest',sourceType:'module'});
  return code;
}

/**
 * Recover a distinct arithmetic-progression model for each parity class.
 * Write x=2*t+r for r in {0,1}; if the function is affine in t within
 * each residue class, samples f(r) and f(r+2) recover its base and step.
 * These steps can be any signed Int32, including odd values that no single
 * globally affine Int32 expression could produce between x and x+2.
 *
 * @typedef {{atZero:number,atOne:number,atTwo:number,atThree:number}} ParitySamples
 * @param {string} publicSource
 * @param {Record<string,ParitySamples>} responses
 * @returns {string}
 */
function synthesizeParityAffineClone(publicSource,responses){
  const ast=acorn.parse(publicSource,{ecmaVersion:'latest',sourceType:'module'});
  /** @type {{start:number,end:number,text:string}[]} */
  const replacements=[];
  for(const name of targets){
    const statement=ast.body.find(item=>
      item.type==='ExportNamedDeclaration'&&
      item.declaration?.type==='FunctionDeclaration'&&
      item.declaration.id?.name===name
    );
    const values=responses[name];
    if(!statement||!values||
       [values.atZero,values.atOne,values.atTwo,values.atThree].some(
         value=>!Number.isInteger(value)||(value|0)!==value
       )){
      throw new TypeError('Expected four signed Int32 parity oracle responses: '+name);
    }
    const evenStep=(values.atTwo-values.atZero)|0;
    const oddStep=(values.atThree-values.atOne)|0;
    const evenBase=values.atZero;
    const oddBase=values.atOne;
    const text='export function '+name+'(input){const x=input|0;'+
      'const step=(x&1)?('+oddStep+'):('+evenStep+');'+
      'const base=(x&1)?('+oddBase+'):('+evenBase+');'+
      'return ((Math.imul(x>>1,step)+base)|0);}';
    replacements.push({start:statement.start,end:statement.end,text});
  }
  let code=publicSource;
  for(const edit of replacements.sort((a,b)=>b.start-a.start)){
    code=code.slice(0,edit.start)+edit.text+code.slice(edit.end);
  }
  acorn.parse(code,{ecmaVersion:'latest',sourceType:'module'});
  return code;
}

/** @param {string} variant @returns {Promise<Graph>} */
async function readGraph(variant){
  return Promise.all(files.map(async name=>({
    path:name,code:await fs.readFile(path.join(root,variant,name),'utf8')
  })));
}

/** @param {string} destination @param {Graph} graph @returns {Promise<void>} */
async function materialize(destination,graph){
  for(const file of graph)await atomicWrite(path.join(destination,file.path),file.code);
}

/** @param {string} location @returns {Promise<any>} */
function loadModule(location){
  return import(pathToFileURL(path.join(location,'math.mjs')).href);
}

/** @param {number} count @returns {Events} */
function records(count){
  return Array.from({length:count},(_,i)=>({
    kind:['start','tick','pause','stop'][i%4],
    payload:'event-'+i+(i%7===0?'終':'')+(i%13===0?'🧪':'')
  }));
}

/**
 * Demonstrate exact cloning of a genuinely published three-file COO graph
 * using three live oracle calls and one explicit low-dimensional hypothesis.
 * The original is read only AFTER the cloned source has been constructed.
 *
 * @returns {Promise<{
 *   oracleCalls:number,offsets:Record<string,number>,
 *   heldoutFunctionComparisons:number,fullApplicationScenarios:number,
 *   fullApplicationEvents:number,nonlinearNegativeControl:boolean,
 *   originalGraphUsedForInference:boolean,attackMs:number,
 *   affineOracleCalls:number,affineSlopes:Record<string,number>,
 *   affineHeldoutFunctionComparisons:number,affineNonlinearNegativeControl:boolean,
 *   publishedBytes:number,nativeBytes:number,
 *   parityOracleCalls:number,parityHeldoutFunctionComparisons:number,
 *   parityNonlinearNegativeControl:boolean
 * }>}
 */
async function runAttack(){
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-blackbox-translation-'));
  try{
    const distributed=await readGraph('generated');
    // A positive control on the actual checked-in obfuscated artifact.
    // Refuse an accidentally unprotected or native-equivalent math input.
    assert.match(distributed[0].code,/_ap_input_[0-9a-f]{14}/u);
    assert.match(distributed[0].code,/_af_[0-9a-f]{14}/u);
    const publishedBytes=Buffer.byteLength(distributed[0].code);
    const publishedDir=path.join(temporary,'published');
    await materialize(publishedDir,distributed);
    const publishedMath=await loadModule(publishedDir);
    const start=performance.now();
    /** @type {Record<string,number>} */
    const offsets=Object.create(null);
    for(const name of targets){
      assert.equal(typeof publishedMath[name],'function');
      offsets[name]=publishedMath[name](0);
    }
    const cloneSource=synthesizeTranslationClone(distributed[0].code,offsets);
    const attackMs=performance.now()-start;
    /** @type {Record<string,{atZero:number,atOne:number}>} */
    const affineResponses=Object.create(null);
    /** @type {Record<string,number>} */
    const affineSlopes=Object.create(null);
    for(const name of targets){
      const atOne=publishedMath[name](1);
      affineResponses[name]={atZero:offsets[name],atOne};
      affineSlopes[name]=(atOne-offsets[name])|0;
    }
    const affineSource=synthesizeAffineClone(distributed[0].code,affineResponses);
    /** @type {Record<string,ParitySamples>} */
    const parityResponses=Object.create(null);
    for(const name of targets){
      parityResponses[name]={
        atZero:offsets[name],atOne:affineResponses[name].atOne,
        atTwo:publishedMath[name](2),atThree:publishedMath[name](3)
      };
    }
    const paritySource=synthesizeParityAffineClone(distributed[0].code,parityResponses);


    const cloned=distributed.map(file=>file.path==='math.mjs'?
      {...file,code:cloneSource}:file);
    const cloneDir=path.join(temporary,'clone');
    await materialize(cloneDir,cloned);
    const clonedMath=await loadModule(cloneDir);
    const affineCloned=distributed.map(file=>file.path==='math.mjs'?
      {...file,code:affineSource}:file);
    const affineDir=path.join(temporary,'affine-clone');
    await materialize(affineDir,affineCloned);
    const affineMath=await loadModule(affineDir);
    const parityCloned=distributed.map(file=>file.path==='math.mjs'?
      {...file,code:paritySource}:file);
    const parityDir=path.join(temporary,'parity-clone');
    await materialize(parityDir,parityCloned);
    const parityMath=await loadModule(parityDir);

    // This is a validation oracle, deliberately introduced after attack
    // synthesis. Neither native bytes nor original functions identify offsets.
    const original=await readGraph('native');
    const nativeBytes=Buffer.byteLength(original[0].code);
    assert.notEqual(original[0].code,distributed[0].code);
    assert.ok(publishedBytes>nativeBytes,'Published math must be substantially transformed');
    const nativeDir=path.join(temporary,'native');
    await materialize(nativeDir,original);
    const originalMath=await loadModule(nativeDir);
    let heldoutFunctionComparisons=0;
    let affineHeldoutFunctionComparisons=0;
    let parityHeldoutFunctionComparisons=0;
    for(const name of targets){
      for(let i=0;i<4096;i++){
        const input=i<7?
          [-2147483648,-1,0,1,2147483647,0x12345678|0,-0x12345678|0][i]:
          Math.imul(i^0x5ac31eed,0x9e3779b1)|0;
        assert.ok(Object.is(publishedMath[name](input),clonedMath[name](input)),
          'Public-oracle translation clone disagrees at '+name+'/'+i);
        assert.ok(Object.is(originalMath[name](input),clonedMath[name](input)),
          'Held-out original disagrees at '+name+'/'+i);
        heldoutFunctionComparisons++;
        assert.ok(Object.is(publishedMath[name](input),affineMath[name](input)),
          'Public-oracle affine clone disagrees at '+name+'/'+i);
        assert.ok(Object.is(originalMath[name](input),affineMath[name](input)),
          'Held-out affine original disagrees at '+name+'/'+i);
        affineHeldoutFunctionComparisons++;
        assert.ok(Object.is(publishedMath[name](input),parityMath[name](input)),
          'Public-oracle parity-affine clone disagrees at '+name+'/'+i);
        assert.ok(Object.is(originalMath[name](input),parityMath[name](input)),
          'Held-out parity-affine original disagrees at '+name+'/'+i);
        parityHeldoutFunctionComparisons++;
      }
    }

    const apps=await Promise.all(
      [nativeDir,publishedDir,cloneDir,affineDir,parityDir].map(location=>
        import(pathToFileURL(path.join(location,'entry.mjs')).href)
      )
    );
    let fullApplicationScenarios=0;
    let fullApplicationEvents=0;
    for(const count of [1,50,1000]){
      const inputs=records(count);
      const outputs=apps.map(app=>{
        /** @type {unknown[]} */
        const trace=[];
        const output=app.runScenario(-817,inputs,{
          /** @param {unknown} value */
          emit(value){trace.push(value);}
        });
        return {output,trace:JSON.stringify(trace)};
      });
      for(const result of outputs.slice(1)){
        assert.equal(result.output,outputs[0].output);
        assert.equal(result.trace,outputs[0].trace);
      }
      fullApplicationScenarios+=outputs.length;
      fullApplicationEvents+=inputs.length*outputs.length;
    }

    // Explicit falsifying control: the one-query attack is conditional on
    // its translation hypothesis. A nonlinear leaf shares the zero response
    // but is NOT cloned correctly at another input.
    const nonlinear=/** @param {number} x */ x=>(((x|0)+9)^x)|0;
    const guessed=/** @param {number} x */ x=>((x|0)+nonlinear(0))|0;
    const nonlinearNegativeControl=nonlinear(1)!==guessed(1);
    assert.ok(nonlinearNegativeControl);
    // A quadratic agrees with the affine interpolant at x=0 and x=1
    // and diverges at x=2, proving the two-query affine model is bounded.
    const quadratic=/** @param {number} x */ x=>((Math.imul(x|0,x|0)+9)|0);
    const linearGuess=/** @param {number} x */ x=>((x|0)+9)|0;
    const affineNonlinearNegativeControl=
      quadratic(0)===linearGuess(0)&&quadratic(1)===linearGuess(1)&&
      quadratic(2)!==linearGuess(2);
    assert.ok(affineNonlinearNegativeControl);
    const parityNonlinearNegativeControl=(
      // For f(x)=x*x, 0 and 2 imply an even-class step of 4;
      // at x=4 the model predicts 8 and the quadratic returns 16.
      Math.imul(2,((4-0)|0))!==Math.imul(4,4)
    );
    assert.ok(parityNonlinearNegativeControl);


    return {
      oracleCalls:targets.length,offsets,heldoutFunctionComparisons,
      fullApplicationScenarios,fullApplicationEvents,
      nonlinearNegativeControl,originalGraphUsedForInference:false,attackMs,
      affineOracleCalls:targets.length*2,affineSlopes,
      affineHeldoutFunctionComparisons,affineNonlinearNegativeControl,publishedBytes,nativeBytes,
      parityOracleCalls:targets.length*4,parityHeldoutFunctionComparisons,
      parityNonlinearNegativeControl
    };
  }finally{
    await fs.rm(temporary,{recursive:true,force:true});
  }
}

if(require.main===module){
  runAttack().then(result=>{
    process.stdout.write('COO_BLACKBOX_TRANSLATION '+JSON.stringify(result)+'\n');
  }).catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runAttack,synthesizeTranslationClone,synthesizeAffineClone,synthesizeParityAffineClone};
