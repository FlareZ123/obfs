'use strict';

const {familywiseBudgetBounds}=require('./familywise-budget-bound');

/** @typedef {'native'|'minified'|'published'|'reconstructed'} Variant */
/** @typedef {{native:number[],minified:number[],published:number[],reconstructed:number[]}} VariantTimes */
/**
 * @typedef {{
 *   sha256:Record<Variant,string>,
 *   protectedFunctions:number,
 *   minifiedStaticRecovery:{recovered:number},
 *   publishedStaticRecovery:{recovered:number},
 *   candidateDecision:{attackAdvantage:'supported'|'contradicted'|'inconclusive'},
 *   rows:Array<{events:number,timingMs:VariantTimes}>
 * }} NodeFourWay
 */
/**
 * @typedef {{
 *   sourceSha256:Record<Variant,string>,
 *   clockProbeMs:number,
 *   verifiedFullOutputs:boolean,
 *   verifiedExternalCallbacks:boolean,
 *   matchedWorkloads:number,
 *   pairedHotWorkEvents:number,
 *   freshGraphHttpModuleRequests:number,
 *   samples:VariantTimes,
 *   coldFreshGraphs:Record<string,{computeMs:VariantTimes}>
 * }} BrowserFourWay
 */

/**
 * Join independently sampled Node and real-clock Chromium results for the
 * same actual emitted four-way ESM graph. A full CI success only means the
 * experiment ran; this result separately evaluates the user's strict budget.
 *
 * The paired distribution estimate concerns medians. A single recorded
 * >2.5x compute pair vetoes a sampled strict-budget pass, irrespective of its
 * median bound. Cold HTTP/import duration is deliberately excluded from the
 * browser compute-only category; it is preserved in the original raw audit.
 *
 * @param {NodeFourWay} node
 * @param {BrowserFourWay} browser
 * @returns {{
 *   sourceHashesMatch:boolean,
 *   matchedSampleBoundaries:string[],
 *   familywise:ReturnType<typeof familywiseBudgetBounds>,
 *   strictComputeBudget:'sample-breached'|'sample-supported'|'inconclusive',
 *   staticAttackerVerdict:'reconstructed'|'inconclusive',
 *   candidateChoice:'reject'|'inconclusive',
 *   releaseVerdict:'RELEASE-BLOCKED'|'RESEARCH-INCONCLUSIVE',
 *   caveat:string
 * }}
 */
function evaluateFourWayCrossRuntime(node,browser){
  const variants=/** @type {Variant[]} */ (
    ['native','minified','published','reconstructed']);
  for(const name of variants){
    const nativeHash=node.sha256[name];
    const browserHash=browser.sourceSha256[name];
    if(typeof nativeHash!=='string'||nativeHash.length!==64||
       nativeHash!==browserHash){
      throw new Error('Node and browser emitted graph SHA-256 mismatch: '+name);
    }
  }
  if(!Number.isFinite(browser.clockProbeMs)||browser.clockProbeMs<0.1){
    throw new Error('No positive real-clock Chromium CPU witness');
  }
  if(browser.verifiedFullOutputs!==true||
     browser.verifiedExternalCallbacks!==true||
     browser.matchedWorkloads!==4||
     browser.pairedHotWorkEvents!==10000||
     browser.freshGraphHttpModuleRequests!==288){
    throw new Error('Incomplete four-way Chromium trace or module-graph witness');
  }
  if(node.rows.length!==4||
     node.rows.some((row,index)=>row.events!==[1,50,1000,10000][index])){
    throw new Error('Expected four frozen Node application workloads');
  }
  const cold=browser.coldFreshGraphs['10000'];
  if(!cold||!cold.computeMs){
    throw new Error('Missing fresh Chromium 10000-event compute measurements');
  }
  const named=[
    ...node.rows.map(row=>({
      name:'node-fresh-session-'+row.events,
      native:row.timingMs.native,
      candidate:row.timingMs.published
    })),
    {name:'chromium-warmed-10000-compute',
      native:browser.samples.native,candidate:browser.samples.published},
    {name:'chromium-fresh-10000-compute',
      native:cold.computeMs.native,candidate:cold.computeMs.published}
  ];
  const familywise=familywiseBudgetBounds(named.map(row=>({
    native:row.native,candidate:row.candidate
  })));
  const strictComputeBudget=familywise.observedSampleHasOverBudgetPair?
    'sample-breached':familywise.verdict==='sample-supported'&&
    familywise.familywiseCoverageAtLeast>=0.95?
      'sample-supported':'inconclusive';
  const staticAttackerVerdict=node.protectedFunctions===3&&
    node.minifiedStaticRecovery.recovered===3&&
    node.publishedStaticRecovery.recovered===3&&
    node.candidateDecision.attackAdvantage==='contradicted'?
      'reconstructed':'inconclusive';
  const candidateChoice=staticAttackerVerdict==='reconstructed'?
    'reject':'inconclusive';
  const releaseVerdict=strictComputeBudget==='sample-breached'||
    candidateChoice==='reject'?'RELEASE-BLOCKED':'RESEARCH-INCONCLUSIVE';
  return {
    sourceHashesMatch:true,
    matchedSampleBoundaries:named.map(row=>row.name),familywise,
    strictComputeBudget,staticAttackerVerdict,candidateChoice,releaseVerdict,
    caveat:'This matched Node/Chromium evidence is limited to the fixed ESM graph, selected attacker, observed trials and local Chrome runner. The full browser CPU-only cold work excludes HTTP/import latency, while Node fresh-session cost includes Node import. A median estimate never proves an all-input 2.5x ceiling; a complete runtime adversary can still inspect public JS.'
  };
}

/**
 * Combine the JSON artifacts produced by the same pinned workflow checkout.
 * This command reports a blocked candidate without failing the evidence
 * experiment merely because the test has discovered a real budget violation.
 *
 * @returns {Promise<void>}
 */
async function main(){
  const fs=require('node:fs/promises');
  const {atomicWrite}=require('../src/atomic');
  const nodePath=process.env.OBFS_FOUR_WAY_NODE_FILE;
  const browserPath=process.env.OBFS_FOUR_WAY_BROWSER_FILE;
  if(!nodePath||!browserPath){
    throw new Error('Both pinned Node and Chromium audit file paths are required');
  }
  const [nodeRaw,browserRaw]=await Promise.all([
    fs.readFile(nodePath,'utf8'),fs.readFile(browserPath,'utf8')
  ]);
  const node=/** @type {NodeFourWay} */(JSON.parse(nodeRaw));
  const browser=/** @type {BrowserFourWay} */(JSON.parse(browserRaw));
  const verdict=evaluateFourWayCrossRuntime(node,browser);
  const output=JSON.stringify(verdict,null,2)+'\n';
  if(process.env.OBFS_FOUR_WAY_JOIN_FILE)
    await atomicWrite(process.env.OBFS_FOUR_WAY_JOIN_FILE,output);
  process.stdout.write('MINIFIED_FOUR_WAY_CROSS_RUNTIME '+JSON.stringify(verdict)+'\n');
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={evaluateFourWayCrossRuntime};

