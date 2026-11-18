'use strict';

const assert=require('node:assert/strict');
const {parse}=require('acorn');
const esbuild=require('esbuild');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {makeSketch,runGraphs}=require('./semantic-sketch-esm');

/**
 * A deliberately narrow public-source-only attacker. This reader is told
 * the challenge family has an exported two-number state object, but receives
 * no original source or original private property names. It extracts the
 * values from the ordinary AST of the distributed JavaScript.
 *
 * @param {string} publicModule
 * @returns {number[]}
 */
function recoverPublicNumbers(publicModule){
  const ast=parse(publicModule,{sourceType:'module',ecmaVersion:'latest'});
  /** @type {number[][]} */
  const candidates=[];
  for(const statement of ast.body){
    const declaration=statement.type==='ExportNamedDeclaration'?
      statement.declaration:statement;
    if(declaration?.type!=='VariableDeclaration')continue;
    for(const item of declaration.declarations){
      if(item.init?.type!=='ObjectExpression'||item.init.properties.length!==2)continue;
      /** @type {number[]} */
      const values=[];
      for(const property of item.init.properties){
        if(property.type!=='Property'||property.value.type!=='Literal'||
          typeof property.value.value!=='number')break;
        values.push(property.value.value);
      }
      if(values.length===2)candidates.push(values);
    }
  }
  assert.equal(candidates.length,1,'Attacker expects one public two-number export');
  return candidates[0];
}

/**
 * Reproduce the declared no-input arithmetic challenge family using only
 * values recovered from public distributed source.
 * @param {number[]} values
 * @returns {number[]}
 */
function reconstructedOutput(values){
  assert.equal(values.length,2);
  return [values[0],values[1],values[0]+values[1]];
}

/**
 * Compare a public-only static attacker against actual compiler output
 * and ordinary esbuild minification of the same six native challenge
 * modules. Native source is used only by the independent verifier.
 * @returns {Promise<{cases:number,compilerRewrites:number,
 *   compiledStaticRecovered:number,minifiedStaticRecovered:number,
 *   publicCompilerStateBytes:number,publicMinifiedStateBytes:number}>}
 */
async function runStaticControl(){
  const originals=[];
  /** @type {number[][]} */
  const compiled=[];
  /** @type {number[][]} */
  const minified=[];
  let compilerRewrites=0;
  let publicCompilerStateBytes=0;
  let publicMinifiedStateBytes=0;
  for(let seed=1;seed<=6;seed++){
    const sketch=makeSketch(seed,0);
    originals.push(sketch);
    const emitted=obfuscateFiles(sketch.files,{
      mode:'coo',closedWorld:true,seed:'semantic-sketch/'+sketch.id,
      strings:false,identifiers:false
    });
    assert.ok(emitted.crossFile.properties>=2);
    compilerRewrites+=emitted.crossFile.properties;
    const state=sketch.files.find(file=>file.path==='state.mjs');
    const output=emitted.files.find(file=>file.path==='state.mjs');
    assert.ok(state&&output&&typeof output.code==='string');
    const ordinary=esbuild.transformSync(state.code,{format:'esm',minify:true}).code;
    compiled.push(reconstructedOutput(recoverPublicNumbers(output.code)));
    minified.push(reconstructedOutput(recoverPublicNumbers(ordinary)));
    publicCompilerStateBytes+=Buffer.byteLength(output.code);
    publicMinifiedStateBytes+=Buffer.byteLength(ordinary);
  }
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-static-sketch-'));
  try{
    const native=await runGraphs(path.join(directory,'native'),originals);
    let compiledStaticRecovered=0;
    let minifiedStaticRecovered=0;
    for(let index=0;index<originals.length;index++){
      // External JS observation is checked only by this verifier, which has
      // separate native program execution that the static reader never calls.
      const expected=/** @type {{value:number[],trace:unknown[]}} */(native[index]);
      assert.deepEqual(expected.trace,[]);
      if(JSON.stringify(compiled[index])===JSON.stringify(expected.value))compiledStaticRecovered++;
      if(JSON.stringify(minified[index])===JSON.stringify(expected.value))minifiedStaticRecovered++;
    }
    assert.equal(compiledStaticRecovered,originals.length);
    assert.equal(minifiedStaticRecovered,originals.length);
    return {cases:originals.length,compilerRewrites,compiledStaticRecovered,
      minifiedStaticRecovered,publicCompilerStateBytes,publicMinifiedStateBytes};
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

if(require.main===module)runStaticControl().then(result=>
  process.stdout.write('OBFS_SKETCH_STATIC_CONTROL '+JSON.stringify(result)+'\n')
).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={recoverPublicNumbers,reconstructedOutput,runStaticControl};
