'use strict';

const acorn=require('acorn');
const {performance}=require('node:perf_hooks');

const targets=Object.freeze(['round1','round2','round3']);

/**
 * A hostile-client dynamic, output-only arithmetic reconstruction.
 *
 * The attacker loads the publicly distributed ESM and observes exactly one
 * call, f(0), per advertised exported numeric function. It commits to a
 * normalized signed-Int32 additive model before any held-out evaluation.
 * The private original source, obfuscator, random seed and static affine
 * decompiler are never read by this reconstruction function.
 *
 * This only tests a deliberately restricted affine grammar. A successful
 * three-probe clone makes no claim about arbitrary JavaScript functions.
 *
 * @typedef {{name:string,offset:number}} ProbedFunction
 * @typedef {{code:string,functions:ProbedFunction[],oracleCalls:number,
 *   attackMs:number,publishedBytes:number,reconstructedBytes:number}} Clone
 */

/**
 * @param {string} distributedMath
 * @returns {Promise<Clone>}
 */
async function reconstructFromRuntime(distributedMath){
  if(typeof distributedMath!=='string'||!distributedMath.trim())
    throw new TypeError('Expected nonempty publicly distributed ESM source');
  const started=performance.now();
  // A separate instrumented consumer could import the exact same bytes by
  // URL. data: avoids any dependency on original files or compiler modules.
  const published=await import('data:text/javascript;base64,'+
    Buffer.from(distributedMath,'utf8').toString('base64'));
  const ast=/** @type {import('../src/ast').AstNode} */ (acorn.parse(
    distributedMath,{sourceType:'module',ecmaVersion:'latest'}
  ));
  /** @type {{start:number,end:number,text:string}[]} */
  const edits=[];
  /** @type {ProbedFunction[]} */
  const functions=[];
  for(const name of targets){
    const matches=ast.body.filter(statement=>
      statement.type==='ExportNamedDeclaration'&&
      statement.declaration?.type==='FunctionDeclaration'&&
      statement.declaration.id?.name===name);
    if(matches.length!==1)
      throw new TypeError('Expected one direct public ESM function '+name);
    const declaration=matches[0].declaration;
    const parameter=declaration.params[0];
    if(declaration.params.length!==1||parameter.type!=='Identifier')
      throw new TypeError('Expected single-parameter public function '+name);
    const callable=published[name];
    if(typeof callable!=='function')
      throw new TypeError('Expected runnable public function '+name);
    // Exactly one observable function invocation is permitted here.
    const observed=callable(0);
    if(!Number.isInteger(observed)||observed<-2147483648||
       observed>2147483647)
      throw new TypeError('Public function is outside signed-Int32 family '+name);
    functions.push({name,offset:observed});
    edits.push({
      start:declaration.body.start,end:declaration.body.end,
      text:'{return (('+parameter.name+'|0)+'+observed+')|0;}'
    });
  }
  let code=distributedMath;
  for(const edit of edits.sort((a,b)=>b.start-a.start))
    code=code.slice(0,edit.start)+edit.text+code.slice(edit.end);
  acorn.parse(code,{sourceType:'module',ecmaVersion:'latest'});
  return {
    code,functions,oracleCalls:functions.length,
    attackMs:performance.now()-started,
    publishedBytes:Buffer.byteLength(distributedMath,'utf8'),
    reconstructedBytes:Buffer.byteLength(code,'utf8')
  };
}

module.exports={reconstructFromRuntime};
