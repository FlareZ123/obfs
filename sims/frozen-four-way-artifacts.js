'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {atomicWrite}=require('../src/atomic');
const {prepare,digest}=require('./polyvariant-app-four-way-control');

/** @typedef {{path:string,bytes:number,sha256:string,base64:string}} FrozenFile */
/** @typedef {{native:FrozenFile[],minified:FrozenFile[],published:FrozenFile[],reconstructed:FrozenFile[]}} FrozenGraphs */
/** @typedef {{
 * schema:string,
 * sourceCommit:string|null,
 * engine:{node:string,v8:string,platform:string,arch:string},
 * dependencies:{packageJsonSha256:string,lockSha256:string},
 * settings:{candidate:{mode:string,seed:string,selectedFunctions:string[]},minifier:{name:string,version:string,bundled:boolean,format:string,target:string,minify:boolean}},
 * graphs:FrozenGraphs,
 * graphDigests:{native:string,minified:string,published:string,reconstructed:string},
 * staticAttack:{minifiedRecovered:number,publishedRecovered:number}
 * }} FrozenReceipt */

/** @param {Buffer|string} bytes @returns {string} */
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {{path:string,code:string}[]} graph @returns {FrozenFile[]} */
function freeze(graph) {
  return graph.map(file=>{
    const bytes=Buffer.from(file.code,'utf8');
    return {path:file.path,bytes:bytes.length,sha256:hash(bytes),
      base64:bytes.toString('base64')};
  });
}

/**
 * Archive every published byte of the existing four-way stateful ESM comparison.
 * All four arms use the same source and build environment. This function records
 * static-attacker outcomes without turning them into a security-promotion claim.
 * @returns {Promise<FrozenReceipt>}
 */
async function createReceipt() {
  const {graphs,minifiedAttack,publishedAttack}=await prepare();
  const root=path.resolve(__dirname,'..');
  const [manifest,lock]=await Promise.all([
    fs.readFile(path.join(root,'package.json')),
    fs.readFile(path.join(root,'package-lock.json'))
  ]);
  const esbuild=require('esbuild');
  return {
    schema:'obfs-frozen-four-way-artifacts-v1',
    sourceCommit:process.env.GITHUB_SHA||null,
    engine:{node:process.version,v8:process.versions.v8,
      platform:process.platform,arch:process.arch},
    dependencies:{packageJsonSha256:hash(manifest),lockSha256:hash(lock)},
    settings:{
      candidate:{mode:'coo',seed:'multi-file-attacker-challenge-20261116',
        selectedFunctions:['round1','round2','round3']},
      minifier:{name:'esbuild',version:esbuild.version,bundled:false,
        format:'esm',target:'es2022',minify:true}
    },
    graphs:{
      native:freeze(graphs.native),
      minified:freeze(graphs.minified),
      published:freeze(graphs.published),
      reconstructed:freeze(graphs.reconstructed)
    },
    graphDigests:{
      native:digest(graphs.native),
      minified:digest(graphs.minified),
      published:digest(graphs.published),
      reconstructed:digest(graphs.reconstructed)
    },
    staticAttack:{
      minifiedRecovered:minifiedAttack.recovered,
      publishedRecovered:publishedAttack.functions.length
    }
  };
}

/** @returns {Promise<void>} */
async function main() {
  const receipt=await createReceipt();
  const content=JSON.stringify(receipt,null,2)+'\n';
  const output=process.argv.indexOf('--output');
  if(output<0)process.stdout.write(content);
  else {
    if(!process.argv[output+1])throw new TypeError('Expected output path');
    await atomicWrite(path.resolve(process.argv[output+1]),content);
    process.stdout.write('FROZEN_FOUR_WAY_RECEIPT '+JSON.stringify({
      graphDigests:receipt.graphDigests,dependencies:receipt.dependencies
    })+'\n');
  }
}
if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={createReceipt,hash};
