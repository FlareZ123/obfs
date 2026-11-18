'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const esbuild=require('esbuild');
const {parse}=require('acorn');
const walk=require('acorn-walk');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {makeSketch,runGraphs}=require('./semantic-sketch-esm');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * A deliberately restricted source-only reader, given the public challenge
 * fact that one literal two-number state object determines [a,b,a+b].
 * It does not inspect the original source or query either runtime.
 * @param {string} source
 * @returns {number[]}
 */
function recoverTwoNumbers(source) {
  const ast=parse(source,{sourceType:'module',ecmaVersion:'latest'});
  /** @type {number[][]} */
  const matches=[];
  walk.full(ast,node=>{
    if(node.type!=='ObjectExpression'||node.properties.length!==2)return;
    /** @type {number[]} */
    const values=[];
    for(const field of node.properties) {
      if(field.type!=='Property'||field.value.type!=='Literal'||
          typeof field.value.value!=='number')return;
      values.push(field.value.value);
    }
    matches.push(values);
  });
  assert.equal(matches.length,1,'Expected one public two-number state initializer');
  return matches[0];
}

/**
 * Compare the native graph, conservative closed-world compiler output and
 * ordinary esbuild (bundled+minified+eligible-property mangled) output of
 * the same six frozen three-module ESM applications, with identical
 * zero-query source-only static reader conditions for both protectors.
 *
 * @returns {Promise<{cases:number,verifiedNativeParity:number,
 * compilerSourceOnlyRecovered:number,esbuildSourceOnlyRecovered:number,
 * compilerPrivateRewrites:number,bytes:{native:number,compiler:number,esbuild:number}}>}
 */
async function compare(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esbuild-mangle-control-'));
  /** @type {{id:number,files:ModuleFile[]}[]} */
  const natives=[];
  /** @type {{id:number,files:ModuleFile[]}[]} */
  const compiled=[];
  /** @type {{id:number,files:ModuleFile[]}[]} */
  const esbuilt=[];
  /** @type {number[][]} */
  const compilerRecovered=[];
  /** @type {number[][]} */
  const esbuildRecovered=[];
  let compilerPrivateRewrites=0;
  const bytes={native:0,compiler:0,esbuild:0};
  try{
    for(let seed=1;seed<=6;seed++){
      const sketch=makeSketch(seed,0);
      natives.push({id:sketch.id,files:sketch.files});
      const input=path.join(root,'input',String(seed));
      for(const file of sketch.files){
        await atomicWrite(path.join(input,file.path),file.code);
        bytes.native+=Buffer.byteLength(file.code);
      }
      const nativeEntry=path.join(input,'entry.mjs');
      const result=await esbuild.build({
        entryPoints:[nativeEntry],bundle:true,format:'esm',platform:'neutral',
        target:'es2022',minify:true,mangleProps:/^private(?:Score|Weight)/,
        write:false,logLevel:'silent'
      });
      assert.equal(result.outputFiles.length,1);
      const bundled=result.outputFiles[0].text;
      assert.ok(!bundled.includes('privateScore')&&!bundled.includes('privateWeight'),
        'esbuild control did not mangle the designated private keys');
      esbuilt.push({id:sketch.id,files:[
        {path:'entry.mjs',sourceType:'module',code:bundled}
      ]});
      esbuildRecovered.push(recoverTwoNumbers(bundled));
      bytes.esbuild+=Buffer.byteLength(bundled);

      const emitted=obfuscateFiles(sketch.files,{
        mode:'coo',closedWorld:true,
        seed:'esbuild-mangle-control/'+sketch.id,
        strings:false,identifiers:false
      });
      assert.ok(emitted.crossFile.properties>=2,'Positive compiler rewrite missing');
      compilerPrivateRewrites+=emitted.crossFile.properties;
      const files=/** @type {ModuleFile[]} */ (emitted.files);
      compiled.push({id:sketch.id,files});
      for(const file of files)bytes.compiler+=Buffer.byteLength(file.code);
      const state=files.find(file=>file.path==='state.mjs');
      assert.ok(state,'Missing compiler state module');
      compilerRecovered.push(recoverTwoNumbers(state.code));
    }
    const originalOutputs=await runGraphs(path.join(root,'native'),natives);
    const compilerOutputs=await runGraphs(path.join(root,'compiler'),compiled);
    const esbuildOutputs=await runGraphs(path.join(root,'esbuild'),esbuilt);
    let verifiedNativeParity=0,compilerSourceOnlyRecovered=0,esbuildSourceOnlyRecovered=0;
    for(let i=0;i<natives.length;i++){
      assert.deepEqual(compilerOutputs[i],originalOutputs[i],
        'Compiler changed graph output: '+natives[i].id);
      assert.deepEqual(esbuildOutputs[i],originalOutputs[i],
        'esbuild control changed graph output: '+natives[i].id);
      verifiedNativeParity++;
      const expected=/** @type {{value:number[],trace:unknown[]}} */(originalOutputs[i]);
      assert.deepEqual(expected.trace,[]);
      const fromCompiler=compilerRecovered[i];
      const fromEsbuild=esbuildRecovered[i];
      if(JSON.stringify([fromCompiler[0],fromCompiler[1],
        fromCompiler[0]+fromCompiler[1]])===JSON.stringify(expected.value)){
        compilerSourceOnlyRecovered++;
      }
      if(JSON.stringify([fromEsbuild[0],fromEsbuild[1],
        fromEsbuild[0]+fromEsbuild[1]])===JSON.stringify(expected.value)){
        esbuildSourceOnlyRecovered++;
      }
    }
    assert.equal(compilerSourceOnlyRecovered,natives.length);
    assert.equal(esbuildSourceOnlyRecovered,natives.length);
    return {cases:natives.length,verifiedNativeParity,
      compilerSourceOnlyRecovered,esbuildSourceOnlyRecovered,
      compilerPrivateRewrites,bytes};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module)compare().then(result=>
  process.stdout.write('OBFS_ESBUILD_PROPERTY_MANGLE_CONTROL '+JSON.stringify(result)+'\n')
).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={compare,recoverTwoNumbers};
