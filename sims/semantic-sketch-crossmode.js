'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {makeSketch,runGraphs}=require('./semantic-sketch-esm');

/**
 * Reuse the held-out source-observer sketches across all three compiler
 * configurations. This is source-compiler behavior in a real Node ESM
 * loader; SCO server residency/authenticated RPC and SNO filesystem
 * adversarial capabilities need independent end-to-end studies.
 *
 * @param {number} [seedCount]
 * @returns {Promise<{sketches:number,modes:string[],
 *    comparisons:number,confirmedPositiveRewrites:Record<string,number>,
 *    zeroRewriteCases:Record<string,number>,equal:boolean}>}
 */
async function crossModeSketches(seedCount=4){
  const cases=[];
  for(let seed=40;seed<40+seedCount;seed++){
    for(let style=0;style<16;style++)cases.push(makeSketch(seed,style));
  }
  const modes=/** @type {const} */ (['coo','sno','sco']);
  /** @type {Record<string,number>} */
  const confirmedPositiveRewrites={};
  /** @type {Record<string,number>} */
  const zeroRewriteCases={};
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-crossmode-sketch-'));
  try{
    const native=await runGraphs(path.join(root,'native'),cases);
    for(const mode of modes){
      let positives=0,zero=0;
      const transformed=cases.map(item=>{
        const output=obfuscateFiles(item.files,{
          mode,closedWorld:true,seed:'crossmode-semantic-sketch/'+item.id,
          strings:false,identifiers:false
        });
        if(item.safeYield){
          assert.ok(output.crossFile.properties>=2,
            mode+' positive private-property rewrite refused: '+item.id);
          positives+=output.crossFile.properties;
        }
        if(output.crossFile.properties===0)zero++;
        return {id:item.id,
          files:/** @type {typeof item.files} */(output.files)};
      });
      const observed=await runGraphs(path.join(root,mode),transformed);
      for(let i=0;i<cases.length;i++){
        assert.deepEqual(observed[i],native[i],
          mode+' changed native result or side-effect trace for '+
          cases[i].id+'/'+cases[i].style);
      }
      confirmedPositiveRewrites[mode]=positives;
      zeroRewriteCases[mode]=zero;
    }
    return {sketches:cases.length,modes:[...modes],
      comparisons:cases.length*modes.length,
      confirmedPositiveRewrites,zeroRewriteCases,equal:true};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module)crossModeSketches().then(result=>
  process.stdout.write('OBFS_CROSSMODE_SEMANTIC_SKETCH '+JSON.stringify(result)+'\n')
).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={crossModeSketches};
