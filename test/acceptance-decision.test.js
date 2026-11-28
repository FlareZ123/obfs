'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {
  evaluateAcceptance,REQUIRED_JOBS,REQUIRED_DIMENSIONS
}=require('../sims/acceptance-decision');

const candidateSha='a'.repeat(40);

/** @returns {Record<string,string>} */
function successfulJobs(){
  return Object.fromEntries(REQUIRED_JOBS.map(name=>[name,'success']));
}

/**
 * @param {Array<Record<string,any>>} documents
 * @returns {Array<{name:string,sha256:string,platform:string}>}
 */
function artifactHashesFor(documents){
  return documents.map((document,index)=>({
    name:'release-evidence-'+document.platform+'.json',
    sha256:String(index+1).repeat(64),
    platform:document.platform
  }));
}

/**
 * @param {Array<Record<string,any>>} documents
 * @param {Record<string,string>} [jobs]
 */
function decide(documents,jobs=successfulJobs()){
  return evaluateAcceptance(
    jobs,documents,candidateSha,artifactHashesFor(documents)
  );
}

/**
 * Execute the actual CLI in an isolated working directory.
 * @param {Array<Record<string,any>>} documents
 * @param {{malformed?:boolean}} [options]
 * @returns {Promise<{status:number|null,stdout:string,stderr:string,decision:any}>}
 */
async function runCli(documents,options={}){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-acceptance-'));
  const evidenceDirectory=path.join(directory,'release-evidence');
  const decisionPath=path.join(directory,'acceptance-decision.json');
  await fs.mkdir(evidenceDirectory);
  for(const document of documents){
    await fs.writeFile(
      path.join(evidenceDirectory,'release-evidence-'+document.platform+'.json'),
      JSON.stringify(document)
    );
  }
  if(options.malformed){
    await fs.writeFile(
      path.join(evidenceDirectory,'release-evidence-malformed.json'),
      '{ malformed'
    );
  }
  const scriptPath=path.resolve(__dirname,'../sims/acceptance-decision.js');
  const result=spawnSync(process.execPath,[scriptPath],{
    cwd:directory,
    encoding:'utf8',
    env:{
      ...process.env,
      OBFS_ACCEPTANCE_EXPECTED_SHA:candidateSha,
      OBFS_ACCEPTANCE_EVIDENCE_DIR:evidenceDirectory,
      OBFS_ACCEPTANCE_DECISION_FILE:decisionPath,
      OBFS_ACCEPTANCE_JOB_RESULTS:JSON.stringify(successfulJobs())
    }
  });
  let decision=null;
  try{
    decision=JSON.parse(await fs.readFile(decisionPath,'utf8'));
  }catch{
    // Malformed artifacts fail before a decision document can be written.
  }
  await fs.rm(directory,{recursive:true,force:true});
  return {
    status:result.status,
    stdout:result.stdout||'',
    stderr:result.stderr||'',
    decision
  };
}

/**
 * @param {string} platform
 * @returns {Record<string,any>}
 */
function passingDocument(platform){
  const dimensions=Object.fromEntries(REQUIRED_DIMENSIONS.map(name=>[name,'passed']));
  const budget=()=>({
    verdict:'sample-supported',
    strictObservedVerdict:'no-observed-exceedances',
    observedOverBudgetPairs:0,
    observedSampleHasOverBudgetPair:false
  });
  return {
    source:'sims/release-evidence-gate.js',
    sourceCommit:candidateSha,
    node:'v22.23.4',
    platform,
    summary:{
      verdict:'RELEASE-GO',
      attackedModes:['sco'],
      attackEvidence:{
        coo:{verdict:'resisted-within-budget'},
        sno:{verdict:'resisted-within-budget'},
        sco:{
          verdict:'demonstrated-functional-clone',
          sameAccountFunctionalReplay:true,
          privateSourceExtraction:'resisted-within-budget',
          unauthorizedTokenBypass:'resisted-within-budget'
        }
      },
      securityAxes:{
        staticReconstruction:{coo:'resisted',sno:'resisted',sco:'resisted'},
        dynamicInstrumentation:{coo:'resisted',sno:'resisted',sco:'resisted'},
        unauthorizedModification:{coo:'resisted',sno:'resisted',sco:'resisted'},
        environmentControl:{coo:'resisted',sno:'resisted',sco:'resisted'},
        authorizedServiceRelay:{coo:'not-applicable',sno:'not-applicable',sco:'legitimate-token-relay-reproduces-output'}
      },
      acceptance:{
        candidateSha,
        decision:'GO',
        dimensions
      },
      performance:{
        coo:{verdict:'sample-supported'},
        sno:{verdict:'sample-supported'},
        sco:{verdict:'sample-supported'},
        crossModeFamilywise:budget(),
        computeBoundaryFamilywise:budget(),
        snoPostInit:budget()
      }
    }
  };
}

test('GO requires exact-source evidence from both supported platforms',()=>{
  const decision=decide([
    passingDocument('linux'),passingDocument('win32')
  ]);
  assert.equal(decision.verdict,'RELEASE-GO');
  assert.deepEqual(decision.platforms,['linux','win32']);
  assert.deepEqual(decision.blockers,[]);
  assert.deepEqual(decision.unresolved,[]);
});

