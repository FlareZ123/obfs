'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { classifyValidationRun } = require('../sims/validation-receipt-classifier.js');

const fullSteps = [
  'Behavioral and adversarial suites with compact failure diagnostics',
  'Isolated exhaustive width-four low-rank oracle inversion',
  'Vary original private arithmetic source and obfuscator seed with post-answer audit',
  'JSDoc type safety',
  'Strict JSDoc for external corpus research tools',
  'Strict JSDoc for low-rank affine inversion tests',
  'Strict JSDoc for paired and complete-suite runtime budget evaluators',
  'Performance sample',
  'Paired own-key and null-prototype six-module startup-and-session profiles',
  'Native/emitted local formal-value whole-process budget and public clone'
];
const chromiumSteps = [
  'Real Chromium module and host-lock integration',
  'Real Chromium null-prototype protected-key and host-inheritance parity',
  'Real Chromium cross-module owner-field observation differential'
];
const focusedSteps = [
  'Execute one reviewed repository test without shell interpolation',
  'Strict project JSDoc',
  'Strict external JSDoc for focused runner',
  'Strict JSDoc for paired and complete-suite runtime budget evaluators'
];
const fullSha = '72e1c170b28b165c150a12df1d12ee21cf4b891c';
const focusSha = 'd1efacb1578b5443456a18b87839c2f3a024b24a';

/**
 * @param {string} name
 * @param {string} conclusion
 * @param {string[]} required
 */
function makeJob(name, conclusion, required) {
  return {
    name,
    conclusion,
    steps: required.map((step) => ({ name: step, conclusion: 'success' }))
  };
}

/** @param {string} sha @param {string | null} conclusion @param {number} id */
function makeRun(sha, conclusion, id) {
  return { head_sha: sha, status: 'completed', conclusion, id };
}

/** @param {string} conclusion */
function makeFullJobs(conclusion) {
  return [
    makeJob('node22 (ubuntu-latest)', conclusion,
      fullSteps.concat(chromiumSteps)),
    makeJob('node22 (windows-latest)', conclusion, fullSteps),
    { name: 'focused', conclusion: 'skipped', steps: [] }
  ];
}

/** @param {string} conclusion */
function makeFocusedJobs(conclusion) {
  return [
    makeJob('focused (ubuntu-latest)', conclusion, focusedSteps),
    makeJob('focused (windows-latest)', conclusion, focusedSteps),
    { name: 'node22', conclusion: 'skipped', steps: [] }
  ];
}

test('documented 23 November full run is red even when Chromium and typechecks pass', () => {
  const jobs = makeFullJobs('failure');
  for (const job of jobs.slice(0, 2)) {
    job.steps[0].conclusion = 'failure';
  }
  for (const job of jobs.slice(0, 2)) {
    assert.equal(job.steps.find((s) => s.name === 'JSDoc type safety')?.conclusion, 'success');
  }
  const receipt = classifyValidationRun(makeRun(fullSha, 'failure', 45136105520), jobs, fullSha);
  assert.equal(receipt.classification, 'full-red');
  assert.equal(receipt.runId, 45136105520);
  assert.equal(receipt.reasons.some((s) => s.includes('Behavioral and adversarial')), true);
});

test('documented main focused success cannot be promoted to full suite success', () => {
  const receipt = classifyValidationRun(makeRun(focusSha, 'success', 45141870967),
    makeFocusedJobs('success'), focusSha);
  assert.equal(receipt.classification, 'focused-green');
});

test('both complete Node matrices and applicable Ubuntu Chromium steps permit full-green', () => {
  const receipt = classifyValidationRun(makeRun(fullSha, 'success', 99),
    makeFullJobs('success'), fullSha);
  assert.equal(receipt.classification, 'full-green');
  assert.deepEqual(receipt.reasons, []);
});

test('missing real Chromium step refuses a false full-green verdict', () => {
  const jobs = makeFullJobs('success');
  jobs[0].steps = jobs[0].steps.filter((step) =>
    step.name !== 'Real Chromium module and host-lock integration');
  const result = classifyValidationRun(makeRun(fullSha, 'success', 99), jobs, fullSha);
  assert.equal(result.classification, 'incomplete');
  assert.equal(result.reasons.some((reason) => reason.includes('Real Chromium module')), true);
});

test('skipped behavioral suite refuses a false full-green verdict', () => {
  const jobs = makeFullJobs('success');
  jobs[1].steps[0].conclusion = 'skipped';
  assert.equal(classifyValidationRun(makeRun(fullSha, 'success', 99), jobs, fullSha)
    .classification, 'incomplete');
});

test('one missing platform cannot certify a full run', () => {
  const jobs = makeFullJobs('success').filter((job) => job.name !== 'node22 (windows-latest)');
  assert.equal(classifyValidationRun(makeRun(fullSha, 'success', 99), jobs, fullSha)
    .classification, 'incomplete');
});

test('head SHA mismatch refuses to certify moving main from a stale receipt', () => {
  const result = classifyValidationRun(makeRun(focusSha, 'success', 45141870967),
    makeFocusedJobs('success'), fullSha);
  assert.equal(result.classification, 'sha-mismatch');
});

test('completed workflow metadata cannot be assumed for running jobs', () => {
  const run = makeRun(fullSha, null, 100);
  run.status = 'in_progress';
  assert.equal(classifyValidationRun(run, makeFullJobs('success'), fullSha)
    .classification, 'incomplete');
});

test('duplicate job names do not pass accidental Map deduplication', () => {
  const jobs = makeFullJobs('success');
  jobs.push(makeJob('node22 (ubuntu-latest)', 'success', fullSteps.concat(chromiumSteps)));
  assert.equal(classifyValidationRun(makeRun(fullSha, 'success', 99), jobs, fullSha)
    .classification, 'incomplete');
});

test('a genuinely failed focused matrix remains focused-red', () => {
  const jobs = makeFocusedJobs('failure');
  jobs[1].steps[0].conclusion = 'failure';
  assert.equal(classifyValidationRun(makeRun(focusSha, 'failure', 99), jobs, focusSha)
    .classification, 'focused-red');
});
