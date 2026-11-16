'use strict';

const acorn=require('acorn');
const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {recover}=require('./polyvariant-affine-static-recover');

/** @typedef {{name:string,paths:number,offset:number}} RecoveredFunction */
/** @typedef {{start:number,end:number,text:string}} SourceEdit */

const names=Object.freeze(['round1','round2','round3']);

/**
 * Rebuild the frozen application's actual protected math module using only
 * its distributed source. The imported recoverer is an independent
 * source-only AST interpreter, with no compiler internals or original source.
 * Residual, unprotected digest logic is copied verbatim from public bytes.
 *
 * @param {string} distributedMath
 * @returns {{code:string,functions:RecoveredFunction[],publishedBytes:number,reconstructedBytes:number,attackMs:number}}
 */
function reconstructPublicMath(distributedMath) {
  const started=performance.now();
  const ast=acorn.parse(distributedMath,{sourceType:'module',ecmaVersion:'latest'});
  /** @type {SourceEdit[]} */
  const edits=[];
  /** @type {RecoveredFunction[]} */
  const functions=[];
  for(const name of names) {
    const wrapper=ast.body.find(statement=>
      statement.type==='ExportNamedDeclaration'&&
      statement.declaration?.type==='FunctionDeclaration'&&
      statement.declaration.id?.name===name);
    if(!wrapper)throw new TypeError('Published function unavailable: '+name);
    const recovered=recover(distributedMath,name,'module');
    edits.push({start:wrapper.start,end:wrapper.end,
      text:'export '+recovered.source+';'});
    functions.push({name,paths:recovered.cases,offset:recovered.offset});
  }
  let code=distributedMath;
  for(const edit of edits.sort((a,b)=>b.start-a.start))
    code=code.slice(0,edit.start)+edit.text+code.slice(edit.end);
  if(/_af_[a-f0-9]{14}|_ap_input_[a-f0-9]{14}/u.test(code))
    throw new TypeError('Reconstruction left published affine case machinery');
  return {
    code,functions,
    publishedBytes:Buffer.byteLength(distributedMath),
    reconstructedBytes:Buffer.byteLength(code),
    attackMs:Number((performance.now()-started).toFixed(3))
  };
}

/** @returns {void} */
function main() {
  const filename=process.argv[2]?
    path.resolve(process.argv[2]):
    path.join(__dirname,'../examples/polyvariant-app/generated/math.mjs');
  const result=reconstructPublicMath(fs.readFileSync(filename,'utf8'));
  process.stdout.write('STATIC_POLYVARIANT_REBUILD '+JSON.stringify({
    input:filename,functions:result.functions,
    publishedBytes:result.publishedBytes,
    reconstructedBytes:result.reconstructedBytes,attackMs:result.attackMs
  })+'\n');
}

if(require.main===module)main();

module.exports={reconstructPublicMath};