test('the CLI exits successfully only for the all-requirements-passing positive fixture',async()=>{
  const result=await runCli([
    passingDocument('linux'),passingDocument('win32')
  ]);
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.decision.verdict,'RELEASE-GO');
  assert.equal(result.decision.artifactHashes.length,2);
  assert.ok(result.decision.artifactHashes.every(item=>
    /^[0-9a-f]{64}$/u.test(item.sha256)));
});

test('the CLI rejects RELEASE-BLOCKED artifacts at process level',async()=>{
  const linux=passingDocument('linux');
  linux.summary.verdict='RELEASE-BLOCKED';
  const result=await runCli([linux,passingDocument('win32')]);
  assert.equal(result.status,1);
  assert.equal(result.decision.verdict,'RELEASE-BLOCKED');
});

test('the CLI rejects sample-exceeded compute evidence at process level',async()=>{
  const linux=passingDocument('linux');
  linux.summary.performance.computeBoundaryFamilywise.observedOverBudgetPairs=1;
  const result=await runCli([linux,passingDocument('win32')]);
  assert.equal(result.status,1);
  assert.equal(result.decision.verdict,'RELEASE-BLOCKED');
});

test('the CLI rejects sample-inconclusive evidence at process level',async()=>{
  const linux=passingDocument('linux');
  linux.summary.performance.coo.verdict='sample-inconclusive';
  const result=await runCli([linux,passingDocument('win32')]);
  assert.equal(result.status,1);
  assert.equal(result.decision.verdict,'RESEARCH-INCONCLUSIVE');
});

test('the CLI rejects static reconstruction at process level',async()=>{
  const linux=passingDocument('linux');
  linux.summary.attackEvidence.coo.verdict='demonstrated-functional-clone';
  const result=await runCli([linux,passingDocument('win32')]);
  assert.equal(result.status,1);
  assert.equal(result.decision.verdict,'RELEASE-BLOCKED');
});

test('the CLI rejects missing platform data at process level',async()=>{
  const result=await runCli([passingDocument('linux')]);
  assert.equal(result.status,1);
  assert.equal(result.decision.verdict,'RESEARCH-INCONCLUSIVE');
});

test('the CLI rejects malformed JSON artifacts at process level',async()=>{
  const result=await runCli([
    passingDocument('linux'),passingDocument('win32')
  ],{malformed:true});
  assert.equal(result.status,1);
  assert.match(result.stderr,/SyntaxError/u);
  assert.equal(result.decision,null);
});

test('green child jobs cannot override an explicit blocked evidence verdict',()=>{
  const linux=passingDocument('linux');
  linux.summary.verdict='RELEASE-BLOCKED';
  const decision=decide([
    linux,passingDocument('win32')
  ]);
  assert.equal(decision.verdict,'RELEASE-BLOCKED');
  assert.ok(decision.blockers.some(value=>value.includes('RELEASE-BLOCKED')));
});

test('a demonstrated functional clone vetoes GO even if a receipt claims success',()=>{
  const linux=passingDocument('linux');
  linux.summary.attackEvidence.coo.verdict='demonstrated-functional-clone';
  const decision=decide([
    linux,passingDocument('win32')
  ]);
  assert.equal(decision.verdict,'RELEASE-BLOCKED');
  assert.ok(decision.blockers.some(value=>value.includes('functional clone')));
});

test('missing or unmeasured acceptance dimensions remain inconclusive',()=>{
  const linux=passingDocument('linux');
  linux.summary.acceptance.dimensions.attackerAdvantage='unmeasured';
  const decision=decide([
    linux,passingDocument('win32')
  ]);
  assert.equal(decision.verdict,'RESEARCH-INCONCLUSIVE');
  assert.ok(decision.unresolved.some(value=>value.includes('attackerAdvantage')));
});

test('any strict over-budget observation vetoes a nominally supported median',()=>{
  const linux=passingDocument('linux');
  linux.summary.performance.computeBoundaryFamilywise.observedOverBudgetPairs=1;
  const decision=decide([
    linux,passingDocument('win32')
  ]);
  assert.equal(decision.verdict,'RELEASE-BLOCKED');
  assert.ok(decision.blockers.some(value=>value.includes('strict over-budget')));
});

test('stale evidence and incomplete job results cannot pass',()=>{
  const linux=passingDocument('linux');
  linux.sourceCommit='b'.repeat(40);
  const jobs=successfulJobs();
  jobs['sco-cpu']='failure';
  const decision=decide([linux,passingDocument('win32')],jobs);
  assert.equal(decision.verdict,'RELEASE-BLOCKED');
  assert.ok(decision.blockers.some(value=>value.includes('candidate SHA')));
  assert.ok(decision.blockers.some(value=>value.includes('sco-cpu')));
});

test('missing platform evidence cannot pass',()=>{
  const decision=decide([
    passingDocument('linux')
  ]);
  assert.equal(decision.verdict,'RESEARCH-INCONCLUSIVE');
  assert.ok(decision.unresolved.some(value=>value.includes('win32')));
});

test('security axes marked not measured prevent a GO receipt',()=>{
  const linux=passingDocument('linux');
  linux.summary.securityAxes.dynamicInstrumentation.coo='not-measured';
  const decision=decide([
    linux,passingDocument('win32')
  ]);
  assert.equal(decision.verdict,'RESEARCH-INCONCLUSIVE');
  assert.ok(decision.unresolved.some(value=>value.includes('not-measured')));
});
