'use strict';

const assert=require('node:assert/strict');
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
      attackedModes:[],
      attackEvidence:{
        coo:{verdict:'resisted-within-budget'},
        sno:{verdict:'resisted-within-budget'},
        sco:{verdict:'resisted-within-budget'}
      },
      securityAxes:{
        staticReconstruction:{coo:'resisted',sno:'resisted',sco:'resisted'},
        dynamicInstrumentation:{coo:'resisted',sno:'resisted',sco:'resisted'},
        unauthorizedModification:{coo:'resisted',sno:'resisted',sco:'resisted'},
        environmentControl:{coo:'resisted',sno:'resisted',sco:'resisted'},
        authorizedServiceRelay:{coo:'not-applicable',sno:'not-applicable',sco:'resisted'}
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
  const decision=evaluateAcceptance(successfulJobs(),[
    passingDocument('linux'),passingDocument('win32')
  ],candidateSha);
  assert.equal(decision.verdict,'RELEASE-GO');
  assert.deepEqual(decision.platforms,['linux','win32']);
  assert.deepEqual(decision.blockers,[]);
  assert.deepEqual(decision.unresolved,[]);
});

test('green child jobs cannot override an explicit blocked evidence verdict',()=>{
  const linux=passingDocument('linux');
  linux.summary.verdict='RELEASE-BLOCKED';
  const decision=evaluateAcceptance(successfulJobs(),[
    linux,passingDocument('win32')
  ],candidateSha);
  assert.equal(decision.verdict,'RELEASE-BLOCKED');
  assert.ok(decision.blockers.some(value=>value.includes('RELEASE-BLOCKED')));
});

test('a demonstrated functional clone vetoes GO even if a receipt claims success',()=>{
  const linux=passingDocument('linux');
  linux.summary.attackEvidence.coo.verdict='demonstrated-functional-clone';
  const decision=evaluateAcceptance(successfulJobs(),[
    linux,passingDocument('win32')
  ],candidateSha);
  assert.equal(decision.verdict,'RELEASE-BLOCKED');
  assert.ok(decision.blockers.some(value=>value.includes('functional clone')));
});

test('missing or unmeasured acceptance dimensions remain inconclusive',()=>{
  const linux=passingDocument('linux');
  linux.summary.acceptance.dimensions.attackerAdvantage='unmeasured';
  const decision=evaluateAcceptance(successfulJobs(),[
    linux,passingDocument('win32')
  ],candidateSha);
  assert.equal(decision.verdict,'RESEARCH-INCONCLUSIVE');
  assert.ok(decision.unresolved.some(value=>value.includes('attackerAdvantage')));
});

test('any strict over-budget observation vetoes a nominally supported median',()=>{
  const linux=passingDocument('linux');
  linux.summary.performance.computeBoundaryFamilywise.observedOverBudgetPairs=1;
  const decision=evaluateAcceptance(successfulJobs(),[
    linux,passingDocument('win32')
  ],candidateSha);
  assert.equal(decision.verdict,'RELEASE-BLOCKED');
  assert.ok(decision.blockers.some(value=>value.includes('strict over-budget')));
});

test('stale evidence and incomplete job results cannot pass',()=>{
  const linux=passingDocument('linux');
  linux.sourceCommit='b'.repeat(40);
  const jobs=successfulJobs();
  jobs['sco-cpu']='failure';
  const decision=evaluateAcceptance(jobs,[
    linux,passingDocument('win32')
  ],candidateSha);
  assert.equal(decision.verdict,'RELEASE-BLOCKED');
  assert.ok(decision.blockers.some(value=>value.includes('candidate SHA')));
  assert.ok(decision.blockers.some(value=>value.includes('sco-cpu')));
});

test('missing platform evidence cannot pass',()=>{
  const decision=evaluateAcceptance(successfulJobs(),[
    passingDocument('linux')
  ],candidateSha);
  assert.equal(decision.verdict,'RESEARCH-INCONCLUSIVE');
  assert.ok(decision.unresolved.some(value=>value.includes('win32')));
});

test('security axes marked not measured prevent a GO receipt',()=>{
  const linux=passingDocument('linux');
  linux.summary.securityAxes.dynamicInstrumentation.coo='not-measured';
  const decision=evaluateAcceptance(successfulJobs(),[
    linux,passingDocument('win32')
  ],candidateSha);
  assert.equal(decision.verdict,'RESEARCH-INCONCLUSIVE');
  assert.ok(decision.unresolved.some(value=>value.includes('not-measured')));
});
