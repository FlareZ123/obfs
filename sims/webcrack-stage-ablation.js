'use strict';

/**
 * Source-pinned, non-executing Webcrack stage-ablation attribution probe.
 * Distinguishes formatting/transpilation from specialized deobfuscation,
 * with an explicitly rejecting VM sandbox. This is NOT source restoration.
 */
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const {webcrack}=require('webcrack');
const {prepare}=require('./polyvariant-app-four-way-control');

/** @param {string} code @returns {string} */
function sha256(code){return createHash('sha256').update(code).digest('hex');}
const STAGES=Object.freeze([
  {name:'both',deobfuscate:true,unminify:true},
  {name:'deobfuscate-only',deobfuscate:true,unminify:false},
  {name:'unminify-only',deobfuscate:false,unminify:true},
  {name:'parser-roundtrip',deobfuscate:false,unminify:false}
]);

/** @returns {Promise<object>} */
async function run(){
  const {graphs,protectedFunctions}=await prepare();
  assert.equal(protectedFunctions,3);
  /** @type {Record<string,{sourceSha256:string,inputBytes:number,stages:Record<string,{sha256:string,bytes:number,sandboxCalls:number,equalsInput:boolean,equalsBoth:boolean}>}>} */
  const variants={};
  for(const variant of /** @type {const} */(['minified','published'])){
    const math=graphs[variant].find(file=>file.path==='math.mjs');
    assert.ok(math);
    /** @type {Record<string,{sha256:string,bytes:number,sandboxCalls:number,equalsInput:boolean,equalsBoth:boolean}>} */
    const stages={};
    let bothOutput='';
    for(const stage of STAGES) {
      let sandboxCalls=0;
      const code=(await webcrack(math.code,{
        deobfuscate:stage.deobfuscate,
        unminify:stage.unminify,
        unpack:false,jsx:false,
        sandbox:async()=>{
          sandboxCalls++;
          throw new Error('Ablation refuses runtime decoder VM evaluation');
        }
      })).code;
      if(stage.name==='both')bothOutput=code;
      stages[stage.name]={
        sha256:sha256(code),bytes:Buffer.byteLength(code),
        sandboxCalls,equalsInput:code===math.code,
        equalsBoth:code===bothOutput
      };
    }
    variants[variant]={
      sourceSha256:sha256(math.code),
      inputBytes:Buffer.byteLength(math.code),
      stages
    };
  }
  const evidence={
    frozenProductionSource:'a8a22f9aef6e7f0d487cebc23c87063376df55cb',
    sourceInputOnly:true,
    webcrack:'2.16.0',node:process.version,platform:process.platform,
    method:'Four Webcrack stages, exact byte/hash comparison, rejecting VM callback; no source execution',
    variants,
    interpretation:'Structural stage attribution only; source formula restoration, attacker effort, semantic equivalence outside the existing full app oracle unmeasured.'
  };
  if(process.env.OBFS_WEBCRACK_ABLATION_REPORT)
    await fs.writeFile(process.env.OBFS_WEBCRACK_ABLATION_REPORT,
      JSON.stringify(evidence,null,2)+'\n','utf8');
  assert.equal(STAGES.length,4);
  for(const variant of Object.values(variants))
    for(const stage of Object.values(variant.stages))
      assert.equal(stage.sandboxCalls,0,'No VM decoder call permitted');
  return evidence;
}
if(require.main===module)run().then(evidence=>{
  process.stdout.write('WEBCRACK_STAGE_ABLATION '+JSON.stringify(evidence)+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run};
