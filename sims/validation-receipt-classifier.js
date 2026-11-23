'use strict';

/**
 * Classify the existing manual-validation workflow from observed GitHub
 * workflow-run and job records. This is an engineering acceptance diagnostic,
 * not a statement about obfuscation security or universal runtime bounds.
 *
 * The workflow dispatch exposes a focused-test path whose GitHub run may be
 * green despite the complete Node and browser matrix being skipped.
 *
 * @typedef {{name: string, conclusion: string | null}} WorkflowStep
 * @typedef {{
 *   name: string,
 *   conclusion: string | null,
 *   steps?: WorkflowStep[]
 * }} WorkflowJob
 * @typedef {{
 *   head_sha: string,
 *   head_branch?: string,
 *   status: string,
 *   conclusion: string | null,
 *   id?: number
 * }} WorkflowRun
 * @typedef {'full-green' | 'full-red' | 'focused-green' |
 *   'focused-red' | 'incomplete' | 'sha-mismatch'} Classification
 * @typedef {{
 *   classification: Classification,
 *   sourceSha: string,
 *   runId: number | null,
 *   reasons: string[]
 * }} ValidationReceipt
 */

const FULL_NAMES = [
  'node22 (ubuntu-latest)',
  'node22 (windows-latest)'
];
const FOCUSED_NAMES = [
  'focused (ubuntu-latest)',
  'focused (windows-latest)'
];
const CORE_STEPS = [
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
const CHROMIUM_STEPS = [
  'Real Chromium module and host-lock integration',
  'Real Chromium null-prototype protected-key and host-inheritance parity',
  'Real Chromium cross-module owner-field observation differential'
];
const FOCUSED_STEPS = [
  'Execute one reviewed repository test without shell interpolation',
  'Strict project JSDoc',
  'Strict external JSDoc for focused runner',
  'Strict JSDoc for paired and complete-suite runtime budget evaluators'
];

/**
 * Return a source-pinned, conservative classification of a workflow run.
 * Caller must provide the expected commit SHA separately. Passing jobs
 * indicate only the named workflow steps at that SHA, not nonzero transformed
 * source coverage, adversarial security, or a universal 2.5x runtime limit.
 *
 * @param {WorkflowRun} run
 * @param {WorkflowJob[]} jobs
 * @param {string} expectedSha
 * @returns {ValidationReceipt}
 */
function classifyValidationRun(run, jobs, expectedSha) {
  /** @type {string[]} */
  const reasons = [];
  const receipt = (/** @type {Classification} */ classification) => ({
    classification,
    sourceSha: run.head_sha,
    runId: typeof run.id === 'number' ? run.id : null,
    reasons
  });

  if (!expectedSha || run.head_sha !== expectedSha) {
    reasons.push('Workflow head SHA differs from the required source pin');
    return receipt('sha-mismatch');
  }
  if (run.status !== 'completed') {
    reasons.push('Workflow run is not completed');
    return receipt('incomplete');
  }
  const byName = new Map(jobs.map((job) => [job.name, job]));
  if (byName.size !== jobs.length) {
    reasons.push('Duplicate job names make the matrix ambiguous');
    return receipt('incomplete');
  }
  const fullSelected = FULL_NAMES.some((name) => {
    const job = byName.get(name);
    return job && job.conclusion !== 'skipped';
  });
  const focusedSelected = FOCUSED_NAMES.some((name) => {
    const job = byName.get(name);
    return job && job.conclusion !== 'skipped';
  });
  if (Boolean(fullSelected) === Boolean(focusedSelected)) {
    reasons.push('Neither one unique full/focused matrix was selected');
    return receipt('incomplete');
  }

  const selectedNames = fullSelected ? FULL_NAMES : FOCUSED_NAMES;
  /** @type {WorkflowJob[]} */
  const selectedJobs = [];
  for (const name of selectedNames) {
    const job = byName.get(name);
    if (!job) {
      reasons.push('Missing required matrix job: ' + name);
    } else {
      selectedJobs.push(job);
    }
  }
  if (reasons.length) return receipt('incomplete');

  for (const job of selectedJobs) {
    const required = fullSelected
      ? CORE_STEPS.concat(job.name === FULL_NAMES[0] ? CHROMIUM_STEPS : [])
      : FOCUSED_STEPS;
    const steps = new Map((job.steps || []).map((step) => [step.name, step]));
    for (const name of required) {
      const step = steps.get(name);
      if (!step || step.conclusion === 'skipped' || step.conclusion === null) {
        reasons.push(job.name + ': required step not executed: ' + name);
      } else if (step.conclusion !== 'success') {
        reasons.push(job.name + ': required step ' + name + ' = ' + step.conclusion);
      }
    }
    if (job.conclusion !== 'success') {
      reasons.push(job.name + ' concluded ' + job.conclusion);
    }
  }
  if (selectedJobs.some((job) => job.conclusion === 'failure') ||
      run.conclusion === 'failure') {
    return receipt(fullSelected ? 'full-red' : 'focused-red');
  }
  if (reasons.length || run.conclusion !== 'success') {
    if (run.conclusion !== 'success') reasons.push('Workflow conclusion is ' + run.conclusion);
    return receipt('incomplete');
  }
  return receipt(fullSelected ? 'full-green' : 'focused-green');
}

module.exports = { classifyValidationRun };
