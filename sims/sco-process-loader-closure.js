'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {partitionScoAsyncGraph}=require('../src/sco-graph');
const {atomicWrite}=require('../src/atomic');

/**
 * Native Node.js can load an undeclared private CommonJS dependency through
 * an imported alias of process.getBuiltinModule without an explicit import
 * from node:module. Compare its executed result with the SCO graph scanner's
 * admission decision. The original graph source stays entirely server-side.
 *
 * This is a bounded graph-closure counterexample, not an attack on public RPC
 * authentication or a demonstration that a remote client sees private bytes.
 * @returns {Promise<void>}
 */
async function main(){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-process-loader-'));
  const source="import {getBuiltinModule as load} from 'node:process';\n"+
    "export async function run(){\n"+
    "const makeRequire=load('node:module').createRequire;\n"+
    "return makeRequire(import.meta.url)('./hidden.cjs').token;\n"+
    "}\n";
  const secret="module.exports={token:137};\n";
  try {
    await atomicWrite(path.join(directory,'api.mjs'),source);
    await atomicWrite(path.join(directory,'hidden.cjs'),secret);
    const actual=await import(pathToFileURL(path.join(directory,'api.mjs')).href);
    assert.equal(await actual.run(),137);
    let graph;
    let refusal=null;
    try {
      graph=partitionScoAsyncGraph([{path:'api.mjs',code:source}],{
        exposedPaths:['api.mjs'],seed:'node-process-loader-closure'
      });
    }catch(error) {
      refusal=error instanceof Error?error.message:String(error);
    }
    const advertised=graph?.privateSourceDigests.map(item=>item.path)??[];
    const report={
      node:process.version,
      actualNativeValue:137,
      suppliedPrivateGraph:['api.mjs'],
      runtimeLoadedButUndeclared:'hidden.cjs',
      graphAccepted:Boolean(graph),
      scannerRefusal:refusal,
      digestCoversUndeclaredFile:advertised.includes('hidden.cjs'),
      digestedPaths:advertised,
      clientFacadeContainsSecret:graph?.clientFiles.some(file=>file.code.includes('token:137'))??false
    };
    console.log(JSON.stringify(report,null,2));
    if(graph){
      assert.equal(report.digestCoversUndeclaredFile,false,
        'An undeclared source should never appear in the supplied graph digest');
      assert.equal(report.clientFacadeContainsSecret,false,
        'The public facade must still omit private source data');
    }
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
