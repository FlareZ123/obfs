'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');

const REQUIRED_JOBS=Object.freeze([
  'full-validation',
  'matched-minifier',
  'sco-equal-trust',
  'sco-cpu',
  'sno-cpu',
  'application-challenge',
  'application-sco',
  'adversarial-applications'
]);
const REQUIRED_PLATFORMS=Object.freeze(['linux','win32']);
const REQUIRED_DIMENSIONS=Object.freeze([
  'semanticParity',
  'positiveYield',
  'staticResistance',
  'dynamicResistance',
  'integrityResistance',
  'environmentAdmission',
  'attackerAdvantage',
  'computeBudget'
]);

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function isRecord(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

/**
 * @typedef {{
 *   verdict:'RELEASE-GO'|'RELEASE-BLOCKED'|'RESEARCH-INCONCLUSIVE',
 *   candidateSha:string|null,
 *   platforms:string[],
 *   blockers:string[],
 *   unresolved:string[],
 *   jobResults:Record<string,string>,
 *   artifactHashes:Array<{name:string,sha256:string,platform:string}>
 * }} AcceptanceDecision
 */

/**
 * A workflow job being green only means that its evidence producer ran.
 * A GO additionally requires two exact-source, cross-platform, machine-readable
 * receipts proving every security, correctness, yield and compute dimension.
 *
 * @param {unknown} jobResultsValue
 * @param {unknown} documentsValue
 * @param {string} expectedSha
 * @param {unknown} artifactHashesValue
 * @returns {AcceptanceDecision}
 */
function evaluateAcceptance(jobResultsValue,documentsValue,expectedSha,artifactHashesValue){
  /** @type {string[]} */
  const blockers=[];
  /** @type {string[]} */
  const unresolved=[];
  /** @type {string[]} */
  const platforms=[];
  /** @type {Record<string,string>} */
  const jobResults={};
  /** @type {Array<{name:string,sha256:string,platform:string}>} */
  const artifactHashes=[];
  const suppliedJobs=isRecord(jobResultsValue)?jobResultsValue:{};

  const documents=Array.isArray(documentsValue)?documentsValue:[];
  if(!Array.isArray(documentsValue)){
    unresolved.push('Evidence artifact collection is not an array');
  }
  if(documents.length!==REQUIRED_PLATFORMS.length){
    unresolved.push('Expected exactly two platform evidence artifacts; found '+
      documents.length);
  }

  if(!Array.isArray(artifactHashesValue)){
    unresolved.push('Exact evidence artifact hashes are missing');
  }else{
    const seenNames=new Set();
    for(const [index,raw] of artifactHashesValue.entries()){
      if(!isRecord(raw)||typeof raw.name!=='string'||
         typeof raw.sha256!=='string'||typeof raw.platform!=='string'){
        unresolved.push('Artifact hash record '+index+' is malformed');
        continue;
      }
      if(!/^[0-9a-f]{64}$/u.test(raw.sha256)){
        unresolved.push('Artifact '+raw.name+' has a malformed SHA-256');
      }
      if(seenNames.has(raw.name)){
        blockers.push('Duplicate artifact hash record for '+raw.name);
      }
      seenNames.add(raw.name);
      artifactHashes.push({
        name:raw.name,sha256:raw.sha256,platform:raw.platform
      });
    }
    if(artifactHashes.length!==documents.length){
      unresolved.push('Artifact hash count does not match the parsed evidence count');
    }
  }

  for(const name of REQUIRED_JOBS){
    const result=suppliedJobs[name];
    if(typeof result==='string')jobResults[name]=result;
    if(result!=='success'){
      blockers.push('Required workflow job '+name+' did not succeed ('+
        String(result===undefined?'missing':result)+')');
    }
  }

  const shaValid=/^[0-9a-f]{40}$/u.test(expectedSha);
  if(!shaValid)unresolved.push('Expected candidate SHA is missing or malformed');

  const seenPlatforms=new Set();
  for(const [index,raw] of documents.entries()){
    const prefix='Evidence artifact '+index;
    if(!isRecord(raw)){
      unresolved.push(prefix+' is not a JSON object');
      continue;
    }

    const platform=raw.platform;
    if(typeof platform!=='string'||!REQUIRED_PLATFORMS.includes(platform)){
      unresolved.push(prefix+' has an unsupported or missing platform');
    }else{
      if(seenPlatforms.has(platform)){
        blockers.push('Duplicate evidence artifact for platform '+platform);
      }
      seenPlatforms.add(platform);
      platforms.push(platform);
    }

    if(typeof platform==='string'&&
       !artifactHashes.some(item=>item.platform===platform)){
      unresolved.push(prefix+' has no matching retained artifact hash');
    }

    if(raw.source!=='sims/release-evidence-gate.js'){
      unresolved.push(prefix+' has an unknown evidence producer');
    }
    if(typeof raw.sourceCommit!=='string'||raw.sourceCommit!==expectedSha){
      blockers.push(prefix+' is not pinned to the dispatched candidate SHA');
    }
    if(raw.node!=='v22.23.4'){
      unresolved.push(prefix+' does not use the pinned Node v22.23.4 runtime');
    }

    const summary=raw.summary;
    if(!isRecord(summary)){
      unresolved.push(prefix+' is missing its evidence summary');
      continue;
    }

    if(summary.verdict==='RELEASE-BLOCKED'){
      blockers.push(prefix+' reports RELEASE-BLOCKED');
    }else if(summary.verdict!=='RELEASE-GO'){
      unresolved.push(prefix+' does not report an explicit RELEASE-GO verdict');
    }

    if(!Array.isArray(summary.attackedModes)){
      unresolved.push(prefix+' is missing the attacked-mode inventory');
    }else{
      const disallowed=summary.attackedModes.filter(mode=>mode!=='sco');
      if(disallowed.length!==0){
        blockers.push(prefix+' reports non-relay attacks in modes: '+
          disallowed.map(String).join(', '));
      }
    }

    if(!isRecord(summary.attackEvidence)){
      unresolved.push(prefix+' is missing per-mode attacker evidence');
    }else{
      for(const mode of ['coo','sno','sco']){
        const evidence=summary.attackEvidence[mode];
        if(!isRecord(evidence)){
          unresolved.push(prefix+' is missing '+mode+' attacker evidence');
          continue;
        }
        if(mode!=='sco'){
          if(evidence.verdict==='demonstrated-functional-clone'){
            blockers.push(prefix+' reports a demonstrated '+mode+' functional clone');
          }else if(evidence.verdict!=='resisted-within-budget'){
            unresolved.push(prefix+' has no bounded resistance receipt for '+mode);
          }
          continue;
        }

        // A legitimate SCO request/response relay is not source extraction.
        // Keep oracle cloning, private-source extraction and token bypass as
        // separate claims, matching the repository's SCO threat model.
        if(evidence.sameAccountFunctionalReplay!==true){
          if(evidence.verdict==='demonstrated-functional-clone'){
            blockers.push(prefix+' reports an SCO clone not identified as an authorized relay');
          }else{
            unresolved.push(prefix+' does not classify the SCO functional replay');
          }
        }
        for(const field of ['privateSourceExtraction','unauthorizedTokenBypass']){
          const status=evidence[field];
          if(status===true||status==='demonstrated'){
            blockers.push(prefix+' reports SCO '+field);
          }else if(status!=='resisted-within-budget'){
            unresolved.push(prefix+' has no bounded SCO '+field+' receipt');
          }
        }
      }
    }

    if(!isRecord(summary.securityAxes)){
      unresolved.push(prefix+' is missing the independent security-axis matrix');
    }else{
      /**
       * @param {unknown} value
       * @param {string} location
       */
      const inspectAxes=(value,location)=>{
        if(typeof value==='string'){
          if(value==='not-applicable'||value==='resisted'||
             value==='resisted-within-budget'||value==='passed'||
             value==='legitimate-token-relay-reproduces-output')return;
          if(/not-measured|not-established|unmeasured|inconclusive/iu.test(value)){
            unresolved.push(prefix+' security axis '+location+' is '+value);
          }else{
            blockers.push(prefix+' security axis '+location+' is not a passing state ('+
              value+')');
          }
          return;
        }
        if(Array.isArray(value)){
          value.forEach((child,i)=>inspectAxes(child,location+'['+i+']'));
          return;
        }
        if(isRecord(value)){
          for(const [key,child] of Object.entries(value)){
            inspectAxes(child,location+'.'+key);
          }
          return;
        }
        unresolved.push(prefix+' security axis '+location+' has no explicit status');
      };
      inspectAxes(summary.securityAxes,'securityAxes');
    }

    const receipt=summary.acceptance;
    if(!isRecord(receipt)){
      unresolved.push(prefix+' is missing the explicit acceptance receipt');
    }else{
      if(receipt.candidateSha!==expectedSha){
        blockers.push(prefix+' acceptance receipt names a different candidate SHA');
      }
      if(receipt.decision==='NO-GO'){
        blockers.push(prefix+' acceptance receipt explicitly says NO-GO');
      }else if(receipt.decision!=='GO'){
        unresolved.push(prefix+' acceptance receipt is not an explicit GO');
      }
      if(!isRecord(receipt.dimensions)){
        unresolved.push(prefix+' acceptance receipt has no dimension map');
      }else{
        for(const dimension of REQUIRED_DIMENSIONS){
          const status=receipt.dimensions[dimension];
          if(status==='failed'){
            blockers.push(prefix+' acceptance dimension '+dimension+' failed');
          }else if(status!=='passed'){
            unresolved.push(prefix+' acceptance dimension '+dimension+
              ' is missing or unmeasured');
          }
        }
      }
    }

    const performance=summary.performance;
    if(!isRecord(performance)){
      unresolved.push(prefix+' is missing performance evidence');
      continue;
    }

    for(const mode of ['coo','sno','sco']){
      const budget=performance[mode];
      if(!isRecord(budget)){
        unresolved.push(prefix+' is missing '+mode+' budget evidence');
      }else if(budget.verdict==='sample-exceeded'){
        blockers.push(prefix+' '+mode+' budget exceeded');
      }else if(budget.verdict!=='sample-supported'){
        unresolved.push(prefix+' '+mode+' budget is not sample-supported');
      }
    }

    for(const name of ['crossModeFamilywise','computeBoundaryFamilywise','snoPostInit']){
      const budget=performance[name];
      if(!isRecord(budget)){
        unresolved.push(prefix+' is missing '+name+' compute evidence');
        continue;
      }
      if(budget.verdict==='sample-exceeded'||
         budget.strictObservedVerdict==='sample-exceeded'||
         (typeof budget.observedOverBudgetPairs==='number'&&
          budget.observedOverBudgetPairs>0)||
         budget.observedSampleHasOverBudgetPair===true){
        blockers.push(prefix+' '+name+' contains a strict over-budget observation');
      }else if(budget.verdict!=='sample-supported'||
               budget.strictObservedVerdict!=='no-observed-exceedances'){
        unresolved.push(prefix+' '+name+' is not a fully supported strict-budget result');
      }
    }
  }

  for(const required of REQUIRED_PLATFORMS){
    if(!seenPlatforms.has(required)){
      unresolved.push('Missing platform evidence for '+required);
    }
  }

  const verdict=blockers.length>0?'RELEASE-BLOCKED':
    unresolved.length>0?'RESEARCH-INCONCLUSIVE':'RELEASE-GO';
  return {
    verdict,
    candidateSha:shaValid?expectedSha:null,
    platforms:platforms.sort(),
    blockers,
    unresolved,
    jobResults,
    artifactHashes
  };
}

/**
 * Read the current workflow's uploaded evidence and fail closed.
 * @returns {Promise<void>}
 */
async function main(){
  const expectedSha=process.env.OBFS_ACCEPTANCE_EXPECTED_SHA||'';
  const directory=process.env.OBFS_ACCEPTANCE_EVIDENCE_DIR||'release-evidence';
  const outputPath=process.env.OBFS_ACCEPTANCE_DECISION_FILE||
    'acceptance-decision.json';
  const rawJobs=process.env.OBFS_ACCEPTANCE_JOB_RESULTS||'{}';
  const jobResults=JSON.parse(rawJobs);
  /** @type {import('node:fs').Dirent[]} */
  let entries=[];
  try{
    entries=await fs.readdir(directory,{withFileTypes:true});
  }catch(error){
    if(!isRecord(error)||error.code!=='ENOENT')throw error;
  }
  const files=entries.filter(entry=>entry.isFile()&&entry.name.endsWith('.json'))
    .map(entry=>entry.name).sort();
  const documents=[];
  /** @type {Array<{name:string,sha256:string,platform:string}>} */
  const artifactHashes=[];
  for(const name of files){
    let raw;
    try{
      raw=await fs.readFile(path.join(directory,name));
    }catch{
      documents.push(null);
      artifactHashes.push({name,sha256:'',platform:'unknown'});
      continue;
    }
    const sha256=crypto.createHash('sha256').update(raw).digest('hex');
    let document;
    try{
      document=JSON.parse(raw.toString('utf8'));
    }catch{
      documents.push(null);
      artifactHashes.push({name,sha256,platform:'unknown'});
      continue;
    }
    documents.push(document);
    artifactHashes.push({
      name,
      sha256,
      platform:isRecord(document)&&typeof document.platform==='string'?
        document.platform:'unknown'
    });
  }
  const decision=evaluateAcceptance(
    jobResults,documents,expectedSha,artifactHashes
  );
  const output=JSON.stringify(decision,null,2)+'\n';
  await fs.writeFile(outputPath,output);
  process.stdout.write('ACCEPTANCE_DECISION '+JSON.stringify(decision)+'\n');
  if(decision.verdict!=='RELEASE-GO'){
    process.stderr.write('Candidate acceptance failed closed: '+
      decision.verdict+'\n');
    process.exitCode=1;
  }
}

if(require.main===module){
  main().catch(error=>{
    process.stderr.write(String(error.stack||error)+'\n');
    process.exitCode=1;
  });
}

module.exports={evaluateAcceptance,REQUIRED_JOBS,REQUIRED_DIMENSIONS};
